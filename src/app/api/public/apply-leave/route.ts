// Applying for leave without signing in.
//
// Most of the staff have no hub login, so this endpoint has to stay open. It
// takes no credential, which makes it the most exposed thing in the product
// and worth being plain about what it used to do:
//
//   • It appended the application into portal_state.data.leaves — one JSON
//     document that also holds every employee, every holiday, every vacation
//     and the payroll adjustments. An unbounded number of unvalidated appends
//     into that document is a way to stop the HR console loading at all. It
//     writes a row in leave_requests now, like every other leave.
//   • There was no rate limit of any kind, and one call sent two emails, a
//     Slack message, a WhatsApp and a Google Sheet row. In a loop that burns
//     the mail quota, marks the sending domain as spam, and mail-bombs a
//     teacher's personal inbox with messages in her own name.
//   • end_date was taken on trust, so 9999-12-31 became about 2.9 million
//     days of leave, and that number reached the balance arithmetic.
//   • The reply carried the employee's personal email address and a
//     diagnostics block. Iterating employee_id harvested the staff's private
//     addresses, no credential needed.
//
// The database now enforces the ranges too (see the leave_requests check
// constraints), because validation that lives only here is validation that
// can be walked around.

import { NextRequest, NextResponse } from "next/server";
import { renderEmail, esc as bEsc, HR_EMAIL, SCHOOL_NAME } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HR_NOTIFY_EMAIL = process.env.HR_NOTIFY_EMAIL || "admin@eurokidsjmdenclave.org";
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE;
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
const GOOGLE_SHEET_WEBHOOK_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL;

export const runtime = "nodejs";

// How much is plausible from one place, or about one person, before it stops
// being somebody applying for leave. A teacher filing a third application in
// a day is unusual; a tenth from one address in an hour is not a teacher.
const IP_PER_HOUR = 10;
const EMP_PER_DAY = 5;
const REASON_MAX = 500;

