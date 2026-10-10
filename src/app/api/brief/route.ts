// The morning brief.
//
// Everything in this hub is already on a screen somewhere — follow-ups in the
// enquiry list, money in Fees, absences in the portal. The trouble is that
// nobody opens five screens before the first parent arrives, so the thing that
// needed attention today is found on Thursday.
//
// This assembles the same figures into one page and asks Claude to write them
// as a briefing. Every number here is counted in SQL. Claude is given the
// counts and the names and told, in as many words, that it may not do
// arithmetic — if it writes "four families", four is a number this route
// counted, not one the model reached for. That is the whole discipline: the
// database decides what is true, the model decides how to say it.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ask, claudeReady, MODELS } from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `You write the morning briefing for the person running EuroKids JMD Enclave, a preschool and day care in Undri, Pune. They read it before the first parent arrives.

You are given counts and names already worked out from the school's records. Use ONLY those. Never add a number, a name, a fee or a date that is not in front of you, and never do arithmetic — if you want to say how many, the figure is already there.

Write it as short prose under a few plain headings, as a competent manager would brief their day. Lead with whatever genuinely needs a person today; if two things matter, say which one first. If a section has nothing in it, say so in a few words and move on — a quiet morning is useful information, not a gap to pad.

Be direct and unsentimental. No emoji, no exclamation marks, no encouragement, no "Great news!". If nothing much needs doing, the whole brief can be three sentences and that is a good brief.

Format in simple Markdown: ## for a heading, - for a list item, **bold** for a name worth noticing. Nothing else.`;

const day = (s?: string | null) => (s ? String(s).slice(0, 10) : "");

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
  const { data: prof } = await admin.from("profiles").select("role, full_name").eq("id", who.user.id).maybeSingle();
  const { data: mods } = await admin.from("module_access").select("module").eq("user_id", who.user.id);
  const have = new Set((mods || []).map(m => m.module));
  const isAdmin = prof?.role === "admin";
  if (!isAdmin && !have.has("admission") && !have.has("finance")) {
    return NextResponse.json({ ok: false, error: "You need Admission or Finance." }, { status: 403 });
  }

  const tbl = admin.schema("eurokids");
  const today = new Date().toISOString().slice(0, 10);
  const cold = new Date(Date.now() - 14 * 864e5).toISOString();

  // Everything the brief may mention, counted here rather than inferred there.
  const [due, visits, fresh, going, won, dupes, calls] = await Promise.all([
    tbl.from("v_enquiry").select("id, child_name, father_name, father_phone, follow_up_on, status, sentiment, ai_summary")
      .lte("follow_up_on", today).not("status", "in", "(won,lost)").order("follow_up_on").limit(25),
    tbl.from("v_enquiry").select("id, child_name, father_name, visit_at")
      .gte("visit_at", today + "T00:00:00Z").lte("visit_at", today + "T23:59:59Z").limit(25),
    tbl.from("v_enquiry").select("id, child_name, father_name, sources, created_at")
      .gte("created_at", new Date(Date.now() - 864e5).toISOString()).order("created_at", { ascending: false }).limit(25),
    tbl.from("v_enquiry").select("id, child_name, father_name, updated_at, sentiment")
      .in("status", ["in_progress", "form_taken"]).lt("updated_at", cold).order("sentiment", { ascending: false }).limit(15),
    tbl.from("v_enquiry").select("id, child_name").eq("status", "won")
      .gte("won_at", new Date(Date.now() - 7 * 864e5).toISOString()).limit(25),
    tbl.from("enquiry_duplicate").select("id", { count: "exact", head: true }).eq("status", "suggested"),
    tbl.from("call_log").select("id, status").gte("started_at", new Date(Date.now() - 864e5).toISOString()).limit(200),
  ]);

  const nm = (r: { child_name?: string | null; father_name?: string | null }) =>
    r.child_name || (r.father_name ? `${r.father_name}'s child` : "an unnamed family");

  const missed = (calls.data || []).filter(c => c.status === "missed").length;

  const facts = [
    `Today is ${today}.`,
    "",
    `## Follow-ups due today or overdue — ${(due.data || []).length}`,
    ...(due.data || []).map(r =>
      `- ${nm(r)}${r.father_phone ? `, ${r.father_phone}` : ""} — due ${r.follow_up_on}${r.sentiment != null ? `, keenness ${r.sentiment}/10` : ""}${r.ai_summary ? `. Background: ${r.ai_summary}` : ""}`),
    "",
    `## Visits booked for today — ${(visits.data || []).length}`,
    ...(visits.data || []).map(r => `- ${nm(r)} at ${String(r.visit_at).slice(11, 16)}`),
    "",
    `## New enquiries in the last 24 hours — ${(fresh.data || []).length}`,
    ...(fresh.data || []).map(r => `- ${nm(r)} via ${(r.sources || []).join(", ") || "unknown"}`),
    "",
    `## Open enquiries not touched in a fortnight — ${(going.data || []).length}`,
    ...(going.data || []).map(r => `- ${nm(r)}, last worked ${day(r.updated_at)}${r.sentiment != null ? `, keenness ${r.sentiment}/10` : ""}`),
    "",
    `## Calls in the last 24 hours — ${(calls.data || []).length} logged, ${missed} missed`,
    `## Admissions won in the last week — ${(won.data || []).length}`,
    ...(won.data || []).map(r => `- ${nm(r)}`),
    `## Possible duplicate families waiting for a decision — ${dupes.count ?? 0}`,
  ].join("\n");

  if (!claudeReady()) {
    // Worth something even without a model: the figures are the point, the
    // prose is the convenience.
    return NextResponse.json({ ok: true, written: false, brief: facts });
  }

  try {
    const brief = await ask({
      feature: "morning_brief", model: MODELS.write, maxTokens: 1200,
      system: SYSTEM, user: facts, log: admin, actor: who.user.id, entityId: today,
    });
    return NextResponse.json({ ok: true, written: true, brief, facts });
  } catch (err) {
    return NextResponse.json({ ok: true, written: false, brief: facts, error: (err as Error).message });
  }
}
