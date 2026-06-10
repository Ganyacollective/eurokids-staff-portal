import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// GET /api/teacher/my-attendance
// Returns reconciled attendance for this teacher across all months that HR
// has explicitly *published* to teachers (i.e., attendanceMonths[m].published_at is set).
// HR controls visibility via the Publish/Unpublish buttons on the Attendance Import panel.
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

  const { data: link } = await admin.from("teacher_links").select("employee_id, display_name").eq("user_id", userId).maybeSingle();
  if (!link) return NextResponse.json({ error: "No employee link for this account." }, { status: 404 });

  const { data: portal } = await admin.from("portal_state").select("data").eq("id", "main").maybeSingle();

  // Pluck the employee record so we have monthly_salary for cut calculations
  type Emp = { id: string; monthly_salary?: number; reporting_minutes?: number; display_name?: string };
  const employees = (portal?.data?.employees as Emp[]) || [];
  const empRecord = employees.find(e => e.id === link.employee_id);
  const monthlySalary = Number(empRecord?.monthly_salary || 0);
  const empReportingMinutes = Number(empRecord?.reporting_minutes || 480);

  const months = (portal?.data?.attendanceMonths as Record<string, {
    reconciledDays?: Array<{ employee_id: string; date: string; dow?: number; status: string; in?: number | null; out?: number | null; late?: number; note?: string; forgiven?: boolean; is_overridden?: boolean; override_note?: string; override_prev_status?: string; scheduledMin?: number; isStrike?: boolean; leave_credit?: { leave_type: string }; }>;
    summaries?: Array<{ employee_id: string; fd?: number; lateStrikes?: number; halfLwp?: number; lwpDays?: number; clDays?: number; elDays?: number; weekOffs?: number; holidays?: number; vacationDays?: number; strikeHalfDays?: number; totalCutDays?: number }>;
    leave_credits?: Array<{ employee_id: string; date: string; leave_type: string }>;
    importedAt?: string;
    published_at?: string;
    published_by?: string;
  }>) || {};
  const adjustments = (portal?.data?.adjustments as Array<{ employee_id: string; date: string; kind: string; reason: string; month?: string; decided_at?: string }>) || [];

  type DayDetail = {
    date: string;
    dow: number;
    status: string;
    in_min: number | null;
    out_min: number | null;
    in_label: string | null;
    out_label: string | null;
    late_min: number | null;
    is_strike: boolean;
    scheduled_min: number | null;
    note: string;
    forgiven: boolean;
    forgive_reason: string | null;
    is_overridden: boolean;
    override_note: string;
    override_prev_status: string | null;
    leave_credit: string | null;
  };

  const minToTime = (m: number | null | undefined) => {
    if (m == null) return null;
    const h24 = Math.floor(m / 60), mm = m % 60;
    const ap = h24 >= 12 ? "PM" : "AM";
    const h12 = ((h24 + 11) % 12) + 1;
    return `${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${ap}`;
  };

  const out: Array<{
    month: string;
    published_at: string;
    days: DayDetail[];
    summary: {
      fd: number;
      lateStrikes: number;
      halfLwp: number;
      lwpDays: number;
      clDays: number;
      elDays: number;
      weekOffs: number;
      holidays: number;
      vacationDays: number;
      strikeHalfDays: number;
      totalCutDays: number;
      monthlySalary: number;
      perDaySalary: number;
      cutAmount: number;
      netPayable: number;
    };
    forgivings: Array<{ date: string; kind: string; reason: string }>;
  }> = [];

  const sortedMonths = Object.keys(months).sort((a, b) => b.localeCompare(a));
  for (const monthKey of sortedMonths) {
    const m = months[monthKey];
    if (!m.published_at) continue;  // HR has not yet published this month

    const myDays: DayDetail[] = (m.reconciledDays || [])
      .filter(d => d.employee_id === link.employee_id)
      .map(d => {
        const matchingForgive = adjustments.find(a =>
          a.employee_id === link.employee_id &&
          a.date === d.date &&
          (a.kind === "forgive_late" || a.kind === "forgive_lwp" || a.kind === "forgive_halflwp")
        );
        return {
          date: d.date,
          dow: d.dow ?? new Date(d.date + "T00:00:00Z").getUTCDay(),
          status: d.status,
          in_min: d.in ?? null,
          out_min: d.out ?? null,
          in_label: minToTime(d.in),
          out_label: minToTime(d.out),
          late_min: d.late ?? null,
          is_strike: !!d.isStrike,
          scheduled_min: d.scheduledMin ?? null,
          note: d.note || "",
          forgiven: !!d.forgiven,
          forgive_reason: matchingForgive?.reason || null,
          is_overridden: !!d.is_overridden,
          override_note: d.override_note || "",
          override_prev_status: d.override_prev_status || null,
          leave_credit: d.leave_credit?.leave_type || null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    if (myDays.length === 0) continue;

    const s = (m.summaries || []).find(sum => sum.employee_id === link.employee_id) || {
      fd: 0, lateStrikes: 0, halfLwp: 0, lwpDays: 0, clDays: 0, elDays: 0, weekOffs: 0, holidays: 0, vacationDays: 0, strikeHalfDays: 0, totalCutDays: 0,
    };
    const totalCutDays = Number(s.totalCutDays || 0);
    const perDaySalary = monthlySalary / 26;
    const cutAmount = Math.round(perDaySalary * totalCutDays);
    const netPayable = Math.round(monthlySalary - cutAmount);

    const myForgivings = adjustments
      .filter(a => a.employee_id === link.employee_id && (a.month === monthKey || (a.date && a.date.slice(0, 7) === monthKey)))
      .map(a => ({ date: a.date, kind: a.kind, reason: a.reason }));

    out.push({
      month: monthKey,
      published_at: m.published_at,
      days: myDays,
      summary: {
        fd: Number(s.fd || 0),
        lateStrikes: Number(s.lateStrikes || 0),
        halfLwp: Number(s.halfLwp || 0),
        lwpDays: Number(s.lwpDays || 0),
        clDays: Number(s.clDays || 0),
        elDays: Number(s.elDays || 0),
        weekOffs: Number(s.weekOffs || 0),
        holidays: Number(s.holidays || 0),
        vacationDays: Number(s.vacationDays || 0),
        strikeHalfDays: Number(s.strikeHalfDays || 0),
        totalCutDays,
        monthlySalary,
        perDaySalary: Math.round(perDaySalary),
        cutAmount,
        netPayable,
      },
      forgivings: myForgivings,
    });
  }

  // Silence the unused-var warning for empReportingMinutes — kept for possible future use
  void empReportingMinutes;

  return NextResponse.json({ ok: true, months: out });
}
