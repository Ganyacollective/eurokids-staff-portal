import { NextResponse } from "next/server";
import { requireBilling, admin } from "@/lib/billing-auth";
import { sendInvoice } from "@/lib/daycare-billing";

export async function POST(req: Request) {
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const b = await req.json().catch(() => ({}));
  const r = await sendInvoice(admin(), Number(b.id), who.name, b.to || null);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}
