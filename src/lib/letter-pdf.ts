// The appointment letter, laid onto the school's own letterhead.
//
// The shape was chosen deliberately: page one is a short, warm letter with a
// box of the five facts that matter, and everything legal comes after it. The
// previous version opened with "hereinafter referred to as the Teacher, which
// expression shall, unless repugnant to the context" — page one, paragraph
// one. Nobody read past it, which is the opposite of what a contract is for.
//
// pdf-lib rather than a headless browser: it runs in a serverless function in
// a few hundred milliseconds, with no Chromium to install and nothing to time
// out. The cost is that we lay out the text ourselves, below.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RGB } from "pdf-lib";
import fs from "node:fs";
import path from "node:path";

// A4 in points, and the safe area inside the letterhead artwork: the logo
// occupies the top ~93pt and the address strip the bottom ~70pt.
const W = 595.28, H = 841.89;
const L = 64, R = W - 64, TOP = H - 104, BOTTOM = 88;
const WIDTH = R - L;

// Black on white, and nothing else. The first draft had blue headings, a red
// edge on a tinted panel and an italic blue quote; it read as a brochure. An
// appointment letter should look like an appointment letter.
const INK: RGB = rgb(0, 0, 0);
const MUTE: RGB = rgb(0.30, 0.30, 0.30);   // small print only, never a heading
const HAIR: RGB = rgb(0.72, 0.72, 0.72);   // a hairline rule, not a colour

export type LetterData = {
  // who
  name: string;
  address?: string[];
  designation: string;
  // the words
  issuedOn: string;            // already formatted, e.g. "21 September 2026"
  page1Body: string;
  terms: { heading: string; body: string }[];
  quote?: string | null;
  quoteBy?: string | null;
  title?: string;
  // the school's side
  signedByName: string;
  signedByRole: string;
  schoolSignaturePng?: string | null;   // data URL
  // the teacher's side, once she has signed
  signature?: {
    name: string;
    png?: string | null;                // data URL of what she drew
    at: string;                         // formatted timestamp
    email?: string | null;
    phone?: string | null;
    ip?: string | null;
    agent?: string | null;
    reference?: string | null;
  } | null;
  signUrl?: string | null;              // printed when it is not yet signed
};

// ── the little text engine ───────────────────────────────────────────────
// Just enough markup to write a letter in a textarea: **bold** inline, blank
// lines between paragraphs. Anything cleverer would be a trap for whoever
// edits the template next.
type Run = { text: string; bold: boolean };

function runs(line: string): Run[] {
  const out: Run[] = [];
  for (const part of line.split(/(\*\*[^*]+\*\*)/g)) {
    if (!part) continue;
    out.push(part.startsWith("**") && part.endsWith("**")
      ? { text: part.slice(2, -2), bold: true }
      : { text: part, bold: false });
  }
  return out.length ? out : [{ text: line, bold: false }];
}

