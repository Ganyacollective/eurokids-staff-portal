import { NextRequest, NextResponse } from "next/server";
import { applyFilters, summarise, addressesFor, type Filters, type ScheduleRow } from "@/lib/recipients";
import { bearer, loadSchedule } from "@/lib/fee-data";

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
