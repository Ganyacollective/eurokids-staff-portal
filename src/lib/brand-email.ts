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
<body style="margin:0;padding:0;background:#F4F5F7;-webkit-text-size-adjust:100%">
  <!-- A table wrapper: phone mail clients honour table widths where they ignore div max-widths, and the banner used to spill past the card. -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F4F5F7"><tr><td align="center" style="padding:16px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:720px;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A202C;line-height:1.6">
  <tr><td style="background:${t.bg};padding:22px 24px;border-radius:12px 12px 0 0">
      <div style="color:${t.fg};font-size:22px;font-weight:800;letter-spacing:-.3px">${esc(opts.title)}</div>
      ${opts.subtitle ? `<div style="color:${t.sub};font-size:13px;margin-top:3px">${esc(opts.subtitle)}</div>` : ""}
  </td></tr>
  <tr><td style="background:#FFFFFF;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;padding:22px 24px;font-size:15px">
      ${opts.bodyHtml}
      <p style="margin-top:24px;margin-bottom:4px">Warm regards,<br><strong>Team ${SCHOOL_NAME}</strong></p>
  </td></tr>
  <tr><td style="padding-top:16px">
    <a href="${SITE}" style="text-decoration:none;display:block">
      <img src="${SIGNATURE_IMG}" alt="${SCHOOL_NAME} — Est. 2017 — Trusted by 3000+ parents"
           width="100%" style="display:block;width:100%;max-width:720px;height:auto;border:0;border-radius:12px" />
    </a>
  </td></tr>
  <tr><td style="padding:14px 0 0;font-size:14px;color:#4B5563;line-height:1.7">
        Call us: <a href="tel:${SCHOOL_PHONE_TEL}" style="color:${t.accent};font-weight:700;text-decoration:none;white-space:nowrap">${SCHOOL_PHONE}</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:${SCHOOL_EMAIL}" style="color:${t.accent};text-decoration:none">${SCHOOL_EMAIL}</a>
        &nbsp;&middot;&nbsp;
        <a href="${INSTAGRAM}" style="color:${t.accent};text-decoration:none">@eurokidsjmdenclave</a>
  </td></tr>
  <tr><td style="padding:12px 0 0;color:#9CA3AF;font-size:11px;line-height:1.5">
      ${esc(opts.footerNote || `Sent by ${SCHOOL_NAME}. Please retain this email for your records.`)}
  </td></tr>
  </table>
  </td></tr></table>
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

// ── the account statement, shared by every letter that shows one ──────────
// What a parent sees: the annual fee, any concession, every payment, the
// balance, and what is overdue or coming up. Nothing about EuroKids' invoice
// versus our figure, nothing "agreed" — those are our books, not theirs. A
// concession is a concession; it must never read as a negotiable price.
export type LedgerLine = {
  on_date: string | null; description: string | null; mode: string | null;
  amount: number | string | null; counts_to_fees: boolean | null;
  still_held: number | string | null; source: string | null;
};
export type StatementChild = {
  student_name: string; program_name?: string | null;
  total_fee?: number | string | null; epms_invoiced?: number | string | null;
  our_discount?: number | string | null; agreed_fee?: number | string | null;
  collected?: number | string | null; uncredited_cash?: number | string | null;
  paid_so_far?: number | string | null;
  true_due?: number | string | null; overpaid?: number | string | null;
  next_due_date?: string | null; next_amount?: number | string | null;
  overdue_amount?: number | string | null; overdue_by?: string | null;
  upcoming_amount?: number | string | null; upcoming_date?: string | null;
  // Why the fee is what it is. Two different things, never to be confused:
  //  · epms_discount_kind — corporate / sibling / defence / staff. EuroKids
  //    applies it before invoicing, so it is ALREADY inside the annual fee.
  //    It is named, never subtracted a second time.
  //  · discount_reason — the concession we fund ourselves, off our own
  //    margin, which is the only thing that reduces the fee here.
  epms_discount_kind?: string | null; discount_reason?: string | null;
  // The published fee for this programme and joining month, and what the
  // EuroKids scheme took off it. Zero when there is no scheme, or when the
  // grid and the invoice do not reconcile — in which case no breakdown is
  // shown rather than a guessed one.
  list_fee?: number | string | null; scheme_discount?: number | string | null;
};

