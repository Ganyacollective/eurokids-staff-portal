import { NextResponse } from "next/server";
import { requireBilling, admin } from "@/lib/billing-auth";

// GET /api/reimbursement/list — everything the Day care billing tab needs in
// one read: families, their children, the standing profiles, and the
// certificates already issued.
export async function GET(req: Request) {
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const a = admin();
  const [parties, children, due, certs] = await Promise.all([
    a.from("billing_party").select("*").order("display_name"),
    a.from("billing_child").select("*").order("name"),
    a.from("v_reimbursement_due").select("*"),
    a.from("reimbursement_certificate")
      .select("id, reference, child_id, party_id, period_start, amount, paid_on, emailed_at, email_to, issued_at, cancelled_at, public_token")
      .order("period_start", { ascending: false }).limit(500),
  ]);
  return NextResponse.json({
    ok: true,
    parties: parties.data || [], children: children.data || [],
    due: due.data || [], certificates: certs.data || [],
    is_admin: who.isAdmin,
  });
}
