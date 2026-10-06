// The fee certificate a parent gives their employer.
//
// It is a receipt and it must read like one. The money is already in, so
// there is no pay link, no balance due and no terms — an "invoice" marked
// paid is what people reach for when they have no concept of a receipt, and
// it confuses the one audience that matters: a finance team at the parent's
// employer, who will reject anything that looks like a bill.
//
// Two names have to be prominent and they are not the same name. The money
// came FROM the parent, who is claiming it back. It was ON BEHALF OF the
// child, who is the reason the employer will pay. A document naming only one
// of them does not do its job.

import { Sheet, rupeesInWords, schoolSignature, fitSignature } from "./letter-pdf";
import { rgb, type RGB } from "pdf-lib";

const INK: RGB = rgb(0, 0, 0);
const MUTE: RGB = rgb(0.32, 0.32, 0.32);
const HAIR: RGB = rgb(0.72, 0.72, 0.72);
const L = 56.7, R = 595.28 - 56.7, WIDTH = R - L, BOTTOM = 88;

export type CertificateDoc = {
  reference: string;              // EK-RMB-00042
  issuedOn: string;               // already formatted
  // who
  partyName: string;              // the parent — "Received from"
  partyAddress?: string | null;
  employerName?: string | null;
  childName: string;              // "On behalf of"
  childClass?: string | null;
  childUin?: string | null;
  // what
  periodLabel: string;            // "October 2026"
  description: string;            // "Day care fee"
  amount: number;
  paidOn?: string | null;         // when the money actually arrived
  mode?: string | null;           // Cash / UPI / Cheque
  // the school's side
  entityName: string;
  signedByName: string;
  signedByRole: string;
  note?: string | null;
};

const rs = (n: number) =>
  "INR " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function renderCertificatePdf(d: CertificateDoc): Promise<Uint8Array> {
  const s = await new Sheet().init();

  s.text("FEE RECEIPT", { bold: true, size: 15, after: 2 });
  s.text(`${d.entityName} · Bungalow 1, JMD Enclave, Mohammadwadi, Pune 411060`,
    { size: 9.5, color: MUTE, lead: 12, after: 12 });
  s.text(`Reference: ${d.reference}`, { size: 11, after: 1 });
  s.text(`Issued: ${d.issuedOn}`, { size: 11, color: MUTE, after: 14 });

  // The sentence first. Everything under it is the same fact in a table, for
  // whoever has to file it.
  s.text(`Received with thanks from ${d.partyName} the sum of ${rs(d.amount)} (${rupeesInWords(d.amount)}), being ${d.description.toLowerCase()} in respect of ${d.childName} for ${d.periodLabel}.`,
    { size: 12, lead: 17, after: 12 });

  const rows: [string, string][] = [
    ["Received from", d.partyName],
    ...(d.employerName ? [["Employer", d.employerName] as [string, string]] : []),
    ["On behalf of", `${d.childName}${d.childClass ? ` · ${d.childClass}` : ""}`],
    ...(d.childUin ? [["Admission number", d.childUin] as [string, string]] : []),
    ["For", d.description],
    ["Period", d.periodLabel],
    ["Amount", rs(d.amount)],
    ...(d.paidOn ? [["Received on", d.paidOn + (d.mode ? ` · ${d.mode}` : "")] as [string, string]] : []),
  ];
  const bh = rows.length * 15 + 20;
  s.room(bh + 10);
  const top = s.y;
  s.page.drawRectangle({ x: L, y: top - bh, width: WIDTH, height: bh, borderColor: HAIR, borderWidth: 0.7 });
  let y = top - 22;
  for (const [k, v] of rows) {
    s.page.drawText(k, { x: L + 12, y, size: 8.8, font: s.reg, color: MUTE });
    s.page.drawText(v, { x: L + 190, y, size: 9.6, font: s.bold, color: INK });
    y -= 15;
  }
  s.y = top - bh - 16;

  s.text(`Amount in words: ${rupeesInWords(d.amount)}`, { size: 10.5, italic: true, lead: 14, after: 10 });
  s.text("This amount has been received in full. No sum remains outstanding for the period stated above.",
    { size: 11, lead: 15, after: 10 });
  if (d.note) s.text(d.note, { size: 10.5, color: MUTE, lead: 14, after: 8 });

  // ── the school's signature ────────────────────────────────────────────
  // Kept with the sentence above it: a signature alone at the foot of a page
  // looks careless in exactly the document where careless is expensive.
  s.room(130);
  s.gap(12);
  s.text(`For ${d.entityName}`, { size: 11, after: 2 });
  const sig = schoolSignature();
  let signed = false;
  if (sig) {
    try {
      const img = await s.doc.embedPng(dataUrlToBytes(sig));
      const { w, h } = fitSignature(img, 140, 54);
      s.page.drawImage(img, { x: L, y: s.y - h, width: w, height: h });
      s.y -= h + 2;
      signed = true;
    } catch { /* the printed name still stands */ }
  } else s.gap(30);
  s.text(d.signedByName, { size: 11, bold: true });
  s.text(d.signedByRole, { size: 10, color: MUTE, after: 14 });

  s.rule(10);
  s.text(signed
    ? "Issued by the school and signed on its behalf. Any query about this receipt: 020 6962 2686."
    : "This is a computer-generated receipt issued by the school and is valid without a physical signature. Any query about this receipt: 020 6962 2686.",
    { size: 7.5, lead: 10, color: MUTE });

  const pages = s.doc.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`,
      { x: R - 64, y: BOTTOM - 14, size: 8, font: s.reg, color: MUTE }));
  }
  return await s.doc.save();
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
