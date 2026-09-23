// Render a cash acknowledgement to a PDF, so the page can be read before
// anyone is asked to sign one.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs \
//        scripts/preview-custody.mjs handover out.pdf

import fs from "node:fs";
import path from "node:path";
import { renderCustodyPdf } from "../src/lib/custody-pdf.ts";

const kind = process.argv[2] || "handover";
const out = process.argv[3] || "custody.pdf";

// A scribble, so the signature block lays out as it will in real life.
function scribble() {
  const W = 420, H = 150;
  const px = Buffer.alloc(W * H * 4, 0);
  const set = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    px[i] = 21; px[i + 1] = 24; px[i + 2] = 28; px[i + 3] = 255;
  };
  for (let t = 0; t < 1200; t++) {
    const x = 20 + t * 0.3;
    const y = 80 + Math.sin(t / 28) * 34 + Math.sin(t / 7) * 6;
    for (let d = -1; d <= 1; d++) { set(x, y + d); set(x + d, y); }
  }
  return "data:image/png;base64," + png(W, H, px).toString("base64");
}

// Minimal PNG writer, so the preview needs no image dependency.
function png(w, h, rgba) {
  const zlib = require("node:zlib");
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
let TBL;
function crc32(buf) {
  if (!TBL) {
    TBL = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TBL[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = TBL[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const pdf = await renderCustodyPdf({
  reference: "EK-CASH-00042",
  kind,
  amount: 32500, mode: "Cash", purpose: "tuition",
  payer: "Aarav Deshmukh", receiptId: 118,
  receivedOn: "19/09/2026",
  fromPerson: "Diya", toPerson: "Neeta",
  at: "23 September 2026, 04:12 pm IST",
  note: "Collected at the desk this morning; parent paid in 500s.",
  signedName: "Neeta Saxena",
  signaturePng: scribble(),
  loggedBy: "Diya Sharma",
  ip: "49.36.180.22",
  agent: "Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15",
  history: [
    { at: "19/09/2026 · 10:04 IST", what: "Taken from Aarav Deshmukh by Diya" },
    { at: "23/09/2026 · 16:12 IST", what: "Diya handed it to Neeta" },
  ],
});
fs.writeFileSync(path.resolve(out), pdf);
console.log("wrote", out);
