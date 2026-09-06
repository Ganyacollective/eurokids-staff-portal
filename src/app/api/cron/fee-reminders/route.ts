import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderEmail, moneyH, money, day, plainFooter, esc, SCHOOL_NAME } from "@/lib/brand-email";
import { addressesFor, type ScheduleRow } from "@/lib/recipients";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || `${SCHOOL_NAME} <admin@eurokidsjmdenclave.org>`;
const CC = "admin@eurokidsjmdenclave.org";
const CRON_SECRET = process.env.CRON_SECRET;

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// GET /api/cron/fee-reminders            — Vercel cron, daily
// GET /api/cron/fee-reminders?dry=1      — what WOULD go today, nothing sent
// GET /api/cron/fee-reminders?dry=1&on=2026-09-05   — simulate another day
//
// The ladder is relative to each unpaid instalment's due date: a step of -15
// means "15 days before", +3 means "3 days after". A family gets a given step
// for a given instalment exactly once, whatever happens to the schedule.
// Anyone with nothing owing is never contacted — the balance used is our true
// position, after discount and after cash we hold.

type Step = { offset: number; title: string; opening: (r: ScheduleRow) => string; theme: "school" | "notice" };

const STEP_COPY = (offset: number): Step => {
  if (offset < 0) return {
    offset, theme: "school",
    title: "A gentle reminder — fees due soon",
    opening: (r) => `This is a friendly reminder that the next instalment of fees for <strong>${esc(r.student_name)}</strong> falls due on <strong>${day(r.next_due_date)}</strong> — ${Math.abs(offset)} days from now.`,
  };
  if (offset === 0) return {
    offset, theme: "notice",
    title: "Fees due today",
    opening: (r) => `The next instalment of fees for <strong>${esc(r.student_name)}</strong> is due <strong>today</strong>, ${day(r.next_due_date)}.`,
  };
  return {
    offset, theme: "notice",
    title: "Fees overdue — please pay at your earliest",
    opening: (r) => `The instalment of fees for <strong>${esc(r.student_name)}</strong> that was due on <strong>${day(r.next_due_date)}</strong> is now ${offset} days overdue. If you have already paid, please ignore this note — payments made in cash or by UPI at the school can take a few days to reflect.`,
  };
};

function feeBlock(r: ScheduleRow) {
  const line = (k: string, v: string) =>
    `<tr><td style="padding:6px 0;color:#4B5563">${k}</td><td style="padding:6px 0;text-align:right">${v}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
    ${line("Fee for the year", moneyH(r.agreed_fee || r.final_fee || 0))}
    ${Number(r.our_discount || 0) > 0 ? line("Special discount", `<span style="color:#15803D">− ${moneyH(r.our_discount)}</span>`) : ""}
    ${line("Received so far", `<span style="color:#15803D">− ${moneyH(r.paid_so_far || 0)}</span>`)}
    <tr><td style="padding:10px 0;border-top:2px solid #1A202C;font-weight:700">Balance outstanding</td>
        <td style="padding:10px 0;border-top:2px solid #1A202C;text-align:right;font-weight:700;font-size:16px">${moneyH(r.true_due)}</td></tr>
    ${r.next_amount ? `<tr><td colspan="2" style="padding-top:8px;color:#4B5563;font-size:13px">This instalment: <strong>${moneyH(r.next_amount)}</strong> due ${day(r.next_due_date)}</td></tr>` : ""}
  </table>
  <p style="font-size:13px;color:#4B5563">You may pay through the EuroKids payment link, by card at the school, or in cash or UPI at the front desk. Please quote <strong>${esc(r.student_name)}</strong> when you do.</p>`;
}

