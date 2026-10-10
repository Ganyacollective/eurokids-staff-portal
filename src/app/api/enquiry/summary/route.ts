// The family's story in one line.
//
// enquiry.ai_summary has been a column in this database since the enquiry book
// was built, and nothing has ever written to it. Meanwhile a coordinator
// opening a card reads fourteen timeline rows to learn that this family rang
// twice in March about day care, came on the 2nd, and are worried about the
// 7:30 drop-off. That is the single most useful sentence on the screen and
// nobody had time to write it.
//
// Claude only reads what is already recorded — the events, the notes, the
// stages, the dates. It is told, firmly, to invent nothing: a summary that
// says a family asked about the bus when they never did is worse than no
// summary, because the next person believes it.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ask, claudeReady, MODELS } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You write one-line summaries of preschool admission enquiries for the staff of EuroKids JMD Enclave in Undri, Pune. The reader is a coordinator who has just opened this family's record and has thirty seconds before the phone rings.

Write ONE sentence, at most about 30 words. No preamble, no "This family…", no quotation marks — just the sentence.

Say what actually matters to the next person who speaks to them: what they want, how far along they are, and anything they said that would be embarrassing to have forgotten. A worry they raised, a date they are waiting on, a competitor they mentioned, a reason they went quiet.

Use ONLY what you are given. Never invent a fee, a date, a programme, a worry or a reason. If the record holds almost nothing, say so plainly — "Called once in March about day care, nothing since" is a perfectly good summary and far better than a flattering guess.

Write in plain Indian English. No emoji, no exclamation marks, no sales language.`;

type Ev = { at: string; kind: string; summary: string | null };
type Nt = { created_at: string; body: string; author: string | null };

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  if (!claudeReady()) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY is not set on this deployment." }, { status: 400 });
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

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ ok: false, error: "Which enquiry?" }, { status: 400 });

  const tbl = admin.schema("eurokids");
  const [{ data: e }, { data: events }, { data: notes }, { data: calls }] = await Promise.all([
    tbl.from("enquiry").select("*").eq("id", id).maybeSingle(),
    tbl.from("enquiry_event").select("at, kind, summary").eq("enquiry_id", id).order("at", { ascending: true }).limit(60),
    tbl.from("enquiry_note").select("created_at, body, author").eq("enquiry_id", id).order("created_at", { ascending: true }).limit(40),
    tbl.from("call_log").select("started_at, direction, status, duration_s").eq("enquiry_id", id).order("started_at", { ascending: true }).limit(40),
  ]);
  if (!e) return NextResponse.json({ ok: false, error: "No such enquiry." }, { status: 404 });

  const day = (s?: string | null) => (s ? String(s).slice(0, 10) : "");
  const lines = [
    `Child: ${e.child_name || "not recorded"}${e.dob ? `, born ${e.dob}` : ""}${e.sex ? `, ${e.sex.toLowerCase()}` : ""}`,
    `Programmes asked about: ${(e.programs || []).join(", ") || "none recorded"}`,
    `Parents: ${[e.father_name, e.mother_name].filter(Boolean).join(" and ") || "not recorded"}`,
    e.address ? `Area: ${e.address}` : null,
    `First contact ${day(e.first_contact_at)} via ${(e.sources || []).join(", ") || "unknown"}`,
    e.first_visit_at ? `Visited the school on ${day(e.first_visit_at)}` : "Has not visited the school",
    e.visit_at ? `A visit is booked for ${day(e.visit_at)}` : null,
    `Where they are now: ${e.status}${(e.stages || []).length ? ` · ${(e.stages || []).join(" → ")}` : ""}`,
    e.sentiment != null ? `Staff rate their keenness ${e.sentiment}/10` : null,
    e.follow_up_on ? `Marked to follow up on ${e.follow_up_on}` : null,
    e.lost_reason ? `Recorded as lost because: ${e.lost_reason}` : null,
    "",
    "What happened, in order:",
    ...(events || []).map((v: Ev) => `  ${day(v.at)} — ${v.summary || v.kind}`),
    (calls || []).length ? `\nCalls: ${(calls || []).length} logged${(calls || []).filter((c: { status: string }) => c.status === "missed").length ? `, ${(calls || []).filter((c: { status: string }) => c.status === "missed").length} missed` : ""}` : null,
    (notes || []).length ? "\nWhat staff wrote down:" : "\nNo notes have been written.",
    ...(notes || []).map((n: Nt) => `  ${day(n.created_at)}${n.author ? ` (${n.author})` : ""}: ${n.body}`),
  ].filter(Boolean).join("\n");

  let summary: string;
  try {
    summary = await ask({
      feature: "enquiry_summary", model: MODELS.write, maxTokens: 200,
      system: SYSTEM, user: lines, log: admin, actor: who.user.id, entityId: id,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }

  // Tidy the two things a model does anyway however firmly it is told not to.
  summary = summary.replace(/^["“']|["”']$/g, "").replace(/\s+/g, " ").trim().slice(0, 400);

  const { error } = await tbl.from("enquiry").update({ ai_summary: summary }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, summary });
}
