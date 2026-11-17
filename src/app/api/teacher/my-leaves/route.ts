import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// GET /api/teacher/my-leaves
//
// The calling teacher's leave history, her entitlement, and the credits for
// days she applied for and then came in anyway.
//
// This route used to merge two lists — leave_requests for anything she filed
// after signing in, and portal_state.data.leaves for anything else — and
// prefer the blob copy where both existed, because HR's edits landed there.
// Leaves are rows in one table now, so there is nothing to merge and nothing
// to prefer. Her entitlement and carry-forward still come from the employee
// record in the state document, which is where staff records legitimately
// live; only the leaves moved.
export async function GET(req: NextRequest) {
  // Authenticate caller
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  const token = match[1];

  const verifier = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userResult, error: verErr } = await verifier.auth.getUser(token);
  if (verErr || !userResult?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const userId = userResult.user.id;

  // Use service role to bypass RLS — we've already authenticated above and
  // scope the queries strictly to this user's own employee record.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Find this user's employee_id via teacher_links.
  //
  // Not maybeSingle(): that throws when a query returns more than one row, and
  // four people here have two teacher_links rows apiece — a second login was
  // provisioned for them at some point and the first was never removed. For
  // those four this route was failing outright, so their leave screen showed
  // an error rather than their leave. Oldest link wins, deterministically.
  const { data: links, error: linkErr } = await admin
    .from("teacher_links")
    .select("employee_id, display_name, department, designation, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);
  const link = links?.[0];
  if (linkErr || !link) {
    return NextResponse.json({ error: "No employee link for this account. Ask HR." }, { status: 404 });
  }

  // 2) Every leave of hers, however she applied for it.
  //
  // Keyed on employee_id rather than user_id: a leave she filed without
  // signing in has no account attached, and keying on user_id would have
  // hidden exactly those from her — including, before the merge, any leave
  // the office typed in on her behalf.
  // One literal string, not a concatenation: supabase-js infers the row type
  // by parsing this at the type level, and a `+` turns it into an opaque
  // string, which costs you every field name on the way out.
  const { data: requests } = await admin
    .from("leave_requests")
    .select("id, employee_id, leave_type, start_date, end_date, total_days, reason, status, reviewer_note, applied_at, reviewed_at, source, half_day")
    .eq("employee_id", link.employee_id)
    .order("applied_at", { ascending: false });
  const requestRows = requests || [];

  // 3) Her employee record, for the entitlement, and the reconciled months,
  //    for the credits. Leave credits live with each month's reconciliation in
  //    attendance_month; the employee record is still in the state document.
  const [{ data: portal }, { data: monthRows }] = await Promise.all([
    admin.from("portal_state").select("data").eq("id", "main").maybeSingle(),
    admin.from("attendance_month").select("month, data"),
  ]);

  const attendanceMonths: Record<string, unknown> = {};
  for (const r of monthRows || []) attendanceMonths[r.month] = r.data;

  // Aggregate leave credits across all reconciled months for this employee
  type Credit = { employee_id: string; leave_id: string; leave_type: string; date: string; days?: number };
  const credits: Credit[] = [];
  const months = (attendanceMonths as Record<string, { leave_credits?: Credit[] }>) || {};
  for (const monthKey of Object.keys(months)) {
    const monthData = months[monthKey];
    for (const c of (monthData.leave_credits || [])) {
      if (c.employee_id === link.employee_id) credits.push(c);
    }
  }

  // Pluck the per-employee carry-forward additions
  type Emp = {
    id: string;
    joining_date?: string | null;
    entitlement_from?: string | null;       // a rejoiner's clock restarts here
    cl_carry_forward?: number | null;
    el_carry_forward?: number | null;
    cl_allowance_override?: number | null;  // legacy field
    el_allowance_override?: number | null;  // legacy field
  };
  const employees = (portal?.data?.employees as Emp[]) || [];
  const empRecord = employees.find((e) => e.id === link.employee_id);
  // Carry-forward is additive on top of AY default; legacy override is total (back-compat).
  // ?? does not catch NaN, and the employee form can store one. A NaN here
  // reached the teacher's screen as the word "NaN" where her leave balance
  // should be, while HR saw a correct number.
  const num = (v: unknown) => (v == null || isNaN(Number(v)) ? 0 : Number(v));
  const carryForward = { cl: num(empRecord?.cl_carry_forward), el: num(empRecord?.el_carry_forward) };
  const legacyOverride = {
    cl: empRecord?.cl_carry_forward == null && empRecord?.cl_allowance_override != null ? empRecord.cl_allowance_override : null,
    el: empRecord?.el_carry_forward == null && empRecord?.el_allowance_override != null ? empRecord.el_allowance_override : null,
  };

  // The entitlement itself, worked out here rather than in the teacher's
  // browser. It used to be computed in two places from a constant copied into
  // two files, which is how a teacher and HR end up looking at different
  // numbers for the same person.
  const AY = { start: "2026-04-06", end: "2027-03-19", cl: 7, el: 8 };
  const allowance = (() => {
    const from = empRecord?.entitlement_from || empRecord?.joining_date || null;
    let months = 12, prorated = false;
    if (from && from > AY.start) {
      prorated = true;
      if (from > AY.end) months = 0;
      else {
        const [y, m, d] = from.split("-").map(Number);
        const [ey, em] = AY.end.split("-").map(Number);
        const firstWhole = d <= 15 ? y * 12 + m : y * 12 + m + 1;
        months = Math.max(0, Math.min(12, ey * 12 + em - firstWhole + 1));
      }
    }
    const half = (n: number) => Math.round(n * 2) / 2;
    const share = months / 12;
    return {
      months, prorated, from,
      cl: legacyOverride.cl != null ? Number(legacyOverride.cl) : half(AY.cl * share) + carryForward.cl,
      el: legacyOverride.el != null ? Number(legacyOverride.el) : half(AY.el * share) + carryForward.el,
    };
  })();

  // 4) One list, in the shape the teacher's screen already expects.
  //
  // What stood here was forty lines reconciling two systems: match each table
  // row to a blob entry by source_id, let the blob's values win field by
  // field, then append the blob entries that matched nothing. `source` used
  // to mean which of the two systems a leave came out of. It now means how
  // the leave was applied for, which is the question anyone actually has.
  const leaves = requestRows.map((r) => ({
    id: r.id,
    leave_type: r.leave_type,
    start_date: r.start_date,
    end_date: r.end_date,
    // numeric can arrive as a string, and this number is subtracted from a
    // balance shown to the person it is about.
    total_days: Number(r.total_days) || 0,
    reason: r.reason || "",
    status: r.status,
    reviewer_note: r.reviewer_note || undefined,
    applied_at: r.applied_at || r.start_date + "T00:00:00Z",
    half_day: !!r.half_day,
    source: r.source as "portal" | "anonymous" | "hr" | "legacy",
  }));

  leaves.sort((a, b) => (b.applied_at || "").localeCompare(a.applied_at || ""));

  return NextResponse.json({ ok: true, leaves, credits, carry_forward: carryForward,
    legacy_override: legacyOverride, allowance, employee: link });
}
