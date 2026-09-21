// A very small PNG reader/writer: enough for one signature, so the project
// gains no image dependency for a job it does once.
import zlib from "node:zlib";

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c; }
  return t;
})();
const crc = (buf) => { let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0; };

function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const t = Buffer.from(type, "ascii");
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, body])));
  return Buffer.concat([len, t, body, c]);
}

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export const PNG = {
  decode(buf) {
    if (!buf.subarray(0, 8).equals(sig)) throw new Error("Not a PNG");
    let i = 8, w = 0, h = 0, bitDepth = 8, colour = 6;
    const idat = [];
    while (i < buf.length) {
      const len = buf.readUInt32BE(i); const type = buf.toString("ascii", i + 4, i + 8);
      const body = buf.subarray(i + 8, i + 8 + len);
      if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4);
        bitDepth = body[8]; colour = body[9];
        if (bitDepth !== 8) throw new Error("Only 8-bit PNGs, please");
        if (colour !== 6 && colour !== 2 && colour !== 0)
          throw new Error("Save the image as RGB or RGBA PNG first");
      } else if (type === "IDAT") idat.push(body);
      else if (type === "IEND") break;
      i += 12 + len;
    }
    const ch = colour === 6 ? 4 : colour === 2 ? 3 : 1;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = w * ch;
    const out = Buffer.alloc(w * h * 4, 255);
    const line = Buffer.alloc(stride), prev = Buffer.alloc(stride);
    let p = 0;
    for (let y = 0; y < h; y++) {
      const f = raw[p++]; raw.copy(line, 0, p, p + stride); p += stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
        line[x] = (line[x] + (f === 1 ? a : f === 2 ? b : f === 3 ? ((a + b) >> 1) : f === 4 ? paeth(a, b, c) : 0)) & 255;
      }
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4, s = x * ch;
        if (ch === 1) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = 255; }
        else { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = ch === 4 ? line[s + 3] : 255; }
      }
      line.copy(prev);
    }
    return { width: w, height: h, data: out };
  },
  encode({ width, height, data }) {
    const raw = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) {
      raw[y * (width * 4 + 1)] = 0;
      data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([sig, chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
  },
};
