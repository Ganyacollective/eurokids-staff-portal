// What the books can honestly say.
//
// A correction lives in this file. I first built this with the money section
// deliberately blank, on the grounds that eurokids.payment_plan_item has
// paid_on set on none of its 418 rows and a figure drawn from it would claim
// ₹1.24 crore overdue. That was true about those rows and wrong about the
// school: the real, settled figures were in the epms schema the whole time,
// pulled every morning — 227 invoices, ₹1.30 crore raised, ₹1.07 crore
// collected. I had looked in one schema, found nothing, and announced the
// data did not exist.
//
// So money is here, taken from epms.fee_invoices, which is what EuroKids
// itself believes. eurokids.payment_plan is a plan nobody updates and is not
// used for any figure below.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Enq = {
  id: number; status: string; sources: string[] | null; stages: string[] | null;
  first_contact_at: string; first_visit_at: string | null; visit_at: string | null;
  won_at: string | null; created_at: string; updated_at: string; updated_by: string | null;
  sentiment: number | null; programs: string[] | null; follow_up_on: string | null;
  child_name: string | null; lost_reason: string | null;
};

const month = (s?: string | null) => (s ? String(s).slice(0, 7) : null);
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const [{ data: mods }, { data: prof }] = await Promise.all([
    admin.from("module_access").select("module").eq("user_id", who.user.id).in("module", ["admission", "finance"]),
    admin.from("profiles").select("role").eq("id", who.user.id).maybeSingle(),
  ]);
  if (!((mods && mods.length) || prof?.role === "admin")) {
    return NextResponse.json({ ok: false, error: "You need Admission or Finance." }, { status: 403 });
  }

  const tbl = admin.schema("eurokids");
  const [{ data: rows }, { data: notes }, { data: calls }] = await Promise.all([
    tbl.from("enquiry").select("id, status, sources, stages, first_contact_at, first_visit_at, visit_at, won_at, created_at, updated_at, updated_by, sentiment, programs, follow_up_on, child_name, lost_reason"),
    tbl.from("enquiry_note").select("enquiry_id, author, created_at"),
    tbl.from("call_log").select("enquiry_id, started_at, status, agent"),
  ]);
  const enq = (rows || []) as Enq[];

  // ── by month ─────────────────────────────────────────────────────────────
  const byMonth = new Map<string, { month: string; enquiries: number; visited: number; form_taken: number; won: number; lost: number; open: number; keen: number[] }>();
  const m = (k: string) => {
    let r = byMonth.get(k);
    if (!r) { r = { month: k, enquiries: 0, visited: 0, form_taken: 0, won: 0, lost: 0, open: 0, keen: [] }; byMonth.set(k, r); }
    return r;
  };
  for (const e of enq) {
    const k = month(e.first_contact_at) || month(e.created_at);
    if (!k) continue;
    const r = m(k);
    r.enquiries++;
    if (e.first_visit_at) r.visited++;
    if (e.status === "form_taken") r.form_taken++;
    if (e.status === "won") r.won++;
    if (e.status === "lost") r.lost++;
    if (e.status === "in_progress" || e.status === "form_taken") r.open++;
    if (e.sentiment != null) r.keen.push(e.sentiment);
  }
  const months = [...byMonth.values()]
    .map(r => ({ ...r, keen: r.keen.length ? Math.round(10 * r.keen.reduce((a, b) => a + b, 0) / r.keen.length) / 10 : null }))
    .sort((a, b) => b.month.localeCompare(a.month));

  // ── by source ────────────────────────────────────────────────────────────
  // An enquiry can carry more than one source — they rang, then walked in — so
  // these add up to more than the total, and the screen says so.
  const bySource = new Map<string, { source: string; enquiries: number; visited: number; won: number; keen: number[] }>();
  for (const e of enq) {
    for (const s of e.sources?.length ? e.sources : ["(not recorded)"]) {
      let r = bySource.get(s);
      if (!r) { r = { source: s, enquiries: 0, visited: 0, won: 0, keen: [] }; bySource.set(s, r); }
      r.enquiries++;
      if (e.first_visit_at) r.visited++;
      if (e.status === "won") r.won++;
      if (e.sentiment != null) r.keen.push(e.sentiment);
    }
  }
  const sources = [...bySource.values()]
    .map(r => ({ source: r.source, enquiries: r.enquiries, visited: r.visited, won: r.won,
      keen: r.keen.length ? Math.round(10 * r.keen.reduce((a, b) => a + b, 0) / r.keen.length) / 10 : null }))
    .sort((a, b) => b.enquiries - a.enquiries);

  // ── by programme ─────────────────────────────────────────────────────────
  const byProg = new Map<string, number>();
  for (const e of enq) for (const p of e.programs?.length ? e.programs : ["(not recorded)"]) byProg.set(p, (byProg.get(p) || 0) + 1);
  const programmes = [...byProg.entries()].map(([programme, enquiries]) => ({ programme, enquiries }))
    .sort((a, b) => b.enquiries - a.enquiries);

  // ── who is doing the work ────────────────────────────────────────────────
  //
  // Measured from notes written and calls logged, not from a status nobody
  // sets. Counting conversions per person is impossible here and the screen
  // says so rather than showing a column of zeroes.
  const people = new Map<string, { who: string; notes: number; enquiries: Set<number>; calls: number; first: string; last: string }>();
  for (const n of (notes || []) as { enquiry_id: number; author: string | null; created_at: string }[]) {
    const a = (n.author || "").trim(); if (!a) continue;
    let r = people.get(a);
    if (!r) { r = { who: a, notes: 0, enquiries: new Set(), calls: 0, first: n.created_at, last: n.created_at }; people.set(a, r); }
    r.notes++; r.enquiries.add(n.enquiry_id);
    if (n.created_at < r.first) r.first = n.created_at;
    if (n.created_at > r.last) r.last = n.created_at;
  }
  for (const c of (calls || []) as { agent: string | null }[]) {
    const a = (c.agent || "").trim(); if (!a) continue;
    const r = people.get(a);
    if (r) r.calls++;
  }
  const staff = [...people.values()]
    .map(r => ({ who: r.who, notes: r.notes, enquiries: r.enquiries.size, calls: r.calls, first: r.first.slice(0, 10), last: r.last.slice(0, 10) }))
    .sort((a, b) => b.notes - a.notes);

  // ── how quickly a new enquiry is first spoken to ─────────────────────────
  const firstNote = new Map<number, string>();
  for (const n of (notes || []) as { enquiry_id: number; created_at: string }[]) {
    const cur = firstNote.get(n.enquiry_id);
    if (!cur || n.created_at < cur) firstNote.set(n.enquiry_id, n.created_at);
  }
  const lags: number[] = [];
  for (const e of enq) {
    const f = firstNote.get(e.id);
    if (f) { const d = days(e.first_contact_at, f); if (d >= 0 && d < 400) lags.push(d); }
  }
  lags.sort((a, b) => a - b);
  const median = lags.length ? lags[Math.floor(lags.length / 2)] : null;

  // ── the money, from what EuroKids itself believes ────────────────────────
  //
  // Paise in EPMS, rupees here, converted once so no screen has to remember.
  const [{ data: inv }, { data: lastSync }, { data: payEvents }] = await Promise.all([
    admin.schema("epms").from("fee_invoices")
      .select("uin, student_name, program_name, student_status, total_invoiced_paise, total_collected_paise, total_due_paise, payment_status"),
    admin.schema("epms").from("sync_runs").select("finished_at, status")
      .eq("status", "ok").order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    admin.schema("epms").from("payment_events").select("amount_paise, detected_at").order("detected_at", { ascending: false }).limit(400),
  ]);

  type Inv = { uin: string; student_name: string | null; program_name: string | null; student_status: string | null;
    total_invoiced_paise: number | null; total_collected_paise: number | null; total_due_paise: number | null; payment_status: string | null };
  const invoices = (inv || []) as Inv[];
  const r = (p?: number | null) => Math.round((p || 0) / 100);

  const byProgMoney = new Map<string, { programme: string; children: number; invoiced: number; collected: number; due: number }>();
  for (const i of invoices) {
    const k = i.program_name || "(not recorded)";
    let x = byProgMoney.get(k);
    if (!x) { x = { programme: k, children: 0, invoiced: 0, collected: 0, due: 0 }; byProgMoney.set(k, x); }
    x.children++; x.invoiced += r(i.total_invoiced_paise); x.collected += r(i.total_collected_paise); x.due += r(i.total_due_paise);
  }

  // Who still owes, worst first — the list somebody can act on this morning.
  const owing = invoices.filter(i => (i.total_due_paise || 0) > 0)
    .map(i => ({ uin: i.uin, name: i.student_name, programme: i.program_name, due: r(i.total_due_paise), collected: r(i.total_collected_paise), invoiced: r(i.total_invoiced_paise) }))
    .sort((a, b) => b.due - a.due);

  // Money actually seen arriving, by month, from the sync's own change log.
  const payByMonth = new Map<string, number>();
  for (const p of (payEvents || []) as { amount_paise: number | null; detected_at: string }[]) {
    const k = String(p.detected_at).slice(0, 7);
    payByMonth.set(k, (payByMonth.get(k) || 0) + r(p.amount_paise));
  }

  const money = {
    as_of: lastSync?.finished_at ?? null,
    children: invoices.length,
    invoiced: invoices.reduce((a, i) => a + r(i.total_invoiced_paise), 0),
    collected: invoices.reduce((a, i) => a + r(i.total_collected_paise), 0),
    due: invoices.reduce((a, i) => a + r(i.total_due_paise), 0),
    families_owing: owing.length,
    top_owing: owing.slice(0, 15),
    by_programme: [...byProgMoney.values()].sort((a, b) => b.invoiced - a.invoiced),
    collected_by_month: [...payByMonth.entries()].map(([month, amount]) => ({ month, amount })).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 8),
  };

  // ── what the book cannot answer, and why ─────────────────────────────────
  const neverWon = enq.every(e => e.status !== "won");
  const neverLost = enq.every(e => e.status !== "lost");
  const untouched = enq.filter(e => !firstNote.has(e.id)).length;

  return NextResponse.json({
    ok: true,
    total: enq.length,
    visited: enq.filter(e => e.first_visit_at).length,
    open: enq.filter(e => e.status === "in_progress" || e.status === "form_taken").length,
    months, sources, programmes, staff, money,
    median_days_to_first_note: median,
    untouched,
    caveats: {
      never_won: neverWon,
      never_lost: neverLost,
      // The hub's own fee plan is still unmaintained; the figures above come
      // from EPMS instead. Worth saying, so nobody reconciles the two and
      // thinks the hub has lost a crore.
      plan_unmaintained: "The hub's own fee plan (418 instalments) has never been marked paid and is ignored here. Every figure above comes from EPMS, which is what EuroKids itself bills and banks.",
    },
  });
}
