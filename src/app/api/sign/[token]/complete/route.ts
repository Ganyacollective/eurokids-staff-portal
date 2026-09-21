import { NextResponse } from "next/server";
import { admin, sha256, clientIp, logEvent } from "@/lib/letters-auth";
import { renderLetterPdf, LetterData } from "@/lib/letter-pdf";
import { renderEmail, esc, SCHOOL_NAME, plainFooter } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";

const ALERT_TO = (process.env.LETTERS_ALERT_EMAIL || "abhinav@ganya.in")
  .split(",").map((x) => x.trim()).filter(Boolean);

// POST /api/sign/[token]/complete — the moment of signing.
//
// Checks, in order: the link is live, the code is right and fresh, and the
// last four digits of her mobile match what the school holds. Then the
// signature is stored, the countersigned PDF is written to storage, and both
// sides get a copy. Everything that could later be disputed is recorded here.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const a = admin();

  const { data: l } = await a.from("appointment_letter")
    .select("*").eq("token", token).maybeSingle();
  if (!l) return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 404 });
  if (l.status === "signed") return NextResponse.json({ ok: false, error: "This letter is already signed." }, { status: 409 });
  if (l.token_expires_at && new Date(l.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 410 });
  }

  // ── the code ──────────────────────────────────────────────────────────
  if (!l.otp_hash || !l.otp_expires_at || new Date(l.otp_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "That code has expired. Ask for a new one." }, { status: 400 });
  }
  if ((l.otp_attempts || 0) >= 6) {
    await logEvent(a, l.id, "otp_locked", {}, req);
    return NextResponse.json({ ok: false, error: "Too many wrong codes. Ask for a new one." }, { status: 429 });
  }
  const given = String(body.otp || "").replace(/\D/g, "");
  if (!given || (await sha256(token + ":" + given)) !== l.otp_hash) {
    await a.from("appointment_letter").update({ otp_attempts: (l.otp_attempts || 0) + 1 }).eq("id", l.id);
    await logEvent(a, l.id, "otp_wrong", { attempt: (l.otp_attempts || 0) + 1 }, req);
    return NextResponse.json({ ok: false, error: "That code is not right. Check the email again." }, { status: 400 });
  }

  // ── something only she knows ──────────────────────────────────────────
  // A code emailed to an inbox proves control of the inbox. The last four of
  // the mobile the school holds is a second, independent thing — enough that
  // a colleague with access to a forwarded link cannot simply sign in her
  // place. Skipped only when the school holds no number for her.
  const onFile = String(l.to_phone || "").replace(/\D/g, "");
  if (onFile.length >= 4) {
    const four = String(body.phone_last4 || "").replace(/\D/g, "");
    if (four !== onFile.slice(-4)) {
      await a.from("appointment_letter").update({ otp_attempts: (l.otp_attempts || 0) + 1 }).eq("id", l.id);
      await logEvent(a, l.id, "phone_check_failed", {}, req);
      return NextResponse.json({ ok: false,
        error: "Those last four digits do not match the mobile number we have for you. Call the school if your number has changed." }, { status: 400 });
    }
  }

  const name = String(body.signer_name || "").trim();
  if (name.length < 3) return NextResponse.json({ ok: false, error: "Please type your full name." }, { status: 400 });
  const png = typeof body.signature_png === "string" && body.signature_png.startsWith("data:image/png")
    ? body.signature_png : null;
  if (!png) return NextResponse.json({ ok: false, error: "Please draw your signature in the box." }, { status: 400 });
  if (png.length > 400_000) return NextResponse.json({ ok: false, error: "That signature image is too large." }, { status: 413 });

  // ── the record ────────────────────────────────────────────────────────
  const at = new Date();
  const ip = clientIp(req);
  const agent = (req.headers.get("user-agent") || "").slice(0, 300);
  const stamp = at.toLocaleString("en-IN", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: true, timeZone: "Asia/Kolkata",
  }) + " IST";
  const reference = `EK-AL-${String(l.id).padStart(5, "0")}`;

  const base = (l.snapshot as { data: LetterData })?.data;
  if (!base) return NextResponse.json({ ok: false, error: "This letter has no content." }, { status: 500 });

  const signedData: LetterData = {
    ...base,
    signUrl: null,
    signature: {
      name, png, at: stamp,
      email: l.to_email, phone: l.to_phone ? "••••" + onFile.slice(-4) : null,
      ip: ip || null, agent, reference,
    },
  };
  const pdf = await renderLetterPdf(signedData);
  const signedHash = await sha256(pdf);

  const path = `signed/${l.id}-${(l.employee_name || "letter").replace(/[^\w]+/g, "-")}.pdf`;
  const up = await a.storage.from("letters").upload(path, Buffer.from(pdf), {
    contentType: "application/pdf", upsert: true,
  });

  const { error: uerr } = await a.from("appointment_letter").update({
    status: "signed", signed_at: at.toISOString(),
    signer_name: name, signature_png: png,
    otp_verified_at: at.toISOString(),
    signed_ip: ip || null, signed_agent: agent,
    signed_pdf_path: up.error ? null : path,
    otp_hash: null,                       // spent
    snapshot: { ...(l.snapshot as object), signed: signedData, signed_sha256: signedHash },
    updated_at: at.toISOString(),
  }).eq("id", l.id);
  if (uerr) return NextResponse.json({ ok: false, error: uerr.message }, { status: 500 });

  await logEvent(a, l.id, "signed",
    { name, reference, sha256: signedHash, storage: up.error ? "upload failed" : path }, req);

  // ── the copies ────────────────────────────────────────────────────────
  if (mailReady()) {
    const first = name.split(/\s+/)[0];
    const attachment = {
      filename: `Appointment Letter - ${l.employee_name} (signed).pdf`,
      content: Buffer.from(pdf).toString("base64"),
    };
    await sendMail({
      to: [l.to_email],
      subject: `Signed — your appointment letter · ${SCHOOL_NAME}`,
      html: renderEmail({
        title: "Thank you — that's done", subtitle: `${esc(l.employee_name)} · ${reference}`, theme: "calm",
        bodyHtml: `<p>Dear ${esc(first)},</p>
          <p>Your appointment letter is signed and attached. Please keep it somewhere safe — it is your copy of what we agreed.</p>
          <p>We are looking forward to having you with us.</p>`,
        footerNote: `Signed electronically on ${esc(stamp)} · reference ${reference}`,
      }),
      text: [`Dear ${first},`, "", "Your appointment letter is signed and attached. Please keep it safe.",
        `Signed ${stamp} · reference ${reference}`, plainFooter()].join("\n"),
      attachments: [attachment],
    });

    await sendMail({
      to: ALERT_TO,
      subject: `${l.employee_name} signed her appointment letter`,
      html: renderEmail({
        title: "Appointment letter signed", subtitle: `${esc(l.employee_name)} · ${reference}`, theme: "calm",
        bodyHtml: `<p><strong>${esc(l.employee_name)}</strong> signed at ${esc(stamp)}.</p>
          <p style="font-size:13px;color:#6B7280">Signed as “${esc(name)}” · ${esc(l.to_email || "")} · ${esc(ip || "no IP")}<br>
             Document hash ${esc(signedHash.slice(0, 32))}…</p>`,
        footerNote: "The signed copy is attached and stored against her record.",
      }),
      text: [`${l.employee_name} signed at ${stamp}.`, `Reference ${reference}`, plainFooter()].join("\n"),
      attachments: [attachment],
    });
  }

  return NextResponse.json({ ok: true, reference, signed_at: stamp });
}
