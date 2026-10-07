// Raising, sending and repeating a day care invoice.
//
// Shared by the office button and the monthly run, so the two cannot drift
// into producing different documents.

import { admin, longDate, monthLabel, nextMonth, newToken, sha256 } from "./billing-auth";
import { renderInvoicePdf, type InvoiceDoc, type InvoiceLine } from "./invoice-pdf";
import { solveBreakup } from "./hours-breakup";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_EMAIL, SCHOOL_PHONE, plainFooter } from "./brand-email";
import { sendMail, mailReady } from "./mailer";
import { pdfDisposition } from "./pdf-name";
import { createPaymentLink, razorpayReady } from "./razorpay";
import { sendWhatsApp, waLink } from "./whatsapp";

type Db = ReturnType<typeof admin>;

export const ORG_NAME = "Eurokids JMD Enclave";
export const ORG_LINES = [
  "UDYAM-MH-26-0594497",
  "PAN : AARFV8391E",
  "Shop Act : 102859369903",
];

// Where a parent sends a bank transfer. One place; every invoice reads it.
export const BANK_LINES = [
  "Veena Educational Services",
  "HDFC Bank — Tain Square, Shop No 22, Building A, Near Fatima Nagar, Pune 411013",
  "Account: 50200041664781      IFSC: HDFC0000837",
];

export const NOTES_REIMBURSEMENT = [
  "Please Note that VEENA EDUCATIONAL SERVICES is an authorised franchise owner of Eurokids International. Thank you for entrusting EuroKids with your child's early learning journey.",
  "We're delighted to have you as part of our family and appreciate your prompt payment. Should you have any questions about this invoice or need assistance, please reach out to your centre coordinator or email us at admin@eurokidsjmdenclave.org",
];
export const NOTES_BILLING = [
  "Thank you for entrusting EuroKids with your child's early learning journey.",
  "We're delighted to have you as part of our family and appreciate your prompt payment. Should you have any questions about this invoice or need assistance, please reach out to your centre coordinator or email us at admin@eurokidsjmdenclave.org",
];
export const TERMS = [
  { heading: "1. Fee Payments", lines: [
    "All daycare fees must be paid monthly in advance, by the 3rd of every month.",
    "Late payments beyond the 7th will attract a late fee of 100 per day.",
    "Payments once made are non-refundable under any circumstances, including absences due to illness or travel." ] },
  { heading: "2. Attendance & Absence", lines: [
    "No adjustments or carry-forwards will be made for missed days.",
    "In case of extended leave (7+ consecutive days), kindly inform the admin team in writing to explore potential options." ] },
  { heading: "3. Pick-Up & Drop", lines: [
    "Only parents or pre-approved guardians (with photo ID) will be allowed to pick up the child.",
    "In case of a new person coming for pick-up, prior written or WhatsApp intimation is mandatory." ] },
];

const dmy = (d: string) => {
  const [y, m, dd] = String(d).slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
};

// A line as the office describes it, turned into one the document can print.
// One invoice can cover several months. The months are expanded into lines
// here rather than in the browser, so a quarterly invoice raised by the
// office and one raised by the monthly run are built by the same code.
export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let m = start.slice(0, 7) + "-01";
  const last = end.slice(0, 7) + "-01";
  // A guard, not a limit: a typo in the end month should not spin forever.
  for (let i = 0; i < 36 && m <= last; i++) { out.push(m); m = nextMonth(m); }
  return out;
}

export type LineInput = {
  rate_id?: number | null;
  name: string;
  description?: string | null;
  // either a flat line…
  qty?: number;
  rate?: number;
  // …or an hourly one, where the monthly fee is the agreed figure
  monthly_amount?: number | null;
  hours_per_day?: number | null;
  days_per_month?: number | null;
};

export function resolveLine(l: LineInput) {
  if (l.monthly_amount && l.hours_per_day) {
    const { best } = solveBreakup(Number(l.monthly_amount), Number(l.hours_per_day),
      { daysPerMonth: l.days_per_month ?? null });
    return {
      rate_id: l.rate_id ?? null,
      name: l.name,
      description: l.description || best.description,
      qty: best.monthlyHours,
      rate: best.ratePerHour,
      rate_text: best.rateText,
      amount: best.amount,
      // The fee is the agreed figure; the rate is printed at the precision
      // that multiplies back to it.
      amount_is_fixed: true,
      breakup: best,
    };
  }
  const qty = Number(l.qty ?? 1), rate = Number(l.rate ?? 0);
  return {
    rate_id: l.rate_id ?? null, name: l.name, description: l.description || null,
    qty, rate, rate_text: null,
    amount: Math.round(qty * rate * 100) / 100, amount_is_fixed: false, breakup: null,
  };
}

