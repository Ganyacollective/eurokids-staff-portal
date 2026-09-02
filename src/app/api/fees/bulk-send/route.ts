import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  renderEmail, textToHtml, moneyH, money, day, plainFooter, esc,
  SCHOOL_NAME, type ThemeKey,
} from "@/lib/brand-email";
import { applyFilters, addressesFor, summarise, type Filters, type ScheduleRow } from "@/lib/recipients";
import { loadSchedule, bearer } from "../recipients/route";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || `${SCHOOL_NAME} <admin@eurokidsjmdenclave.org>`;
const CC = "admin@eurokidsjmdenclave.org";

export const maxDuration = 300;

type Attachment = { filename: string; content: string };  // content = base64

// Merge fields the office can drop into the message body.
function merge(text: string, r: ScheduleRow) {
  const first = (r.student_name || "").split(" ")[0];
  const map: Record<string, string> = {
    "{{child}}": r.student_name || "",
    "{{first_name}}": first,
    "{{class}}": r.program_name || "",
    "{{batch}}": r.batch || "",
    "{{amount_due}}": money(r.true_due),
    "{{next_amount}}": money(r.next_amount),
    "{{due_date}}": day(r.next_due_date),
    "{{father}}": r.father_name || "",
  };
  return Object.entries(map).reduce((s, [k, v]) => s.split(k).join(v), String(text || ""));
}

// An optional per-child fee block appended under the message.
function feeBlock(r: ScheduleRow) {
  const owed = Number(r.true_due || 0);
  if (owed <= 1) {
    return `<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px">
      <tr><td style="padding:14px 16px">
        <div style="font-weight:700;color:#15803D">All fees received — thank you</div>
        <div style="color:#166534;font-size:13px;margin-top:2px">Balance outstanding: <strong>${moneyH(0)}</strong></div>
      </td></tr></table>`;
  }
  const rows = [
    ["Fee for the year", moneyH(r.final_fee || r.total_fee || 0)],
    ...(Number(r.our_discount || 0) > 0 ? [["Special discount", "− " + moneyH(r.our_discount)]] : []),
    ["Received so far", "− " + moneyH(Number(r.collected || 0) + Number(r.uncredited_cash || 0))],
  ];
  return `<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
    ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#4B5563">${k}</td><td style="padding:6px 0;text-align:right">${v}</td></tr>`).join("")}
    <tr><td style="padding:10px 0;border-top:2px solid #1A202C;font-weight:700">Amount now due</td>
        <td style="padding:10px 0;border-top:2px solid #1A202C;text-align:right;font-weight:700;font-size:16px">${moneyH(r.true_due)}</td></tr>
    ${r.next_due_date ? `<tr><td colspan="2" style="padding-top:8px;color:#4B5563;font-size:13px">Due on <strong>${day(r.next_due_date)}</strong></td></tr>` : ""}
  </table>`;
}

// POST /api/fees/bulk-send
export async function POST(req: NextRequest) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  if (!RESEND_API_KEY) return NextResponse.json({ error: "RESEND_API_KEY is not configured in Vercel." }, { status: 400 });

  let body: {
    filters?: Filters; subject?: string; message?: string;
    theme?: ThemeKey; title?: string; includeFees?: boolean;
    attachments?: Attachment[]; ccOffice?: boolean;
    testTo?: string;          // send one copy here instead of to parents
    confirm?: boolean;        // must be true to actually send
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const subject = (body.subject || "").trim();
  const message = (body.message || "").trim();
  if (!subject) return NextResponse.json({ error: "Please give the email a subject." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Please write a message." }, { status: 400 });

  let rows: ScheduleRow[];
  try { rows = await loadSchedule(token); }
  catch (e) { return NextResponse.json({ error: "Could not read fee data: " + (e as Error).message }, { status: 403 }); }

  const matched = applyFilters(rows, body.filters || {});
  const sum = summarise(matched);

  const attachments = (body.attachments || [])
    .filter((a) => a && a.filename && a.content)
    .map((a) => ({ filename: a.filename, content: a.content }));

  const build = (r: ScheduleRow) => {
    const bodyHtml = textToHtml(merge(message, r)) + (body.includeFees ? feeBlock(r) : "");
    return {
      html: renderEmail({
        title: merge(body.title || subject, r),
        subtitle: `${r.student_name}${r.program_name ? " · " + r.program_name : ""}`,
        bodyHtml, theme: body.theme,
      }),
      text: [merge(message, r), ...(body.includeFees && Number(r.true_due || 0) > 1
        ? ["", `Amount now due: ${money(r.true_due)}`,
           ...(r.next_due_date ? [`Due on: ${day(r.next_due_date)}`] : [])] : []),
        plainFooter()].join("\n"),
    };
  };

  // ── test send ─────────────────────────────────────────────────────────────
  if (body.testTo) {
    const sample = matched[0] || rows[0];
    if (!sample) return NextResponse.json({ error: "No children matched, so there is nothing to preview." }, { status: 400 });
    const { html, text } = build(sample);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: RESEND_FROM, to: [body.testTo],
        subject: `[TEST — would go to ${sum.reachable} families] ` + merge(subject, sample),
        html, text, attachments,
      }),
    });
    if (!r.ok) return NextResponse.json({ error: `Resend ${r.status}: ${(await r.text()).slice(0, 300)}` }, { status: 500 });
    return NextResponse.json({ ok: true, mode: "test", sent_to: body.testTo, sample: sample.student_name, summary: sum });
  }

  // ── dry run is the default; sending needs an explicit confirm ─────────────
  if (!body.confirm) {
    const sample = matched[0];
    return NextResponse.json({
      ok: true, mode: "preview", summary: sum,
      preview_html: sample ? build(sample).html : null,
      preview_for: sample?.student_name || null,
    });
  }

  if (!sum.reachable) return NextResponse.json({ error: "Nobody in this selection has an email address on file." }, { status: 400 });

  // ── send ──────────────────────────────────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const sent: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const r of matched) {
    const to = addressesFor(r);
    if (!to.length) continue;
    const { html, text } = build(r);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: RESEND_FROM, to,
          ...(body.ccOffice === false ? {} : { cc: [CC] }),
          subject: merge(subject, r), html, text, attachments,
        }),
      });
      if (res.ok) sent.push(r.uin);
      else failed.push({ name: r.student_name, error: `Resend ${res.status}: ${(await res.text()).slice(0, 160)}` });
    } catch (e) {
      failed.push({ name: r.student_name, error: (e as Error).message });
    }
    await new Promise((s) => setTimeout(s, 120));   // stay under Resend's rate limit
  }

  // Keep a record of what went out, so nobody has to guess later.
  await admin.schema("eurokids").from("email_log").insert({
    subject, theme: body.theme || "school",
    filters: body.filters || {},
    recipients: sent.length, failures: failed.length,
    detail: { failed: failed.slice(0, 50), summary: sum },
  }).then(() => {}, () => {});   // logging must never block a send

  return NextResponse.json({
    ok: true, mode: "sent", sent: sent.length, failed: failed.length,
    failures: failed.slice(0, 30), summary: sum,
  });
}
