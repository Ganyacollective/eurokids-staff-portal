import { NextResponse } from "next/server";
import { requireDocuments, admin, buildDoc, missingForDoc, newToken, sha256, logDocEvent, type DocTemplate } from "@/lib/docs-auth";
import { renderDocumentPdf } from "@/lib/doc-pdf";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_PHONE, SCHOOL_EMAIL, plainFooter, SITE } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";

// POST /api/docs/send — raise a declaration for signature.
//
// Two ways out, because the school has two situations. A parent at the desk
// signs on the iPad there and then, with the coordinator watching — which is
// the stronger record for a liability waiver, because someone can say they
// saw it happen. A parent who is not here gets a private link and a code.
// Either way the document is frozen at this moment and never re-rendered
// from a template that might change later.
//
// These come from admin@, not hr@: it is the office writing to a parent about
// their child, and a reply belongs in the office inbox.
export async function POST(req: Request) {
  const who = await requireDocuments(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const body = await req.json().catch(() => ({}));
  const a = admin();
  const { data: tplRow } = await a.from("document_template").select("*").eq("id", body.template_id).maybeSingle();
  if (!tplRow) return NextResponse.json({ ok: false, error: "That form no longer exists." }, { status: 404 });
  const tpl = tplRow as DocTemplate;

  const channel: "link" | "in_person" = body.channel === "in_person" ? "in_person" : "link";
  const input = {
    childName: String(body.child_name || "").trim(),
    childUin: String(body.child_uin || "").trim() || null,
    partyName: String(body.party_name || "").trim(),
    email: String(body.to_email || "").trim() || null,
    phone: String(body.to_phone || "").trim() || null,
    values: (body.values || {}) as Record<string, string>,
  };

  const gaps = missingForDoc(tpl, { ...input, channel });
  if (gaps.length) {
    return NextResponse.json({ ok: false, missing: gaps,
      error: `Still needed: ${gaps.join(", ")}.` }, { status: 400 });
  }

  const token = newToken();
  const doc = buildDoc(tpl, input, {
    signUrl: channel === "link" ? `${SITE}/declare#${token}` : null,
  });

  const { data: row, error } = await a.from("signature_request").insert({
    template_id: tpl.id, template_slug: tpl.slug,
    status: channel === "in_person" ? "viewed" : "sent",
    child_name: input.childName, child_uin: input.childUin,
    party_name: input.partyName, to_email: input.email, to_phone: input.phone,
    values: input.values, doc,
    channel, witnessed_by: channel === "in_person" ? who.email : null,
    token, token_expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
    sent_at: new Date().toISOString(),
    created_by: who.email,
  }).select("id").single();
  if (error || !row) {
    return NextResponse.json({ ok: false, error: error?.message || "Could not save this." }, { status: 500 });
  }

  // The fingerprint of what we are presenting, taken now. If the signed copy
  // is ever questioned, this proves the pages signed are the pages shown.
  const pdf = await renderDocumentPdf(doc);
  await a.from("signature_request").update({ pdf_sha256: await sha256(pdf) }).eq("id", row.id);

  const link = `${SITE}/declare#${token}`;

  // Signed at the desk: no email, no code. The coordinator opens the link on
  // the iPad and hands it over.
  if (channel === "in_person") {
    await logDocEvent(a, row.id, "raised_in_person", { by: who.email, child: input.childName }, req);
    return NextResponse.json({ ok: true, id: row.id, link, channel, mailed: false });
  }

  if (!mailReady()) {
    await logDocEvent(a, row.id, "raised", { by: who.email, mailed: false }, req);
    return NextResponse.json({ ok: true, id: row.id, link, channel, mailed: false,
      note: "Saved, but no mail provider is configured — send the link yourself." });
  }

  const first = input.partyName.split(/\s+/)[0];
  const r = await sendMail({
    to: [input.email!],
    subject: `${doc.title} — ${input.childName}`,
    html: renderEmail({
      title: doc.title,
      subtitle: `${esc(input.childName)} · ${SCHOOL_NAME}`,
      theme: "school",
      bodyHtml: `<p>Dear ${esc(first)},</p>
        <p>Please read and sign the form below for <strong>${esc(input.childName)}</strong>. It is attached to this email for your records, and it takes about a minute to sign on your phone.</p>
        <p style="margin:22px 0">
          <a href="${link}" style="background:#21409A;color:#fff;text-decoration:none;font-weight:700;
             padding:13px 22px;border-radius:8px;display:inline-block">Read and sign</a></p>
        <p style="font-size:13px;color:#6B7280">If the button does not work, copy this into your browser:<br>${esc(link)}</p>
        <p>If anything in it is unclear, please call us on ${SCHOOL_PHONE} before you sign. We would much rather explain it.</p>`,
      footerNote: `Sent to ${esc(input.email!)} about ${esc(input.childName)}. This link is personal to you.`,
    }),
    text: [`Dear ${first},`, "",
      `Please read and sign the attached form for ${input.childName}.`,
      "You can sign it here:", link, "",
      `Anything unclear, call us on ${SCHOOL_PHONE}.`, plainFooter(SCHOOL_EMAIL)].join("\n"),
    attachments: [{ filename: `${doc.title} - ${input.childName}.pdf`, content: Buffer.from(pdf).toString("base64") }],
  });

  await logDocEvent(a, row.id, r.ok ? "sent" : "send_failed", { to: input.email, by: who.email }, req);
  if (!r.ok) {
    return NextResponse.json({ ok: false, id: row.id, link,
      error: `Saved, but the email did not go: ${r.error || "unknown"}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: row.id, link, channel, mailed: true });
}
