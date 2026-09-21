import { NextResponse } from "next/server";
import { requireLetters, admin, loadStaff } from "@/lib/letters-auth";
import { missingFor, scheduleOf, SCHEDULE_LABEL } from "@/lib/letter-merge";

// GET /api/letters/staff — the roster, with a salary against each name and a
// plain list of what is still missing before a letter can go out.
//
// One request, not two: the screen needs "who can I write to today", and the
// answer is a join of the roster, the pay book and the letters already sent.
export async function GET(req: Request) {
  const who = await requireLetters(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const a = admin();
  const [staff, { data: pay }, { data: letters }] = await Promise.all([
    loadStaff(a),
    a.from("v_salary_current").select("employee_id, monthly_salary"),
    a.from("appointment_letter")
      .select("id, employee_id, status, issued_on, sent_at, signed_at, to_email")
      .order("id", { ascending: false }),
  ]);

  const salary = new Map((pay || []).map((r) => [r.employee_id as string, Number(r.monthly_salary || 0)]));
  const byEmp = new Map<string, typeof letters>();
  for (const l of letters || []) {
    if (!byEmp.has(l.employee_id)) byEmp.set(l.employee_id, []);
    byEmp.get(l.employee_id)!.push(l);
  }

  const rows = staff
    .filter((e) => e.is_active !== false)
    .sort((x, y) => x.display_name.localeCompare(y.display_name))
    .map((e) => {
      const sal = salary.get(e.id) || 0;
      const mine = byEmp.get(e.id) || [];
      return {
        id: e.id, name: e.display_name,
        designation: e.designation || "", department: e.department || "",
        schedule_type: scheduleOf(e),
        schedule_label: SCHEDULE_LABEL[scheduleOf(e)] || "",
        joining_date: e.joining_date || null,
        email: e.email || "", phone: e.phone || "",
        address: e.address || "",
        reporting_minutes: e.reporting_minutes ?? null,
        punch_out_minutes: e.punch_out_minutes ?? null,
        reports_to: e.reports_to || "",
        bank_name: e.bank_name || "", bank_last4: String(e.bank_account || "").slice(-4),
        salary: sal,
        missing: missingFor(e, sal),
        letters: mine,
        latest: mine[0] || null,
      };
    });

  return NextResponse.json({ ok: true, staff: rows });
}
