// Nightly: keep the UIN → EPMS admission id phone book current, so a child
// admitted today can be sent a payment link tomorrow without anyone knowing
// this step exists.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { harvestAdmissionIds } from "@/lib/epms-admissions";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no" }, { status: 401 });
  }
  if (!process.env.EPMS_USER) return NextResponse.json({ ok: true, skipped: "EPMS_USER not set" });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { harvested } = await harvestAdmissionIds(admin);
    return NextResponse.json({ ok: true, harvested });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
