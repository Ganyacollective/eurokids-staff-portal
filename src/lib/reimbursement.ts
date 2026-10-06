// Issuing a fee certificate: freeze it, number it, render it, keep it.
//
// Shared between the button in the office and the monthly run, so the two
// cannot drift into producing different documents.

// The client is bound to the eurokids schema, which gives it a different
// generic than the default public one — so take whatever admin() returns.
import type { admin as adminClient } from "./billing-auth";
type Db = ReturnType<typeof adminClient>;
import { renderCertificatePdf, type CertificateDoc } from "./certificate-pdf";
import { newToken, sha256, monthEnd, monthLabel, longDate, ENTITY, SIGNATORY } from "./billing-auth";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_EMAIL, SCHOOL_PHONE, plainFooter } from "./brand-email";
import { sendMail, mailReady } from "./mailer";
import { pdfDisposition } from "./pdf-name";

export type IssueInput = {
  childId: number;
  period: string;          // any date inside the month
  amount?: number | null;  // defaults to the profile's monthly amount
  description?: string | null;
  paidOn?: string | null;
  mode?: string | null;
  note?: string | null;
  profileId?: number | null;
  by: string;
};

export type IssueResult =
  | { ok: true; id: number; reference: string; alreadyThere?: boolean; emailed?: boolean; emailError?: string }
  | { ok: false; error: string; status: number };

export async function issueCertificate(a: Db, inp: IssueInput, opts: { email?: boolean } = {}): Promise<IssueResult> {
  const periodStart = inp.period.slice(0, 7) + "-01";

  const { data: child } = await a.from("billing_child")
    .select("id, name, uin, class_label, party_id, is_active").eq("id", inp.childId).maybeSingle();
  if (!child) return { ok: false, error: "That child is not on the day care list.", status: 404 };

  const { data: party } = await a.from("billing_party")
    .select("id, display_name, email, address, employer_name").eq("id", child.party_id).maybeSingle();
  if (!party) return { ok: false, error: "That child has no family record.", status: 404 };

  // One per child per month. The index enforces it; this is only so the
  // answer is a sentence rather than a constraint violation.
  const { data: existing } = await a.from("reimbursement_certificate")
    .select("id, reference").eq("child_id", child.id).eq("period_start", periodStart)
    .is("cancelled_at", null).maybeSingle();
  if (existing) return { ok: true, id: existing.id, reference: existing.reference, alreadyThere: true };

  const { data: profile } = inp.profileId
    ? await a.from("reimbursement_profile").select("*").eq("id", inp.profileId).maybeSingle()
    : await a.from("reimbursement_profile").select("*").eq("child_id", child.id).eq("status", "active")
        .order("id", { ascending: false }).limit(1).maybeSingle();

  const amount = Number(inp.amount ?? profile?.monthly_amount ?? 0);
  if (!(amount > 0)) return { ok: false, error: "How much was received for this month?", status: 400 };

  const { data: ref, error: refErr } = await a.rpc("next_document_number", { p_kind: "reimbursement" });
  if (refErr || !ref) return { ok: false, error: refErr?.message || "Could not take a reference number.", status: 500 };

  // Frozen here and never recomputed. A certificate issued in April must read
  // the same in December, whatever has changed about fees, names or the
  // school's address since.
  const doc: CertificateDoc = {
    reference: String(ref),
    issuedOn: longDate(new Date()),
    partyName: party.display_name,
    partyAddress: party.address,
    employerName: party.employer_name,
    childName: child.name,
    childClass: child.class_label,
    childUin: child.uin,
    periodLabel: monthLabel(periodStart),
    description: inp.description || profile?.fee_description || "Day care fee",
    amount,
    paidOn: inp.paidOn ? longDate(inp.paidOn) : null,
    mode: inp.mode || null,
    entityName: ENTITY,
    signedByName: SIGNATORY.name,
    signedByRole: SIGNATORY.role,
    note: inp.note || null,
  };

  const pdf = await renderCertificatePdf(doc);
  const token = newToken();
  const path = `certificates/${periodStart.slice(0, 7)}/${ref}.pdf`;
  const up = await a.storage.from("documents").upload(path, Buffer.from(pdf), {
    contentType: "application/pdf", upsert: true,
  });

  const { data: row, error } = await a.from("reimbursement_certificate").insert({
    reference: String(ref), profile_id: profile?.id ?? null,
    child_id: child.id, party_id: party.id,
    period_start: periodStart, period_end: monthEnd(periodStart),
    amount, paid_on: inp.paidOn || null,
    doc, pdf_sha256: await sha256(pdf), pdf_path: up.error ? null : path,
    public_token: token, email_to: party.email || null, created_by: inp.by,
  }).select("id").single();
  if (error || !row) {
    // The number is spent either way — numbers are never reused, and a gap in
    // the series is cheaper than two certificates sharing a reference.
    return { ok: false, error: error?.message || "Could not save it.", status: 500 };
  }

  if (profile?.id) {
    // Only ever forward, and only past the month just issued, so a profile
    // deferred for any reason is picked up next time rather than skipped.
    const { nextMonth } = await import("./billing-auth");
    const advance = nextMonth(periodStart);
    if (!profile.next_month || profile.next_month <= periodStart) {
      await a.from("reimbursement_profile").update({ next_month: advance, updated_at: new Date().toISOString() })
        .eq("id", profile.id);
    }
  }

  let emailed = false, emailError: string | undefined;
  if (opts.email !== false && party.email && mailReady()) {
    const r = await sendCertificateEmail(a, row.id, pdf, doc, party.email);
    emailed = r.ok; emailError = r.error;
  }
  return { ok: true, id: row.id, reference: String(ref), emailed, emailError };
}

