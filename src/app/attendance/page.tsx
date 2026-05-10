import { createServerClient } from "@/lib/supabase/server";
import UploadAttendance from "./UploadAttendance";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const supabase = await createServerClient();
  const { data: imports } = await supabase
    .from("attendance_raw_imports")
    .select("*")
    .order("month", { ascending: false })
    .limit(12);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-eurokids-ink mb-1">Attendance Import</h1>
      <p className="text-sm text-gray-500 mb-8">
        Upload PetPooja&rsquo;s monthly Excel/CSV. The reconciliation engine applies the late-strike,
        Saturday, sandwich, holiday, and leave-application rules automatically.
      </p>

      <UploadAttendance />

      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden mt-8">
        <header className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-eurokids-ink">Recent imports</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Month</th>
              <th className="px-4 py-2 text-left font-semibold">Source</th>
              <th className="px-4 py-2 text-left font-semibold">Rows</th>
              <th className="px-4 py-2 text-left font-semibold">Imported</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(imports ?? []).map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-2 font-medium text-eurokids-ink">
                  {new Date(i.month).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                </td>
                <td className="px-4 py-2 text-gray-600">{i.source}</td>
                <td className="px-4 py-2 text-gray-600">{i.row_count}</td>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(i.imported_at).toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
            {(!imports || imports.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                  No imports yet. Upload your first PetPooja file above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
