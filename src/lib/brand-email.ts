// Shared branding for every email the school sends.
// One place for the header, the signature banner and the contact line, so a
// welcome letter, a fee reminder and a Janmashtami note all look like they
// came from the same school.

export const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://admin.eurokidsjmdenclave.org";
export const SIGNATURE_IMG = `${SITE}/brand/email-signature.png`;
export const SCHOOL_NAME = "EuroKids JMD Enclave";
export const SCHOOL_PHONE = "022 696 22 686";
export const SCHOOL_PHONE_TEL = "+912269622686";
export const SCHOOL_EMAIL = "admin@eurokidsjmdenclave.org";
export const INSTAGRAM = "https://www.instagram.com/eurokidsjmdenclave/";

// Rupee as an HTML entity, never a raw glyph. A literal ₹ turns into "â‚¹"
// the moment a mail client guesses the wrong character set.
export const RUPEE = "&#8377;";

export const money = (n: number | string | null | undefined) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const moneyH = (n: number | string | null | undefined) =>
  RUPEE + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const day = (d: string | null | undefined) =>
  d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-IN",
    { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }) : "";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── themes ──────────────────────────────────────────────────────────────────
// The default is the school's blue. The rest are for occasions — pick one in
// the compose screen and the header changes without anyone touching code.
export type ThemeKey =
  | "school" | "celebration" | "festive" | "warm" | "notice" | "calm";

type Theme = { label: string; bg: string; fg: string; sub: string; accent: string };

export const THEMES: Record<ThemeKey, Theme> = {
  school:      { label: "School blue (default)", bg: "#21409A", fg: "#FFFFFF", sub: "rgba(255,255,255,.85)", accent: "#21409A" },
  celebration: { label: "Celebration red",       bg: "#FF2217", fg: "#FFFFFF", sub: "rgba(255,255,255,.9)",  accent: "#C41A11" },
  festive:     { label: "Festive saffron",       bg: "#C2410C", fg: "#FFFFFF", sub: "rgba(255,255,255,.9)",  accent: "#9A3412" },
  warm:        { label: "Warm rose",             bg: "#BE185D", fg: "#FFFFFF", sub: "rgba(255,255,255,.9)",  accent: "#9D174D" },
  notice:      { label: "Payment notice amber",  bg: "#B45309", fg: "#FFFFFF", sub: "rgba(255,255,255,.9)",  accent: "#92400E" },
  calm:        { label: "Calm green",            bg: "#15803D", fg: "#FFFFFF", sub: "rgba(255,255,255,.9)",  accent: "#166534" },
};

export const themeList = () =>
  (Object.keys(THEMES) as ThemeKey[]).map((k) => ({ key: k, label: THEMES[k].label, bg: THEMES[k].bg }));

// ── the wrapper ─────────────────────────────────────────────────────────────
export function renderEmail(opts: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  theme?: ThemeKey;
  footerNote?: string;
}) {
  const t = THEMES[opts.theme || "school"] || THEMES.school;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F5F7">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A202C;max-width:720px;width:100%;margin:0 auto;line-height:1.6;padding:20px">
    <div style="background:${t.bg};padding:24px 30px;border-radius:12px 12px 0 0">
      <div style="color:${t.fg};font-size:22px;font-weight:800;letter-spacing:-.3px">${esc(opts.title)}</div>
      ${opts.subtitle ? `<div style="color:${t.sub};font-size:13px;margin-top:3px">${esc(opts.subtitle)}</div>` : ""}
    </div>
    <div style="background:#FFFFFF;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;padding:26px 30px">
      ${opts.bodyHtml}
      <p style="margin-top:24px;margin-bottom:4px">Warm regards,<br><strong>Team ${SCHOOL_NAME}</strong></p>
    </div>

    <a href="${SITE}" style="text-decoration:none;display:block;margin-top:18px">
      <img src="${SIGNATURE_IMG}" alt="${SCHOOL_NAME} — Est. 2017 — Trusted by 3000+ parents"
           width="720" style="display:block;width:100%;max-width:720px;height:auto;border:0;border-radius:12px" />
    </a>

    <table role="presentation" style="width:100%;max-width:720px;border-collapse:collapse;margin-top:14px;font-size:14px">
      <tr><td style="padding:4px 0;color:#4B5563">
        Call us: <a href="tel:${SCHOOL_PHONE_TEL}" style="color:${t.accent};font-weight:700;text-decoration:none">${SCHOOL_PHONE}</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:${SCHOOL_EMAIL}" style="color:${t.accent};text-decoration:none">${SCHOOL_EMAIL}</a>
        &nbsp;&middot;&nbsp;
        <a href="${INSTAGRAM}" style="color:${t.accent};text-decoration:none">@eurokidsjmdenclave</a>
      </td></tr>
    </table>

    <p style="max-width:720px;color:#9CA3AF;font-size:11px;margin-top:12px;line-height:1.5">
      ${esc(opts.footerNote || `Sent by ${SCHOOL_NAME}. Please retain this email for your records.`)}
    </p>
  </div>
</body></html>`;
}

export function plainFooter() {
  return ["", "--", `Team ${SCHOOL_NAME}`, `Call us:   ${SCHOOL_PHONE}`,
    `Email:     ${SCHOOL_EMAIL}`, `Instagram: ${INSTAGRAM}`].join("\n");
}

// Turn the plain text someone typed in the compose box into safe paragraphs.
export function textToHtml(text: string) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}
