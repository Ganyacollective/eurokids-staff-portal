// Ticking off the transaction fee invoice.
//
// A reimbursement receipt going out to a parent means a fee invoice has to be
// raised against them in Zoho. The two systems do not talk, so this records
// the one fact that matters — it has been done — against the receipt that
// made it necessary.
//
// Who and when are stamped here rather than asked for. Abhinav asked for a
// tick and nothing else, and that is what the coordinator sees; but a tick
// with no author is a fact with nobody behind it, and the name costs her
// nothing because the server already knows who is signed in.

import { NextResponse } from "next/server";
import { requireBilling, admin } from "@/lib/billing-auth";

export async function POST(req: Request) {
  // The reimbursement book, not the billing one.
  const who = await requireBilling(req, "reimbursement");
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const raised = !!b.raised;
  if (!id) return NextResponse.json({ ok: false, error: "Which receipt?" }, { status: 400 });

  const a = admin();
  const { data: inv } = await a.from("daycare_invoice")
    .select("id, kind, number").eq("id", id).maybeSingle();
  if (!inv) return NextResponse.json({ ok: false, error: "No such receipt." }, { status: 404 });

  // Only a reimbursement receipt has a fee invoice owing against it. A day
  // care bill is the fee.
  if (inv.kind !== "reimbursement") {
    return NextResponse.json(
      { ok: false, error: "Only a reimbursement receipt carries a transaction fee." },
      { status: 400 },
    );
  }

  const { error } = await a.from("daycare_invoice").update({
    fee_raised: raised,
    // Clearing the tick clears the name with it. Leaving the old name on an
    // unticked row would say somebody had done something they had not.
    fee_raised_by: raised ? (who.name || who.email || "someone") : null,
    fee_raised_at: raised ? new Date().toISOString() : null,
  }).eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, raised });
}
