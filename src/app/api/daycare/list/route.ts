import { NextResponse } from "next/server";
import { requireBilling, admin } from "@/lib/billing-auth";

// Everything the Day care billing tab needs in one read.
export async function GET(req: Request) {
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const a = admin();
  const [parties, children, rates, invoices, lines, recurring, payments, messages] = await Promise.all([
    a.from("billing_party").select("*").order("display_name"),
    a.from("billing_child").select("*").order("name"),
    a.from("daycare_rate").select("*").eq("is_active", true).order("sort"),
    a.from("daycare_invoice").select("*").order("id", { ascending: false }).limit(400),
    a.from("daycare_invoice_line").select("*").order("position"),
    a.from("daycare_recurring").select("*").order("id"),
    a.from("daycare_payment").select("*").order("paid_on", { ascending: false }).limit(600),
    // The trail: what was sent, to whom, for how much, and whether it arrived.
    a.from("billing_message").select("*").order("sent_at", { ascending: false }).limit(600),
  ]);
  // One read serves both apps, so it must not hand over the half this person
  // does not hold. Filtering on the screen alone would mean the data was in
  // the browser all along, which is not a permission at all.
  const kinds = [who.canBill ? "billing" : null, who.canCertify ? "reimbursement" : null].filter(Boolean);
  const invoiceRows = (invoices.data || []).filter((i) => kinds.includes(i.kind));
  const keptIds = new Set(invoiceRows.map((i) => i.id));
  const partyRows = (parties.data || [])
    .filter((p) => (who.canBill && p.in_billing) || (who.canCertify && p.in_reimbursement));
  const partyIds = new Set(partyRows.map((p) => p.id));

  return NextResponse.json({ ok: true, is_admin: who.isAdmin,
    can_bill: who.canBill, can_certify: who.canCertify,
    parties: partyRows,
    children: (children.data || []).filter((c) => partyIds.has(c.party_id)),
    rates: rates.data || [],
    invoices: invoiceRows,
    lines: (lines.data || []).filter((l) => keptIds.has(l.invoice_id)),
    recurring: (recurring.data || []).filter((r) => kinds.includes(r.kind)),
    payments: (payments.data || []).filter((p) => keptIds.has(p.invoice_id)),
    messages: (messages.data || []).filter((m) => partyIds.has(m.party_id)),
    // So the screen can say plainly whether a Pay now button will appear and
    // whether a WhatsApp will actually go, instead of the coordinator finding
    // out from a parent that neither happened.
    razorpay: process.env.RAZORPAY_KEY_ID
      ? (process.env.RAZORPAY_KEY_ID.startsWith("rzp_live") ? "live" : "test") : "off",
    whatsapp: process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? "on" : "off" });
}
