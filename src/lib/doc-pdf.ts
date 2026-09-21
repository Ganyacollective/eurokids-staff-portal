// A parent declaration, on the same letterhead and in the same hand as the
// appointment letter — because a parent being asked to accept a risk about
// their four-year-old should be looking at a document that obviously comes
// from the school, not at a form.
//
// Shares the page engine in letter-pdf.ts: A4, 14pt, 56.7pt margins, the JMD
// Enclave artwork behind every page.

import { Sheet, schoolSignature, type LetterData } from "./letter-pdf";
import { rgb, type RGB } from "pdf-lib";

const INK: RGB = rgb(0, 0, 0);
const MUTE: RGB = rgb(0.32, 0.32, 0.32);
const HAIR: RGB = rgb(0.72, 0.72, 0.72);
const L = 56.7, R = 595.28 - 56.7, WIDTH = R - L, BOTTOM = 88;

export type DocSignature = NonNullable<LetterData["signature"]> & {
  witnessedBy?: string | null;
  channel?: "link" | "in_person";
};

export type DocData = {
  title: string;
  issuedOn: string;
  intro: string;
  clauses: { heading: string; body: string }[];
  declaration: string;
  // who
  partyName: string;             // the parent, or the member of staff
  partyRole?: string;            // "Parent / Guardian"
  childName?: string | null;
  childUin?: string | null;
  contact?: { email?: string | null; phone?: string | null };
  // the school's side
  signedByName: string;
  signedByRole: string;
  schoolSignaturePng?: string | null;
  // the parent's side
  signature?: DocSignature | null;
  signUrl?: string | null;
};

