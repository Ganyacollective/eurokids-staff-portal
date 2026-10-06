// The two day care invoices, rebuilt from INV-000059 and INV-000802.
//
// Same document in two dresses. The reimbursement copy a parent claims
// against shows hours and a rate per hour and names the child as a field;
// the ordinary monthly bill shows quantities and rates, groups the lines
// under "Child | Month", and carries the terms and a payment QR on the back.
//
// Both always leave fully paid. A reimbursement claim with a balance on it is
// worth nothing to an employer, and the monthly bill is raised after the fee
// is in — so Payment Made and Balance Due 0.00 are not a state, they are part
// of the design.
//
// Built on the same Sheet engine as everything else, but NOT on the
// letterhead: these carry their own header block, because that is what the
// originals do and a finance team matching a document against last month's
// will notice the difference before they notice anything else.

import { PDFDocument, PDFFont, PDFPage, rgb, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs";
import path from "node:path";
import { rupeesInWords, schoolSignature, fitSignature } from "./letter-pdf";

const W = 595.28, H = 841.89;
const L = 42, R = W - 42, WIDTH = R - L;
const TOP = H - 40, BOTTOM = 56;

const INK: RGB = rgb(0.11, 0.12, 0.13);
const BRAND: RGB = rgb(0.12, 0.25, 0.60);     // the EuroKids blue of the originals
const MUTE: RGB = rgb(0.42, 0.45, 0.50);
const HAIR: RGB = rgb(0.85, 0.86, 0.88);
const BAR: RGB = rgb(0.25, 0.27, 0.30);
const PANEL: RGB = rgb(0.95, 0.955, 0.96);

const asset = (...p: string[]) => path.join(process.cwd(), "public", "brand", ...p);

export type InvoiceLine = {
  name: string;
  description?: string | null;
  qty: number;
  rate: number;
  amount: number;
};

export type InvoiceDoc = {
  kind: "reimbursement" | "billing";
  number: string;                 // INV-000059
  invoiceDate: string;            // 01/10/2026
  dueDate: string;
  termsLabel: string;
  // who
  billToName: string;             // the parent
  childName?: string | null;
  subject?: string | null;        // billing only
  groupHeader?: string | null;    // billing only — "Fawaz | October 2026"
  // the money
  lines: InvoiceLine[];
  subtotal: number;
  total: number;
  paymentMade: number;
  balanceDue: number;
  // the organisation
  orgName: string;
  orgLines: string[];             // address, phone, email, website, registrations
  notes?: string[] | null;
  terms?: { heading: string; lines: string[] }[] | null;
  payQrPng?: string | null;
  signedByName: string;
};

const money = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function renderInvoicePdf(d: InvoiceDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(fs.readFileSync(asset("fonts", "body.ttf")), { subset: true });
  const bold = await doc.embedFont(fs.readFileSync(asset("fonts", "body-bold.ttf")), { subset: true });
  const ital = await doc.embedFont(fs.readFileSync(asset("fonts", "body-italic.ttf")), { subset: true });

  let page = doc.addPage([W, H]);
  let y = TOP;
  const pages = [page];
  const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = TOP; };
  const room = (h: number) => { if (y - h < BOTTOM) newPage(); };

  const put = (s: string, x: number, size = 9, f: PDFFont = reg, c: RGB = INK) =>
    page.drawText(String(s ?? ""), { x, y: y - size, size, font: f, color: c });
  const right = (s: string, xEnd: number, size = 9, f: PDFFont = reg, c: RGB = INK) =>
    page.drawText(String(s ?? ""), { x: xEnd - f.widthOfTextAtSize(String(s ?? ""), size), y: y - size, size, font: f, color: c });

  // Wraps at a width, returns the lines. One drawText per line — a string
  // with newlines in it measures as a single line and silently overflows.
  const wrap = (s: string, maxW: number, size: number, f: PDFFont) => {
    const out: string[] = [];
    for (const para of String(s || "").split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const t = line ? line + " " + word : word;
        if (f.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = word; }
        else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const block = (s: string, x: number, maxW: number, size: number, f: PDFFont, c: RGB, lead = size * 1.45) => {
    for (const ln of wrap(s, maxW, size, f)) {
      room(lead);
      page.drawText(ln, { x, y: y - size, size, font: f, color: c });
      y -= lead;
    }
  };

  // ── the head ──────────────────────────────────────────────────────────
  put("TAX INVOICE", L, 24, reg, INK);
  y -= 30;
  put(`Invoice# ${d.number}`, L, 9.5, bold, BRAND);
  y -= 22;
  put("Balance Due", L, 7.5, reg, MUTE);
  y -= 11;
  put(money(d.balanceDue), L, 13, bold, INK);

  // the organisation, right-aligned, starting level with the title
  let oy = TOP;
  const orgRight = (s: string, size: number, f: PDFFont, c: RGB) => {
    page.drawText(s, { x: R - f.widthOfTextAtSize(s, size), y: oy - size, size, font: f, color: c });
    oy -= size * 1.5;
  };
  oy = TOP - 58;
  orgRight(d.orgName, 9.5, bold, INK);
  for (const ln of d.orgLines) orgRight(ln, 9, reg, BRAND);

  y = Math.min(y - 34, oy - 26);

  // ── the facts, two columns ────────────────────────────────────────────
  const label = (k: string, v: string) => {
    put(k, L, 9, reg, BRAND);
    put(v, L + 118, 9, reg, INK);
    y -= 16;
  };
  const factTop = y;
  label("Invoice Date :", d.invoiceDate);
  label("Terms :", d.termsLabel);
  label("Due Date :", d.dueDate);
  // The reimbursement copy names the child here, as a field — it is what the
  // employer's finance team looks for first.
  if (d.kind === "reimbursement" && d.childName) label("Childs Name :", d.childName);

  const billY = factTop - 48;
  page.drawText("Bill To", { x: L + 300, y: billY - 9, size: 9, font: reg, color: BRAND });
  page.drawText(d.billToName, { x: L + 300, y: billY - 23, size: 9.5, font: bold, color: INK });

  y = Math.min(y, billY - 34) - 8;

  if (d.subject) {
    put("Subject :", L, 9, reg, INK); y -= 15;
    block(d.subject, L, WIDTH, 9, reg, BRAND);
    y -= 6;
  }

  // ── the table ─────────────────────────────────────────────────────────
  // Right edges, not left — every figure in a money column is right-aligned,
  // and the first version put the rate column's edge on top of the amount's.
  const hourly = d.kind === "reimbursement";
  const cols = {
    num: L + 8, item: L + 30,
    qtyEnd: L + 330, rateEnd: L + 428, amtEnd: R - 8,
    qtyHead: hourly ? ["Monthly", "Hours"] : ["Qty"],
    rateHead: hourly ? ["Rate Per", "Hour"] : ["Rate"],
  };

  const headH = hourly ? 32 : 22;
  room(headH + 40);
  page.drawRectangle({ x: L, y: y - headH, width: WIDTH, height: headH, color: BAR });
  const hy = y - (hourly ? 13 : 15);
  page.drawText("#", { x: cols.num, y: hy, size: 8.5, font: reg, color: rgb(1, 1, 1) });
  page.drawText("Item & Description", { x: cols.item, y: hy, size: 8.5, font: reg, color: rgb(1, 1, 1) });
  const headRight = (parts: string[], xEnd: number) => {
    parts.forEach((p, i) => {
      page.drawText(p, { x: xEnd - reg.widthOfTextAtSize(p, 8.5), y: hy - i * 11, size: 8.5, font: reg, color: rgb(1, 1, 1) });
    });
  };
  headRight(cols.qtyHead, cols.qtyEnd);
  headRight(cols.rateHead, cols.rateEnd);
  headRight(["Amount"], cols.amtEnd);
  y -= headH + 4;

  if (d.groupHeader) {
    room(20);
    y -= 10;
    put(d.groupHeader, cols.item, 9, bold, INK);
    y -= 14;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: HAIR });
  }

  d.lines.forEach((ln, i) => {
    const desc = ln.description ? wrap(ln.description, 330, 7.5, reg) : [];
    room(20 + desc.length * 10);
    y -= 12;
    put(String(i + 1), cols.num, 9, reg, INK);
    put(ln.name, cols.item, 9, reg, INK);
    right(Number(ln.qty).toFixed(2), cols.qtyEnd, 9, reg, INK);
    right(money(ln.rate), cols.rateEnd, 9, reg, INK);
    right(money(ln.amount), cols.amtEnd, 9, reg, INK);
    y -= 11;
    for (const dl of desc) {
      page.drawText(dl, { x: cols.item, y: y - 7.5, size: 7.5, font: reg, color: MUTE });
      y -= 10;
    }
    y -= 4;
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 0.5, color: HAIR });
  });

  // ── the totals ────────────────────────────────────────────────────────
  // Kept whole: the figures and the amount in words must never be split
  // across a page from each other.
  room(130);
  y -= 16;
  const tLabelEnd = R - 150, tAmtEnd = R - 8;
  const totalRow = (k: string, v: string, f: PDFFont = reg, c: RGB = INK) => {
    right(k, tLabelEnd, 9, f, c);
    right(v, tAmtEnd, 9, f, c);
    y -= 18;
  };
  totalRow("Sub Total", money(d.subtotal));
  totalRow("Total", money(d.total), bold);
  totalRow("Payment Made", "(-) " + money(d.paymentMade), reg, rgb(0.78, 0.18, 0.13));

  // The band sits behind the Balance Due row only. Drawn one row too high it
  // covered Payment Made completely — the line that proves the invoice is a
  // receipt, which is the whole point of this document.
  page.drawRectangle({ x: tLabelEnd - 150, y: y - 14, width: R - (tLabelEnd - 150), height: 22, color: PANEL });
  totalRow("Balance Due", money(d.balanceDue), bold);
  y -= 10;

  right("Total In Words:", tLabelEnd, 9, reg, INK);
  const words = wrap(`Indian ${rupeesInWords(d.total).replace(/^Rupees /, "Rupee ")}`, 150, 9, ital);
  words.forEach((w, i) => {
    page.drawText(w, { x: tLabelEnd + 12, y: y - 9 - i * 13, size: 9, font: ital, color: INK });
  });
  y -= words.length * 13 + 14;

  // ── the back of the document ──────────────────────────────────────────
  if (d.notes?.length) {
    room(50);
    y -= 10;
    put("Notes", L, 9.5, reg, BRAND); y -= 14;
    for (const n of d.notes) { block(n, L, WIDTH, 7.8, reg, MUTE, 11); y -= 4; }
  }

  if (d.payQrPng) {
    room(90);
    y -= 10;
    try {
      const img = await doc.embedPng(dataUrlToBytes(d.payQrPng));
      const side = 74;
      page.drawRectangle({ x: L, y: y - side - 12, width: 300, height: side + 12, color: PANEL });
      page.drawImage(img, { x: L + 6, y: y - side - 6, width: side, height: side });
      page.drawText("Scan the QR code to pay.", { x: L + side + 18, y: y - side / 2 - 10, size: 9, font: reg, color: BRAND });
      y -= side + 22;
    } catch { /* a missing QR must not stop an invoice */ }
  }

  if (d.terms?.length) {
    room(60);
    y -= 8;
    put("Terms & Conditions", L, 9.5, reg, INK); y -= 15;
    for (const t of d.terms) {
      room(28);
      put(t.heading, L, 7.8, reg, BRAND); y -= 11;
      for (const ln of t.lines) block(ln, L, WIDTH, 7.8, reg, BRAND, 11);
      y -= 6;
    }
  }

  // ── the signature ─────────────────────────────────────────────────────
  room(110);
  y -= 24;
  const sig = schoolSignature();
  if (sig) {
    try {
      const img = await doc.embedPng(dataUrlToBytes(sig));
      const { w, h } = fitSignature(img, 140, 58);
      page.drawImage(img, { x: L, y: y - h, width: w, height: h });
      y -= h + 6;
    } catch { /* the printed name still stands */ }
  } else y -= 40;
  put(d.signedByName, L, 9, reg, BRAND); y -= 13;
  put("Authorized Signature", L, 9, reg, INK);

  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const s = String(i + 1);
      p.drawText(s, { x: R - reg.widthOfTextAtSize(s, 7.5), y: 28, size: 7.5, font: reg, color: MUTE });
    });
  }
  return await doc.save();
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
