import { NextResponse } from "next/server";
import { admin } from "@/lib/billing-auth";
import { issueCertificate } from "@/lib/reimbursement";

// The monthly run.
//
// Idempotent twice over: the unique index on (child, month) refuses a second
// certificate, and issueCertificate returns the existing one rather than
// raising. So the scheduler may run twice, a deploy may replay it, and
// somebody may press the button in the office at the same moment — the family
// still gets exactly one receipt for October.
//
// It never issues for a month that has not finished. A receipt saying money
// was received for October, sent on the 3rd of October, is not true yet.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const given = req.headers.get("authorization") || "";
    if (given !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "No." }, { status: 401 });
    }
  }
  const a = admin();
  const thisMonth = new Date().toISOString().slice(0, 7) + "-01";

  const { data: profiles, error } = await a.from("v_reimbursement_due").select("*")
    .eq("status", "active").eq("auto_issue", true).eq("already_issued", false)
    .lt("next_month", thisMonth);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const issued: string[] = [], skipped: string[] = [], failed: { child: string; why: string }[] = [];
  for (const p of profiles || []) {
    if (p.end_month && p.next_month > p.end_month) {
      await a.from("reimbursement_profile").update({ status: "ended" }).eq("id", p.profile_id);
      skipped.push(`${p.child_name}: profile ended`);
      continue;
    }
    const r = await issueCertificate(a, {
      childId: p.child_id, period: p.next_month, amount: p.monthly_amount,
      description: p.fee_description, profileId: p.profile_id, by: "monthly run",
    });
    if (!r.ok) failed.push({ child: p.child_name, why: r.error });
    else if (r.alreadyThere) skipped.push(`${p.child_name}: already had one`);
    else issued.push(`${p.child_name} ${r.reference}`);
  }
  return NextResponse.json({ ok: true, issued, skipped, failed });
}
