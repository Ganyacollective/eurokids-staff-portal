import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createServerClient();

  const [
    { count: employeeCount },
    { count: pendingLeaves },
    { count: openAnomalies },
    { data: latestSalary },
  ] = await Promise.all([
    supabase.from("employees").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("leave_applications").select("*", { count: "exact", head: true }).eq("status", "Pending"),
    supabase.from("anomalies").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("salary_sheets").select("month, total_net, is_locked").order("month", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-eurokids-ink mb-1">Overview</h1>
      <p className="text-sm text-gray-500 mb-8">A snapshot of the staff portal as of right now.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Stat label="Active employees" value={employeeCount ?? 0} href="/employees" />
        <Stat label="Pending leave requests" value={pendingLeaves ?? 0} href="/anomalies" />
        <Stat label="Open anomalies" value={openAnomalies ?? 0} href="/anomalies" />
      </div>

      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Last salary sheet</h2>
        {latestSalary ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-medium text-eurokids-ink">
                {new Date(latestSalary.month).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
              </div>
              <div className="text-sm text-gray-500">
                Total disbursed: ₹{latestSalary.total_net?.toLocaleString("en-IN") ?? "—"}
                {latestSalary.is_locked ? " · Locked" : " · Draft"}
              </div>
            </div>
            <Link href="/salary" className="text-sm text-eurokids-blue hover:underline">View →</Link>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            No salary sheets yet. Once you import an attendance file, you can generate one.
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-eurokids-blue/50 transition-colors block"
    >
      <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</div>
      <div className="text-3xl font-semibold text-eurokids-ink mt-2">{value}</div>
    </Link>
  );
}
