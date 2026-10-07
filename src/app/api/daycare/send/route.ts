import { NextResponse } from "next/server";
import { requireBilling, admin } from "@/lib/billing-auth";
import { sendInvoice } from "@/lib/daycare-billing";

export async function POST(req: Request) {
  // Allowed in at all; which half is decided below, once we know what
  // kind of document this id actually is.
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const b = await req.json().catch(() => ({}));
  const a = admin();

  // The person may hold one half and not the other, so the check is against
  // this document's own kind. Sending is the irreversible one: it takes a
  // number the series can never reuse and puts a PDF in a parent's inbox.
  const { data: inv } = await a.from("daycare_invoice").select("kind").eq("id", Number(b.id)).maybeSingle();
  if (!inv) return NextResponse.json({ ok: false, error: "No such invoice." }, { status: 404 });
  if (!(inv.kind === "billing" ? who.canBill : who.canCertify)) {
    return NextResponse.json({ ok: false, error: inv.kind === "billing"
      ? "You do not have Day care billing." : "You do not have Reimbursements." }, { status: 403 });
  }

  const r = await sendInvoice(a, Number(b.id), who.name, b.to || null);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}