function wrap(rs: Run[], size: number, maxW: number, reg: PDFFont, bold: PDFFont): Run[][] {
  const lines: Run[][] = [];
  let line: Run[] = [], w = 0;
  for (const r of rs) {
    const f = r.bold ? bold : reg;
    // Keep the spaces: splitting on /(\s+)/ means a run that ends mid-sentence
    // rejoins the next one without swallowing the gap between words.
    for (const word of r.text.split(/(\s+)/)) {
      if (!word) continue;
      const ww = f.widthOfTextAtSize(word, size);
      if (w + ww > maxW && /\S/.test(word) && line.length) { lines.push(line); line = []; w = 0; }
      if (!/\S/.test(word) && !line.length) continue;   // no leading space on a new line
      line.push({ text: word, bold: r.bold }); w += ww;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

export class Sheet {
  doc!: PDFDocument;
  page!: PDFPage;
  y = TOP;
  reg!: PDFFont; bold!: PDFFont; ital!: PDFFont;
  bg?: Awaited<ReturnType<PDFDocument["embedPng"]>>;

  async init() {
    this.doc = await PDFDocument.create();
    this.reg = await this.doc.embedFont(StandardFonts.Helvetica);
    this.bold = await this.doc.embedFont(StandardFonts.HelveticaBold);
    this.ital = await this.doc.embedFont(StandardFonts.HelveticaOblique);
    // The letterhead is the page: logo, address strip, the pink block. Drawing
    // it as a full-bleed background means the letter looks the same as one
    // printed on the school's own paper.
    const p = path.join(process.cwd(), "public", "brand", "letterhead.png");
    if (fs.existsSync(p)) this.bg = await this.doc.embedPng(fs.readFileSync(p));
    this.newPage();
    return this;
  }

  newPage() {
    this.page = this.doc.addPage([W, H]);
    if (this.bg) this.page.drawImage(this.bg, { x: 0, y: 0, width: W, height: H });
    this.y = TOP;
    return this.page;
  }

  room(h: number) { if (this.y - h < BOTTOM) this.newPage(); }

  text(s: string, opts: { size?: number; color?: RGB; bold?: boolean; italic?: boolean;
                          lead?: number; gap?: number; indent?: number; width?: number } = {}) {
    const size = opts.size ?? 10.5;
    const lead = opts.lead ?? size * 1.55;
    const x = L + (opts.indent ?? 0);
    const maxW = (opts.width ?? WIDTH) - (opts.indent ?? 0);
    const reg = opts.italic ? this.ital : (opts.bold ? this.bold : this.reg);
    for (const para of String(s).split(/\n/)) {
      if (!para.trim()) { this.y -= lead * 0.45; continue; }
      for (const ln of wrap(runs(para), size, maxW, reg, this.bold)) {
        this.room(lead);
        let cx = x;
        for (const r of ln) {
          const f = r.bold ? this.bold : reg;
          this.page.drawText(r.text, { x: cx, y: this.y - size, size, font: f, color: opts.color ?? INK });
          cx += f.widthOfTextAtSize(r.text, size);
        }
        this.y -= lead;
      }
    }
    this.y -= opts.gap ?? 0;
  }

  rule(gap = 10) { this.room(gap + 2);
    this.page.drawLine({ start: { x: L, y: this.y }, end: { x: R, y: this.y }, thickness: 0.6, color: HAIR });
    this.y -= gap; }
}

// ── rupees, written out the way an Indian letter writes them ─────────────
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function under100(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)], o = ONES[n % 10];
  return o ? `${t}-${o}` : t;
}
function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? under100(r) : ""].filter(Boolean).join(" and ");
}

