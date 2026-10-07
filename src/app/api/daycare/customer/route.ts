// A customer, and the welcome letter a new day care family gets.
//
// One party row can belong to both books: a school family can take a day care
// invoice and a reimbursement certificate. Keeping them as two rows would mean
// two email addresses for one family, and the day somebody corrects one of
// them is the day the other goes stale. So: one record, a flag per book.

import { NextResponse } from "next/server";
import { requireBilling, admin, ENTITY, SIGNATORY, longDate } from "@/lib/billing-auth";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_EMAIL, SCHOOL_PHONE, plainFooter } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";
import { renderDocumentPdf } from "@/lib/doc-pdf";
import { pdfDisposition } from "@/lib/pdf-name";
import { BANK_LINES } from "@/lib/daycare-billing";

export async function POST(req: Request) {
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const b = await req.json().catch(() => ({}));
  const a = admin();

  // The welcome letter is about joining day care, so it belongs to that half.
  if (String(b.action || "save") === "welcome") {
    if (!who.canBill) return NextResponse.json({ ok: false, error: "You do not have Day care billing." }, { status: 403 });
    return welcome(a, Number(b.id), who.name);
  }

  const name = String(b.display_name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "A customer needs a name." }, { status: 400 });

  // Which books they belong to. A customer in neither book would exist and be
  // invisible in both lists, so default to the one the screen asked from.
  const inBilling = b.in_billing === true;
  const inReimb = b.in_reimbursement === true;
  if (!inBilling && !inReimb) {
    return NextResponse.json({ ok: false, error: "Say whether this is a billing or a reimbursement customer." }, { status: 400 });
  }
  const id = Number(b.id) || 0;
  const { data: was } = id
    ? await a.from("billing_party").select("in_billing, in_reimbursement").eq("id", id).maybeSingle()
    : { data: null };

  // You may only *change* a book you hold — not merely be in one. A family can
  // be in both, so somebody with billing alone has to be able to fix a shared
  // family's phone number without that counting as touching reimbursements.
  // What is refused is adding or removing a book they do not have.
  if (inBilling !== Boolean(was?.in_billing) && !who.canBill) {
    return NextResponse.json({ ok: false, error: "You do not have Day care billing, so you cannot change that." }, { status: 403 });
  }
  if (inReimb !== Boolean(was?.in_reimbursement) && !who.canCertify) {
    return NextResponse.json({ ok: false, error: "You do not have Reimbursements, so you cannot change that." }, { status: 403 });
  }

  const row = {
    display_name: name,
    father_name: b.father_name || null,
    email: String(b.email || "").trim() || null,
    login_email: String(b.login_email || "").trim() || null,
    mobile: String(b.mobile || "").trim() || null,
    whatsapp: String(b.whatsapp || "").trim() || null,
    // Consent is a tick somebody made, not something to infer from a number
    // being present. Meta suspends numbers that message people who did not ask.
    whatsapp_opt_in: b.whatsapp_opt_in === true,
    address: b.address || null,
    employer_name: b.employer_name || null,
    note: b.note || null,
    in_billing: inBilling,
    in_reimbursement: inReimb,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { error } = await a.from("billing_party").update(row).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id });
  }
  const { data, error } = await a.from("billing_party")
    .insert({ ...row, created_by: who.name }).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// The welcome letter. Sent from the customer's own record, because that is
// where you are standing the moment a family signs up — and logged in their
// history like every other thing this system sends them.
async function welcome(a: ReturnType<typeof admin>, id: number, by: string) {
  const { data: p } = await a.from("billing_party")
    .select("id, display_name, email, welcome_sent_at").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ ok: false, error: "No such customer." }, { status: 404 });
  const to = String(p.email || "").trim();
  if (!to) return NextResponse.json({ ok: false, error: "There is no email address for this family." }, { status: 400 });

  const first = String(p.display_name).replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "").split(/\s+/)[0];

  const pdf = await renderDocumentPdf({
    title: "Welcome to day care",
    issuedOn: longDate(new Date()),
    intro: `Welcome to the day care at ${SCHOOL_NAME}, operated by ${ENTITY}. We are glad your family is joining ours. `
      + `This letter sets out the few practical things worth knowing from the start, so that nothing about fees or `
      + `collection comes as a surprise later.`,
    clauses: [
      { heading: "Fees", body:
        "Day care fees are billed monthly, in advance, and are due by the 3rd of each month. Your invoice reaches you by "
        + "email a few days before that. It carries a link you can pay from directly, and the bank account below, whichever "
        + "suits you. Fees once paid are not refunded, including for days missed through illness or travel." },
      { heading: "Who may collect your child", body:
        "Only you, or someone you have told us about beforehand in writing or on WhatsApp, may collect your child. If "
        + "somebody different is coming, tell the coordinator the same day — we will ask that person for photo "
        + "identification at the gate. We would rather be awkward about this than wrong about it." },
      { heading: "If your child will be away", body:
        "For an absence of a week or more, please tell the admin team in writing. No adjustment is made for individual "
        + "missed days, but for a longer stretch we will tell you honestly what can be done." },
      { heading: "Where fees are paid", body: BANK_LINES.join("  ·  ") },
      { heading: "Reaching us", body:
        `Call ${SCHOOL_PHONE} or write to ${SCHOOL_EMAIL}. If something is worrying you about your child's day, please `
        + "tell us early. We would much rather hear it small than hear it late." },
    ],
    declaration:
      "We are glad to have you with us, and we will look after your child with the care we would want for our own.",
    partyName: p.display_name,
    partyRole: "Parent / Guardian",
    signedByName: SIGNATORY.name,
    signedByRole: SIGNATORY.role,
  });
  const filename = pdfDisposition(["Welcome", p.display_name]).match(/filename="([^"]+)"/)?.[1] || "Welcome.pdf";

  const r = await mailReady() ? await sendMail({
    to: [to],
    subject: `Welcome to day care at ${SCHOOL_NAME}`,
    html: renderEmail({
      title: "Welcome to day care", subtitle: esc(p.display_name), theme: "calm",
      bodyHtml: `<p>Dear ${esc(first)},</p>
        <p>We are glad your family is joining ours. The letter attached sets out how fees are billed, who may collect your child, and how to reach us.</p>
        <p style="font-size:13px;color:#6B7280">Any query at all, call us on ${SCHOOL_PHONE}.</p>`,
      footerNote: esc(SCHOOL_NAME),
    }),
    text: [`Welcome to day care at ${SCHOOL_NAME}. The letter is attached.`, plainFooter(SCHOOL_EMAIL)].join("\n"),
    attachments: [{ filename, content: Buffer.from(pdf).toString("base64") }],
  }) : { ok: false, error: "Email is not configured on the server." };

  await a.from("billing_message").insert({
    party_id: id, channel: "email", kind: "welcome", to_addr: to,
    subject: `Welcome to day care at ${SCHOOL_NAME}`,
    status: r.ok ? "sent" : "failed", error: r.ok ? null : String(r.error || ""), sent_by: by,
  });
  if (r.ok) await a.from("billing_party").update({ welcome_sent_at: new Date().toISOString() }).eq("id", id);

  return r.ok
    ? NextResponse.json({ ok: true, sent_to: to })
    : NextResponse.json({ ok: false, error: `The welcome letter did not go: ${r.error}` }, { status: 502 });
}