export async function GET(req: NextRequest) {
  // Vercel sends the secret; a browser with the same secret can dry-run.
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("key") || "";
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const onParam = req.nextUrl.searchParams.get("on");
  // "today" in India, not UTC — the cron may fire either side of midnight
  const todayIST = onParam || new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: settings } = await admin.schema("eurokids").from("reminder_settings").select("*").eq("id", true).maybeSingle();
  if (!settings) return NextResponse.json({ ok: false, error: "No reminder settings row." }, { status: 500 });
  if (!settings.enabled && !dry) {
    return NextResponse.json({ ok: true, skipped: "Reminders are switched off.", on: todayIST });
  }
  const steps: number[] = (settings.steps || []).map(Number);

  const { data: rows, error } = await admin.schema("eurokids").from("v_schedule").select("*").limit(2000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data: already } = await admin.schema("eurokids").from("reminder_log").select("uin,due_date,step");
  const done = new Set((already || []).map((l) => `${l.uin}|${l.due_date}|${l.step}`));

  // Which families are hit today? For each unpaid instalment, today == due + step.
  const addDays = (iso: string, n: number) => {
    const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
  };
  const candidates: { r: ScheduleRow; step: number }[] = [];
  for (const r of (rows || []) as ScheduleRow[]) {
    if (Number(r.true_due || 0) <= 1) continue;          // nothing owed — never chase
    if (!r.next_due_date) continue;                      // no schedule → coordinator's job, not the parent's
    for (const step of steps) {
      if (addDays(r.next_due_date, step) !== todayIST) continue;
      if (done.has(`${r.uin}|${r.next_due_date}|${step}`)) continue;
      candidates.push({ r, step });
    }
  }

  const plan = candidates.map(({ r, step }) => ({
    child: r.student_name, class: r.program_name, step, due: r.next_due_date,
    amount_due: Number(r.true_due || 0), to: addressesFor(r),
  }));
  if (dry) return NextResponse.json({ ok: true, dry: true, on: todayIST, enabled: settings.enabled, steps, would_send: plan.length, plan });

  if (!RESEND_API_KEY) return NextResponse.json({ ok: false, error: "RESEND_API_KEY missing" }, { status: 500 });

  const results: { child: string; step: number; result: string }[] = [];
  for (const { r, step } of candidates) {
    const to = addressesFor(r);
    const copy = STEP_COPY(step);
    let result = "";
    if (!to.length) {
      result = "skipped: no parent email";
    } else {
      const html = renderEmail({
        title: copy.title,
        subtitle: `${r.student_name}${r.program_name ? " · " + r.program_name : ""}`,
        theme: copy.theme,
        bodyHtml: `<p>Dear Parent,</p><p>${copy.opening(r)}</p>${feeBlock(r)}<p>Thank you for your continued support.</p>`,
      });
      const text = [copy.title, "", "Dear Parent,", "",
        copy.opening(r).replace(/<[^>]+>/g, ""), "",
        `Balance outstanding: ${money(r.true_due)}`,
        ...(r.next_amount ? [`This instalment: ${money(r.next_amount)} due ${day(r.next_due_date)}`] : []),
        plainFooter()].join("\n");
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Idempotency-Key": `reminder-${r.uin}-${r.next_due_date}-${step}`,
          },
          body: JSON.stringify({
            from: RESEND_FROM, to, ...(settings.cc_office ? { cc: [CC] } : {}),
            subject: `${copy.title} — ${r.student_name} | ${SCHOOL_NAME}`, html, text,
          }),
        });
        result = res.ok ? "sent" : `failed: Resend ${res.status} ${(await res.text()).slice(0, 120)}`;
      } catch (e) {
        result = "failed: " + (e as Error).message;
      }
      await new Promise((s) => setTimeout(s, 550));
    }
    // Log every outcome, including skips, so the same step is never retried
    // into a family's inbox twice.
    await admin.schema("eurokids").from("reminder_log").upsert({
      uin: r.uin, due_date: r.next_due_date, step, sent_to: to,
      amount_due: Number(r.true_due || 0), result,
    }, { onConflict: "uin,due_date,step", ignoreDuplicates: true });
    results.push({ child: r.student_name, step, result });
  }

  return NextResponse.json({
    ok: true, on: todayIST, steps,
    sent: results.filter((x) => x.result === "sent").length,
    skipped: results.filter((x) => x.result.startsWith("skipped")).length,
    failed: results.filter((x) => x.result.startsWith("failed")).length,
    results,
  });
}
