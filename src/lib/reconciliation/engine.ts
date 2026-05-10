/**
 * Reconciliation engine — applies Eurokids JM Enclave HR policy to raw PetPooja
 * attendance rows, producing per-day status, late strikes, anomalies, and
 * per-month per-employee cuts.
 *
 * Pure function: no I/O. Caller hands in the raw rows + reference data, gets
 * back a structured plan to persist.
 */

import { timeToMinutes } from "@/lib/utils";

export type RawRow = {
  raw_name: string;
  attendance_date: string; // YYYY-MM-DD
  first_punch: string | null;
  last_punch: string | null;
  petpooja_status: string | null;
  petpooja_emp_code?: string | null;
};

export type Employee = {
  id: string;
  name_petpooja: string;
  display_name: string;
  reporting_minutes: number;
  is_active: boolean;
};

export type Holiday = {
  id: string;
  date: string;
  name: string;
  is_mandatory: boolean;
};

export type Vacation = {
  id: string;
  start_date: string;
  end_date: string;
  name: string;
};

export type LeaveApplication = {
  id: string;
  employee_id: string;
  leave_type: "CL" | "EL" | "LWP" | "Maternity" | "Bereavement" | "Other";
  start_date: string;
  end_date: string;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
};

export type DayStatus =
  | "FullDay" | "HalfDay" | "Late" | "HalfLWP" | "LWP"
  | "CasualLeave" | "EarnedLeave" | "Holiday" | "OptionalHoliday"
  | "Vacation" | "WeekOff" | "ForgotPunch";

export type ReconciledDay = {
  raw_row_index: number;        // index back into the input array
  employee_id: string | null;   // null when name unmatched
  attendance_date: string;
  day_of_week: number;
  scheduled_minutes: number | null;
  punch_in_minutes: number | null;
  punch_out_minutes: number | null;
  late_minutes: number | null;
  is_late_strike: boolean;
  status: DayStatus;
  matched_leave_id?: string;
  matched_holiday_id?: string;
  matched_vacation_id?: string;
  notes?: string;
};

export type AnomalyKind =
  | "missing_schedule" | "zero_punches" | "name_mismatch"
  | "punch_on_holiday" | "forgot_punch" | "excess_late_strikes"
  | "unmatched_leave_application" | "sandwich_violation";

export type Anomaly = {
  kind: AnomalyKind;
  employee_id: string | null;
  raw_row_index: number | null;
  description: string;
};

export type EmployeeMonthSummary = {
  employee_id: string;
  full_days: number;
  late_strikes: number;
  half_lwp: number;
  lwp_days: number;
  cl_days: number;
  el_days: number;
  week_offs: number;
  holidays: number;
  vacation_days: number;
  saturday_absences: number;
  saturday_refunds: number;
  saturday_excess: number;
  strike_half_days: number;          // floor(late_strikes / 3)
  total_cut_days: number;            // lwp_days + 0.5*(strike_half_days + half_lwp)
};

export type ReconcileInput = {
  rawRows: RawRow[];
  employees: Employee[];
  holidays: Holiday[];
  vacations: Vacation[];
  leaveApplications: LeaveApplication[]; // only Approved are honoured
};

export type ReconcileOutput = {
  reconciledDays: ReconciledDay[];
  anomalies: Anomaly[];
  summaries: EmployeeMonthSummary[];
};

const SATURDAY_REPORTING_MINUTES = 540; // 9:00 AM uniform

const LATE_GRACE_MINUTES = 10;
const HALF_LWP_LATE_THRESHOLD = 90;     // > 1.5 hr late = ½ day LWP
const STRIKE_TO_HALF_DAY = 3;
const SATURDAYS_FREE_PER_MONTH = 2;

