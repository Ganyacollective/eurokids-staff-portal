import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Eurokids Portal <onboarding@resend.dev>";
// NB: WhatsApp delivery requires a per-teacher CallMeBot API key stored on
// their employee record (employee.whatsapp_api_key). CallMeBot's free tier
// binds each key to a specific authorized phone — keys are not interchangeable.
// If a teacher hasn't set up their personal CallMeBot key, we fall back to
// email only.

// POST /api/auth/forgot-password
// Body: { email }
// Public (no auth). Resets the user's password and dispatches the new password
// to their personal email and WhatsApp number on file.
export async function POST(req: NextRequest) {
  let body: { email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }  // always answer vaguely
  const email = (body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: true });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Locate the auth user
  let target: { id: string; email?: string | null } | undefined;
  for (let page = 1; page <= 20 && !target; page++) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = list?.users || [];
    target = users.find((u) => (u.email || "").toLowerCase() === email);
    if (users.length < 200) break;
  }
  if (!target) {
    // Don't disclose absence; return a generic acknowledgement
    return NextResponse.json({ ok: true, sent: { email: false, whatsapp: false } });
  }

  // 2) Look up the teacher_links → portal_state for personal contact details
  const { data: link } = await admin.from("teacher_links").select("employee_id, display_name").eq("user_id", target.id).maybeSingle();
  let personalEmail: string | null = null;
  let phone: string | null = null;
  let whatsappKey: string | null = null;
  let displayName = link?.display_name || "Eurokids staff";
  if (link?.employee_id) {
    const { data: portal } = await admin.from("portal_state").select("data").eq("id", "main").maybeSingle();
    if (portal?.data?.employees) {
      const emp = portal.data.employees.find((e: { id: string }) => e.id === link.employee_id);
      if (emp) {
        personalEmail = (emp.email || "").trim() || null;
        phone = (emp.phone || "").replace(/\D/g, "") || null;
        whatsappKey = (emp.whatsapp_api_key || "").trim() || null;
        if (emp.display_name) displayName = emp.display_name;
      }
    }
  }

  // 3) Generate a fresh, memorable password
  const newPassword = "eurokids" + Math.floor(100 + Math.random() * 900);

  // 4) Apply the password
  const { error: updErr } = await admin.auth.admin.updateUserById(target.id, { password: newPassword });
  if (updErr) {
    return NextResponse.json({ ok: false, error: "Could not reset password. Please contact the office." }, { status: 500 });
  }

  // 5) Dispatch via email + WhatsApp, in parallel; report which succeeded
  const portalUrl = req.nextUrl.origin + "/teacher";
  const subject = "Your Eurokids portal password has been reset";
  const textBody = [
    `Hello ${displayName.split(" ")[0]},`,
    "",
    "You requested a password reset for the Eurokids JMD Enclave staff portal.",
    "",
    `Your new password is: ${newPassword}`,
    "",
    `Sign in at: ${portalUrl}`,
    "Use your email and the new password above.",
    "",
    "If you didn't request this, please contact the office immediately.",
    "",
    "— Eurokids JMD Enclave",
  ].join("\n");

  const htmlBody = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1A202C;max-width:520px;line-height:1.5">
      <h2 style="color:#21409A;margin:0 0 12px">Your portal password has been reset</h2>
      <p>Hello ${displayName.split(" ")[0]},</p>
      <p>You requested a password reset for the Eurokids JMD Enclave staff portal. Here's your new password:</p>
      <div style="background:#F3F6FB;border:1px solid #DCE5F2;border-radius:10px;padding:14px;text-align:center;margin:14px 0">
        <div style="font-size:11pt;color:#718096;text-transform:uppercase;letter-spacing:0.1em;font-weight:600">New password</div>
        <div style="font-family:'SF Mono',Menlo,monospace;font-size:20pt;font-weight:700;color:#21409A;margin-top:6px;letter-spacing:0.05em">${newPassword}</div>
      </div>
      <a href="${portalUrl}" style="background:#F58220;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Sign in to portal</a>
      <p style="color:#718096;font-size:10pt;margin-top:18px">If you didn't request this, please tell the office immediately.</p>
    </div>
  `;

  const sent = { email: false, whatsapp: false };

  // Email via Resend
  if (RESEND_API_KEY && personalEmail) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: RESEND_FROM, to: [personalEmail], subject, text: textBody, html: htmlBody }),
      });
      sent.email = r.ok;
    } catch { /* ignore */ }
  }

  // WhatsApp via CallMeBot — only if this teacher has their own authorized API key
  if (whatsappKey && phone) {
    try {
      const msg = `Hello ${displayName.split(" ")[0]}, your new Eurokids portal password is: ${newPassword}\n\nSign in at ${portalUrl}\n\nIf you didn't request this, tell the office.`;
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(whatsappKey)}`;
      const r = await fetch(url);
      sent.whatsapp = r.ok;
    } catch { /* ignore */ }
  }

  return NextResponse.json({ ok: true, sent, hasEmail: !!personalEmail, hasPhone: !!phone });
}