export async function buildDocFor(a: Db, invoiceId: number): Promise<InvoiceDoc | null> {
  const { data: inv } = await a.from("daycare_invoice").select("*").eq("id", invoiceId).maybeSingle();
  if (!inv) return null;
  const [{ data: party }, { data: child }, { data: lines }] = await Promise.all([
    a.from("billing_party").select("display_name").eq("id", inv.party_id).maybeSingle(),
    inv.child_id ? a.from("billing_child").select("name").eq("id", inv.child_id).maybeSingle()
                 : Promise.resolve({ data: null }),
    a.from("daycare_invoice_line").select("*").eq("invoice_id", invoiceId).order("position"),
  ]);
  const reimb = inv.kind === "reimbursement";
  return {
    kind: inv.kind,
    number: inv.number || "DRAFT",
    invoiceDate: dmy(inv.invoice_date),
    dueDate: dmy(inv.due_date || inv.invoice_date),
    termsLabel: inv.terms_label,
    billToName: party?.display_name || "",
    childName: child?.name || null,
    subject: reimb ? null : inv.subject,
    groupHeader: reimb ? null : (child && inv.period_start ? `${child.name} | ${monthLabel(inv.period_start)}` : null),
    lines: (lines || []).map((l): InvoiceLine => ({
      name: l.name, description: l.description, qty: Number(l.qty), rate: Number(l.rate),
      rateText: l.rate_text, amount: Number(l.amount),
    })),
    subtotal: Number(inv.subtotal), total: Number(inv.total),
    paymentMade: Number(inv.payment_made), balanceDue: Number(inv.balance_due),
    orgName: ORG_NAME, orgLines: ORG_LINES,
    notes: reimb ? NOTES_REIMBURSEMENT : NOTES_BILLING,
    bankLines: BANK_LINES,
    terms: reimb ? null : TERMS,
    signedByName: "Neeta Saxena",
  };
}

// Sending is what makes it real: it takes the number, freezes the document and
// emails it. Generating does none of that, which is the whole point — an
// invoice can sit in drafts while a family catches up on their fees.
export async function sendInvoice(a: Db, invoiceId: number, by: string, toOverride?: string | null) {
  const { data: inv } = await a.from("daycare_invoice").select("*").eq("id", invoiceId).maybeSingle();
  if (!inv) return { ok: false as const, error: "No such invoice.", status: 404 };
  if (inv.status === "void") return { ok: false as const, error: "That invoice was voided.", status: 409 };

  const { data: party } = await a.from("billing_party")
    .select("id, display_name, email, mobile, whatsapp, whatsapp_opt_in, hold_reimbursement")
    .eq("id", inv.party_id).maybeSingle();
  const to = String(toOverride || party?.email || "").trim();
  if (!to) return { ok: false as const, error: "There is no email address for this family.", status: 400 };

  let number = inv.number;
  if (!number) {
    const { data: n, error } = await a.rpc("next_document_number", { p_kind: "daycare_invoice" });
    if (error || !n) return { ok: false as const, error: error?.message || "Could not take a number.", status: 500 };
    number = String(n);
    await a.from("daycare_invoice").update({ number }).eq("id", invoiceId);
  }

  const doc = await buildDocFor(a, invoiceId);
  if (!doc) return { ok: false as const, error: "Could not build the document.", status: 500 };
  doc.number = number;

  // The pay link is made here, at the moment of sending, and only for a bill
  // that is actually owed. A reimbursement certificate is already paid — a Pay
  // now button on one would be asking for the money twice. A draft edited five
  // times would otherwise leave five live links behind, so drafting makes none.
  let payUrl: string | null = inv.razorpay_short_url || null;
  let payNote: string | null = null;
  if (inv.kind === "billing" && inv.online_payment && !payUrl && Number(inv.total) > 0) {
    const link = await createPaymentLink({
      amount: Number(inv.total),
      description: doc.subject || `Daycare invoice ${number}`,
      reference: number,
      name: party?.display_name, email: to, phone: party?.whatsapp || party?.mobile,
    });
    if (link.status === "created") {
      payUrl = link.shortUrl;
      // If this write fails the link exists at Razorpay but we have forgotten
      // it, and the next send is refused for a duplicate reference. Say so
      // rather than letting the bill go out quietly short of a pay button.
      const { error: keep } = await a.from("daycare_invoice")
        .update({ razorpay_link_id: link.id, razorpay_short_url: link.shortUrl }).eq("id", invoiceId);
      if (keep) payNote = `The pay link was made but could not be saved against the invoice (${keep.message}). Check it before sending again.`;
    } else if (link.status === "failed") {
      // The bill still goes. It carries the bank details, as it did before
      // any of this existed — a parent not getting their invoice because a
      // payment gateway was unhappy would be the worse failure by far.
      payNote = `The pay link could not be made (${link.error}), so the invoice went with bank details only.`;
    }
  }
  doc.payUrl = payUrl;

  const pdf = await renderInvoicePdf(doc);
  const token = inv.public_token || newToken();
  const path = `daycare/${String(inv.period_start || inv.invoice_date).slice(0, 7)}/${number}.pdf`;
  const up = await a.storage.from("documents").upload(path, Buffer.from(pdf), {
    contentType: "application/pdf", upsert: true });

  const filename = pdfDisposition([doc.kind === "reimbursement" ? "Fee receipt" : "Daycare invoice",
    doc.childName, number]).match(/filename="([^"]+)"/)?.[1] || `${number}.pdf`;

  const r = await mailReady() ? await sendMail({
    to: [to],
    subject: doc.kind === "reimbursement"
      ? `Your receipt — ${doc.childName || doc.billToName}, ${number}`
      : `Your daycare invoice — ${doc.childName || doc.billToName}, ${number}`,
    html: renderEmail({
      title: doc.kind === "reimbursement" ? "Thank you — here is your receipt" : "Your daycare invoice",
      subtitle: `${esc(doc.childName || "")} · ${esc(number)}`, theme: "calm",
      bodyHtml: doc.kind === "reimbursement"
        ? `<p>Dear ${esc(String(doc.billToName).replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "").split(/\s+/)[0])},</p>
           <p>Thank you so much for paying. Your receipt is attached — it shows the amount as paid in full, so you can pass it straight to your employer.</p>
           <p style="font-size:13px;color:#6B7280">Any query, call us on ${SCHOOL_PHONE}.</p>`
        : `<p>Dear ${esc(String(doc.billToName).replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "").split(/\s+/)[0])},</p>
           <p>Your daycare invoice is attached.</p>
           ${payUrl ? `<p style="margin:22px 0"><a href="${esc(payUrl)}" style="background:#3D5278;color:#fff;
              text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600">Pay now</a></p>
              <p style="font-size:13px;color:#6B7280">Or transfer to the account printed on the invoice.</p>`
            : `<p style="font-size:13px;color:#6B7280">The account to transfer to is printed on the invoice.</p>`}
           <p style="font-size:13px;color:#6B7280">Any query, call us on ${SCHOOL_PHONE}.</p>`,
      footerNote: `${esc(SCHOOL_NAME)} · ${esc(number)}`,
    }),
    text: [`Your ${doc.kind === "reimbursement" ? "receipt" : "invoice"} ${number} is attached.`,
      plainFooter(SCHOOL_EMAIL)].join("\n"),
    attachments: [{ filename, content: Buffer.from(pdf).toString("base64") }],
  }) : { ok: false, error: "Email is not configured on the server." };

  await a.from("daycare_invoice").update({
    status: "sent", doc, pdf_sha256: await sha256(pdf), pdf_path: up.error ? null : path,
    public_token: token, sent_at: new Date().toISOString(), email_to: to, updated_at: new Date().toISOString(),
  }).eq("id", invoiceId);

  // What went to whom, for how much. Written whether or not the send worked,
  // because "we tried and it bounced" is the thing you need to know when a
  // parent says they never got it.
  await a.from("billing_message").insert({
    party_id: inv.party_id, invoice_id: invoiceId, channel: "email",
    kind: inv.status === "sent" ? "resend" : "invoice",
    to_addr: to, subject: doc.subject || number, amount: Number(inv.total),
    status: r.ok ? "sent" : "failed", error: r.ok ? null : String(r.error || ""), sent_by: by,
  });

  // WhatsApp follows the email, for bills only, and only to a parent who said
  // yes. Meta suspends numbers that message people who did not ask.
  let wa: Awaited<ReturnType<typeof notifyWhatsApp>> = null;
  if (r.ok && inv.kind === "billing" && party?.whatsapp_opt_in) {
    wa = await notifyWhatsApp(a, {
      partyId: inv.party_id, invoiceId, number, to: party.whatsapp || party.mobile || "",
      name: String(doc.billToName || ""), amount: Number(inv.total), payUrl, by,
    });
  }

  return r.ok
    ? { ok: true as const, number, sent_to: to, pay_url: payUrl, whatsapp: wa, note: payNote }
    : { ok: false as const, error: `Numbered ${number} and saved, but the email did not go: ${r.error}`, status: 502 };
}

