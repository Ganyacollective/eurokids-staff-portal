// One way out for every email the school sends, so the provider is a setting
// rather than a rewrite.
//
//   MAIL_PROVIDER = smtp      → any SMTP account (Zoho, Brevo, Gmail, SES-SMTP)
//   MAIL_PROVIDER = resend    → Resend's API (the old path; 100/day on free)
//   unset                     → SMTP if SMTP_HOST is set, else Resend
//
// SMTP needs: SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASS,
// and optionally SMTP_FROM ("EuroKids JMD Enclave <admin@…>").
// Sending 192 statements through SMTP is one connection reused for all of
// them, paced so no provider treats us as a burst.
import nodemailer, { type Transporter } from "nodemailer";
import { SCHOOL_NAME } from "@/lib/brand-email";

export type Mail = { to: string[]; cc?: string[]; subject: string; html: string; text?: string;
  attachments?: { filename: string; content: string }[];
  // Which mailbox it comes from. "school" = admin@ (parents, fees, enquiries);
  // "hr" = hr@ (leave, payroll, staff portal). Anything else is a literal
  // From header.
  from?: "school" | "hr" | string };
// Shaped like a fetch Response as well, so the older call sites that read
// `r.ok`, `r.status` and `await r.text()` keep working unchanged.
export type SendResult = { ok: boolean; id?: string; error?: string; status: number; text: () => Promise<string> };
const good = (id?: string): SendResult => ({ ok: true, id, status: 200, text: async () => "" });
const bad = (error: string, status = 500): SendResult => ({ ok: false, error, status, text: async () => error });

export const FROM = process.env.SMTP_FROM || process.env.RESEND_FROM || `${SCHOOL_NAME} <admin@eurokidsjmdenclave.org>`;
// HR writes as itself, so a teacher's leave approval never lands under the
// fees address. Google Workspace will only let SMTP send as the account it
// authenticated with *or* one of its verified "Send mail as" aliases, so
// either add hr@ as an alias on admin@ (Gmail → Settings → Accounts → Send
// mail as) or give hr@ its own app password in HR_SMTP_USER/HR_SMTP_PASS.
export const HR_FROM = process.env.HR_SMTP_FROM || `${SCHOOL_NAME} — HR <hr@eurokidsjmdenclave.org>`;
const fromFor = (f?: string) => !f || f === "school" ? FROM : f === "hr" ? HR_FROM : f;
const hrOwnAccount = () => !!(process.env.HR_SMTP_USER && process.env.HR_SMTP_PASS);
// Which provider a mailbox uses. MAIL_PROVIDER decides, and there is no quiet
// fallback: if it says smtp and SMTP is misconfigured, the send fails loudly
// rather than slipping out through Resend behind your back. Resend is only
// ever used when it is asked for by name, or when no SMTP host is set at all.
export const provider = (box: "school" | "hr" = "school") => {
  const raw = box === "hr" ? (process.env.HR_MAIL_PROVIDER || process.env.MAIL_PROVIDER) : process.env.MAIL_PROVIDER;
  const p = (raw || "").toLowerCase();
  if (p === "smtp" || p === "resend") return p;
  return (box === "hr" ? (process.env.HR_SMTP_HOST || process.env.SMTP_HOST) : process.env.SMTP_HOST) ? "smtp" : "resend";
};
// Can this mailbox actually send right now? Used by the routes instead of
// "is there a Resend key", so deleting RESEND_API_KEY breaks nothing.
export const mailReady = (box: "school" | "hr" = "school") =>
  provider(box) === "smtp"
    ? !!((box === "hr" && process.env.HR_SMTP_HOST ? process.env.HR_SMTP_HOST : process.env.SMTP_HOST) &&
         (box === "hr" && process.env.HR_SMTP_USER ? process.env.HR_SMTP_USER : process.env.SMTP_USER))
    : !!process.env.RESEND_API_KEY;

