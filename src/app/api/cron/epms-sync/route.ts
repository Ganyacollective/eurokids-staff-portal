import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderEmail, esc, SCHOOL_NAME, plainFooter, SITE } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;
const SYNC_CRON_KEY = process.env.SYNC_CRON_KEY;

// Who hears about it. The office does not need to; this is an engine-room
// alarm, and a sync that fails quietly is exactly the failure mode that let
// "Last synced" sit frozen for a fortnight without anyone noticing.
const ALERT_TO = (process.env.SYNC_ALERT_EMAIL || "abhinav@ganya.in")
  .split(",").map((x) => x.trim()).filter(Boolean);

const ist = (d: Date) => d.toLocaleString("en-IN", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  hour12: true, timeZone: "Asia/Kolkata",
});

// A plain-English reading of what EPMS actually said. The raw error is still
// printed underneath — this is the line that saves a phone call.
function diagnose(err: string) {
  const e = err.toLowerCase();
  if (/credentials rejected|bounced to login|login/.test(e))
    return "EPMS refused our login. Almost always this means the EPMS password was changed at the EuroKids end and the copy we hold is now stale.";
  if (/epms_user|epms_pass|not set/.test(e))
    return "The EPMS login was never configured on the server, so there was nothing to log in with.";
  if (/permission|not signed in/.test(e))
    return "The scheduled run was turned away by our own permission check — the shared key on the server no longer matches the one the sync expects.";
  if (/timeout|timed out|fetch failed|network|econn/.test(e))
    return "We could not reach EPMS at all. Usually their site is down or very slow; the next run may well succeed on its own.";
  if (/already running/.test(e))
    return "Another sync was still in flight, so this one stood down. Harmless unless it repeats.";
  return "The pull reached EPMS but did not finish. The message below is what came back.";
}

// GET /api/cron/epms-sync — the unattended pull, twice a day.
// It exists for one reason beyond freshness: a sync nobody watches is a sync
// nobody knows has stopped. Every failure leaves a row in epms.sync_runs (so
// the Overview can show it) and, once, an email.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}` && !dry) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const epms = admin.schema("epms");

  let ok = false, error = "", detail: Record<string, unknown> = {};
  if (!SYNC_CRON_KEY) {
    error = "SYNC_CRON_KEY is not set on the web server, so the scheduled sync cannot identify itself to the sync function.";
  } else {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/epms-pull`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
          "x-sync-key": SYNC_CRON_KEY,
        },
      });
      const body = await r.text();
      let j: { ok?: boolean; error?: string } = {};
      try { j = JSON.parse(body); } catch { /* an HTML error page, not JSON */ }
      ok = r.ok && j.ok === true;
      detail = j as Record<string, unknown>;
      if (!ok) error = j.error || `The sync function answered ${r.status}: ${body.slice(0, 200)}`;
    } catch (e) {
      error = `Could not reach the sync function: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  if (ok) return NextResponse.json({ ok: true, ...detail });

  // The pull may have failed before it could open its own log row — when the
  // function is unreachable, for instance. Look for the row it would have
  // written in the last few minutes; if there is none, write one ourselves so
  // the Overview and the sync log both show the outage rather than silence.
  const since = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  const { data: recent } = await epms.from("sync_runs")
    .select("id, status, alerted_at, finished_at")
    .eq("route", "epms-pull").gte("started_at", since)
    .order("id", { ascending: false }).limit(1);
  let row: { id?: number; alerted_at?: string | null } | undefined = recent?.[0];
  if (!row && !dry) {
    const ins = await epms.from("sync_runs").insert({
      report: "payment_due", route: "epms-pull", triggered_by: "scheduled",
      finished_at: new Date().toISOString(), status: "error", error,
    }).select("id, alerted_at").single();
    row = ins.data ?? undefined;
  }

  // One email per failed run. A cron that retries, or an office colleague
  // pressing Sync into the same broken login, must not fill the inbox the way
  // the old CC-everything habit did.
  let mailed = "skipped — already alerted";
  if (row?.alerted_at) { /* said once, enough */ }
  else if (!mailReady()) mailed = "skipped — no mail provider configured";
  else {
    const when = ist(new Date());
    const html = renderEmail({
      title: "EPMS sync failed",
      subtitle: `${when} · scheduled run`,
      theme: "notice",
      bodyHtml: `<p>The automatic pull from EPMS did not complete at <strong>${esc(when)}</strong>.</p>
        <p>${esc(diagnose(error))}</p>
        <p style="margin:16px 0;padding:12px 14px;background:#F9FAFB;border-left:3px solid #B45309;border-radius:6px;
                  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#374151;word-break:break-word">
          ${esc(error)}</p>
        <p>Fee balances in the hub are still the ones from the last successful sync, so they are safe to read — only out of date. Nothing has been lost.</p>
        <p><a href="${SITE}/hub.html" style="color:#B45309;font-weight:700;text-decoration:none">Open the hub</a> and press <strong>Sync from EPMS</strong> to try again by hand; the Overview now shows the same warning at the top.</p>`,
      footerNote: "Sent automatically because a scheduled EPMS sync failed. You are the only recipient.",
    });
    const r = await sendMail({
      to: ALERT_TO,
      subject: `EPMS sync failed at ${when}`,
      html,
      text: [`The automatic pull from EPMS did not complete at ${when}.`, "",
        diagnose(error), "", error, "",
        "Hub figures are from the last successful sync — out of date, not wrong.",
        `${SITE}/hub.html`, plainFooter()].join("\n"),
    });
    mailed = r.ok ? `sent to ${ALERT_TO.join(", ")}` : `failed: ${r.error || "unknown"}`;
    if (r.ok && row?.id && !dry) {
      await epms.from("sync_runs").update({ alerted_at: new Date().toISOString() }).eq("id", row.id);
    }
  }

  // 200, deliberately: the cron did its job, which was to notice. A 500 here
  // would make Vercel retry and the whole alarm would ring again.
  return NextResponse.json({ ok: false, school: SCHOOL_NAME, error, mailed, run: row?.id ?? null });
}