export function reconcile(input: ReconcileInput): ReconcileOutput {
  const { rawRows, employees, holidays, vacations, leaveApplications } = input;

  // ----- Build lookup maps -----
  const empByPetpoojaName = new Map<string, Employee>();
  for (const e of employees) empByPetpoojaName.set(e.name_petpooja, e);

  // Fuzzy lookup fallback
  function lookupEmployee(rawName: string): Employee | null {
    const exact = empByPetpoojaName.get(rawName);
    if (exact) return exact;
    const trimmed = rawName.trim();
    for (const e of employees) {
      if (e.name_petpooja.trim().toLowerCase() === trimmed.toLowerCase()) return e;
    }
    return null;
  }

  const holidayByDate = new Map<string, Holiday>();
  for (const h of holidays) holidayByDate.set(h.date, h);

  function dateInVacation(d: string): Vacation | null {
    for (const v of vacations) {
      if (d >= v.start_date && d <= v.end_date) return v;
    }
    return null;
  }

  const leavesByEmployee = new Map<string, LeaveApplication[]>();
  for (const l of leaveApplications) {
    if (l.status !== "Approved") continue;
    const arr = leavesByEmployee.get(l.employee_id) || [];
    arr.push(l);
    leavesByEmployee.set(l.employee_id, arr);
  }

  // ----- Pass 1: classify each row -----
  const reconciledDays: ReconciledDay[] = [];
  const anomalies: Anomaly[] = [];

  rawRows.forEach((row, idx) => {
    const emp = lookupEmployee(row.raw_name);
    if (!emp) {
      anomalies.push({
        kind: "name_mismatch",
        employee_id: null,
        raw_row_index: idx,
        description: `PetPooja name "${row.raw_name}" doesn't match any employee on file. Add them under Employees, or correct the spelling.`,
      });
      return;
    }
    if (!emp.is_active) {
      // skip inactive — they shouldn't be in payroll
      return;
    }

    const date = row.attendance_date;
    const d = new Date(date + "T00:00:00Z");
    const dow = d.getUTCDay(); // 0 = Sun

    // Vacation block check FIRST — these dates are non-working
    const vac = dateInVacation(date);
    if (vac) {
      reconciledDays.push({
        raw_row_index: idx, employee_id: emp.id, attendance_date: date, day_of_week: dow,
        scheduled_minutes: null, punch_in_minutes: null, punch_out_minutes: null,
        late_minutes: null, is_late_strike: false,
        status: "Vacation", matched_vacation_id: vac.id,
      });
      return;
    }

    // Mandatory holiday — paid, no LWP regardless of attendance
    const holiday = holidayByDate.get(date);
    if (holiday?.is_mandatory) {
      reconciledDays.push({
        raw_row_index: idx, employee_id: emp.id, attendance_date: date, day_of_week: dow,
        scheduled_minutes: null, punch_in_minutes: null, punch_out_minutes: null,
        late_minutes: null, is_late_strike: false,
        status: "Holiday", matched_holiday_id: holiday.id,
      });
      return;
    }

    // Approved leave on this date?
    const leaves = leavesByEmployee.get(emp.id) || [];
    const matchedLeave = leaves.find(L => date >= L.start_date && date <= L.end_date);

    const inMin = timeToMinutes(row.first_punch);
    const outMin = timeToMinutes(row.last_punch);
    const status = (row.petpooja_status || "").trim();

    const isSaturday = dow === 6;
    const isSunday = dow === 0;
    const sched = isSaturday ? SATURDAY_REPORTING_MINUTES : emp.reporting_minutes;

    // Forgot punch detection: only one of in/out, marked Absent
    const forgotPunch = /absent/i.test(status) && ((inMin && !outMin) || (outMin && !inMin));
    if (forgotPunch) {
      anomalies.push({
        kind: "forgot_punch",
        employee_id: emp.id,
        raw_row_index: idx,
        description: `${emp.display_name} on ${date}: punched ${inMin ? "in" : "out"} only — likely forgot the other punch. Treating as Present.`,
      });
      reconciledDays.push({
        raw_row_index: idx, employee_id: emp.id, attendance_date: date, day_of_week: dow,
        scheduled_minutes: sched, punch_in_minutes: inMin, punch_out_minutes: outMin,
        late_minutes: null, is_late_strike: false,
        status: "ForgotPunch",
      });
      return;
    }

    // Week off (Sundays mostly)
    if (/week\s*off/i.test(status)) {
      reconciledDays.push({
        raw_row_index: idx, employee_id: emp.id, attendance_date: date, day_of_week: dow,
        scheduled_minutes: null, punch_in_minutes: null, punch_out_minutes: null,
        late_minutes: null, is_late_strike: false,
        status: "WeekOff",
      });
      return;
    }

    // Absent
    if (/absent/i.test(status)) {
      if (matchedLeave) {
        const dayStatus: DayStatus =
          matchedLeave.leave_type === "EL" ? "EarnedLeave" :
          matchedLeave.leave_type === "CL" ? "CasualLeave" : "LWP";
        reconciledDays.push({
          raw_row_index: idx, employee_id: emp.id, attendance_date: date, day_of_week: dow,
          scheduled_minutes: null, punch_in_minutes: null, punch_out_minutes: null,
          late_minutes: null, is_late_strike: false,
          status: dayStatus, matched_leave_id: matchedLeave.id,
        });
      } else {
        // Unmatched absence -> LWP (pending Saturday-cap refund applied later)
        reconciledDays.push({
          raw_row_index: idx, employee_id: emp.id, attendance_date: date, day_of_week: dow,
          scheduled_minutes: null, punch_in_minutes: null, punch_out_minutes: null,
          late_minutes: null, is_late_strike: false,
          status: "LWP",
        });
      }
      return;
    }

    // Has punch in (and out, presumably)
    if (inMin != null) {
      const lateMin = inMin - sched;
      let dayStatus: DayStatus = "FullDay";
      let isStrike = false;

      if (lateMin > HALF_LWP_LATE_THRESHOLD) {
        dayStatus = "HalfLWP";
      } else if (lateMin > LATE_GRACE_MINUTES) {
        dayStatus = "Late";
        isStrike = true;
      }

      reconciledDays.push({
        raw_row_index: idx, employee_id: emp.id, attendance_date: date, day_of_week: dow,
        scheduled_minutes: sched, punch_in_minutes: inMin, punch_out_minutes: outMin,
        late_minutes: lateMin, is_late_strike: isStrike,
        status: dayStatus,
      });
    } else {
      // PetPooja gave us an unrecognized status with no punch info
      reconciledDays.push({
        raw_row_index: idx, employee_id: emp.id, attendance_date: date, day_of_week: dow,
        scheduled_minutes: sched, punch_in_minutes: null, punch_out_minutes: null,
        late_minutes: null, is_late_strike: false,
        status: status === "FD" || /full/i.test(status) ? "FullDay" : "LWP",
        notes: `Unrecognized PetPooja status: "${status}"`,
      });
    }
  });

  // ----- Pass 2: aggregate per employee with Saturday-cap refund -----
  const summaryByEmp = new Map<string, EmployeeMonthSummary>();
  function ensure(empId: string): EmployeeMonthSummary {
    let s = summaryByEmp.get(empId);
    if (!s) {
      s = {
        employee_id: empId,
        full_days: 0, late_strikes: 0, half_lwp: 0, lwp_days: 0,
        cl_days: 0, el_days: 0, week_offs: 0, holidays: 0, vacation_days: 0,
        saturday_absences: 0, saturday_refunds: 0, saturday_excess: 0,
        strike_half_days: 0, total_cut_days: 0,
      };
      summaryByEmp.set(empId, s);
    }
    return s;
  }

  for (const d of reconciledDays) {
    if (!d.employee_id) continue;
    const s = ensure(d.employee_id);
    switch (d.status) {
      case "FullDay": case "Late": case "ForgotPunch": s.full_days++; break;
      case "HalfDay": s.full_days += 0.5; break;
      case "HalfLWP": s.half_lwp++; s.full_days += 0.5; break;
      case "LWP":
        s.lwp_days++;
        if (d.day_of_week === 6) s.saturday_absences++;
        break;
      case "CasualLeave": s.cl_days++; break;
      case "EarnedLeave": s.el_days++; break;
      case "WeekOff": s.week_offs++; break;
      case "Holiday": case "OptionalHoliday": s.holidays++; break;
      case "Vacation": s.vacation_days++; break;
    }
    if (d.is_late_strike) s.late_strikes++;
  }

  // Apply Saturday-cap refund + strike-to-half-day rule
  for (const s of summaryByEmp.values()) {
    s.saturday_refunds = Math.min(SATURDAYS_FREE_PER_MONTH, s.saturday_absences);
    s.saturday_excess = Math.max(0, s.saturday_absences - SATURDAYS_FREE_PER_MONTH);
    s.lwp_days -= s.saturday_refunds;
    s.strike_half_days = Math.floor(s.late_strikes / STRIKE_TO_HALF_DAY);
    s.total_cut_days = s.lwp_days + 0.5 * (s.strike_half_days + s.half_lwp);
  }

  // ----- Pass 3: cross-cutting anomalies -----
  for (const s of summaryByEmp.values()) {
    if (s.full_days === 0 && s.cl_days === 0 && s.el_days === 0) {
      anomalies.push({
        kind: "zero_punches",
        employee_id: s.employee_id,
        raw_row_index: null,
        description: "No punches the entire month. Verify whether this employee is still active and if their biometric ID is correctly mapped in PetPooja.",
      });
    }
    if (s.late_strikes >= 6) {
      anomalies.push({
        kind: "excess_late_strikes",
        employee_id: s.employee_id,
        raw_row_index: null,
        description: `${s.late_strikes} late strikes — chronic tardiness. Consider a conversation.`,
      });
    }
  }

  return {
    reconciledDays,
    anomalies,
    summaries: Array.from(summaryByEmp.values()),
  };
}
