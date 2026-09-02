import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { applyFilters, summarise, addressesFor, type Filters, type ScheduleRow } from "@/lib/recipients";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Read eurokids.v_schedule as the signed-in user, not as service role, so the
// finance gate on the view is the thing deciding who may see fee data.
export function userClient(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
    db: { schema: "eurokids" },
  });
}

export function bearer(req: NextRequest): string | null {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function loadSchedule(token: string): Promise<ScheduleRow[]> {
  const sb = userClient(token);
  const { data, error } = await sb.from("v_schedule").select("*").limit(2000);
  if (error) throw new Error(error.message);
  return (data || []) as ScheduleRow[];
}

// POST /api/fees/recipients  { filters }
// Returns who this send would reach — always shown before anything is sent.
export async function POST(req: NextRequest) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });

  let body: { filters?: Filters };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  let rows: ScheduleRow[];
  try { rows = await loadSchedule(token); }
  catch (e) { return NextResponse.json({ error: "Could not read fee data: " + (e as Error).message }, { status: 403 }); }

  const matched = applyFilters(rows, body.filters || {});

  // Facets so the compose screen can offer real options rather than guesses
  const facet = (key: keyof ScheduleRow) => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      const v = String(r[key] ?? "").trim();
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
  };

  return NextResponse.json({
    ok: true,
    summary: summarise(matched),
    facets: { classes: facet("program_name"), batches: facet("batch") },
    flags: rows.reduce((acc: Record<string, number>, r) => {
      acc[r.schedule_flag] = (acc[r.schedule_flag] || 0) + 1; return acc;
    }, {}),
    recipients: matched.slice(0, 400).map((r) => ({
      uin: r.uin,
      name: r.student_name,
      program: r.program_name,
      batch: r.batch,
      emails: addressesFor(r),
      true_due: Number(r.true_due || 0),
      next_due_date: r.next_due_date,
      next_amount: r.next_amount,
      flag: r.schedule_flag,
      days_overdue: r.days_overdue,
    })),
  });
}
