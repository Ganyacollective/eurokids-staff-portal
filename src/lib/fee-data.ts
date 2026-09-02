import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ScheduleRow } from "@/lib/recipients";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// These live in lib rather than beside the route because a Next.js route file
// is only allowed to export route handlers — anything else fails the build.

export function bearer(req: NextRequest): string | null {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// Read fee data as the signed-in user, not as service role, so the finance
// gate on eurokids.v_schedule is what decides who may see it.
export function userClient(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
    db: { schema: "eurokids" },
  });
}

export async function loadSchedule(token: string): Promise<ScheduleRow[]> {
  const { data, error } = await userClient(token).from("v_schedule").select("*").limit(2000);
  if (error) throw new Error(error.message);
  return (data || []) as ScheduleRow[];
}
