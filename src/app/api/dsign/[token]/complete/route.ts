import { NextResponse } from "next/server";
import { admin, sha256, clientIp, logDocEvent } from "@/lib/docs-auth";
import { renderDocumentPdf, type DocData, type DocSignature } from "@/lib/doc-pdf";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_EMAIL, plainFooter } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";

const ALERT_TO = (process.env.DOCS_ALERT_EMAIL || process.env.HR_NOTIFY_EMAIL || "admin@eurokidsjmdenclave.org")
  .split(",").map((x) => x.trim()).filter(Boolean);

// POST /api/dsign/[token]/complete — the parent signs.
//
// By link: the code emailed to them, plus the last four of the mobile the
// school holds. At the desk: no code, because the coordinator is standing
// there and is named on the certificate as the witness — which for a
// liability waiver is the better evidence of the two.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const a = admin();

  const { data: r } = await a.from("signature_request").select("*").eq("token", token).maybeSingle();
  if (!r) return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 404 });
  if (r.status === "signed") return NextResponse.json({ ok: false, error: "This form is already signed." }, { status: 409 });
  if (r.token_expires_at && new Date(r.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 410 });
  }

  const inPerson = r.channel === "in_person";
  const onFile = String(r.to_phone || "").replace(/\D/g, "");

  if (!inPerson) {
    if (!r.otp_hash || !r.otp_expires_at || new Date(r.otp_expires_at) < new Date()) {
      return NextResponse.json({ ok: false, error: "That code has expired. Ask for a new one." }, { status: 400 });
    }
    if ((r.otp_attempts || 0) >= 6) {
      await logDocEvent(a, r.id, "otp_locked", {}, req);
      return NextResponse.json({ ok: false, error: "Too many wrong codes. Ask for a new one." }, { status: 429 });
    }
    const given = String(body.otp || "").replace(/\D/g, "");
    if (!given || (await sha256(token + ":" + given)) !== r.otp_hash) {
      await a.from("signature_request").update({ otp_attempts: (r.otp_attempts || 0) + 1 }).eq("id", r.id);
      await logDocEvent(a, r.id, "otp_wrong", {}, req);
      return NextResponse.json({ ok: false, error: "That code is not right. Check the email again." }, { status: 400 });
    }
    if (onFile.length >= 4) {
      const four = String(body.phone_last4 || "").replace(/\D/g, "");
      if (four !== onFile.slice(-4)) {
        await a.from("signature_request").update({ otp_attempts: (r.otp_attempts || 0) + 1 }).eq("id", r.id);
        await logDocEvent(a, r.id, "phone_check_failed", {}, req);
        return NextResponse.json({ ok: false,
          error: "Those last four digits do not match the number we have for you. Please call the school." }, { status: 400 });
      }
    }
  }

  const name = String(body.signer_name || "").trim();
  if (name.length < 3) return NextResponse.json({ ok: false, error: "Please type your full name." }, { status: 400 });
  const png = typeof body.signature_png === "string" && body.signature_png.startsWith("data:image/png")
    ? body.signature_png : null;
  if (!png) return NextResponse.json({ ok: false, error: "Please sign in the box." }, { status: 400 });
  if (png.length > 400_000) return NextResponse.json({ ok: false, error: "That signature image is too large." }, { status: 413 });

  const at = new Date();
  const ip = clientIp(req);
  const agent = (req.headers.get("user-agent") || "").slice(0, 300);
  const stamp = at.toLocaleString("en-IN", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: true, timeZone: "Asia/Kolkata",
  }) + " IST";
  const reference = `EK-DOC-${String(r.id).padStart(5, "0")}`;

  // The trail, in the same shape a signing service prints it.
  const { data: events } = await a.from("signature_event")
    .select("at, event, ip").eq("request_id", r.id).order("at");
  const when = (t: string) => new Date(t).toLocaleString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "Asia/Kolkata" }).replace(",", " ·") + " IST";
  const WORDS: Record<string, string> = {
    sent: `Sent for signature to ${r.party_name} (${r.to_email}) by the school`,
    raised_in_person: `Raised at the school office by ${r.witnessed_by || "the coordinator"}`,
    viewed: `Opened by ${r.party_name}`,
    otp_sent: `One-time code emailed to ${r.to_email}`,
    otp_wrong: "An incorrect code was entered",
    phone_check_failed: "The mobile check did not match",
  };
  const history = (events || []).filter((e) => WORDS[e.event as string])
    .map((e) => ({ at: when(e.at as string), what: WORDS[e.event as string], ip: (e.ip as string) || null }));
  history.push({ at: when(at.toISOString()), what: `Signed by ${name}`, ip: ip || null });
  history.push({ at: when(at.toISOString()), what: "The document has been completed.", ip: null });

  const base = r.doc as DocData;
  const signature: DocSignature = {
    name, png, at: stamp,
    email: r.to_email, phone: onFile.length >= 4 ? "••••" + onFile.slice(-4) : null,
    ip: ip || null, agent, reference, history,
    sha256: (r.pdf_sha256 as string) || null,
    channel: inPerson ? "in_person" : "link",
    witnessedBy: r.witnessed_by || null,
  };
  const signed: DocData = { ...base, signUrl: null, signature };
  const pdf = await renderDocumentPdf(signed);

  const path = `signed/${r.id}-${String(r.template_slug)}-${String(r.child_name || "child").replace(/[^\w]+/g, "-")}.pdf`;
  const up = await a.storage.from("documents").upload(path, Buffer.from(pdf), {
    contentType: "application/pdf", upsert: true,
  });

  const { error: uerr } = await a.from("signature_request").update({
    status: "signed", signed_at: at.toISOString(),
    signer_name: name, signature_png: png,
    signed_ip: ip || null, signed_agent: agent,
    signed_pdf_path: up.error ? null : path,
    otp_hash: null,
    doc: signed,
    updated_at: at.toISOString(),
  }).eq("id", r.id);
  if (uerr) return NextResponse.json({ ok: false, error: uerr.message }, { status: 500 });

  await logDocEvent(a, r.id, "signed", { name, reference, storage: up.error ? "upload failed" : path }, req);

  if (mailReady()) {
    const attachment = { filename: `${base.title} - ${r.child_name} (signed).pdf`,
      content: Buffer.from(pdf).toString("base64") };
    if (r.to_email) {
      await sendMail({
        to: [r.to_email],
        subject: `Signed — ${base.title} for ${r.child_name}`,
        html: renderEmail({
          title: "Thank you — that's signed", subtitle: `${esc(r.child_name || "")} · ${reference}`, theme: "calm",
          bodyHtml: `<p>Dear ${esc(name.split(/\s+/)[0])},</p>
            <p>Your signed copy is attached. Please keep it — it is your record of what was agreed.</p>`,
          footerNote: `Signed on ${esc(stamp)} · reference ${reference}`,
        }),
        text: [`Your signed copy is attached.`, `Signed ${stamp} · reference ${reference}`, plainFooter(SCHOOL_EMAIL)].join("\n"),
        attachments: [attachment],
      });
    }
    await sendMail({
      to: ALERT_TO,
      subject: `${r.party_name} signed: ${base.title} — ${r.child_name}`,
      html: renderEmail({
        title: "Form signed", subtitle: `${esc(r.child_name || "")} · ${reference}`, theme: "calm",
        bodyHtml: `<p><strong>${esc(r.party_name)}</strong> signed <em>${esc(base.title)}</em> for
            <strong>${esc(r.child_name || "")}</strong> at ${esc(stamp)}.</p>
          <p style="font-size:13px;color:#6B7280">${inPerson
            ? `Signed in person, witnessed by ${esc(r.witnessed_by || "the coordinator")}.`
            : `Signed by link · ${esc(r.to_email || "")} · ${esc(ip || "no IP")}`}</p>`,
        footerNote: "The signed copy is attached and stored against the child's record.",
      }),
      text: [`${r.party_name} signed ${base.title} for ${r.child_name} at ${stamp}.`, plainFooter(SCHOOL_EMAIL)].join("\n"),
      attachments: [attachment],
    });
  }

  return NextResponse.json({ ok: true, reference, signed_at: stamp });
}
