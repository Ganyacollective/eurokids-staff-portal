import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET /api/public/employees
// Returns a minimal roster of active employees — just id + display_name.
// Public (no auth). Used by the "Just apply for a leave" flow on the login screen
// so a teacher can pick their name without signing in.
export async function GET() {
  if (!SERVICE_ROLE) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: portal, error } = await admin.from("portal_state").select("data").eq("id", "main").maybeSingle();
  if (error || !portal) return NextResponse.json({ ok: false, error: "Could not load roster" }, { status: 500 });

  type Emp = { id: string; display_name: string; is_active?: boolean };
  const employees = ((portal.data?.employees as Emp[]) || [])
    .filter((e) => e.is_active !== false)
    .map((e) => ({ id: e.id, display_name: e.display_name }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  return NextResponse.json({ ok: true, employees });
}
