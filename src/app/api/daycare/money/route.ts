// Money arriving against a day care invoice, and the two ways an invoice
// stops being owed without money arriving: written off, or voided.
//
// None of these touch balance_due directly. The balance is derived by
// recalc_daycare_invoice from the payment rows and the written-off amount, so
// there is exactly one place that decides what is outstanding and it is the
// database. Application code that sets a balance is application code that
// eventually disagrees with the rows underneath it.

import { NextResponse } from "next/server";
import { requireBilling, admin } from "@/lib/billing-auth";
import { cancelPaymentLink } from "@/lib/razorpay";

const MODES = ["cash", "upi", "bank", "cheque", "adjustment"] as const;

export async function POST(req: Request) {
  // Everything here is about a balance, and only a day care bill has one.
  const who = await requireBilling(req, "billing");
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const b = await req.json().catch(() => ({}));
  const a = admin();
  const id = Number(b.id);
  const action = String(b.action || "pay");

  const { data: inv } = await a.from("daycare_invoice")
    .select("id, kind, number, status, total, balance_due, written_off, razorpay_link_id").eq("id", id).maybeSingle();
  if (!inv) return NextResponse.json({ ok: false, error: "No such invoice." }, { status: 404 });

  // The screen already refuses these, but the screen is not the gate: anyone
  // with a session can call this. A voided invoice is not owed and a draft has
  // not been sent to anybody, so neither can receive money.
  if (action === "pay" || action === "writeoff") {
    if (inv.status === "void") return NextResponse.json({ ok: false, error: "That invoice was voided." }, { status: 409 });
    if (inv.status === "draft") return NextResponse.json({ ok: false, error: "That invoice has not been sent yet." }, { status: 409 });
  }

  // A reimbursement certificate is an invoice and a receipt on one sheet: it
  // is paid in full the moment it is issued. There is no balance on it to
  // collect, write off, or chase.
  if (inv.kind !== "billing" && action !== "void") {
    return NextResponse.json({ ok: false, error: "A reimbursement certificate is already paid in full." }, { status: 400 });
  }

  if (action === "pay") {
    const amount = Number(b.amount);
    if (!(amount > 0)) return NextResponse.json({ ok: false, error: "Enter an amount." }, { status: 400 });
    if (!MODES.includes(b.mode)) return NextResponse.json({ ok: false, error: "Pick how it was paid." }, { status: 400 });
    // Overpaying is almost always a typo — a digit too many, or the same
    // payment entered twice. Refusing it here is cheaper than unpicking it.
    if (amount > Number(inv.balance_due) + 0.01) {
      return NextResponse.json({ ok: false,
        error: `That is more than the ${Number(inv.balance_due).toFixed(2)} still owed on ${inv.number || "this invoice"}.` }, { status: 400 });
    }
    const { error } = await a.from("daycare_payment").insert({
      invoice_id: id, amount, mode: b.mode, reference: b.reference || null,
      paid_on: b.paid_on || undefined, note: b.note || null, recorded_by: who.name,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  else if (action === "writeoff") {
    // Writing off is not a payment and must never be countable as one. It goes
    // in its own column so a report of money received stays true.
    //
    // Accumulated, not assigned. balance_due already has the previous
    // written_off subtracted out, so assigning it would throw the earlier
    // relief away: write off 600, remove a 400 payment, write off the 400
    // that reappears, and the figure goes 600 → 400 while the balance climbs
    // to 600. It oscillated and never reached zero.
    const { error } = await a.from("daycare_invoice")
      .update({ written_off: Number(inv.written_off || 0) + Number(inv.balance_due),
                note: b.note || null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    await a.rpc("recalc_daycare_invoice", { p_invoice: id });
    // And the pay link goes, for the same reason it goes on a void: a family
    // that kept the email could otherwise still pay a bill we have already
    // relieved, and the relief would be counted twice.
    if (inv.razorpay_link_id) await cancelPaymentLink(inv.razorpay_link_id);
  }

  else if (action === "void") {
    if (!String(b.reason || "").trim()) {
      return NextResponse.json({ ok: false, error: "Say why it is being voided." }, { status: 400 });
    }
    // The number stays. A gap in a numbered series is the thing an auditor
    // asks about, and "we deleted it" is never the answer anybody wants.
    // balance_due goes to zero here rather than being left stale: a cancelled
    // invoice is not owed, and anything summing balances would keep counting
    // it forever.
    const { error } = await a.from("daycare_invoice")
      .update({ status: "void", void_reason: String(b.reason).trim(), balance_due: 0,
                updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    // And the pay link dies with it, so a parent who kept the email cannot
    // pay a bill that no longer stands.
    if (inv.razorpay_link_id) await cancelPaymentLink(inv.razorpay_link_id);
  }

  else if (action === "unpay") {
    const pid = Number(b.payment_id);
    const { data: p } = await a.from("daycare_payment").select("id, mode").eq("id", pid).maybeSingle();
    if (!p) return NextResponse.json({ ok: false, error: "No such payment." }, { status: 404 });
    // Money Razorpay says it collected is not ours to un-say. Removing it here
    // would leave our books disagreeing with the gateway's.
    if (p.mode === "razorpay") {
      return NextResponse.json({ ok: false,
        error: "That one came from Razorpay. Refund it there and it will come back here." }, { status: 400 });
    }
    const { error } = await a.from("daycare_payment").delete().eq("id", pid);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  else return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });

  const { data: after } = await a.from("daycare_invoice")
    .select("id, number, status, total, payment_made, balance_due, written_off, paid_at").eq("id", id).maybeSingle();
  return NextResponse.json({ ok: true, invoice: after });
}
