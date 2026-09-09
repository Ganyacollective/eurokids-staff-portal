// Rebuild the UIN → EPMS admission id phone book.
//
// Normally nobody calls this: it runs nightly, and the payment-link route
// rebuilds on the spot when it meets a child it does not recognise. It stays
// here so the office can force it if EPMS is ever edited behind our back.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { harvestAdmissionIds } from "@/lib/epms-admissions";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who } = await sb.auth.getUser(token);
  if (!who?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: mods } = await admin.from("module_access").select("module")
    .eq("user_id", who.user.id).in("module", ["epms_admin", "finance"]);
  if (!mods?.length && (who.user.email || "").toLowerCase() !== "abhinav@ganya.in") {
    return NextResponse.json({ error: "You do not have permission to do this." }, { status: 403 });
  }

  try {
    const { harvested } = await harvestAdmissionIds(admin);
    const { count } = await admin.schema("epms").from("admission_ids").select("*", { count: "exact", head: true });
    return NextResponse.json({ ok: true, harvested, stored: count });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
