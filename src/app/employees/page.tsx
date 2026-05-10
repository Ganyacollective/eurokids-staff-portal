import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Plus } from "lucide-react";
import { minutesToTime, inr } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const supabase = await createServerClient();
  const { data: employees, error } = await supabase
    .from("employees")
    .select("*")
    .order("is_active", { ascending: false })
    .order("display_name");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-eurokids-ink">Employees</h1>
          <p className="text-sm text-gray-500 mt-1">
            The single source of truth for staff names, schedules, and pay rates.
          </p>
        </div>
        <Link
          href="/employees/new"
          className="inline-flex items-center gap-2 bg-eurokids-orange hover:bg-eurokids-orange/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} /> Add employee
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
          {error.message}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Department</th>
              <th className="px-4 py-3 font-semibold">Designation</th>
              <th className="px-4 py-3 font-semibold">Reporting</th>
              <th className="px-4 py-3 font-semibold text-right">Salary</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(employees ?? []).map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/employees/${e.id}`} className="text-eurokids-ink font-medium hover:text-eurokids-blue">
                    {e.display_name}
                  </Link>
                  {e.display_name !== e.name_petpooja.trim() && (
                    <div className="text-xs text-gray-400">PetPooja: &ldquo;{e.name_petpooja}&rdquo;</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{e.department}</td>
                <td className="px-4 py-3 text-gray-600">{e.designation}</td>
                <td className="px-4 py-3 text-gray-600">{minutesToTime(e.reporting_minutes)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{inr(e.monthly_salary)}</td>
                <td className="px-4 py-3">
                  <span className={
                    e.is_active
                      ? "inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium"
                      : "inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium"
                  }>
                    {e.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
            {(!employees || employees.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  No employees yet. Add your first one to begin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
