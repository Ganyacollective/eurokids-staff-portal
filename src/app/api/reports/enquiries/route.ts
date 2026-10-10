// What the enquiry book can honestly say.
//
// Deliberately only the enquiry half. The fee tables hold 418 instalments and
// paid_on is set on none of them, because parents pay through EPMS and nothing
// comes back — so the hub believes ₹1.24 crore of ₹1.28 crore is overdue. Any
// money figure drawn from that is wrong by roughly a crore, and a wrong figure
// on a page that looks official is worse than a blank space. The blank space
// is in the screen, labelled, until EPMS writes back.
//
// Everything below is counted from records somebody actually entered.

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

  // ── what the book cannot answer, and why ─────────────────────────────────
  const neverWon = enq.every(e => e.status !== "won");
  const neverLost = enq.every(e => e.status !== "lost");
  const untouched = enq.filter(e => !firstNote.has(e.id)).length;

  return NextResponse.json({
    ok: true,
    total: enq.length,
    visited: enq.filter(e => e.first_visit_at).length,
    open: enq.filter(e => e.status === "in_progress" || e.status === "form_taken").length,
    months, sources, programmes, staff,
    median_days_to_first_note: median,
    untouched,
    caveats: {
      never_won: neverWon,
      never_lost: neverLost,
      // Said plainly rather than shown as a number, because the number is wrong.
      money: "Fee collection is not shown. Parents pay through EPMS and nothing is written back, so every one of the 418 instalments still reads as unpaid and the hub would report about ₹1.24 crore overdue. That figure would be wrong, so it is not here.",
    },
  });
}
