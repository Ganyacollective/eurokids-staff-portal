import { NextResponse } from "next/server";
import { requireLetters, admin, findStaff, salaryOf, currentTemplate, newToken, sha256, logEvent } from "@/lib/letters-auth";
import { mergeLetter, LetterTemplate, StaffRecord, missingFor, longDate } from "@/lib/letter-merge";
import { renderLetterPdf } from "@/lib/letter-pdf";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_PHONE, plainFooter, SITE } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";

// POST /api/letters/send — write the letter, freeze it, and email the link.
//
// "Freeze" is the important word. The snapshot stores every merged value, so
// next year's raise or a corrected address cannot quietly rewrite a letter
// somebody already signed. What she signs is what is in the snapshot, for
// ever.
export async function POST(req: Request) {
  const who = await requireLetters(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const body = await req.json().catch(() => ({}));
  const a = admin();
  const emp = await findStaff(a, String(body.employee_id || ""));
  if (!emp) return NextResponse.json({ ok: false, error: "That person is not on the roster." }, { status: 404 });

  const tpl = (await currentTemplate(a)) as LetterTemplate & { id: number } | null;
  if (!tpl) return NextResponse.json({ ok: false, error: "No letter template has been set up yet." }, { status: 400 });

  const merged: StaffRecord = { ...emp, ...(body.overrides || {}) };
  const salary = Number(body.salary ?? 0) > 0 ? Number(body.salary) : await salaryOf(a, emp.id);
  const to = String(body.to_email || merged.email || "").trim();

  const gaps = missingFor(merged, salary).filter((g) => !/mobile number/.test(g) || !body.allow_no_phone);
  if (gaps.length && !body.force) {
    return NextResponse.json({ ok: false, error:
      `This letter is missing ${gaps.join(", ")}. Fill it in on the employee record first — the letter draws from there.`,
      missing: gaps }, { status: 400 });
  }
  if (!to) return NextResponse.json({ ok: false, error: "No email address to send this to." }, { status: 400 });

  // ── the row, and its private link ─────────────────────────────────────
  const token = newToken();
  const data = mergeLetter({
    employee: merged, template: tpl, salary,
    issuedOn: new Date(), startsOn: body.starts_on || merged.joining_date,
    signedByName: body.signed_by_name, signedByRole: body.signed_by_role,
    signUrl: `${SITE}/sign.html#${token}`,
  });

  const { data: row, error } = await a.from("appointment_letter").insert({
    employee_id: emp.id, employee_name: merged.display_name, template_id: tpl.id,
    status: "sent",
    snapshot: { data, salary, employee: merged, template: tpl },
    starts_on: body.starts_on || merged.joining_date || null,
    to_email: to, to_phone: merged.phone || null,
    token, token_expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
    sent_at: new Date().toISOString(),
    created_by: who.email,
  }).select("id").single();
  if (error || !row) {
    return NextResponse.json({ ok: false, error: error?.message || "Could not save the letter." }, { status: 500 });
  }

  // The hash of exactly these bytes. If the signed copy is ever questioned,
  // this is what proves the document did not change between sending and
  // signing.
  const pdf = await renderLetterPdf(data);
  const hash = await sha256(pdf);
  await a.from("appointment_letter").update({ pdf_sha256: hash }).eq("id", row.id);

  // ── the email ─────────────────────────────────────────────────────────
  const link = `${SITE}/sign.html#${token}`;
  const first = (merged.display_name || "").split(/\s+/)[0];
  if (!mailReady()) {
    return NextResponse.json({ ok: true, id: row.id, link, mailed: false,
      note: "Saved, but no mail provider is configured — send the link yourself." });
  }

  const html = renderEmail({
    title: "Your appointment letter",
    subtitle: `${merged.display_name} · ${merged.designation || "EuroKids JMD Enclave"}`,
    theme: "calm",
    bodyHtml: `<p>Dear ${esc(first)},</p>
      <p>Welcome to ${SCHOOL_NAME}. Your appointment letter is ready, and it is attached to this email for your records.</p>
      <p>Please also open the link below to read it and sign — it takes a minute on your phone. We will send a short code to this email address to confirm it is you.</p>
      <p style="margin:22px 0">
        <a href="${link}" style="background:#15803D;color:#fff;text-decoration:none;font-weight:700;
           padding:13px 22px;border-radius:8px;display:inline-block">Read and sign your letter</a></p>
      <p style="font-size:13px;color:#6B7280">If the button does not work, copy this into your browser:<br>${esc(link)}</p>
      <p>Anything at all that is unclear, call us on ${SCHOOL_PHONE} or reply to this email. We would much rather explain it than have you sign something you are unsure about.</p>`,
    footerNote: `Sent to ${esc(to)} because you are joining ${SCHOOL_NAME}. This link is personal to you.`,
  });

  const r = await sendMail({
    to: [to],
    subject: `Your appointment letter — ${SCHOOL_NAME}`,
    html,
    text: [`Dear ${first},`, "",
      `Welcome to ${SCHOOL_NAME}. Your appointment letter is attached.`,
      "Please open this link to read and sign it:", link, "",
      `Anything unclear, call us on ${SCHOOL_PHONE}.`, plainFooter()].join("\n"),
    attachments: [{
      filename: `Appointment Letter - ${merged.display_name}.pdf`,
      content: Buffer.from(pdf).toString("base64"),
    }],
  });

  await logEvent(a, row.id, r.ok ? "sent" : "send_failed",
    { to, hash, salary_on_letter: salary, starts_on: body.starts_on || merged.joining_date, by: who.email }, req);

  if (!r.ok) {
    return NextResponse.json({ ok: false, id: row.id, link,
      error: `The letter is saved but the email did not go: ${r.error || "unknown"}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id: row.id, link, mailed: true,
    starts_on: longDate(body.starts_on || merged.joining_date) });
}