// The WhatsApp that follows a bill. Meta only allows a business to open a
// conversation with an approved template, so without one configured there is
// nothing to send — in that case we hand the coordinator a one-tap wa.me link
// and record it as 'manual', which is honest about who actually sent it.
export async function notifyWhatsApp(a: Db, o: {
  partyId: number; invoiceId: number; number: string; to: string;
  name: string; amount: number; payUrl: string | null; by: string;
}) {
  if (!o.to) return null;
  const first = o.name.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "").split(/\s+/)[0] || "there";
  const amount = o.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const template = process.env.WHATSAPP_INVOICE_TEMPLATE || "daycare_invoice";

  const res = await sendWhatsApp({ to: o.to, template, params: [first, o.number, amount, o.payUrl || ""] });
  const manual = res.status === "not_configured"
    ? waLink(o.to, [`Dear ${first}, your EuroKids daycare invoice ${o.number} for ₹${amount} is ready.`,
        o.payUrl ? `Pay here: ${o.payUrl}` : ""].filter(Boolean).join(" "))
    : null;

  await a.from("billing_message").insert({
    party_id: o.partyId, invoice_id: o.invoiceId, channel: "whatsapp", kind: "invoice",
    to_addr: o.to, subject: `Invoice ${o.number}`, amount: o.amount,
    status: res.status === "sent" ? "sent" : res.status === "not_configured" ? "manual" : "failed",
    provider_id: res.id || null, error: res.error || null, sent_by: o.by,
  });

  return { status: res.status, link: manual };
}

export { nextMonth, longDate };
