// Razorpay telling us a parent paid.
//
// Three things this has to get right, because none of them are visible when
// they go wrong: the signature must be checked against the raw bytes; a
// repeated delivery must not pay the invoice twice (Razorpay retries, and it
// retries on our own 500s); and an event about something we do not recognise
// must be answered 200, or Razorpay keeps resending it for days.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhook } from "@/lib/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }, db: { schema: "eurokids" },
  });

export async function POST(req: NextRequest) {
  // Raw, not req.json(): the signature is over these exact bytes.
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") || "";
  if (!verifyWebhook(raw, sig)) {
    // Said out loud, because the likeliest cause is a missing or mistyped
    // RAZORPAY_WEBHOOK_SECRET — and the symptom of that is silence: parents
    // pay, Razorpay gives up after its retries, and the money never reaches
    // our books with nothing anywhere saying why.
    console.error("[razorpay] webhook signature did not verify.",
      process.env.RAZORPAY_WEBHOOK_SECRET ? "Check the secret matches the one in the Razorpay dashboard."
                                          : "RAZORPAY_WEBHOOK_SECRET is not set on this deployment.");
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true, ignored: "unparseable" }); }

  const event = String(body.event || "");
  if (event !== "payment_link.paid") return NextResponse.json({ ok: true, ignored: event });

  const payload = body.payload as Record<string, { entity?: Record<string, unknown> }> | undefined;
  const link = payload?.payment_link?.entity || {};
  const payment = payload?.payment?.entity || {};
  const linkId = String(link.id || "");
  const paymentId = String(payment.id || "");
  const paise = Number(payment.amount ?? link.amount_paid ?? 0);
  if (!linkId || !paymentId || !(paise > 0)) return NextResponse.json({ ok: true, ignored: "incomplete" });

  const a = admin();
  const { data: inv } = await a.from("daycare_invoice")
    .select("id, party_id, number, status, total").eq("razorpay_link_id", linkId).maybeSingle();
  // A link we did not raise, or an invoice since deleted. Answering 200 stops
  // Razorpay retrying something we will never be able to match.
  if (!inv) return NextResponse.json({ ok: true, ignored: "unknown link" });

  // The real guard against a double payment is the unique index on
  // razorpay_payment_id, not this read — two deliveries can both get past a
  // check and only one can get past the constraint.
  const { error } = await a.from("daycare_payment").insert({
    invoice_id: inv.id,
    amount: paise / 100,
    mode: "razorpay",
    reference: linkId,
    razorpay_payment_id: paymentId,
    note: "Paid online",
    recorded_by: "razorpay",
  });
  if (error) {
    // 23505 is that unique index doing its job on a retry: already recorded.
    if (error.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    // Anything else is ours to fix, and Razorpay should try again.
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await a.from("daycare_invoice")
    .update({ razorpay_payment_id: paymentId, updated_at: new Date().toISOString() })
    .eq("id", inv.id);

  return NextResponse.json({ ok: true, invoice: inv.number });
}
