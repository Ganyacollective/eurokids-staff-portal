import { createServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HolidaysPage() {
  const supabase = await createServerClient();
  const [{ data: holidays }, { data: vacations }] = await Promise.all([
    supabase.from("holidays").select("*").order("date"),
    supabase.from("vacations").select("*").order("start_date"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-eurokids-ink mb-1">Holidays & Vacations</h1>
      <p className="text-sm text-gray-500 mb-8">
        Seeded for AY 2026-27. CRUD coming in the next iteration.
      </p>

      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-8">
        <header className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-eurokids-ink">Holidays ({holidays?.length ?? 0})</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Date</th>
              <th className="px-4 py-2 text-left font-semibold">Holiday</th>
              <th className="px-4 py-2 text-left font-semibold">Type</th>
              <th className="px-4 py-2 text-left font-semibold">AY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(holidays ?? []).map((h) => (
              <tr key={h.id}>
                <td className="px-4 py-2 text-gray-600">{formatDate(h.date)}</td>
                <td className="px-4 py-2 font-medium text-eurokids-ink">{h.name}</td>
                <td className="px-4 py-2">
                  {h.is_mandatory ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-eurokids-orange/10 text-eurokids-orange font-medium">Mandatory</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">Optional</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-500">{h.academic_year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-eurokids-ink">Vacation blocks ({vacations?.length ?? 0})</h2>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">From</th>
              <th className="px-4 py-2 text-left font-semibold">To</th>
              <th className="px-4 py-2 text-left font-semibold">Description</th>
              <th className="px-4 py-2 text-left font-semibold">AY</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(vacations ?? []).map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-2 text-gray-600">{formatDate(v.start_date)}</td>
                <td className="px-4 py-2 text-gray-600">{formatDate(v.end_date)}</td>
                <td className="px-4 py-2 font-medium text-eurokids-ink">{v.name}</td>
                <td className="px-4 py-2 text-gray-500">{v.academic_year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