// Lakh and crore, not million — the reader is in Pune.
export function rupeesInWords(amount: number): string {
  const n = Math.round(Number(amount) || 0);
  if (n <= 0) return "Nil";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${under1000(crore)} Crore`);
  if (lakh) parts.push(`${under1000(lakh)} Lakh`);
  if (thousand) parts.push(`${under1000(thousand)} Thousand`);
  if (rest) parts.push(under1000(rest));
  return `Rupees ${parts.join(" ")} only`;
}

// Helvetica has no rupee glyph, and a missing glyph in a PDF is a blank box
// on a legal document. "Rs." is what these letters have always said anyway.
export const rs = (n: number | string) =>
  "Rs. " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }) + "/-";

// ── the document ─────────────────────────────────────────────────────────
export async function renderLetterPdf(d: LetterData): Promise<Uint8Array> {
  const s = await new Sheet().init();

  // ── page one: the letter ────────────────────────────────────────────
  s.text(d.issuedOn, { size: 10, gap: 12 });
  s.text(d.name, { size: 10.5, lead: 14 });
  for (const ln of d.address || []) s.text(ln, { size: 10.5, lead: 14 });
  s.y -= 14;
  s.text(`Sub: ${d.title || "Letter of Appointment"}`, { size: 10.5, bold: true, gap: 10 });
  s.text(d.page1Body, {});

  // Regards + signature + name + role + the quote, measured together: this
  // block moves to the next page as a whole or not at all.
  const closing = 22 + (d.schoolSignaturePng ? 44 : 26) + 30 + (d.quote ? 58 : 0);
  s.y -= 9;
  s.room(closing);
  s.text("Yours sincerely,", { size: 10.5, gap: 2 });
  if (d.schoolSignaturePng) {
    try {
      const img = await s.doc.embedPng(dataUrlToBytes(d.schoolSignaturePng));
      const w = 120, h = (img.height / img.width) * w;
      s.room(h + 6);
      s.page.drawImage(img, { x: L, y: s.y - h, width: w, height: h });
      s.y -= h + 2;
    } catch { /* an unreadable signature image must not stop a letter */ }
  } else s.y -= 26;
  s.text(d.signedByName, { size: 10.5, bold: true, lead: 14 });
  s.text(d.signedByRole, { size: 10, lead: 13 });

  if (d.quote) {
    s.y -= 16;
    s.rule(10);
    s.text(`"${d.quote}"`, { size: 9.5, italic: true, lead: 14 });
    if (d.quoteBy) s.text(`— ${d.quoteBy}`, { size: 9, color: MUTE, lead: 12 });
  }

  // ── the detail, behind ──────────────────────────────────────────────
  s.newPage();
  s.text("The details", { size: 12.5, bold: true, gap: 2 });
  s.text("Everything below is part of your appointment. Read it once, keep it, and ask us about anything that is not clear.",
    { size: 10, gap: 14 });

  let n = 0;
  for (const t of d.terms || []) {
    n++;
    s.room(52);
    s.text(`${n}.  ${t.heading}`, { size: 11, bold: true, gap: 2 });
    s.text(t.body, { size: 10.5, lead: 15.5, gap: 12 });
  }

  // ── the signature page ──────────────────────────────────────────────
  // Reserved as one block. A signature panel that breaks leaves a single
  // orphan line of legal boilerplate on a page of its own, which looks like
  // a fault in the document at exactly the moment it should look careful.
  s.room(d.signature ? 348 : 214);
  s.y -= 8;
  s.rule(16);
  s.text("Acceptance", { size: 11, bold: true, gap: 4 });

  if (d.signature) {
    s.text("This letter was read and accepted electronically. The record of that acceptance is set out below.",
      { size: 10, gap: 12 });
    if (d.signature.png) {
      try {
        const img = await s.doc.embedPng(dataUrlToBytes(d.signature.png));
        const w = 170, h = Math.min(60, (img.height / img.width) * w);
        s.room(h + 10);
        s.page.drawImage(img, { x: L, y: s.y - h, width: w, height: h });
        s.y -= h + 4;
      } catch { /* keep the typed name even if the drawing will not embed */ }
    }
    s.page.drawLine({ start: { x: L, y: s.y }, end: { x: L + 200, y: s.y }, thickness: 0.8, color: HAIR });
    s.y -= 14;
    s.text(d.signature.name, { size: 10.5, bold: true, lead: 14 });
    s.text(`Signed ${d.signature.at}`, { size: 9.5, lead: 13, gap: 14 });

    // The audit block. This — not the drawing above it — is what makes an
    // electronic signature worth anything if it is ever questioned.
    const rows: [string, string][] = [
      ["Signed by", d.signature.name],
      ["One-time code emailed to", d.signature.email || "—"],
      ["Mobile on record, confirmed by signatory", d.signature.phone || "not held"],
      ["Timestamp", d.signature.at],
      ["IP address", d.signature.ip || "—"],
      ["Device", (d.signature.agent || "—").slice(0, 78)],
      ["Document reference", d.signature.reference || "—"],
    ];
    const h = rows.length * 13 + 30;
    s.room(h + 10);
    const top = s.y;
    s.page.drawRectangle({ x: L, y: top - h, width: WIDTH, height: h, borderColor: HAIR, borderWidth: 0.7 });
    s.page.drawText("Record of electronic signature", { x: L + 12, y: top - 16, size: 8.5, font: s.bold, color: INK });
    let y = top - 32;
    for (const [k, v] of rows) {
      s.page.drawText(k, { x: L + 12, y, size: 7.6, font: s.reg, color: MUTE });
      s.page.drawText(v, { x: L + 190, y, size: 7.6, font: s.reg, color: INK });
      y -= 13;
    }
    s.y = top - h - 10;
    s.text("Signed electronically under the Information Technology Act, 2000. The signatory was identified by a one-time code and the record above captured at the moment of signing.",
      { size: 7.5, color: MUTE, lead: 10 });
  } else {
    s.text("Please sign this letter online — it takes less than a minute on your phone. Open the link we emailed you, read the letter, enter the code we email you, and sign.",
      { size: 10, lead: 15, gap: 10 });
    if (d.signUrl) s.text(d.signUrl, { size: 9, lead: 13, gap: 16 });
    s.y -= 20;
    s.page.drawLine({ start: { x: L, y: s.y }, end: { x: L + 220, y: s.y }, thickness: 0.8, color: HAIR });
    s.y -= 14;
    s.text(d.name, { size: 10, lead: 13 });
    s.text("Signature and date", { size: 9, color: MUTE, lead: 12 });
  }

  // Page numbers, last, once the count is known.
  const pages = s.doc.getPages();
  pages.forEach((p, i) => {
    if (pages.length < 2) return;
    p.drawText(`Page ${i + 1} of ${pages.length}`,
      { x: R - 62, y: BOTTOM - 14, size: 8, font: s.reg, color: MUTE });
  });

  return await s.doc.save();
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
