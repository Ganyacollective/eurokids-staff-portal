import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Notification destinations — all optional. Set in Vercel env vars.
const RESEND_API_KEY   = process.env.RESEND_API_KEY;
const RESEND_FROM      = process.env.RESEND_FROM || "Eurokids Portal <onboarding@resend.dev>";
const HR_NOTIFY_EMAIL  = process.env.HR_NOTIFY_EMAIL;
const SLACK_WEBHOOK    = process.env.SLACK_WEBHOOK_URL;
const WHATSAPP_PHONE   = process.env.WHATSAPP_PHONE;        // e.g. 919876543210
const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;      // CallMeBot key
const GOOGLE_SHEET_WEBHOOK_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL;

// POST /api/notify-leave
// Body: { request_id }
// Sends notifications about a freshly submitted leave_requests row.
export async function POST(req: NextRequest) {
  // Verify caller via Bearer token
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  const token = match[1];

  const verifier = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: verErr } = await verifier.auth.getUser(token);
  if (verErr || !userResult?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  let body: { request_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const request_id = (body.request_id || "").trim();
  if (!request_id) return NextResponse.json({ error: "request_id required" }, { status: 400 });

  // Fetch the request + teacher info via service role (the user's RLS only sees their own, which is fine)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: lr, error: lrErr } = await admin.from("leave_requests").select("*").eq("id", request_id).single();
  if (lrErr || !lr) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const { data: link } = await admin.from("teacher_links").select("display_name, department, designation").eq("user_id", lr.user_id).maybeSingle();
  const teacherName = link?.display_name || userResult.user.email || "A staff member";
  const role = link?.designation || link?.department || "";

  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  const dateText = lr.start_date === lr.end_date ? fmt(lr.start_date) : `${fmt(lr.start_date)} → ${fmt(lr.end_date)}`;
  const days = Number(lr.total_days);
  const portalUrl = req.nextUrl.origin + "/";

  const subject = `${teacherName} applied for ${lr.leave_type} (${days} day${days === 1 ? "" : "s"})`;
  const lines = [
    `${teacherName}${role ? ` (${role})` : ""} just submitted a leave request.`,
    "",
    `Type:    ${lr.leave_type}`,
    `Dates:   ${dateText}`,
    `Days:    ${days}`,
    `Reason:  ${lr.reason || "(not provided)"}`,
    "",
    `Open the HR Inbox to approve or reject: ${portalUrl}`,
  ];
  const textBody = lines.join("\n");
  const htmlBody = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#1F2937;max-width:520px">
      <h2 style="color:#F58220;margin:0 0 8px">New leave request</h2>
      <p style="margin:0 0 14px"><strong>${teacherName}</strong>${role ? ` <span style="color:#6B7280">(${role})</span>` : ""} just submitted a leave request.</p>
      <table style="border-collapse:collapse;font-size:14px;width:100%;margin-bottom:18px">
        <tr><td style="padding:6px 12px 6px 0;color:#6B7280">Type</td><td><strong>${lr.leave_type}</strong></td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6B7280">Dates</td><td>${dateText}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6B7280">Days</td><td>${days}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#6B7280;vertical-align:top">Reason</td><td>${(lr.reason || "(not provided)").replace(/</g, "&lt;")}</td></tr>
      </table>
      <a href="${portalUrl}" style="background:#F58220;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Open HR Inbox</a>
    </div>
  `;

  const results: Record<string, string> = {};

  // 1) Resend email
  if (RESEND_API_KEY && HR_NOTIFY_EMAIL) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: RESEND_FROM, to: [HR_NOTIFY_EMAIL], subject, text: textBody, html: htmlBody }),
      });
      results.email = r.ok ? "sent" : `failed: ${r.status}`;
    } catch (e: unknown) { results.email = "failed: " + (e instanceof Error ? e.message : String(e)); }
  } else { results.email = "skipped (no RESEND_API_KEY or HR_NOTIFY_EMAIL)"; }

  // 2) Slack webhook
  if (SLACK_WEBHOOK) {
    try {
      const r = await fetch(SLACK_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `*${subject}*\n${dateText} — ${lr.reason || ""}\nOpen: ${portalUrl}` }),
      });
      results.slack = r.ok ? "sent" : `failed: ${r.status}`;
    } catch (e: unknown) { results.slack = "failed: " + (e instanceof Error ? e.message : String(e)); }
  } else { results.slack = "skipped (no SLACK_WEBHOOK_URL)"; }

  // 3) WhatsApp via CallMeBot
  if (WHATSAPP_PHONE && WHATSAPP_API_KEY) {
    try {
      const msg = `${subject}\n${dateText}\nReason: ${lr.reason || "(none)"}\nOpen: ${portalUrl}`;
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(WHATSAPP_PHONE)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(WHATSAPP_API_KEY)}`;
      const r = await fetch(url);
      results.whatsapp = r.ok ? "sent" : `failed: ${r.status}`;
    } catch (e: unknown) { results.whatsapp = "failed: " + (e instanceof Error ? e.message : String(e)); }
  } else { results.whatsapp = "skipped (no WHATSAPP_PHONE or WHATSAPP_API_KEY)"; }

  // 4) Google Sheet backup — mirror this leave to a Sheet if webhook is configured
  if (GOOGLE_SHEET_WEBHOOK_URL) {
    try {
      const r = await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applied_at: lr.applied_at,
          employee_id: lr.employee_id,
          employee_name: teacherName,
          department: link?.department || "",
          designation: link?.designation || "",
          leave_type: lr.leave_type,
          start_date: lr.start_date,
          end_date: lr.end_date,
          total_days: Number(lr.total_days),
          reason: lr.reason || "",
          status: lr.status || "Pending",
          source: "teacher_portal",
        }),
      });
      results.gsheet = r.ok ? "sent" : `failed: ${r.status}`;
    } catch (e: unknown) { results.gsheet = "failed: " + (e instanceof Error ? e.message : String(e)); }
  } else { results.gsheet = "skipped (no GOOGLE_SHEET_WEBHOOK_URL)"; }

  return NextResponse.json({ ok: true, request_id, results });
}
