import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// GET /api/teacher/my-attendance
// Returns reconciled attendance for this teacher across all months that have
// been finalised — i.e., today is on or after the 10th of the following month.
//
// Example: May 2026 attendance becomes visible to the teacher on 10 June 2026.
//          June 2026 attendance becomes visible on 10 July 2026.
// This matches the school's payroll cadence — once salaries are paid, the
// month is "closed" and the teacher can review what was counted.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  const token = match[1];

  const verifier = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userResult, error: verErr } = await verifier.auth.getUser(token);
  if (verErr || !userResult?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const userId = userResult.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // Resolve employee_id
  const { data: link } = await admin.from("teacher_links").select("employee_id, display_name").eq("user_id", userId).maybeSingle();
  if (!link) return NextResponse.json({ error: "No employee link for this account." }, { status: 404 });

  // Fetch portal_state
  const { data: portal } = await admin.from("portal_state").select("data").eq("id", "main").maybeSingle();
  const months = (portal?.data?.attendanceMonths as Record<string, {
    reconciledDays?: Array<{ employee_id: string; date: string; dow?: number; status: string; in?: number | null; out?: number | null; late?: number; note?: string; forgiven?: boolean; is_overridden?: boolean; override_note?: string; leave_credit?: { leave_type: string } }>;
    summaries?: Array<{ employee_id: string; fd?: number; lateStrikes?: number; halfLwp?: number; lwpDays?: number; clDays?: number; elDays?: number; weekOffs?: number; holidays?: number; vacationDays?: number; strikeHalfDays?: number; totalCutDays?: number }>;
    leave_credits?: Array<{ employee_id: string; date: string; leave_type: string }>;
    importedAt?: string;
  }>) || {};
  const adjustments = (portal?.data?.adjustments as Array<{ employee_id: string; date: string; kind: string; reason: string; month?: string; decided_at?: string }>) || [];

  // Determine which months are visible — only after the 10th of the *following* month
  const today = new Date();
  const isMonthVisible = (monthKey: string): boolean => {
    // monthKey format: YYYY-MM
    const [y, m] = monthKey.split("-").map(Number);
    // 10th of (m+1)
    // If m is 12, the next month is January of next year
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const cutoff = new Date(Date.UTC(nextYear, nextMonth - 1, 10));
    return today.getTime() >= cutoff.getTime();
  };

  const out: Array<{
    month: string;
    days: Array<{ date: string; dow: number; status: string; in: number | null; out: number | null; late: number | null; note: string; forgiven: boolean; is_overridden: boolean; override_note: string; leave_credit?: string }>;
    summary: { fd: number; lateStrikes: number; halfLwp: number; lwpDays: number; clDays: number; elDays: number; weekOffs: number; holidays: number; vacationDays: number; strikeHalfDays: number; totalCutDays: number };
    forgivings: Array<{ date: string; kind: string; reason: string }>;
  }> = [];

  const sortedMonths = Object.keys(months).sort((a, b) => b.localeCompare(a)); // newest first
  for (const monthKey of sortedMonths) {
    if (!isMonthVisible(monthKey)) continue;
    const m = months[monthKey];
    const myDays = (m.reconciledDays || []).filter(d => d.employee_id === link.employee_id).map(d => ({
      date: d.date,
      dow: d.dow ?? new Date(d.date + "T00:00:00Z").getUTCDay(),
      status: d.status,
      in: d.in ?? null,
      out: d.out ?? null,
      late: d.late ?? null,
      note: d.note || "",
      forgiven: !!d.forgiven,
      is_overridden: !!d.is_overridden,
      override_note: d.override_note || "",
      leave_credit: d.leave_credit?.leave_type,
    }));
    if (myDays.length === 0) continue;
    const summary = (m.summaries || []).find(s => s.employee_id === link.employee_id) || {
      fd: 0, lateStrikes: 0, halfLwp: 0, lwpDays: 0, clDays: 0, elDays: 0, weekOffs: 0, holidays: 0, vacationDays: 0, strikeHalfDays: 0, totalCutDays: 0,
    };
    const myForgivings = adjustments
      .filter(a => a.employee_id === link.employee_id && (a.month === monthKey || (a.date && a.date.slice(0, 7) === monthKey)))
      .map(a => ({ date: a.date, kind: a.kind, reason: a.reason }));
    out.push({
      month: monthKey,
      days: myDays.sort((a, b) => a.date.localeCompare(b.date)),
      summary: {
        fd: Number(summary.fd || 0),
        lateStrikes: Number(summary.lateStrikes || 0),
        halfLwp: Number(summary.halfLwp || 0),
        lwpDays: Number(summary.lwpDays || 0),
        clDays: Number(summary.clDays || 0),
        elDays: Number(summary.elDays || 0),
        weekOffs: Number(summary.weekOffs || 0),
        holidays: Number(summary.holidays || 0),
        vacationDays: Number(summary.vacationDays || 0),
        strikeHalfDays: Number(summary.strikeHalfDays || 0),
        totalCutDays: Number(summary.totalCutDays || 0),
      },
      forgivings: myForgivings,
    });
  }

  // Also surface a hint about the next month they can expect to see
  const allMonthKeys = Object.keys(months).sort((a, b) => b.localeCompare(a));
  const lockedMonths = allMonthKeys.filter(k => !isMonthVisible(k));
  const nextUnlock = lockedMonths.length > 0 ? lockedMonths[0] : null;
  const nextUnlockDate = (() => {
    if (!nextUnlock) return null;
    const [y, m] = nextUnlock.split("-").map(Number);
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    const d = new Date(Date.UTC(nextYear, nextMonth - 1, 10));
    return d.toISOString().slice(0, 10);
  })();

  return NextResponse.json({
    ok: true,
    months: out,
    next_unlock: nextUnlock ? { month: nextUnlock, available_from: nextUnlockDate } : null,
  });
}
