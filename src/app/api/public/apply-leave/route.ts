import { NextRequest, NextResponse } from "next/server";
import { renderEmail, esc as bEsc, plainFooter, HR_EMAIL, SCHOOL_NAME } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_FROM = process.env.RESEND_FROM || "EuroKids JMD Enclave <admin@eurokidsjmdenclave.org>";
const HR_NOTIFY_EMAIL = process.env.HR_NOTIFY_EMAIL || "admin@eurokidsjmdenclave.org";
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const WHATSAPP_PHONE = process.env.WHATSAPP_PHONE;
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
const GOOGLE_SHEET_WEBHOOK_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL;

// POST /api/public/apply-leave
// Body: { employee_id, leave_type, start_date, end_date, reason }
// Anonymous submission — no auth required. The leave is written into
// portal_state.data.leaves as a Pending entry, HR gets notified, the teacher's
// personal email gets a "thanks, we've got your application" confirmation, and
// the whole thing is mirrored to a Google Sheet if configured.
export async function POST(req: NextRequest) {
  if (!SERVICE_ROLE) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });

  let body: {
    employee_id?: string;
    leave_type?: string;
    start_date?: string;
    end_date?: string;
    reason?: string;
    half_day?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }

  const employee_id = (body.employee_id || "").trim();
  const leave_type = (body.leave_type || "").trim().toUpperCase();
  const start_date = (body.start_date || "").trim();
  const end_date = (body.end_date || "").trim();
  const reason = (body.reason || "").trim();

  if (!employee_id || !leave_type || !start_date || !end_date || !reason) {
    return NextResponse.json({ ok: false, error: "Please fill every field." }, { status: 400 });
  }
  if (!/^(CL|EL|LWP)$/.test(leave_type)) {
    return NextResponse.json({ ok: false, error: "Invalid leave type." }, { status: 400 });
  }
  if (start_date > end_date) {
    return NextResponse.json({ ok: false, error: "End date can't be before start date." }, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // Load portal_state, find the employee, push a pending leave in
  const { data: portalRow } = await admin.from("portal_state").select("data").eq("id", "main").maybeSingle();
  if (!portalRow) return NextResponse.json({ ok: false, error: "Could not load portal state." }, { status: 500 });

  type Emp = { id: string; display_name?: string; email?: string; phone?: string; department?: string; designation?: string; is_active?: boolean };
  type Leave = { id: string; employee_id: string; leave_type: string; start_date: string; end_date: string; total_days: number; reason: string; status: string; applied_at: string; source: string; source_details?: string };
  const data = portalRow.data as { employees?: Emp[]; leaves?: Leave[] };
  const emp = (data.employees || []).find(e => e.id === employee_id);
  if (!emp) return NextResponse.json({ ok: false, error: "Employee not found. Please pick from the list." }, { status: 404 });
  if (emp.is_active === false) return NextResponse.json({ ok: false, error: "This employee is archived." }, { status: 400 });

  const isHalf = !!body.half_day;
  if (isHalf && start_date !== end_date) {
    return NextResponse.json({ ok: false, error: "Half-day leave must be a single date." }, { status: 400 });
  }
  const startTs = new Date(start_date + "T00:00:00Z").getTime();
  const endTs = new Date(end_date + "T00:00:00Z").getTime();
  const total_days = isHalf ? 0.5 : Math.round((endTs - startTs) / 86400000) + 1;

  const newLeave: Leave = {
    id: randomUUID().slice(0, 8),
    employee_id,
    leave_type,
    start_date,
    end_date,
    total_days,
    reason: isHalf ? `[Half-day] ${reason}` : reason,
    status: "Pending",
    applied_at: new Date().toISOString(),
    source: "anonymous_portal",
    source_details: "Submitted without login from teacher portal",
  };

  // Appended inside Postgres, atomically. Rewriting the whole blob from here
  // raced with the HR console's own saves and lost applications.
  const { error: updErr } = await admin.rpc("append_portal_leave", { p_leave: newLeave });
  if (updErr) return NextResponse.json({ ok: false, error: "Could not save application: " + updErr.message }, { status: 500 });

  // ─── Notifications (fire-and-forget in parallel) ─────────────────────────
  const fmt = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  const dateText = start_date === end_date ? fmt(start_date) : `${fmt(start_date)} → ${fmt(end_date)}`;
  const portalUrl = req.nextUrl.origin;
  const dispatches: Promise<unknown>[] = [];
  const results: Record<string, string> = {};

  // (a) HR notification email
  if (mailReady("hr") && HR_NOTIFY_EMAIL) {
    dispatches.push((async () => {
      try {
        const r = await sendMail({ from: "hr",
            to: [HR_NOTIFY_EMAIL],
            subject: `${emp.display_name} applied for ${leave_type} (${total_days} day${total_days === 1 ? "" : "s"})`,
            text: `${emp.display_name} just applied for ${leave_type}.\n\nDates: ${dateText}\nDays: ${total_days}\nReason: ${reason}\nSubmitted anonymously (no sign-in)\n\nReview: ${portalUrl}/`,
            html: renderEmail({ contactEmail: HR_EMAIL, theme: "notice",
              title: "New leave request",
              subtitle: `${emp.display_name}${emp.designation ? " · " + emp.designation : ""}`,
              bodyHtml: `<p><strong>${bEsc(emp.display_name)}</strong> has applied for leave.</p>
                <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
                  <tr><td style="padding:7px 0;color:#6B7280;border-bottom:1px solid #EEF0F2">Type</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #EEF0F2"><strong>${bEsc(leave_type)}</strong></td></tr>
                  <tr><td style="padding:7px 0;color:#6B7280;border-bottom:1px solid #EEF0F2">Dates</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #EEF0F2">${bEsc(dateText)}</td></tr>
                  <tr><td style="padding:7px 0;color:#6B7280;border-bottom:1px solid #EEF0F2">Days</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #EEF0F2">${total_days}</td></tr>
                  <tr><td style="padding:7px 0;color:#6B7280;vertical-align:top">Reason</td><td style="padding:7px 0;text-align:right">${bEsc(reason)}</td></tr>
                </table>
                <p style="margin:22px 0"><a href="${portalUrl}/" style="background:#B45309;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:8px;display:inline-block">Open the staff portal</a></p>`,
              footerNote: "Submitted from the leave form without signing in." }),
          });
        results.hr_email = r.ok ? "sent" : `failed:${r.status}`;
      } catch (e) { results.hr_email = "err:" + (e as Error).message; }
    })());
  }

  // (b) Teacher confirmation email — record explicit skip reasons so the UI can surface them
  if (!mailReady("hr")) {
    results.teacher_confirm = "skipped: no mail provider set in Vercel";
  } else if (!emp.email) {
    results.teacher_confirm = "skipped: no personal email on employee record";
  } else {
    dispatches.push((async () => {
      try {
        const r = await sendMail({ from: "hr",
            to: [emp.email!],
            subject: "We've received your leave application",
            text: `Hello ${emp.display_name?.split(" ")[0] || ""},\n\nThank you for applying. Here's what we received:\n\nType: ${leave_type}\nDates: ${dateText}\nDays: ${total_days}\nReason: ${reason}\n\nHR will review and let you know shortly. If you did not submit this, please tell the office immediately.\n\n— Eurokids JMD Enclave`,
            html: renderEmail({ contactEmail: HR_EMAIL, theme: "calm",
              title: "Thank you for applying",
              subtitle: `${SCHOOL_NAME} · leave application`,
              bodyHtml: `<p>Hello ${bEsc(emp.display_name?.split(" ")[0] || "")},</p>
                <p>We have received your leave application. Here is a copy for your records:</p>
                <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
                  <tr><td style="padding:7px 0;color:#6B7280;border-bottom:1px solid #EEF0F2">Type</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #EEF0F2"><strong>${bEsc(leave_type)}</strong></td></tr>
                  <tr><td style="padding:7px 0;color:#6B7280;border-bottom:1px solid #EEF0F2">Dates</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #EEF0F2">${bEsc(dateText)}</td></tr>
                  <tr><td style="padding:7px 0;color:#6B7280;border-bottom:1px solid #EEF0F2">Days</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #EEF0F2">${total_days}</td></tr>
                  <tr><td style="padding:7px 0;color:#6B7280;vertical-align:top">Reason</td><td style="padding:7px 0;text-align:right">${bEsc(reason)}</td></tr>
                </table>
                <p>HR will review it and let you know shortly. If you did not submit this, please tell the office right away.</p>`,
              footerNote: "You are receiving this because a leave application was submitted in your name." }),
          });
        if (r.ok) {
          results.teacher_confirm = "sent";
        } else {
          const errText = await r.text();
          results.teacher_confirm = `failed HTTP ${r.status}: ${errText.slice(0, 200)}`;
        }
      } catch (e) { results.teacher_confirm = "err:" + (e as Error).message; }
    })());
  }

  // (c) Slack + WhatsApp — reuse existing HR channels
  if (SLACK_WEBHOOK) {
    dispatches.push((async () => {
      try {
        const r = await fetch(SLACK_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `*${emp.display_name} applied for ${leave_type}* (${total_days}d)\n${dateText} — ${reason}` }) });
        results.slack = r.ok ? "sent" : `failed:${r.status}`;
      } catch (e) { results.slack = "err:" + (e as Error).message; }
    })());
  }
  if (WHATSAPP_PHONE && WHATSAPP_API_KEY) {
    dispatches.push((async () => {
      try {
        const msg = `${emp.display_name} applied for ${leave_type} (${total_days}d)\n${dateText}\nReason: ${reason}`;
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(WHATSAPP_PHONE)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(WHATSAPP_API_KEY)}`;
        const r = await fetch(url);
        results.whatsapp = r.ok ? "sent" : `failed:${r.status}`;
      } catch (e) { results.whatsapp = "err:" + (e as Error).message; }
    })());
  }

  // (d) Google Sheet backup — post to Apps Script webhook if configured
  if (GOOGLE_SHEET_WEBHOOK_URL) {
    dispatches.push((async () => {
      try {
        const r = await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applied_at: newLeave.applied_at,
            employee_id: emp.id,
            employee_name: emp.display_name,
            department: emp.department || "",
            designation: emp.designation || "",
            leave_type,
            start_date,
            end_date,
            total_days,
            reason,
            status: "Pending",
            source: "anonymous_portal",
            personal_email: emp.email || "",
          }),
        });
        results.gsheet = r.ok ? "sent" : `failed:${r.status}`;
      } catch (e) { results.gsheet = "err:" + (e as Error).message; }
    })());
  }

  await Promise.all(dispatches);

  // Build a candid, teacher-friendly message that reflects what actually happened.
  const parts: string[] = ["Application received. HR will review shortly."];
  const confirmStatus = results.teacher_confirm || "unknown";
  if (confirmStatus === "sent") {
    parts.push(`Confirmation sent to ${emp.email}. Check inbox + spam folder.`);
  } else if (confirmStatus.startsWith("skipped: no personal email")) {
    parts.push("(No personal email on file for you — ask the office to add one so future confirmations reach you.)");
  } else if (confirmStatus.startsWith("skipped: no mail provider")) {
    parts.push("(Email confirmations are not yet configured — ask the office.)");
  } else if (confirmStatus.startsWith("failed") || confirmStatus.startsWith("err")) {
    parts.push(`(Confirmation to ${emp.email} could not be delivered: ${confirmStatus}.)`);
  }
  return NextResponse.json({
    ok: true,
    message: parts.join(" "),
    leave_id: newLeave.id,
    personal_email: emp.email || null,
    notifications: results,
    diagnostics: {
      mail_configured: mailReady("hr"),
      resend_from: RESEND_FROM,
      hr_notify_email_present: !!HR_NOTIFY_EMAIL,
      employee_personal_email: emp.email || null,
    },
  });
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
