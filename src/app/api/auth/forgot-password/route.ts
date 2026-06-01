import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Eurokids Portal <onboarding@resend.dev>";

// POST /api/auth/forgot-password
// Body: { email }
// Resets the user's password and dispatches the new password to whichever channels
// are configured. Returns candid status so HR can diagnose issues quickly.
export async function POST(req: NextRequest) {
  let body: { email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 }); }
  const email = (body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Please enter an email address." }, { status: 400 });

  // Quick env sanity check
  if (!SERVICE_ROLE) {
    console.error("[forgot-password] SUPABASE_SERVICE_ROLE_KEY is not set in Vercel env");
    return NextResponse.json({ ok: false, error: "Server misconfigured (missing service role)." }, { status: 500 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Locate the auth user
  let target: { id: string; email?: string | null } | undefined;
  for (let page = 1; page <= 20 && !target; page++) {
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("[forgot-password] listUsers error", error);
      return NextResponse.json({ ok: false, error: "Could not look up your account." }, { status: 500 });
    }
    const users = list?.users || [];
    target = users.find((u) => (u.email || "").toLowerCase() === email);
    if (users.length < 200) break;
  }
  if (!target) {
    return NextResponse.json({ ok: false, error: "No account exists with that email. Check spelling, or ask the office." }, { status: 404 });
  }

  // 2) Look up teacher_links → portal_state for personal contact details
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

  // If we have NO destination to dispatch to, fail fast with a clear message
  if (!personalEmail && !(whatsappKey && phone)) {
    return NextResponse.json({
      ok: false,
      error: "No personal email or WhatsApp on file for this account. Please ask the office to update your contact details.",
    }, { status: 422 });
  }

  // 3) Generate a fresh, memorable password
  const newPassword = "eurokids" + Math.floor(100 + Math.random() * 900);

  // 4) Apply the password
  const { error: updErr } = await admin.auth.admin.updateUserById(target.id, { password: newPassword });
  if (updErr) {
    console.error("[forgot-password] updateUserById error", updErr);
    return NextResponse.json({ ok: false, error: "Could not reset password: " + updErr.message }, { status: 500 });
  }

  // 5) Dispatch via email and/or WhatsApp
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
  const errors: string[] = [];

  // Email via Resend
  if (personalEmail) {
    if (!RESEND_API_KEY) {
      errors.push("Email skipped: RESEND_API_KEY is not configured in Vercel.");
    } else {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({ from: RESEND_FROM, to: [personalEmail], subject, text: textBody, html: htmlBody }),
        });
        if (r.ok) {
          sent.email = true;
        } else {
          const txt = await r.text();
          console.error("[forgot-password] Resend error", r.status, txt);
          errors.push(`Email failed (Resend ${r.status}): ${txt.slice(0, 200)}`);
        }
      } catch (e: unknown) {
        errors.push("Email failed: " + (e instanceof Error ? e.message : String(e)));
      }
    }
  }

  // WhatsApp via CallMeBot
  if (whatsappKey && phone) {
    try {
      const msg = `Hello ${displayName.split(" ")[0]}, your new Eurokids portal password is: ${newPassword}\n\nSign in at ${portalUrl}\n\nIf you didn't request this, tell the office.`;
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(msg)}&apikey=${encodeURIComponent(whatsappKey)}`;
      const r = await fetch(url);
      if (r.ok) sent.whatsapp = true;
      else errors.push(`WhatsApp failed (${r.status}).`);
    } catch (e: unknown) {
      errors.push("WhatsApp failed: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  // Compose response
  if (!sent.email && !sent.whatsapp) {
    return NextResponse.json({
      ok: false,
      error: "Password was reset but could not be delivered. " + (errors.join(" ") || "No channels succeeded."),
      details: errors,
    }, { status: 500 });
  }

  let msg = "Password reset and sent";
  if (sent.email && sent.whatsapp) msg += " to your email and WhatsApp.";
  else if (sent.email) msg += ` to ${personalEmail}.`;
  else if (sent.whatsapp) msg += " to your WhatsApp.";

  return NextResponse.json({ ok: true, message: msg, sent, warnings: errors });
}
