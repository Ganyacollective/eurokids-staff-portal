// The appointment letter, rebuilt to match the school's own Pages document.
//
// The first version was my own design — a short warm letter with the terms
// behind it. Abhinav's answer was direct: the existing agreement is better
// made, use that. So this renders the real thing: PRIVATE AND CONFIDENTIAL,
// the recital, numbered clauses, SPECIAL CONDITIONS with its § X / § Y / § Z
// sections, and a closing page that ends "I accept the above terms &
// conditions".
//
// Measured from EC_EK.pdf rather than guessed: A4, 14pt body, 56.7pt side
// margins, text from y≈57 to y≈764, all on the JMD Enclave letterhead.
//
// pdf-lib rather than a headless browser: a few hundred milliseconds in a
// serverless function, no Chromium to install and nothing to time out. The
// cost is that we lay the text out ourselves, below.

import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs";
import path from "node:path";

// A4 and the original's own measurements.
const W = 595.28, H = 841.89;
const L = 56.7, R = W - 56.7;
const TOP = H - 104;          // clear of the logo
const BOTTOM = 88;            // clear of the address strip
const WIDTH = R - L;

const SIZE = 14;              // the body size in the original
const LEAD = SIZE * 1.42;

// Black on white. Nothing else — this is a contract.
const INK: RGB = rgb(0, 0, 0);
const MUTE: RGB = rgb(0.32, 0.32, 0.32);
const HAIR: RGB = rgb(0.72, 0.72, 0.72);

const asset = (...p: string[]) => path.join(process.cwd(), "public", "brand", ...p);

export type LetterData = {
  // who
  name: string;
  address?: string[];
  designation: string;
  // the words — all of it editable in letter_template
  issuedOn: string;
  page1Body: string;                              // preamble, recital, WHEREAS
  terms: { heading: string; body: string }[];     // the numbered agreement
  closing?: string | null;                        // "We believe our teachers…"
  title?: string;
  // the school's side
  signedByName: string;
  signedByRole: string;
  schoolSignaturePng?: string | null;
  // the employee's side, once she has signed
  signature?: {
    name: string;
    png?: string | null;
    at: string;
    email?: string | null;
    phone?: string | null;
    ip?: string | null;
    agent?: string | null;
    reference?: string | null;
    sha256?: string | null;
    // Sent → viewed → code issued → signed, the way a signing service prints
    // it. Every line of this is already recorded in letter_event; it was
    // simply never shown to the person it protects.
    history?: { at: string; what: string; ip?: string | null }[];
  } | null;
  signUrl?: string | null;
};

// ── the little text engine ───────────────────────────────────────────────
// Enough markup to write a contract in a textarea: **bold** inline, blank
// lines between paragraphs, and a leading "• " for a bullet. Anything
// cleverer would be a trap for whoever edits the template next.
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
    // Keep the spaces: splitting on /(\s+)/ means a run ending mid-sentence
    // rejoins the next without swallowing the gap between words.
    for (const word of r.text.split(/(\s+)/)) {
      if (!word) continue;
      const ww = f.widthOfTextAtSize(word, size);
      if (w + ww > maxW && /\S/.test(word) && line.length) { lines.push(line); line = []; w = 0; }
      if (!/\S/.test(word) && !line.length) continue;
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
    this.doc.registerFontkit(fontkit);
    // Tahoma in the original; DejaVu Sans Condensed here, because Tahoma is a
    // Microsoft font that may not be redistributed. See fonts/LICENCE.txt.
    const font = (f: string) => this.doc.embedFont(fs.readFileSync(asset("fonts", f)), { subset: true });
    this.reg = await font("body.ttf");
    this.bold = await font("body-bold.ttf");
    this.ital = await font("body-italic.ttf");
    const p = asset("letterhead.png");
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
  gap(h: number) { this.y -= h; }

  text(s: string, o: { size?: number; color?: RGB; bold?: boolean; italic?: boolean;
                       lead?: number; after?: number; indent?: number; hang?: number } = {}) {
    const size = o.size ?? SIZE;
    const lead = o.lead ?? (size === SIZE ? LEAD : size * 1.42);
    const reg = o.italic ? this.ital : (o.bold ? this.bold : this.reg);
    for (const raw of String(s).split(/\n/)) {
      const para = raw.trimEnd();
      if (!para.trim()) { this.y -= lead * 0.55; continue; }

      // "• " starts a bullet: the marker sits in the margin and the wrapped
      // lines hang under the text, not under the dot.
      const isBullet = /^[•\-•]\s+/.test(para);
      const body = isBullet ? para.replace(/^[•\-•]\s+/, "") : para;
      const indent = (o.indent ?? 0) + (isBullet ? 16 : 0);
      const hang = isBullet ? 0 : (o.hang ?? 0);

      const lines = wrap(runs(body), size, WIDTH - indent, reg, this.bold);
      lines.forEach((ln, i) => {
        this.room(lead);
        let cx = L + indent + (i > 0 ? hang : 0);
        if (isBullet && i === 0) {
          this.page.drawText("•", { x: L + indent - 14, y: this.y - size, size, font: reg, color: o.color ?? INK });
        }
        for (const r of ln) {
          const f = r.bold ? this.bold : reg;
          this.page.drawText(r.text, { x: cx, y: this.y - size, size, font: f, color: o.color ?? INK });
          cx += f.widthOfTextAtSize(r.text, size);
        }
        this.y -= lead;
      });
      this.y -= lead * 0.18;
    }
    this.y -= o.after ?? 0;
  }

  rule(after = 10) {
    this.room(after + 2);
    this.page.drawLine({ start: { x: L, y: this.y }, end: { x: R, y: this.y }, thickness: 0.6, color: HAIR });
    this.y -= after;
  }
}

