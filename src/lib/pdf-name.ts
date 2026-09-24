// What a downloaded PDF is called.
//
// This is not cosmetic. A Content-Disposition header is a ByteString: one
// non-Latin-1 character in it and constructing the response throws, Next
// returns its error page, and the browser saves *that* — a text file with a
// .pdf name. Every document title here contains an em dash ("Parent's
// Consent — Collection from outside school"), so every signed form downloaded
// from the office was arriving broken.
//
// So: an ASCII name in `filename` that any browser can save, and the real one
// in `filename*` for those that read it.

const ASCII: Record<string, string> = {
  "—": "-", "–": "-", "‑": "-", "’": "'", "‘": "'", "“": '"', "”": '"',
  "·": "-", "…": "...", "₹": "INR ", "•": "-", " ": " ",
};

export function asciiName(s: string) {
  return String(s || "")
    .replace(/[—–‑’‘“”·…₹• ]/g, (c) => ASCII[c] ?? "-")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")   // café → cafe
    .replace(/[^\x20-\x7E]/g, "")                        // anything still exotic
    .replace(/["\\\r\n]/g, "")                           // would break the quoting
    .replace(/\s+/g, " ")
    .trim();
}

// Joins the parts that are actually there, so a document with no child's name
// does not come out called "Declaration - .pdf".
export function pdfDisposition(parts: (string | null | undefined)[], opts: { download?: boolean } = {}) {
  const full = parts.map((p) => String(p || "").trim()).filter(Boolean).join(" - ") || "document";
  const safe = asciiName(full).replace(/[/:*?<>|]/g, "-").slice(0, 120) || "document";
  const how = opts.download ? "attachment" : "inline";
  return `${how}; filename="${safe}.pdf"; filename*=UTF-8''${encodeURIComponent(full + ".pdf")}`;
}
