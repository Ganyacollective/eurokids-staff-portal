// Razorpay payment links for day care invoices.
//
// The same shape as whatsapp.ts: without keys every call returns
// "not_configured" and the rest of the system carries on. An invoice whose
// pay link could not be created still goes out — it just carries the bank
// details instead of a Pay now button, which is what happened before any of
// this existed. Nothing here is allowed to stop a parent getting their bill.
//
// Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
// Test keys are rzp_test_*; live keys are rzp_live_*. The link's amount is in
// paise, which is the single most common way to get this wrong — a 12,000
// rupee invoice is 1200000, and a missing ×100 charges the parent ₹120.

import crypto from "node:crypto";

export type LinkResult =
  | { status: "created"; id: string; shortUrl: string }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

const KEY = () => process.env.RAZORPAY_KEY_ID || "";
const SECRET = () => process.env.RAZORPAY_KEY_SECRET || "";

export const razorpayReady = () => Boolean(KEY() && SECRET());
export const razorpayMode = (): "live" | "test" | "off" =>
  !razorpayReady() ? "off" : KEY().startsWith("rzp_live") ? "live" : "test";

const auth = () => "Basic " + Buffer.from(`${KEY()}:${SECRET()}`).toString("base64");

// Razorpay rejects a contact it cannot parse, and rejects the whole link with
// it — so a bad phone number must not cost us the link. Only send a number we
// are confident about, and let Razorpay ask for the rest.
const contact = (phone?: string | null) => {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return undefined;
  return d.length === 10 ? "+91" + d : "+" + d;
};

export async function createPaymentLink(opts: {
  amount: number;              // rupees, as shown on the invoice
  description: string;
  reference: string;           // our invoice number — Razorpay enforces it unique
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  callbackUrl?: string | null;
  expiresAt?: Date | null;
}): Promise<LinkResult> {
  if (!razorpayReady()) return { status: "not_configured" };
  const paise = Math.round(Number(opts.amount) * 100);
  if (!(paise > 0)) return { status: "failed", error: "The invoice has no amount to collect." };

  try {
    const r = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth() },
      body: JSON.stringify({
        amount: paise,
        currency: "INR",
        accept_partial: false,
        description: opts.description.slice(0, 2048),
        reference_id: opts.reference,
        customer: {
          name: opts.name || undefined,
          email: opts.email || undefined,
          contact: contact(opts.phone),
        },
        // We send our own email and WhatsApp, with our own wording and the PDF
        // attached. Letting Razorpay notify as well would mean the parent is
        // told twice about one bill, in two different voices.
        notify: { sms: false, email: false },
        reminder_enable: false,
        callback_url: opts.callbackUrl || undefined,
        callback_method: opts.callbackUrl ? "get" : undefined,
        ...(opts.expiresAt ? { expire_by: Math.floor(opts.expiresAt.getTime() / 1000) } : {}),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { status: "failed", error: j?.error?.description || `HTTP ${r.status}` };
    return { status: "created", id: String(j.id), shortUrl: String(j.short_url) };
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }
}

// Cancelling the link when an invoice is voided or paid by hand, so a parent
// who kept the email cannot pay a bill that no longer stands.
export async function cancelPaymentLink(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!razorpayReady() || !id) return { ok: false, error: "not_configured" };
  try {
    const r = await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(id)}/cancel`, {
      method: "POST", headers: { Authorization: auth() },
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      // Already cancelled or already paid is not a failure worth surfacing.
      const d = String(j?.error?.description || "");
      if (/cancel|paid|expired/i.test(d)) return { ok: true };
      return { ok: false, error: d || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Razorpay signs the raw request body. It must be verified against the bytes
// as they arrived — JSON.parse then re-stringify changes key order and
// whitespace, and the signature stops matching for reasons nobody can see.
export function verifyWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8"), b = Buffer.from(signature, "utf8");
  // Length-safe compare: timingSafeEqual throws on a length mismatch, and an
  // exception here would read as a server error rather than a bad signature.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