// ── rupees, written the way an Indian letter writes them ─────────────────
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

// The original writes "INR 26,000". Now that a real font is embedded the
// rupee glyph would work, but the house style is INR and it stays.
export const rs = (n: number | string) =>
  "INR " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// ── the document ─────────────────────────────────────────────────────────
export async function renderLetterPdf(d: LetterData): Promise<Uint8Array> {
  const s = await new Sheet().init();

  // ── page one: the head of the letter ──────────────────────────────────
  s.text("PRIVATE AND CONFIDENTIAL", { bold: true });
  s.text(`Date: ${d.issuedOn}`, { after: 10 });
  s.text(d.name);
  for (const ln of d.address || []) s.text(ln);
  s.gap(8);
  s.text("EUROKIDS JMD ENCLAVE");
  s.text("(Operated by Veena Educational Services)", { after: 10 });
  s.text(`Sub: ${d.title || "Letter of Appointment"}`, { bold: true, after: 8 });
  s.text(`Dear ${d.name},`, { after: 6 });
  s.text(d.page1Body);

  // ── the agreement ─────────────────────────────────────────────────────
  for (const t of d.terms || []) {
    const h = (t.heading || "").trim();
    if (!h && !t.body?.trim()) continue;
    // A heading and its first two lines travel together; a clause number
    // stranded at the foot of a page looks like a printing fault.
    s.room(LEAD * 3.4);
    s.gap(6);
    if (h) s.text(h, { bold: true, after: 2 });
    if (t.body) s.text(t.body);
  }

  // ── the closing page ──────────────────────────────────────────────────
  // Always its own page: the acceptance block is what gets printed, signed
  // and filed, and it should never share a sheet with clause 11.4.
  s.newPage();
  if (d.closing) s.text(d.closing, { after: 14 });

  s.text("Yours Truly");
  s.text("For EuroKids JMD Enclave");
  s.text("(Operated by Veena Educational Services)", { after: 18 });
  s.text("Authorised Signatory", { after: 4 });

  if (d.schoolSignaturePng) {
    try {
      const img = await s.doc.embedPng(dataUrlToBytes(d.schoolSignaturePng));
      const w = 150, h = (img.height / img.width) * w;
      s.room(h + 8);
      s.page.drawImage(img, { x: L, y: s.y - h, width: w, height: h });
      s.y -= h + 4;
    } catch { /* an unreadable signature image must not stop a letter */ }
  } else s.gap(34);

  s.text(`Name: ${d.signedByName}`);
  s.text(`Designation: ${d.signedByRole}`, { after: 22 });

  s.text("I have read and understood the contents of this letter. The said terms and conditions have been agreed & accepted by me and I am signing herewith in token of having accepted the letter and the terms and conditions mentioned therein.",
    { after: 18 });
  s.text("I accept the above terms & conditions", { after: 14 });

  if (d.signature) {
    if (d.signature.png) {
      try {
        const img = await s.doc.embedPng(dataUrlToBytes(d.signature.png));
        const w = 160, h = Math.min(58, (img.height / img.width) * w);
        s.room(h + 8);
        s.page.drawImage(img, { x: L, y: s.y - h, width: w, height: h });
        s.y -= h + 2;
      } catch { /* keep the typed name even if the drawing will not embed */ }
    }
    s.page.drawLine({ start: { x: L, y: s.y }, end: { x: L + 200, y: s.y }, thickness: 0.8, color: HAIR });
    s.gap(16);
    s.text(`Accepted: ${d.signature.name}`, { size: 12 });
    s.text(`Date: ${d.signature.at}`, { size: 12, after: 16 });

    // The audit block gets its own sheet, titled, the way a signing service
    // appends a certificate of completion. It was overflowing the acceptance
    // page and landing on a bare sheet, which read as a fault rather than a
    // deliberate appendix.
    s.newPage();
    s.text("Certificate of electronic signature", { size: 13, bold: true, after: 4 });
    s.text(`This certificate forms part of the Letter of Appointment issued to ${d.name} and dated ${d.issuedOn}.`,
      { size: 10, lead: 14, after: 14 });

    const rows: [string, string][] = [
      ["Signed by", d.signature.name],
      ["One-time code emailed to", d.signature.email || "—"],
      ["Mobile on record, confirmed by signatory", d.signature.phone || "not held"],
      ["Timestamp", d.signature.at],
      ["IP address", d.signature.ip || "—"],
      ["Device", (d.signature.agent || "—").slice(0, 70)],
      ["Document reference", d.signature.reference || "—"],
    ];
    const bh = rows.length * 13 + 30;
    const top = s.y;
    s.page.drawRectangle({ x: L, y: top - bh, width: WIDTH, height: bh, borderColor: HAIR, borderWidth: 0.7 });
    s.page.drawText("Record of electronic signature", { x: L + 12, y: top - 17, size: 9, font: s.bold, color: INK });
    let y = top - 33;
    for (const [k, v] of rows) {
      s.page.drawText(k, { x: L + 12, y, size: 7.6, font: s.reg, color: MUTE });
      s.page.drawText(v, { x: L + 210, y, size: 7.6, font: s.reg, color: INK });
      y -= 13;
    }
    s.y = top - bh - 16;

    // ── document history ────────────────────────────────────────────────
    const hist = d.signature.history || [];
    if (hist.length) {
      s.text("Document history", { size: 10.5, bold: true, after: 4 });
      for (const h of hist) {
        s.room(26);
        const yTop = s.y;
        s.page.drawText(h.at, { x: L, y: yTop - 8, size: 7.6, font: s.reg, color: MUTE });
        const lines = wrap(runs(h.what), 8, WIDTH - 130, s.reg, s.bold);
        let yy = yTop - 8;
        for (const ln of lines) {
          let cx = L + 130;
          for (const r of ln) {
            const f = r.bold ? s.bold : s.reg;
            s.page.drawText(r.text, { x: cx, y: yy, size: 8, font: f, color: INK });
            cx += f.widthOfTextAtSize(r.text, 8);
          }
          yy -= 11;
        }
        if (h.ip) { s.page.drawText(`IP: ${h.ip}`, { x: L + 130, y: yy, size: 7.2, font: s.reg, color: MUTE }); yy -= 11; }
        s.y = yy - 4;
        s.page.drawLine({ start: { x: L, y: s.y + 4 }, end: { x: R, y: s.y + 4 }, thickness: 0.4, color: HAIR });
      }
      s.gap(8);
    }

    if (d.signature.sha256) {
      s.text(`Fingerprint of the letter sent for signature (SHA-256): ${d.signature.sha256}`,
        { size: 7, lead: 9, color: MUTE, after: 4 });
    }
    s.text("Signed electronically under the Information Technology Act, 2000. The signatory was identified by a one-time code sent to the email address on record and by the last four digits of the mobile number held by the school. This certificate and the history above were captured automatically at the moment of signing.",
      { size: 7.5, lead: 10, color: MUTE });
  } else {
    s.text("Accepted:", { after: 2 });
    s.text("Date:", { after: 20 });
    if (d.signUrl) {
      s.rule(12);
      s.text("You can sign this letter online instead — it takes less than a minute on your phone. Open the link we emailed you, read the letter, enter the code we email you, and sign.",
        { size: 10, lead: 14 });
      s.text(d.signUrl, { size: 9.5, lead: 13, color: MUTE });
    }
  }

  // Page numbers last, once the count is known.
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