export async function sendCertificateEmail(
  a: Db, id: number, pdf: Uint8Array, doc: CertificateDoc, to: string,
) {
  const first = String(doc.partyName || "").replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "").split(/\s+/)[0];
  const filename = pdfDisposition(["Fee receipt", doc.childName, doc.periodLabel])
    .match(/filename="([^"]+)"/)?.[1] || `${doc.reference}.pdf`;

  // Two lines. The panel above already carries the amount, the period and the
  // child's name — a body that repeats them is three sentences to read past.
  const r = await sendMail({
    to: [to],
    subject: `Fee receipt — ${doc.childName}, ${doc.periodLabel}`,
    html: renderEmail({
      title: "Your fee receipt", subtitle: `${esc(doc.childName)} · ${esc(doc.periodLabel)}`, theme: "calm",
      bodyHtml: `<p>Dear ${esc(first)},</p>
        <p>Your receipt for ${esc(doc.periodLabel)} is attached. You can pass it straight to your employer${
          doc.employerName ? ` at ${esc(doc.employerName)}` : ""} — it names ${esc(doc.childName)}, the period and the amount received.</p>
        <p style="font-size:13px;color:#6B7280">Reference ${esc(doc.reference)}. Any query, call us on ${SCHOOL_PHONE}.</p>`,
      footerNote: `Issued by ${esc(SCHOOL_NAME)} on ${esc(doc.issuedOn)}.`,
    }),
    text: [`Dear ${first},`, "",
      `Your fee receipt for ${doc.periodLabel} is attached — ${doc.childName}, reference ${doc.reference}.`,
      plainFooter(SCHOOL_EMAIL)].join("\n"),
    attachments: [{ filename, content: Buffer.from(pdf).toString("base64") }],
  });
  if (r.ok) {
    await a.from("reimbursement_certificate")
      .update({ emailed_at: new Date().toISOString(), email_to: to }).eq("id", id);
  }
  return { ok: r.ok, error: r.ok ? undefined : (r.error || "the email did not go") };
}
