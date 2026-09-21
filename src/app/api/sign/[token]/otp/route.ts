import { NextResponse } from "next/server";
import { admin, sha256, logEvent } from "@/lib/letters-auth";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_PHONE, plainFooter , HR_EMAIL } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";

// POST /api/sign/[token]/otp — send the one-time code.
//
// The code goes to the email the letter was sent to, which means signing
// requires control of that inbox at the moment of signing, not merely
// possession of a forwarded link. Paired with the last four digits of her
// mobile at the next step, it is a reasonable answer to "was it really her?"
// — the question any electronic signature ultimately has to survive.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const a = admin();
  const { data: l } = await a.from("appointment_letter")
    .select("id, status, to_email, employee_name, otp_expires_at, token_expires_at")
    .eq("token", token).maybeSingle();

  if (!l) return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 404 });
  if (l.status === "signed") return NextResponse.json({ ok: false, error: "This letter is already signed." }, { status: 409 });
  if (l.token_expires_at && new Date(l.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 410 });
  }
  if (!l.to_email) return NextResponse.json({ ok: false, error: "There is no email address on this letter." }, { status: 400 });

  // Don't let a stuck finger send twenty emails.
  if (l.otp_expires_at && new Date(l.otp_expires_at).getTime() - Date.now() > 9 * 60 * 1000) {
    return NextResponse.json({ ok: true, resent: false, sent_to: hint(l.to_email),
      note: "A code was just sent. Check your email, including the spam folder." });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await a.from("appointment_letter").update({
    otp_hash: await sha256(token + ":" + code),
    otp_sent_to: l.to_email,
    otp_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    otp_attempts: 0,
  }).eq("id", l.id);

  if (!mailReady("hr")) return NextResponse.json({ ok: false, error: "Email is not configured on the server." }, { status: 500 });

  const first = String(l.employee_name || "").split(/\s+/)[0];
  const r = await sendMail({
    from: "hr",
    to: [l.to_email],
    subject: `${code} is your code to sign your appointment letter`,
    html: renderEmail({ contactEmail: HR_EMAIL,
      title: "Your signing code", subtitle: SCHOOL_NAME, theme: "calm",
      bodyHtml: `<p>Dear ${esc(first)},</p>
        <p>Here is the code to sign your appointment letter. It is good for ten minutes.</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:9px;margin:22px 0;color:#15803D">${code}</p>
        <p>If you did not ask for this, you can ignore this email — nothing has been signed. Call us on ${SCHOOL_PHONE} if you are unsure.</p>`,
      footerNote: "This code lets you sign one document. Never share it with anyone, including school staff.",
    }),
    text: [`Dear ${first},`, "", `Your code to sign your appointment letter is ${code}. It is good for ten minutes.`,
      "If you did not ask for this, ignore this email — nothing has been signed.", plainFooter(HR_EMAIL)].join("\n"),
  });

  await logEvent(a, l.id, r.ok ? "otp_sent" : "otp_send_failed", { to: hint(l.to_email) }, req);
  if (!r.ok) return NextResponse.json({ ok: false, error: "The code could not be emailed. Call the school." }, { status: 502 });
  return NextResponse.json({ ok: true, sent_to: hint(l.to_email) });
}

function hint(email?: string | null) {
  const v = String(email || "");
  if (!v.includes("@")) return v;
  const [u, d] = v.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(2, u.length - 2))}@${d}`;
}
