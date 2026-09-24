// An acknowledgement for money changing hands.
//
// The cash chain already recorded that Diya handed ₹15,000 to Neeta. What it
// could not show was Neeta agreeing that she had it. This is that page: one
// side of A4 on the school letterhead, the facts of the handover, the
// signature drawn on the tablet, and the audit block underneath.
//
// Deliberately one page. Somebody is standing at a desk holding cash while
// this is being signed.

import { Sheet, rupeesInWords, fitSignature } from "./letter-pdf";
import { rgb, type RGB } from "pdf-lib";

const INK: RGB = rgb(0, 0, 0);
const MUTE: RGB = rgb(0.32, 0.32, 0.32);
const HAIR: RGB = rgb(0.72, 0.72, 0.72);
const L = 56.7, R = 595.28 - 56.7, WIDTH = R - L, BOTTOM = 88;

export type CustodyKind = "collected" | "handover" | "banked";

export type CustodyAck = {
  reference: string;              // EK-CASH-00042
  kind: CustodyKind;
  // the money
  amount: number;
  mode: string;                   // Cash / Cheque
  purpose: string;                // tuition / day care / uniform …
  payer: string | null;           // the child or the person who paid
  chequeNumber?: string | null;
  chequeBank?: string | null;
  receiptId: number;
  receivedOn?: string | null;     // when the school first took it
  // the movement
  fromPerson: string | null;
  toPerson: string | null;
  at: string;                     // already formatted, IST
  note?: string | null;
  // who signed, and the trail
  signedName?: string | null;
  signaturePng?: string | null;
  loggedBy?: string | null;       // the staff account that opened the tablet
  ip?: string | null;
  agent?: string | null;
  history?: { at: string; what: string }[];
};

const TITLE: Record<CustodyKind, string> = {
  collected: "Acknowledgement of money received",
  handover: "Acknowledgement of money handed over",
  banked: "Record of money deposited in the bank",
};

export async function renderCustodyPdf(d: CustodyAck): Promise<Uint8Array> {
  const s = await new Sheet().init();
  const money = (n: number) => "INR " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  s.text(TITLE[d.kind] || TITLE.handover, { bold: true, size: 15, after: 2 });
  s.text("EuroKids JMD Enclave, operated by Veena Educational Services · Bungalow 1, JMD Enclave, Mohammadwadi, Pune 411060",
    { size: 9.5, color: MUTE, lead: 12, after: 12 });
  s.text(`Date: ${d.at}`, { size: 12, after: 1 });
  s.text(`Reference: ${d.reference}`, { size: 10.5, color: MUTE, after: 12 });

  // The sentence first, because that is what is being agreed. Everything
  // below it is the same fact set out in a table for whoever reads the file.
  const who = d.toPerson || "the person named below";
  const line = d.kind === "banked"
    ? `${money(d.amount)} (${rupeesInWords(d.amount)}) received by the school${d.payer ? ` from ${d.payer}` : ""} has been deposited in the school's bank account.`
    : d.kind === "collected"
      ? `I, ${who}, confirm that I have received ${money(d.amount)} (${rupeesInWords(d.amount)}) in ${d.mode.toLowerCase()}${d.payer ? ` from ${d.payer}` : ""}, on behalf of EuroKids JMD Enclave.`
      : `I, ${who}, confirm that I have received ${money(d.amount)} (${rupeesInWords(d.amount)}) in ${d.mode.toLowerCase()}${d.fromPerson ? ` from ${d.fromPerson}` : ""}, being money collected by the school${d.payer ? ` from ${d.payer}` : ""}, and that it is now in my keeping until it is passed on or banked.`;
  s.text(line, { size: 12, lead: 17, after: 12 });

  // ── the facts ─────────────────────────────────────────────────────────
  const rows: [string, string][] = [
    ["Amount", `${money(d.amount)} (${d.mode})`],
    ["Collected from", d.payer || "—"],
    ["For", d.purpose || "—"],
    ...(d.chequeNumber ? [["Cheque", `${d.chequeNumber}${d.chequeBank ? ` · ${d.chequeBank}` : ""}`] as [string, string]] : []),
    ...(d.receivedOn ? [["First received by the school", d.receivedOn] as [string, string]] : []),
    ["Handed over by", d.fromPerson || "—"],
    ["Received by", d.toPerson || "—"],
    ["Receipt number", `#${d.receiptId}`],
  ];
  const bh = rows.length * 14 + 20;
  s.room(bh + 10);
  const top = s.y;
  s.page.drawRectangle({ x: L, y: top - bh, width: WIDTH, height: bh, borderColor: HAIR, borderWidth: 0.7 });
  let y = top - 22;
  for (const [k, v] of rows) {
    s.page.drawText(k, { x: L + 12, y, size: 8.6, font: s.reg, color: MUTE });
    s.page.drawText(v, { x: L + 210, y, size: 9.2, font: s.bold, color: INK });
    y -= 14;
  }
  s.y = top - bh - 14;

  if (d.note) s.text(`Note: ${d.note}`, { size: 10.5, lead: 14, color: MUTE, after: 6 });

  // ── the signature ─────────────────────────────────────────────────────
  if (d.signaturePng) {
    s.room(92);
    s.gap(4);
    try {
      const img = await s.doc.embedPng(dataUrlToBytes(d.signaturePng));
      const { w, h } = fitSignature(img, 150, 46);
      s.page.drawImage(img, { x: L, y: s.y - h, width: w, height: h });
      s.y -= h + 2;
    } catch { /* the typed name still stands if the drawing will not embed */ }
    s.page.drawLine({ start: { x: L, y: s.y }, end: { x: L + 210, y: s.y }, thickness: 0.8, color: HAIR });
    s.gap(14);
    s.text(`Signed: ${d.signedName || d.toPerson || ""}`, { size: 11 });
    s.text(`Date: ${d.at}`, { size: 11, after: 4 });
  } else if (d.kind !== "banked") {
    s.gap(10);
    s.text("Signature:", { after: 26 });
    s.text("Name:", { after: 14 });
  }

  // ── the audit block ───────────────────────────────────────────────────
  // Reserve only the heading and its first line: if the trail has to break
  // across pages it may, but it should not push a mostly-empty page on its own.
  s.room(40);
  s.gap(8);
  s.rule(10);
  s.text("How this was recorded", { size: 10, bold: true, after: 3 });
  const trail: [string, string][] = [
    ["Entered by", d.loggedBy || "—"],
    ["Signed on", d.at],
    ["Device", (d.agent || "—").slice(0, 70)],
    ["IP address", d.ip || "—"],
    ["Reference", d.reference],
  ];
  for (const [k, v] of trail) {
    s.room(12);
    s.page.drawText(k, { x: L, y: s.y - 8, size: 7.6, font: s.reg, color: MUTE });
    s.page.drawText(v, { x: L + 150, y: s.y - 8, size: 7.6, font: s.reg, color: INK });
    s.y -= 12;
  }

  if (d.history?.length) {
    s.gap(6);
    s.text("This money so far", { size: 10, bold: true, after: 3 });
    for (const h of d.history) {
      s.room(14);
      s.page.drawText(h.at, { x: L, y: s.y - 8, size: 7.6, font: s.reg, color: MUTE });
      s.page.drawText(h.what, { x: L + 130, y: s.y - 8, size: 8, font: s.reg, color: INK });
      s.y -= 13;
    }
  }

  s.gap(6);
  s.text("Signed electronically under the Information Technology Act, 2000. The time, device and network address above were captured automatically at the moment of signing and are not editable.",
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
