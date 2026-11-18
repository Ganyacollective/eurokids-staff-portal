// Anonymous parent feedback, coming in.
//
// One shared link, so this endpoint takes no credential and no token — which
// makes it the second-most exposed thing in the product after apply-leave, and
// it is written with that in mind:
//
//   * Nothing identifying is stored. No IP, no user agent, no referrer, and
//     only a DATE rather than a timestamp. The throttle below does record an
//     IP in public_submit_log, which is the price of having a throttle at
//     all; keeping the time of day out of parent_feedback is what stops the
//     two being joined to put a name to a comment. See the table's own
//     comment.
//   * It is rate limited per IP, because every unauthenticated write needs to
//     be. There are no emails or WhatsApps triggered here, so the worst a
//     flood could do is fill the table with noise — but noise in the one
//     channel parents are asked to be honest in is worth preventing.
//   * The reply says whether it worked and nothing else.
//
// Deliberately NOT done: a per-browser cookie or fingerprint to stop repeat
// submissions. Either would be a way to recognise a returning parent, which
// is the opposite of the promise the page makes. The page keeps a localStorage
// flag as a courtesy to stop an accidental double-send; the server's only
// defence is the rate limit, and that is the right trade.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

// Generous enough for a family sharing one connection, or a few parents on the
// school's own wifi at pickup; low enough that nobody fills the table.
const PER_IP_PER_HOUR = 6;
const COMMENT_MAX = 2000;

// The academic year, worked out here rather than taken from the caller, who
// has no business deciding which year their feedback lands in.
function academicYear(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() + 1 >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

// Control characters out, whitespace collapsed to something a person would
// recognise as their own paragraph, length capped. The comment is free text
// from an anonymous stranger that staff will read and that may be pasted
// elsewhere, so it is never treated as anything but a string.
function cleanComment(s: unknown) {
  return String(s ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, COMMENT_MAX);
}

// The five Ofsted-style statements, scored 4 (strongly agree) down to 1
// (strongly disagree). Anything else — including "don't know", which the
// page sends as an absent field — is stored as null and never scored.
const ITEMS = ["happy", "safe", "progress", "teacher", "informed", "concerns"] as const;

function agreement(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : null;
}

export async function POST(req: NextRequest) {
  if (!SERVICE_ROLE) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const scores: Record<string, number | null> = {};
  for (const k of ITEMS) scores["q_" + k] = agreement(body["q_" + k]);
  const recommend = typeof body.recommend === "boolean" ? body.recommend : null;
  const comment = cleanComment(body.comment);
  const answered = ITEMS.some((k) => scores["q_" + k] !== null) || recommend !== null;

  // A submission with nothing in it is somebody's stray tap, not feedback.
  // The table enforces this too; this is so the message is a kind one.
  if (!answered && !comment) {
    return NextResponse.json(
      { ok: false, error: "There is nothing to send yet — please rate something or write us a note." },
      { status: 400 },
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  try {
    if (ip) {
      const { count } = await admin.from("public_submit_log")
        .select("id", { count: "exact", head: true })
        .eq("kind", "feedback").eq("ip", ip).gte("created_at", since);
      if ((count ?? 0) >= PER_IP_PER_HOUR) {
        return NextResponse.json(
          { ok: false, error: "A few responses have already come from this connection. If you have more to say, please call the office." },
          { status: 429 },
        );
      }
    }
  } catch (e) {
    // A throttle that cannot be read must not become a way around the
    // throttle — but this is feedback, not money, and silently losing a
    // parent's honest answer is its own harm. Let it through and say so in
    // the log.
    console.error("[feedback] throttle check failed, allowing", e);
  }
  await admin.from("public_submit_log").insert({ kind: "feedback", ip, subject: null });

  const { error } = await admin.from("parent_feedback").insert({
    academic_year: academicYear(),
    ...scores,
    recommend,
    comment: comment || null,
  });

  if (error) {
    console.error("[feedback] insert failed", error);
    return NextResponse.json({ ok: false, error: "We could not save that just now. Please try again in a moment." }, { status: 500 });
  }

  // No id comes back. An id would be a handle on one anonymous response, and
  // there is no reason for the page to hold one.
  return NextResponse.json({
    ok: true,
    message: "Your feedback has reached us, and it is genuinely useful. Thank you for taking the time.",
  });
}
