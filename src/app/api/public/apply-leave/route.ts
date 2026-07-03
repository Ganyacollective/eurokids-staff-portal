import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Eurokids Portal <onboarding@resend.dev>";
const HR_NOTIFY_EMAIL = process.env.HR_NOTIFY_EMAIL;
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

  const startTs = new Date(start_date + "T00:00:00Z").getTime();
  const endTs = new Date(end_date + "T00:00:00Z").getTime();
  const total_days = Math.round((endTs - startTs) / 86400000) + 1;

  const newLeave: Leave = {
    id: randomUUID().slice(0, 8),
    employee_id,
    leave_type,
    start_date,
    end_date,
    total_days,
    reason,
    status: "Pending",
    applied_at: new Date().toISOString(),
    source: "anonymous_portal",
    source_details: "Submitted without login from teacher portal",
  };

  const leaves = [...(data.leaves || []), newLeave];
  const updated = { ...data, leaves };

  const { error: updErr } = await admin.from("portal_state").upsert({ id: "main", data: updated, updated_at: new Date().toISOString() });
  if (updErr) return NextResponse.json({ ok: false, error: "Could not save application: " + updErr.message }, { status: 500 });

  // ─── Notifications (fire-and-forget in parallel) ─────────────────────────
  const fmt = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  const dateText = start_date === end_date ? fmt(start_date) : `${fmt(start_date)} → ${fmt(end_date)}`;
  const portalUrl = req.nextUrl.origin;
  const dispatches: Promise<unknown>[] = [];
  const results: Record<string, string> = {};

  // (a) HR notification email
  if (RESEND_API_KEY && HR_NOTIFY_EMAIL) {
    dispatches.push((async () => {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: RESEND_FROM, to: [HR_NOTIFY_EMAIL],
            subject: `${emp.display_name} applied for ${leave_type} (${total_days} day${total_days === 1 ? "" : "s"})`,
            text: `${emp.display_name} just applied for ${leave_type}.\n\nDates: ${dateText}\nDays: ${total_days}\nReason: ${reason}\nSubmitted anonymously (no sign-in)\n\nReview: ${portalUrl}/`,
            html: `<div style="font-family:sans-serif"><h2 style="color:#21409A">New leave request</h2><p><strong>${emp.display_name}</strong>${emp.designation?` <span style="color:#666">(${emp.designation})</span>`:""}</p><p><strong>Type:</strong> ${leave_type}<br><strong>Dates:</strong> ${dateText}<br><strong>Days:</strong> ${total_days}<br><strong>Reason:</strong> ${escapeHtml(reason)}</p><p style="color:#888;font-size:11pt">Submitted without login.</p><a href="${portalUrl}/" style="background:#F58220;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Open HR portal</a></div>`,
          }),
        });
        results.hr_email = r.ok ? "sent" : `failed:${r.status}`;
      } catch (e) { results.hr_email = "err:" + (e as Error).message; }
    })());
  }

  // (b) Teacher confirmation email
  if (RESEND_API_KEY && emp.email) {
    dispatches.push((async () => {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: RESEND_FROM, to: [emp.email],
            subject: "We've received your leave application",
            text: `Hello ${emp.display_name?.split(" ")[0] || ""},\n\nThank you for applying. Here's what we received:\n\nType: ${leave_type}\nDates: ${dateText}\nDays: ${total_days}\nReason: ${reason}\n\nHR will review and let you know shortly. If you did not submit this, please tell the office immediately.\n\n— Eurokids JMD Enclave`,
            html: `<div style="font-family:sans-serif;max-width:520px"><h2 style="color:#21409A">Thank you for applying</h2><p>Hello ${emp.display_name?.split(" ")[0]||""},</p><p>We've received your leave application. Here's a copy for your records:</p><table style="border-collapse:collapse;font-size:14px;margin:14px 0"><tr><td style="padding:6px 12px 6px 0;color:#718096">Type</td><td><strong>${leave_type}</strong></td></tr><tr><td style="padding:6px 12px 6px 0;color:#718096">Dates</td><td>${dateText}</td></tr><tr><td style="padding:6px 12px 6px 0;color:#718096">Days</td><td>${total_days}</td></tr><tr><td style="padding:6px 12px 6px 0;color:#718096;vertical-align:top">Reason</td><td>${escapeHtml(reason)}</td></tr></table><p>HR will review and let you know shortly. If you did not submit this application, please tell the office right away.</p><p style="color:#888;font-size:11pt">— Eurokids JMD Enclave</p></div>`,
          }),
        });
        results.teacher_confirm = r.ok ? "sent" : `failed:${r.status}`;
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

  return NextResponse.json({
    ok: true,
    message: `Application received. HR will review shortly.${emp.email ? " A confirmation has been sent to your personal email." : ""}`,
    leave_id: newLeave.id,
    notifications: results,
  });
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
