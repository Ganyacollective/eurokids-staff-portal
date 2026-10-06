import { NextResponse } from "next/server";
import { requireBilling, admin } from "@/lib/billing-auth";
import { issueCertificate } from "@/lib/reimbursement";

// POST /api/reimbursement/issue — one certificate, for one child, for one month.
export async function POST(req: Request) {
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const b = await req.json().catch(() => ({}));
  if (!b.child_id || !b.period) {
    return NextResponse.json({ ok: false, error: "Which child, and which month?" }, { status: 400 });
  }
  const r = await issueCertificate(admin(), {
    childId: Number(b.child_id),
    period: String(b.period),
    amount: b.amount == null ? null : Number(b.amount),
    description: b.description || null,
    paidOn: b.paid_on || null,
    mode: b.mode || null,
    note: b.note || null,
    profileId: b.profile_id ? Number(b.profile_id) : null,
    by: who.name,
  }, { email: b.email !== false });

  return r.ok ? NextResponse.json(r) : NextResponse.json({ ok: false, error: r.error }, { status: r.status });
}
