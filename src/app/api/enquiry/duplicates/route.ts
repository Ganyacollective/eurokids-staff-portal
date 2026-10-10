// The duplicate desk.
//
// GET   — the pairs waiting for a decision.
// POST  {action:"scan"}                — look for new ones and ask Claude.
// POST  {action:"merge", id, keep}     — join them; `keep` is the survivor.
// POST  {action:"not_same", id}        — they are different families; never ask again.
//
// Merging is the only destructive thing in the enquiry book, so it is behind
// Admission or admin, it records who did it on the surviving record, and it
// can only act on a pair that was actually proposed — no merging two ids
// somebody typed into the address bar.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findCandidates, judge, mergeEnquiries } from "@/lib/enquiry-dupes";
import { claudeReady } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FIELDS = "id, child_name, father_name, father_phone, mother_name, mother_phone, address, programs, sources, status, first_contact_at";

async function gate(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { error: "Not signed in.", status: 401 as const };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return { error: "Not signed in.", status: 401 as const };

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const [{ data: mods }, { data: prof }] = await Promise.all([
    admin.from("module_access").select("module").eq("user_id", who.user.id).eq("module", "admission"),
    admin.from("profiles").select("role, full_name").eq("id", who.user.id).maybeSingle(),
  ]);
  if (!((mods && mods.length) || prof?.role === "admin")) return { error: "You need Admission.", status: 403 as const };

  return { admin, user: who.user, name: prof?.full_name || who.user.email || "someone" };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });

  const tbl = g.admin.schema("eurokids");
  const { data: pairs } = await tbl.from("enquiry_duplicate")
    .select("id, a_id, b_id, confidence, reason, found_at")
    .eq("status", "suggested").order("confidence", { ascending: false });

  if (!pairs?.length) return NextResponse.json({ ok: true, pairs: [], ready: claudeReady() });

  const ids = [...new Set(pairs.flatMap(p => [p.a_id, p.b_id]))];
  const { data: enq } = await tbl.from("enquiry").select(FIELDS).in("id", ids);
  const by = new Map((enq || []).map(e => [e.id, e]));

  return NextResponse.json({
    ok: true, ready: claudeReady(),
    pairs: pairs.map(p => ({ ...p, a: by.get(p.a_id) || null, b: by.get(p.b_id) || null }))
      // A pair whose records have since gone is not a question any more.
      .filter(p => p.a && p.b),
  });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { admin, user, name } = g;
  const tbl = admin.schema("eurokids");

  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");

  if (action === "scan") {
    if (!claudeReady()) {
      return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY is not set on this deployment, so pairs cannot be judged." }, { status: 400 });
    }
    let found: Awaited<ReturnType<typeof findCandidates>>;
    try { found = await findCandidates(admin, 40); }
    catch (e) { return NextResponse.json({ ok: false, error: `Could not look for pairs: ${(e as Error).message}` }, { status: 500 }); }

    if (!found.length) return NextResponse.json({ ok: true, looked: 0, kept: 0, note: "Nothing new to look at." });

    let verdicts;
    try { verdicts = await judge(found, admin, user.id); }
    catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 }); }

    // Below forty it is not a lead, it is noise — but it is still recorded, as
    // "not the same", so the pair is never raised again.
    const rows = verdicts.map(v => ({
      a_id: Math.min(v.a, v.b), b_id: Math.max(v.a, v.b),
      confidence: v.confidence, reason: v.reason,
      status: v.confidence >= 40 ? "suggested" : "not_same",
      ...(v.confidence >= 40 ? {} : { decided_at: new Date().toISOString(), decided_by: user.id }),
    }));
    const { error } = await tbl.from("enquiry_duplicate").upsert(rows, { onConflict: "a_id,b_id" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true, looked: found.length,
      kept: rows.filter(r => r.status === "suggested").length,
      dismissed: rows.filter(r => r.status === "not_same").length,
    });
  }

  const id = Number(b.id);
  if (!id) return NextResponse.json({ ok: false, error: "Which pair?" }, { status: 400 });
  const { data: pair } = await tbl.from("enquiry_duplicate").select("*").eq("id", id).maybeSingle();
  if (!pair) return NextResponse.json({ ok: false, error: "No such pair." }, { status: 404 });
  if (pair.status !== "suggested") return NextResponse.json({ ok: false, error: "That pair has already been decided." }, { status: 409 });

  if (action === "not_same") {
    await tbl.from("enquiry_duplicate").update({ status: "not_same", decided_at: new Date().toISOString(), decided_by: user.id }).eq("id", id);
    return NextResponse.json({ ok: true, status: "not_same" });
  }

  if (action === "merge") {
    // The survivor must be one of the two proposed. Anything else would be a
    // merge nobody reviewed.
    const keep = Number(b.keep);
    if (keep !== pair.a_id && keep !== pair.b_id) {
      return NextResponse.json({ ok: false, error: "The record to keep must be one of the pair." }, { status: 400 });
    }
    const drop = keep === pair.a_id ? pair.b_id : pair.a_id;

    let out;
    try { out = await mergeEnquiries(admin, keep, drop, name); }
    catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 }); }

    await tbl.from("enquiry_duplicate").update({ status: "merged", decided_at: new Date().toISOString(), decided_by: user.id }).eq("id", id);

    // Said out loud rather than swallowed: this is the one action here that
    // destroys a record, so it belongs in the audit trail whatever happens to
    // the enquiry afterwards.
    const { error: logErr } = await admin.from("audit_log").insert({
      actor_id: user.id, action: "enquiry_merged", entity_type: "enquiry", entity_id: String(keep),
      before_json: { kept: keep, dropped: drop, by: name, confidence: pair.confidence, reason: pair.reason },
    });
    if (logErr) console.error("[enquiry merge] done, but the audit entry failed:", logErr.message);

    return NextResponse.json({ ok: true, ...out });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