// Free text that will be read by people and pasted into a spreadsheet. Strip
// the control characters, flatten the newlines, cap the length. The reason is
// also the one field an outsider fully controls, so it is never treated as
// anything but a string to display.
const clean = (s: string, max: number) =>
  String(s || "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const isDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// One shape of reply for every rejection the caller could use to learn
// something: a wrong id, an archived person, a throttle. "Employee not found"
// against "This employee is archived" confirmed which ids were real.
const vague = () =>
  NextResponse.json(
    { ok: false, error: "That application could not be submitted. Please check the details with the office." },
    { status: 400 },
  );

export async function POST(req: NextRequest) {
  if (!SERVICE_ROLE) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });

  let body: {
    employee_id?: string; leave_type?: string; start_date?: string;
    end_date?: string; reason?: string; half_day?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const employee_id = clean(body.employee_id || "", 64);
  const leave_type = clean(body.leave_type || "", 8).toUpperCase();
  const start_date = clean(body.start_date || "", 10);
  const end_date = clean(body.end_date || "", 10);
  const reason = clean(body.reason || "", REASON_MAX);
  const isHalf = body.half_day === true;

  if (!employee_id || !leave_type || !start_date || !end_date || !reason) {
    return NextResponse.json({ ok: false, error: "Please fill every field." }, { status: 400 });
  }
  if (!/^(CL|EL|LWP)$/.test(leave_type)) {
    return NextResponse.json({ ok: false, error: "Invalid leave type." }, { status: 400 });
  }
  if (!isDate(start_date) || !isDate(end_date)) {
    return NextResponse.json({ ok: false, error: "Those dates are not valid." }, { status: 400 });
  }
  if (start_date > end_date) {
    return NextResponse.json({ ok: false, error: "End date can't be before start date." }, { status: 400 });
  }
  if (isHalf && start_date !== end_date) {
    return NextResponse.json({ ok: false, error: "Half-day leave must be a single date." }, { status: 400 });
  }

  // A real application is somewhere near today. This also stops the arithmetic
  // below from ever producing an absurd number of days.
  const today = new Date();
  const floor = new Date(today.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  const ceil = new Date(today.getTime() + 400 * 86400000).toISOString().slice(0, 10);
  if (start_date < floor || start_date > ceil || end_date > ceil) {
    return NextResponse.json({ ok: false, error: "Those dates are outside the period leave can be applied for." }, { status: 400 });
  }

  const total_days = isHalf
    ? 0.5
    : Math.round((Date.parse(end_date + "T00:00:00Z") - Date.parse(start_date + "T00:00:00Z")) / 86400000) + 1;
  if (!(total_days > 0) || total_days > 60) {
    return NextResponse.json({ ok: false, error: "That is more leave than can be applied for at once." }, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // ── Throttle, before anything is written or sent ────────────────────────
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const since = (mins: number) => new Date(Date.now() - mins * 60000).toISOString();
  try {
    const [byIp, byEmp] = await Promise.all([
      ip
        ? admin.from("public_submit_log").select("id", { count: "exact", head: true })
            .eq("kind", "apply-leave").eq("ip", ip).gte("created_at", since(60))
        : Promise.resolve({ count: 0 }),
      admin.from("public_submit_log").select("id", { count: "exact", head: true })
        .eq("kind", "apply-leave").eq("subject", employee_id).gte("created_at", since(60 * 24)),
    ]);
    if ((byIp?.count ?? 0) >= IP_PER_HOUR || (byEmp?.count ?? 0) >= EMP_PER_DAY) {
      return NextResponse.json(
        { ok: false, error: "Too many applications have been submitted from here recently. Please speak to the office." },
        { status: 429 },
      );
    }
  } catch (e) {
    // A throttle that cannot be read must not become a way to apply for leave.
    console.error("[apply-leave] throttle check failed", e);
    return NextResponse.json({ ok: false, error: "Could not accept the application just now. Please try again shortly." }, { status: 503 });
  }
  await admin.from("public_submit_log").insert({ kind: "apply-leave", ip, subject: employee_id });

  // ── Who it is for ───────────────────────────────────────────────────────
  // The roster still lives in the state document. Only the name, email and
  // active flag are read, and none of it is echoed back to the caller.
  const { data: portalRow } = await admin.from("portal_state").select("data").eq("id", "main").maybeSingle();
  if (!portalRow) return NextResponse.json({ ok: false, error: "Could not accept the application just now." }, { status: 503 });

  type Emp = { id: string; display_name?: string; email?: string; department?: string; designation?: string; is_active?: boolean };
  const data = portalRow.data as { employees?: Emp[] };
  const emp = (data.employees || []).find((e) => e.id === employee_id);
  if (!emp || emp.is_active === false) return vague();

  // If she has an account, tie the row to it so it shows up in her own portal.
  // Resolved only where it is unambiguous; some people have two logins.
  let user_id: string | null = null;
  const { data: links } = await admin.from("teacher_links").select("user_id").eq("employee_id", employee_id);
  if (links && links.length === 1) user_id = links[0].user_id;

  const { data: inserted, error: insErr } = await admin
    .from("leave_requests")
    .insert({
      user_id,
      employee_id,
      leave_type,
      start_date,
      end_date,
      total_days,
      reason: isHalf ? `[Half-day] ${reason}` : reason,
      status: "Pending",
      half_day: isHalf,
      source: "anonymous",
      source_details: "Submitted from the leave form without signing in",
    })
    .select("id")
    .single();

  if (insErr) {
    // The partial unique index. Someone double-tapped Submit, or is applying
    // again for dates already on file — which is worth saying plainly,
    // because it is the one case where the caller should change something.
    if (insErr.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "An application for those exact dates is already on file. The office can see it." },
        { status: 409 },
      );
    }
    console.error("[apply-leave] insert failed", insErr);
    return NextResponse.json({ ok: false, error: "Could not save the application." }, { status: 500 });
  }

  // ── Notifications ───────────────────────────────────────────────────────
  const fmt = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  const dateText = start_date === end_date ? fmt(start_date) : `${fmt(start_date)} → ${fmt(end_date)}`;
  const portalUrl = req.nextUrl.origin;
  const dispatches: Promise<unknown>[] = [];
  // Kept server-side for the log only. None of this is returned to the caller.
  const results: Record<string, string> = {};
  const name = emp.display_name || employee_id;

  const factRows = `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:7px 0;color:#6B7280;border-bottom:1px solid #EEF0F2">Type</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #EEF0F2"><strong>${bEsc(leave_type)}</strong></td></tr>
      <tr><td style="padding:7px 0;color:#6B7280;border-bottom:1px solid #EEF0F2">Dates</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #EEF0F2">${bEsc(dateText)}</td></tr>
      <tr><td style="padding:7px 0;color:#6B7280;border-bottom:1px solid #EEF0F2">Days</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #EEF0F2">${total_days}</td></tr>
      <tr><td style="padding:7px 0;color:#6B7280;vertical-align:top">Reason</td><td style="padding:7px 0;text-align:right">${bEsc(reason)}</td></tr>
    </table>`;

  if (mailReady("hr") && HR_NOTIFY_EMAIL) {
    dispatches.push((async () => {
      try {
        const r = await sendMail({
          from: "hr",
          to: [HR_NOTIFY_EMAIL],
          subject: `${name} applied for ${leave_type} (${total_days} day${total_days === 1 ? "" : "s"})`,
          text: `${name} just applied for ${leave_type}.\n\nDates: ${dateText}\nDays: ${total_days}\nReason: ${reason}\nSubmitted without signing in\n\nReview: ${portalUrl}/`,
          html: renderEmail({
            contactEmail: HR_EMAIL, theme: "notice",
            title: "New leave request",
            subtitle: `${name}${emp.designation ? " · " + emp.designation : ""}`,
            bodyHtml: `<p><strong>${bEsc(name)}</strong> has applied for leave.</p>${factRows}
              <p style="margin:22px 0"><a href="${portalUrl}/" style="background:#B45309;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:8px;display:inline-block">Open the staff portal</a></p>`,
            footerNote: "Submitted from the leave form without signing in.",
          }),
        });
        results.hr_email = r.ok ? "sent" : `failed:${r.status}`;
      } catch (e) { results.hr_email = "err:" + (e as Error).message; }
    })());
  }

  // Her own copy. This is the one message that reaches a personal inbox, and
  // the throttle above is what keeps it from being a weapon.
  if (!mailReady("hr")) {
    results.teacher_confirm = "skipped: no mail provider";
  } else if (!emp.email) {
    results.teacher_confirm = "skipped: no personal email on record";
  } else {
    dispatches.push((async () => {
      try {
        const r = await sendMail({
          from: "hr",
          to: [emp.email!],
          subject: "We've received your leave application",
          text: `Hello ${(name.split(" ")[0] || "")},\n\nThank you for applying. Here's what we received:\n\nType: ${leave_type}\nDates: ${dateText}\nDays: ${total_days}\nReason: ${reason}\n\nHR will review and let you know shortly. If you did not submit this, please tell the office immediately.\n\n— ${SCHOOL_NAME}`,
          html: renderEmail({
            contactEmail: HR_EMAIL, theme: "calm",
            title: "Thank you for applying",
            subtitle: `${SCHOOL_NAME} · leave application`,
            bodyHtml: `<p>Hello ${bEsc(name.split(" ")[0] || "")},</p>
              <p>We have received your leave application. Here is a copy for your records:</p>${factRows}
              <p>HR will review it and let you know shortly. If you did not submit this, please tell the office right away.</p>`,
            footerNote: "You are receiving this because a leave application was submitted in your name.",
          }),
        });
        results.teacher_confirm = r.ok ? "sent" : `failed HTTP ${r.status}`;
      } catch (e) { results.teacher_confirm = "err:" + (e as Error).message; }
    })());
  }

  if (SLACK_WEBHOOK) {
    dispatches.push((async () => {
      try {
        const r = await fetch(SLACK_WEBHOOK, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: `*${name} applied for ${leave_type}* (${total_days}d)\n${dateText} — ${reason}` }),
        });
        results.slack = r.ok ? "sent" : `failed:${r.status}`;
      } catch (e) { results.slack = "err:" + (e as Error).message; }
    })());
  }
  if (WHATSAPP_PHONE && WHATSAPP_API_KEY) {
    dispatches.push((async () => {
      try {
        const msg = `${name} applied for ${leave_type} (${total_days}d)\n${dateText}\nReason: ${reason}`;
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(WHATSAPP_PHONE)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(WHATSAPP_API_KEY)}`;
        const r = await fetch(url);
        results.whatsapp = r.ok ? "sent" : `failed:${r.status}`;
      } catch (e) { results.whatsapp = "err:" + (e as Error).message; }
    })());
  }
  if (GOOGLE_SHEET_WEBHOOK_URL) {
    dispatches.push((async () => {
      try {
        const r = await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applied_at: new Date().toISOString(), employee_id, employee_name: name,
            department: emp.department || "", designation: emp.designation || "",
            leave_type, start_date, end_date, total_days, reason,
            status: "Pending", source: "anonymous", request_id: inserted?.id,
          }),
        });
        results.gsheet = r.ok ? "sent" : `failed:${r.status}`;
      } catch (e) { results.gsheet = "err:" + (e as Error).message; }
    })());
  }

  await Promise.all(dispatches);
  console.info("[apply-leave]", inserted?.id, JSON.stringify(results));

  // Housekeeping, cheap and occasional.
  if (Math.random() < 0.02) { try { await admin.rpc("prune_public_submit_log"); } catch (_) {} }

  // What comes back says whether it worked and nothing else. It used to carry
  // the employee's email address and a diagnostics block, which turned an
  // open endpoint into a staff-directory dump.
  const confirmed = results.teacher_confirm === "sent";
  return NextResponse.json({
    ok: true,
    message: confirmed
      ? "Application received. A confirmation has been emailed to you — check your spam folder too. HR will review it shortly."
      : "Application received. HR will review it shortly.",
  });
}
