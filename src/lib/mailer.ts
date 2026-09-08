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
  attachments?: { filename: string; content: string }[] };
// Shaped like a fetch Response as well, so the older call sites that read
// `r.ok`, `r.status` and `await r.text()` keep working unchanged.
export type SendResult = { ok: boolean; id?: string; error?: string; status: number; text: () => Promise<string> };
const good = (id?: string): SendResult => ({ ok: true, id, status: 200, text: async () => "" });
const bad = (error: string, status = 500): SendResult => ({ ok: false, error, status, text: async () => error });

export const FROM = process.env.SMTP_FROM || process.env.RESEND_FROM || `${SCHOOL_NAME} <admin@eurokidsjmdenclave.org>`;
export const provider = () => {
  const p = (process.env.MAIL_PROVIDER || "").toLowerCase();
  if (p === "smtp" || p === "resend") return p;
  return process.env.SMTP_HOST ? "smtp" : "resend";
};
// Free SMTP accounts have daily caps too; this is what the UI warns against.
export const dailyCap = () => Number(process.env.MAIL_DAILY_CAP || (provider() === "smtp" ? 300 : 100));

let tx: Transporter | null = null;
function transport() {
  if (tx) return tx;
  const port = Number(process.env.SMTP_PORT || 587);
  tx = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    pool: true, maxConnections: 3, maxMessages: 200, rateDelta: 1000, rateLimit: 8,
  });
  return tx;
}

export async function sendMail(m: Mail): Promise<SendResult> {
  if (provider() === "smtp") {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return bad("SMTP is not configured.", 400);
    try {
      const info = await transport().sendMail({
        from: FROM, to: m.to, cc: m.cc, subject: m.subject, html: m.html, text: m.text,
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
      body: JSON.stringify({ from: FROM, to: m.to, cc: m.cc, subject: m.subject, html: m.html, text: m.text, attachments: m.attachments }),
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
  if (provider() === "resend" && !msgs.some((m) => m.attachments?.length)) {
    const key = process.env.RESEND_API_KEY!;
    for (let i = 0; i < msgs.length; i += 100) {
      const chunk = msgs.slice(i, i + 100);
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`,
            ...(opts.idempotencyKey ? { "Idempotency-Key": `${opts.idempotencyKey}-${i / 100}` } : {}) },
          body: JSON.stringify(chunk.map((m) => ({ from: FROM, to: m.to, cc: m.cc, subject: m.subject, html: m.html, text: m.text }))),
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
