import { NextRequest, NextResponse } from "next/server";
import { loadSchedule, bearer } from "@/lib/fee-data";
import { addressesFor, type ScheduleRow } from "@/lib/recipients";

// POST /api/fees/reminder-preview  { on: 'YYYY-MM-DD', steps: number[] }
// Exactly the selection the nightly cron would make on that date, for the
// signed-in user, without sending anything. Shares the cron's rules so the
// preview cannot drift from the real thing.
export async function POST(req: NextRequest) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });

  let body: { on?: string; steps?: number[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const on = (body.on || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) return NextResponse.json({ error: "on must be YYYY-MM-DD" }, { status: 400 });
  const steps = (body.steps || []).map(Number).filter((n) => Number.isFinite(n));

  let rows: ScheduleRow[];
  try { rows = await loadSchedule(token); }
  catch (e) { return NextResponse.json({ error: "Could not read fee data: " + (e as Error).message }, { status: 403 }); }

  const addDays = (iso: string, n: number) => {
    const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
  };
  const plan: { child: string; class: string | null; step: number; due: string; amount_due: number; to: string[] }[] = [];
  for (const r of rows) {
    if (Number(r.true_due || 0) <= 1 || !r.next_due_date) continue;
    for (const step of steps) {
      if (addDays(r.next_due_date, step) !== on) continue;
      plan.push({ child: r.student_name, class: r.program_name, step, due: r.next_due_date,
        amount_due: Number(r.true_due || 0), to: addressesFor(r) });
    }
  }
  plan.sort((a, b) => a.step - b.step || a.child.localeCompare(b.child));
  return NextResponse.json({ ok: true, on, steps, would_send: plan.length, plan });
}