// The concessions we grant ourselves. Kept in one place so the child sheet,
// the statement and the email all use the same words.
export const CONCESSION_REASONS = [
  "Paid in full", "Early payment", "Second child at the school",
  "Annual function fee waived", "Uniform not taken", "Settlers opted out",
  "Joined mid-term", "Long-standing family", "Financial hardship", "Other",
];
// EuroKids' own discount schemes. These arrive on the EPMS invoice and are
// already reflected in the fee it bills, so they explain the number rather
// than reduce it.
export const EPMS_DISCOUNTS = ["Corporate Discount", "Sibling", "Defence Discount", "Staff"];
// "Corporate Discount" → "corporate discount"; "Sibling" → "sibling discount".
export const epmsDiscountLabel = (k?: string | null) => {
  const s = String(k || "").trim();
  if (!s || /^no discount$/i.test(s)) return null;
  return /discount$/i.test(s) ? s.toLowerCase() : `${s.toLowerCase()} discount`;
};

const GREEN = "#146C3A", RED = "#A3231A", INK = "#1A202C", MUTE = "#4B5563";

// The one-line position under the balance: what is late, what is next.
function positionLines(c: StatementChild) {
  const owed = Number(c.true_due || 0);
  if (owed <= 1) return [];
  const late = Number(c.overdue_amount || 0);
  const out: string[] = [];
  if (late > 1) out.push(`<span style="color:${RED};font-weight:700">${moneyH(late)} is overdue</span>${c.overdue_by ? ` — it was due by ${day(c.overdue_by)}` : ""}.`);
  if (c.upcoming_date) out.push(`${late > 1 ? "A further" : "The next instalment of"} <strong>${moneyH(c.upcoming_amount || 0)}</strong> is due on <strong>${day(c.upcoming_date)}</strong>.`);
  else if (late <= 1 && c.next_due_date) out.push(`The next instalment${c.next_amount ? " of <strong>" + moneyH(c.next_amount) + "</strong>" : ""} is due on <strong>${day(c.next_due_date)}</strong>.`);
  return out;
}

