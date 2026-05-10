import Link from "next/link";
import { logout } from "../login/actions";
import { createServerClient } from "@/lib/supabase/server";
import {
  LayoutDashboard, Users, CalendarDays, FileSpreadsheet,
  AlertTriangle, Receipt, LogOut,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/holidays", label: "Holidays & Vacations", icon: CalendarDays },
  { href: "/attendance", label: "Attendance Import", icon: FileSpreadsheet },
  { href: "/anomalies", label: "Anomalies", icon: AlertTriangle },
  { href: "/salary", label: "Salary Sheets", icon: Receipt },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user!.id)
    .single();

  return (
    <div className="min-h-screen flex bg-eurokids-paper">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-eurokids-orange flex items-center justify-center text-white font-bold">
              E
            </div>
            <div>
              <div className="text-sm font-semibold text-eurokids-ink">Staff Portal</div>
              <div className="text-xs text-gray-500">JM Enclave</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <Icon size={18} className="text-gray-500" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200 space-y-2">
          <div className="px-3 py-2 text-sm">
            <div className="font-medium text-eurokids-ink">{profile?.full_name}</div>
            <div className="text-xs text-gray-500 capitalize">{profile?.role}</div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <LogOut size={18} className="text-gray-500" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">{children}</div>
      </main>
    </div>
  );
}
