// Turn a photographed or screenshotted signature into something that can sit
// on a letter: white knocked out, edges trimmed, ink darkened.
//
//   node scripts/prepare-signature.mjs ~/Desktop/neeta.png
//
// Writes public/brand/signature.png, which every letter and declaration then
// picks up automatically. No dependencies beyond what the project already
// has — PNG in, PNG out, done with pdf-lib's own decoder.
import fs from "node:fs";
import path from "node:path";
import { PNG } from "./png.mjs";

const src = process.argv[2];
if (!src) { console.error("usage: node scripts/prepare-signature.mjs <image.png>"); process.exit(1); }

const img = PNG.decode(fs.readFileSync(src));
const { width: w, height: h, data } = img;

// Anything lighter than this is paper, not ink. Photographs of a signature on
// white paper are rarely pure white, so the cut is generous.
const PAPER = 205;
let x0 = w, y0 = h, x1 = 0, y1 = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum >= PAPER) { data[i + 3] = 0; continue; }
    // Ink: full black, with the alpha carrying the stroke's softness so the
    // curve keeps its shape instead of turning into a jagged silhouette.
    const a = Math.min(255, Math.round((PAPER - lum) / PAPER * 255 * 1.6));
    data[i] = data[i + 1] = data[i + 2] = 20;
    data[i + 3] = a;
    if (a > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
}
if (x1 <= x0 || y1 <= y0) { console.error("No ink found — is the image mostly white?"); process.exit(1); }

const pad = Math.round(Math.max(w, h) * 0.01);
x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
const out = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) {
  data.copy(out, y * cw * 4, ((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4);
}

const dest = path.join(process.cwd(), "public", "brand", "signature.png");
fs.writeFileSync(dest, PNG.encode({ width: cw, height: ch, data: out }));
console.log(`Wrote ${dest} — ${cw}×${ch}, background removed.`);