export function statementHtml(c: StatementChild, ledger: LedgerLine[] = []) {
  const fee = Number(c.total_fee || c.epms_invoiced || 0);
  const disc = Number(c.our_discount || 0);
  const owed = Number(c.true_due || 0);
  const over = Number(c.overpaid || 0);
  const settled = owed <= 1;
  const pays = ledger.filter((l) => l.counts_to_fees)
    .sort((a, b) => String(a.on_date || "").localeCompare(String(b.on_date || "")));
  // What they have paid that no line below accounts for. Taken from what we
  // believe they have paid in total, not from EuroKids' own collections — a
  // cheque we took and later posted on would otherwise appear twice.
  const shown = pays.reduce((s, l) => s + Number(l.amount || 0), 0);
  const undated = Math.max(0, Number(c.paid_so_far ?? c.collected ?? 0) - shown);
  // Two fixed columns: the amount never wraps, so "− ₹39,300" cannot split
  // across lines on a phone the way it did.
  const row = (k: string, v: string, cls = "") =>
    `<tr><td style="padding:9px 0;color:${MUTE};border-bottom:1px solid #EEF0F2;vertical-align:top">${k}</td>
         <td style="padding:9px 0 9px 12px;text-align:right;border-bottom:1px solid #EEF0F2;white-space:nowrap;vertical-align:top;${cls}">${v}</td></tr>`;
  const green = `color:${GREEN}`;
  // A EuroKids scheme discount is already inside the invoiced fee, so it is
  // named under the annual fee, not deducted again. Only a concession we fund
  // ourselves comes off, and it says what it was given for.
  const sub = (t: string) => `<div style="font-size:12px;color:#9CA3AF;margin-top:2px">${esc(t)}</div>`;
  const scheme = epmsDiscountLabel(c.epms_discount_kind);
  const why = String(c.discount_reason || "").trim();
  // EuroKids applies its scheme before the invoice is raised, so a statement
  // built on the invoice alone silently drops the largest thing the family was
  // given. Both reductions are shown, off the published fee, in the order they
  // happened — the parent should be able to see the whole of their benefit.
  const listFee = Number(c.list_fee || 0), schemeOff = Number(c.scheme_discount || 0);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const lines = [
    schemeOff > 0
      ? row(`Annual fee${sub(`${c.program_name || "the year"} · full fee`)}`, moneyH(listFee))
        + row(cap(scheme || "EuroKids discount"), "− " + moneyH(schemeOff), green)
      : row(`Annual fee${scheme ? sub(`after your ${scheme}`) : ""}`, moneyH(fee)),
    disc > 0 ? row(`Concession from the school${why ? sub(why) : ""}`, "− " + moneyH(disc), green) : "",
    undated > 0 ? row("Paid so far", "− " + moneyH(undated), green) : "",
    ...pays.map((l) => row(
      `Paid${l.on_date ? ` <span style="color:#9CA3AF;font-size:12px">${day(l.on_date)}${l.mode && l.source !== "epms" ? " · " + esc(l.mode) : ""}</span>` : ""}`,
      "− " + moneyH(l.amount), green)),
  ].join("");
  const totalRow = settled
    ? `<tr><td style="padding:12px 0;font-weight:700;border-top:2px solid ${GREEN};color:${GREEN}">${over > 1 ? "Paid in full — credit of " + moneyH(over) : "Fully paid"}</td>
          <td style="padding:12px 0 12px 12px;text-align:right;font-weight:700;font-size:16px;border-top:2px solid ${GREEN};color:${GREEN};white-space:nowrap">${moneyH(0)}</td></tr>`
    : `<tr><td style="padding:12px 0;font-weight:700;border-top:2px solid ${INK}">Balance due</td>
          <td style="padding:12px 0 12px 12px;text-align:right;font-weight:700;font-size:16px;border-top:2px solid ${INK};color:${RED};white-space:nowrap">${moneyH(owed)}</td></tr>`;
  const pos = positionLines(c);
  const next = pos.length
    ? `<tr><td colspan="2" style="padding-top:10px;color:${MUTE};font-size:13px;line-height:1.5">${pos.join("<br>")}</td></tr>` : "";
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;table-layout:auto">${lines}${totalRow}${next}</table>
    ${Number(c.uncredited_cash || 0) > 0 ? `<p style="font-size:13px;color:${MUTE}">Payments made at the school office can take a few days to appear on the online portal. The balance above already includes them.</p>` : ""}`;
}

export function statementText(c: StatementChild, ledger: LedgerLine[] = []) {
  const fee = Number(c.total_fee || c.epms_invoiced || 0), disc = Number(c.our_discount || 0);
  const owed = Number(c.true_due || 0), late = Number(c.overdue_amount || 0);
  const pays = ledger.filter((l) => l.counts_to_fees);
  const scheme = epmsDiscountLabel(c.epms_discount_kind);
  const why = String(c.discount_reason || "").trim();
  const listFee = Number(c.list_fee || 0), schemeOff = Number(c.scheme_discount || 0);
  return [
    ...(schemeOff > 0
      ? [`Annual fee:      ${money(listFee)}`,
         `${(scheme || "EuroKids discount").replace(/^./, (m) => m.toUpperCase())}: − ${money(schemeOff)}`]
      : [`Annual fee:      ${money(fee)}${scheme ? `  (after your ${scheme})` : ""}`]),
    ...(disc > 0 ? [`Concession:      − ${money(disc)}${why ? `  (${why})` : ""}`] : []),
    ...pays.map((l) => `Paid ${l.on_date ? day(l.on_date) : ""}: − ${money(l.amount)}`),
    owed <= 1 ? `Balance:         NIL — fully paid` : `Balance due:     ${money(owed)}`,
    ...(owed > 1 && late > 1 ? [`Overdue:         ${money(late)}${c.overdue_by ? " (was due by " + day(c.overdue_by) + ")" : ""}`] : []),
    ...(owed > 1 && c.upcoming_date ? [`Next instalment: ${money(c.upcoming_amount)} due ${day(c.upcoming_date)}`]
      : owed > 1 && late <= 1 && c.next_due_date ? [`Next instalment due ${day(c.next_due_date)}`] : []),
  ].join("\n");
}
