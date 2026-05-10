import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  missing_schedule: "Missing schedule",
  zero_punches: "Zero punches",
  name_mismatch: "Name mismatch",
  punch_on_holiday: "Punch on holiday",
  forgot_punch: "Forgot punch",
  excess_late_strikes: "Excess late strikes",
  unmatched_leave_application: "Unmatched leave application",
  sandwich_violation: "Sandwich rule violation",
};

export default async function AnomaliesPage() {
  const supabase = await createServerClient();
  const { data: rows } = await supabase
    .from("anomalies")
    .select("*, employees(display_name)")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-eurokids-ink mb-1">Anomalies</h1>
      <p className="text-sm text-gray-500 mb-8">
        Flagged issues that need a human decision before salary lock.
      </p>

      {(rows ?? []).length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500">
          No open anomalies. Once you import an attendance month, anything ambiguous lands here.
        </div>
      ) : (
        <div className="space-y-3">
          {rows!.map((r) => (
            <div key={r.id} className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                      {KIND_LABELS[r.kind] ?? r.kind}
                    </span>
                    {r.employees?.display_name && (
                      <span className="text-sm font-medium text-eurokids-ink">{r.employees.display_name}</span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(r.month).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{r.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
