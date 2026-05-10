"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { createServerClient } from "@/lib/supabase/server";
import { reconcile, type RawRow, type LeaveApplication } from "@/lib/reconciliation/engine";

type Result = { rows?: number; anomalies?: number; summaries?: number; error?: string };

export async function uploadAttendance(formData: FormData): Promise<Result> {
  try {
    const month = String(formData.get("month") || "");
    const source = String(formData.get("source") || "petpooja_excel");
    const file = formData.get("file") as File | null;
    if (!month || !file) return { error: "Month and file are required." };

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in." };

    // Parse file -> RawRow[]
    const arrayBuffer = await file.arrayBuffer();
    let rawRows: RawRow[] = [];

    if (source === "petpooja_api" || file.name.endsWith(".json")) {
      const text = new TextDecoder().decode(arrayBuffer);
      const parsed = JSON.parse(text);
      const arr = parsed.data ?? parsed;
      rawRows = (arr as Array<Record<string, unknown>>).map((r) => ({
        raw_name: String(r.name ?? ""),
        attendance_date: String(r.attandance_date ?? r.attendance_date ?? r.date ?? "").slice(0, 10),
        first_punch: (r.first_punch as string) ?? null,
        last_punch: (r.last_punch as string) ?? null,
        petpooja_status: (r.status as string) ?? null,
        petpooja_emp_code: (r.code as string) ?? null,
      }));
    } else {
      // Excel or CSV
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      rawRows = json.map((r) => ({
        raw_name: String(r["Employee Name"] ?? r["Name"] ?? r["name"] ?? ""),
        attendance_date: normalizeDate(r["Date"] ?? r["date"]),
        first_punch: nilOrString(r["First Punch"] ?? r["first_punch"]),
        last_punch: nilOrString(r["Last Punch"] ?? r["last_punch"]),
        petpooja_status: nilOrString(r["Status"] ?? r["status"]),
        petpooja_emp_code: nilOrString(r["Employee ID"] ?? r["Employee Id"] ?? r["code"]),
      })).filter((r) => r.raw_name && r.attendance_date);
    }

    if (rawRows.length === 0) return { error: "No rows parsed from the file. Check the format." };

    // Persist raw import
    const monthDate = month + "-01";
    const { data: importRow, error: importErr } = await supabase
      .from("attendance_raw_imports")
      .upsert({ month: monthDate, source, imported_by: user.id, row_count: rawRows.length }, { onConflict: "month,source" })
      .select("id")
      .single();
    if (importErr || !importRow) return { error: importErr?.message || "Failed to record import." };

    // Wipe and reinsert raw rows for this import
    await supabase.from("attendance_raw_rows").delete().eq("import_id", importRow.id);
    const rawInsert = rawRows.map((r) => ({
      import_id: importRow.id,
      raw_name: r.raw_name,
      attendance_date: r.attendance_date,
      first_punch: r.first_punch,
      last_punch: r.last_punch,
      petpooja_status: r.petpooja_status,
      petpooja_emp_code: r.petpooja_emp_code,
    }));
    // Chunked insert
    for (let i = 0; i < rawInsert.length; i += 500) {
      const slice = rawInsert.slice(i, i + 500);
      const { error: rowErr } = await supabase.from("attendance_raw_rows").insert(slice);
      if (rowErr) return { error: rowErr.message };
    }

    // Load reference data
    const [{ data: employees }, { data: holidays }, { data: vacations }, { data: leaves }] = await Promise.all([
      supabase.from("employees").select("id, name_petpooja, display_name, reporting_minutes, is_active"),
      supabase.from("holidays").select("id, date, name, is_mandatory"),
      supabase.from("vacations").select("id, start_date, end_date, name"),
      supabase.from("leave_applications")
        .select("id, employee_id, leave_type, start_date, end_date, status")
        .eq("status", "Approved"),
    ]);

    // Run reconciliation
    const out = reconcile({
      rawRows,
      employees: employees ?? [],
      holidays: holidays ?? [],
      vacations: vacations ?? [],
      leaveApplications: (leaves ?? []) as LeaveApplication[],
    });

    // Wipe prior reconciliation for this month, then bulk insert
    await supabase.from("reconciled_attendance").delete().eq("month", monthDate);
    const reconInsert = out.reconciledDays
      .filter((d) => d.employee_id)
      .map((d) => ({
        month: monthDate,
        employee_id: d.employee_id,
        attendance_date: d.attendance_date,
        day_of_week: d.day_of_week,
        scheduled_minutes: d.scheduled_minutes,
        punch_in_minutes: d.punch_in_minutes,
        punch_out_minutes: d.punch_out_minutes,
        late_minutes: d.late_minutes,
        is_late_strike: d.is_late_strike,
        status: mapStatusToEnum(d.status),
        matched_leave_id: d.matched_leave_id,
        matched_holiday_id: d.matched_holiday_id,
        matched_vacation_id: d.matched_vacation_id,
        notes: d.notes,
      }));
    for (let i = 0; i < reconInsert.length; i += 500) {
      const { error: rErr } = await supabase.from("reconciled_attendance").insert(reconInsert.slice(i, i + 500));
      if (rErr) return { error: rErr.message };
    }

    // Insert anomalies (replace this month's open ones)
    await supabase.from("anomalies").delete().eq("month", monthDate).eq("status", "open");
    if (out.anomalies.length > 0) {
      const anomInsert = out.anomalies.map((a) => ({
        month: monthDate,
        kind: a.kind,
        employee_id: a.employee_id,
        description: a.description,
      }));
      await supabase.from("anomalies").insert(anomInsert);
    }

    revalidatePath("/attendance");
    revalidatePath("/anomalies");
    revalidatePath("/dashboard");

    return {
      rows: rawRows.length,
      anomalies: out.anomalies.length,
      summaries: out.summaries.length,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function nilOrString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "-") return null;
  return s;
}

function normalizeDate(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  // Try DD-MM-YYYY, YYYY-MM-DD, etc.
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return ymd[0];
  // Excel date number
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}

function mapStatusToEnum(s: string): string {
  // The DB enum uses the same names — we rely on TypeScript-time agreement.
  return s;
}
