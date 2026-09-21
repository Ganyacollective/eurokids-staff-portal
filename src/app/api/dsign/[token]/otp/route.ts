import { NextResponse } from "next/server";
import { admin, sha256, logDocEvent } from "@/lib/docs-auth";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_PHONE, SCHOOL_EMAIL, plainFooter } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";

// The one-time code. Only ever needed for a link — a parent signing at the
// desk is identified by the person standing in front of them.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const a = admin();
  const { data: r } = await a.from("signature_request")
    .select("id, status, to_email, party_name, child_name, channel, otp_expires_at, token_expires_at")
    .eq("token", token).maybeSingle();
  if (!r) return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 404 });
  if (r.status === "signed") return NextResponse.json({ ok: false, error: "This form is already signed." }, { status: 409 });
  if (r.token_expires_at && new Date(r.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 410 });
  }
  if (r.channel === "in_person") return NextResponse.json({ ok: true, in_person: true });
  if (!r.to_email) return NextResponse.json({ ok: false, error: "There is no email address on this form." }, { status: 400 });

  if (r.otp_expires_at && new Date(r.otp_expires_at).getTime() - Date.now() > 9 * 60 * 1000) {
    return NextResponse.json({ ok: true, resent: false, sent_to: hint(r.to_email),
      note: "A code was just sent. Check your email, including the spam folder." });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await a.from("signature_request").update({
    otp_hash: await sha256(token + ":" + code),
    otp_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    otp_attempts: 0,
  }).eq("id", r.id);

  if (!mailReady()) return NextResponse.json({ ok: false, error: "Email is not configured on the server." }, { status: 500 });
  const first = String(r.party_name || "").split(/\s+/)[0];
  const sent = await sendMail({
    to: [r.to_email],
    subject: `${code} is your code to sign the form for ${r.child_name}`,
    html: renderEmail({
      title: "Your signing code", subtitle: SCHOOL_NAME, theme: "school",
      bodyHtml: `<p>Dear ${esc(first)},</p>
        <p>Here is the code to sign the form for <strong>${esc(r.child_name || "your child")}</strong>. It is good for ten minutes.</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:9px;margin:22px 0;color:#21409A">${code}</p>
        <p>If you did not ask for this, ignore this email — nothing has been signed. Call us on ${SCHOOL_PHONE} if you are unsure.</p>`,
      footerNote: "This code signs one document. Never share it with anyone, including school staff.",
    }),
    text: [`Dear ${first},`, "", `Your code is ${code}. It is good for ten minutes.`,
      "If you did not ask for this, ignore this email.", plainFooter(SCHOOL_EMAIL)].join("\n"),
  });
  await logDocEvent(a, r.id, sent.ok ? "otp_sent" : "otp_send_failed", { to: hint(r.to_email) }, req);
  if (!sent.ok) return NextResponse.json({ ok: false, error: "The code could not be emailed. Call the school." }, { status: 502 });
  return NextResponse.json({ ok: true, sent_to: hint(r.to_email) });
}

function hint(email?: string | null) {
  const v = String(email || "");
  if (!v.includes("@")) return v;
  const [u, d] = v.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(2, u.length - 2))}@${d}`;
}
