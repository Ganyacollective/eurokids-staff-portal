// Both day care invoices, rendered side by side with the originals.
import fs from "node:fs";
import { renderInvoicePdf } from "../src/lib/invoice-pdf.ts";
import { breakup } from "../src/lib/hours-breakup.ts";
import { BANK_LINES } from "../src/lib/daycare-billing.ts";

const ORG = "Eurokids JMD Enclave";
const ORG_LINES = [
  "UDYAM-MH-26-0594497",
  "PAN : AARFV8391E",
  "Shop Act : 102859369903",
];

// 59 — the reimbursement copy. The fee is 12,000 and the parent needs it
// shown as 5 hours a day.
const b = breakup(12000, 5);
fs.writeFileSync(process.argv[2] || "inv59.pdf", await renderInvoicePdf({
  kind: "reimbursement",
  number: "INV-000059",
  invoiceDate: "01/10/2026", dueDate: "01/10/2026", termsLabel: "Due on Receipt",
  billToName: "Ms. Shikha Singh",
  childName: "Dev Kumar",
  lines: [{ name: "Daycare", description: b.description, qty: b.monthlyHours, rate: b.ratePerHour, rateText: b.rateText, amount: b.amount }],
  subtotal: b.amount, total: b.amount, paymentMade: b.amount, balanceDue: 0,
  orgName: ORG, orgLines: ORG_LINES,
  notes: [
    "Please Note that VEENA EDUCATIONAL SERVICES is an authorised franchise owner of Eurokids International. Thank you for entrusting EuroKids with your child's early learning journey.",
    "We're delighted to have you as part of our family and appreciate your prompt payment. Should you have any questions about this invoice or need assistance, please reach out to your centre coordinator or email us at admin@eurokidsjmdenclave.org",
  ],
  bankLines: BANK_LINES,
  signedByName: "Neeta Saxena",
}));

// 802 — the monthly bill.
fs.writeFileSync(process.argv[3] || "inv802.pdf", await renderInvoicePdf({
  kind: "billing",
  number: "INV-000802",
  invoiceDate: "05/10/2026", dueDate: "05/10/2026", termsLabel: "Due on Receipt",
  billToName: "Aafreen Sultana",
  subject: "Your Daycare Invoice is ready for October 2026",
  groupHeader: "Fawaz | October 2026",
  lines: [
    { name: "Daycare | 6 Hours", qty: 1, rate: 6000, amount: 6000 },
    { name: "Lunch & Snacks", qty: 1, rate: 1600, amount: 1600 },
  ],
  subtotal: 7600, total: 7600, paymentMade: 7600, balanceDue: 0,
  orgName: ORG, orgLines: ORG_LINES,
  notes: [
    "Thank you for entrusting EuroKids with your child's early learning journey.",
    "We're delighted to have you as part of our family and appreciate your prompt payment. Should you have any questions about this invoice or need assistance, please reach out to your centre coordinator or email us at admin@eurokidsjmdenclave.org",
  ],
  terms: [
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
  ],
  bankLines: BANK_LINES,
  signedByName: "Neeta Saxena",
}));
console.log("ok —", b.monthlyHours, "hours @", b.rateText, "=", b.computed, b.reconciles ? "ok" : "MISMATCH");