// What the office should see on screen, so "which mailbox sent that?" is
// never a guess.
export const mailStatus = () => ({
  school: { provider: provider("school"), from: FROM, host: process.env.SMTP_HOST || null, user: process.env.SMTP_USER || null },
  hr: { provider: provider("hr"), from: HR_FROM,
        host: (hrOwnAccount() ? process.env.HR_SMTP_HOST : null) || process.env.SMTP_HOST || null,
        user: hrOwnAccount() ? process.env.HR_SMTP_USER! : (process.env.SMTP_USER || null),
        own_account: hrOwnAccount() },
  resend_key_present: !!process.env.RESEND_API_KEY,
});
// Free SMTP accounts have daily caps too; this is what the UI warns against.
export const dailyCap = () => Number(process.env.MAIL_DAILY_CAP || (provider() === "smtp" ? 2000 : 100));

const tx: Record<string, Transporter> = {};
function transport(box: "school" | "hr" = "school") {
  const useHr = box === "hr" && hrOwnAccount();
  const k = useHr ? "hr" : "school";
  if (tx[k]) return tx[k];
  const port = Number((useHr ? process.env.HR_SMTP_PORT : process.env.SMTP_PORT) || process.env.SMTP_PORT || 587);
  tx[k] = nodemailer.createTransport({
    host: (useHr ? process.env.HR_SMTP_HOST : process.env.SMTP_HOST) || process.env.SMTP_HOST,
    port, secure: port === 465,
    auth: useHr ? { user: process.env.HR_SMTP_USER, pass: process.env.HR_SMTP_PASS }
                : { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    pool: true, maxConnections: 3, maxMessages: 200, rateDelta: 1000, rateLimit: 8,
  });
  return tx[k];
}

export async function sendMail(m: Mail): Promise<SendResult> {
  const box = m.from === "hr" ? "hr" : "school";
  if (provider(box) === "smtp") {
    const host = (box === "hr" && hrOwnAccount() ? process.env.HR_SMTP_HOST : null) || process.env.SMTP_HOST;
    const user = box === "hr" && hrOwnAccount() ? process.env.HR_SMTP_USER : process.env.SMTP_USER;
    if (!host || !user) return bad(`SMTP is selected for ${box === "hr" ? "hr@" : "admin@"} but SMTP_HOST/SMTP_USER are not set.`, 400);
    try {
      const info = await transport(m.from === "hr" ? "hr" : "school").sendMail({
        from: fromFor(m.from), to: m.to, cc: m.cc, subject: m.subject, html: m.html, text: m.text,
        attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "base64") })),
      });
      return good(info.messageId);
    } catch (e) { return bad((e as Error).message); }
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return bad("No mail provider is configured.", 400);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: fromFor(m.from), to: m.to, cc: m.cc, subject: m.subject, html: m.html, text: m.text, attachments: m.attachments }),
    });
    if (!r.ok) return bad(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`, r.status);
    const j = await r.json().catch(() => ({}));
    return good(j?.id);
  } catch (e) { return bad((e as Error).message); }
}

// A whole school-wide send. Resend keeps its 100-per-call batch endpoint;
// SMTP goes one at a time down a pooled connection, which for 192 families is
// under a minute and costs nothing.
export async function sendMany(msgs: (Mail & { label: string })[], opts: { idempotencyKey?: string } = {}) {
  const sent: string[] = [], failed: { name: string; error: string }[] = [];
  // The batch endpoint is Resend's; SMTP sends one at a time down a pool.
  if (provider(msgs[0]?.from === "hr" ? "hr" : "school") === "resend" && !msgs.some((m) => m.attachments?.length)) {
    const key = process.env.RESEND_API_KEY!;
    for (let i = 0; i < msgs.length; i += 100) {
      const chunk = msgs.slice(i, i + 100);
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`,
            ...(opts.idempotencyKey ? { "Idempotency-Key": `${opts.idempotencyKey}-${i / 100}` } : {}) },
          body: JSON.stringify(chunk.map((m) => ({ from: fromFor(m.from), to: m.to, cc: m.cc, subject: m.subject, html: m.html, text: m.text }))),
        });
        if (res.ok) chunk.forEach((m) => sent.push(m.label));
        else { const why = `Resend ${res.status}: ${(await res.text()).slice(0, 160)}`; chunk.forEach((m) => failed.push({ name: m.label, error: why })); }
      } catch (e) { chunk.forEach((m) => failed.push({ name: m.label, error: (e as Error).message })); }
    }
    return { sent, failed };
  }
  for (const m of msgs) {
    const r = await sendMail(m);
    if (r.ok) sent.push(m.label); else failed.push({ name: m.label, error: r.error || "failed" });
  }
  return { sent, failed };
}