export async function renderDocumentPdf(d: DocData): Promise<Uint8Array> {
  const s = await new Sheet().init();

  // ── the head ──────────────────────────────────────────────────────────
  // Deliberately plain. The employment agreement opens PRIVATE AND
  // CONFIDENTIAL because it carries a salary; a parent being asked for
  // consent about their own child does not need to be greeted that way.
  // The legal entity appears once, small, because the consent has to run to
  // the right company — that is the part which actually has to be sound.
  s.text(d.title, { bold: true, size: 15, after: 2 });
  s.text("EuroKids JMD Enclave, operated by Veena Educational Services · Bungalow 1, JMD Enclave, Mohammadwadi, Pune 411060",
    { size: 9.5, color: MUTE, lead: 12, after: 12 });
  s.text(`Date: ${d.issuedOn}`, { after: 12 });

  if (d.intro) s.text(d.intro, { after: 4 });

  // ── the clauses ───────────────────────────────────────────────────────
  for (const c of d.clauses || []) {
    if (!c.heading?.trim() && !c.body?.trim()) continue;
    s.room(20 * 3.4);
    s.gap(6);
    if (c.heading) s.text(c.heading, { bold: true, after: 2 });
    if (c.body) s.text(c.body);
  }

  // ── the declaration and the signature ─────────────────────────────────
  // Kept whole: the sentence someone is accepting and the line they sign it
  // on must never be separated by a page break.
  s.room(d.signature ? 300 : 230);
  s.gap(12);
  s.rule(14);
  s.text("Declaration", { bold: true, after: 4 });
  s.text(d.declaration, { after: 20 });

  if (d.signature) {
    if (d.signature.png) {
      try {
        const img = await s.doc.embedPng(dataUrlToBytes(d.signature.png));
        const w = 165, h = Math.min(58, (img.height / img.width) * w);
        s.room(h + 8);
        s.page.drawImage(img, { x: L, y: s.y - h, width: w, height: h });
        s.y -= h + 2;
      } catch { /* the typed name still stands if the drawing will not embed */ }
    }
    s.page.drawLine({ start: { x: L, y: s.y }, end: { x: L + 210, y: s.y }, thickness: 0.8, color: HAIR });
    s.gap(16);
    s.text(`Signed: ${d.signature.name}`, { size: 12 });
    s.text(`Date: ${d.signature.at}`, { size: 12 });
    if (d.signature.channel === "in_person" && d.signature.witnessedBy) {
      s.text(`Signed in person at the school office, witnessed by ${d.signature.witnessedBy}.`,
        { size: 10, color: MUTE, lead: 14 });
    }
    s.gap(8);
  } else {
    s.text("Signature:", { after: 26 });
    s.text("Name:", { after: 14 });
    s.text("Date:", { after: 18 });
    if (d.signUrl) {
      s.rule(12);
      s.text("You can sign this online instead — it takes a minute on your phone. Open the link we emailed you, read it, enter the code we email you, and sign.",
        { size: 10, lead: 14 });
      s.text(d.signUrl, { size: 9.5, lead: 13, color: MUTE });
    }
  }

  // ── for the school ────────────────────────────────────────────────────
  s.gap(10);
  s.text("For EuroKids JMD Enclave", { size: 11 });
  const schoolSig = d.schoolSignaturePng ?? schoolSignature();
  if (schoolSig) {
    try {
      const img = await s.doc.embedPng(dataUrlToBytes(schoolSig));
      const w = 130, h = (img.height / img.width) * w;
      s.room(h + 6);
      s.page.drawImage(img, { x: L, y: s.y - h, width: w, height: h });
      s.y -= h + 2;
    } catch { /* ignore */ }
  } else s.gap(26);
  s.text(d.signedByName, { size: 11, bold: true });
  s.text(d.signedByRole, { size: 10, color: MUTE });

  // ── the certificate ───────────────────────────────────────────────────
  if (d.signature) {
    s.newPage();
    s.text("Certificate of electronic signature", { size: 13, bold: true, after: 4 });
    s.text(`This certificate forms part of "${d.title}" concerning ${d.childName || d.partyName}, dated ${d.issuedOn}.`,
      { size: 10, lead: 14, after: 14 });

    const rows: [string, string][] = [
      ["Signed by", d.signature.name],
      ["Signing method", d.signature.channel === "in_person"
        ? `In person at the school office${d.signature.witnessedBy ? `, witnessed by ${d.signature.witnessedBy}` : ""}`
        : "Private link, with a one-time code by email"],
      ...(d.signature.channel === "in_person" ? [] as [string, string][]
        : [["One-time code emailed to", d.signature.email || "—"] as [string, string]]),
      ["Mobile on record", d.signature.phone || "not held"],
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

    const hist = d.signature.history || [];
    if (hist.length) {
      s.text("Document history", { size: 10.5, bold: true, after: 4 });
      for (const h of hist) {
        s.room(26);
        const yTop = s.y;
        s.page.drawText(h.at, { x: L, y: yTop - 8, size: 7.6, font: s.reg, color: MUTE });
        s.page.drawText(h.what.replace(/\*\*/g, ""), { x: L + 130, y: yTop - 8, size: 8, font: s.reg, color: INK });
        let yy = yTop - 19;
        if (h.ip) { s.page.drawText(`IP: ${h.ip}`, { x: L + 130, y: yy, size: 7.2, font: s.reg, color: MUTE }); yy -= 11; }
        s.y = yy - 4;
        s.page.drawLine({ start: { x: L, y: s.y + 4 }, end: { x: R, y: s.y + 4 }, thickness: 0.4, color: HAIR });
      }
      s.gap(8);
    }
    if (d.signature.sha256) {
      s.text(`Fingerprint of the document presented for signature (SHA-256): ${d.signature.sha256}`,
        { size: 7, lead: 9, color: MUTE, after: 4 });
    }
    s.text("Signed electronically under the Information Technology Act, 2000. This certificate and the history above were captured automatically at the moment of signing.",
      { size: 7.5, lead: 10, color: MUTE });
  }

  const pages = s.doc.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => p.drawText(`Page ${i + 1} of ${pages.length}`,
      { x: R - 64, y: BOTTOM - 14, size: 8, font: s.reg, color: MUTE }));
  }
  return await s.doc.save();
}

// {{child_name}} and the template's own fields, filled from one map.
export function fillDoc(t: string, vars: Record<string, string>) {
  return String(t || "").replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? `__${k}__`);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
