import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderEmail, moneyH, money, day, plainFooter, esc, SCHOOL_NAME } from "@/lib/brand-email";
import { loadSchedule, bearer, userClient } from "@/lib/fee-data";
import { addressesFor, isRealAddress, type ScheduleRow } from "@/lib/recipients";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || `${SCHOOL_NAME} <admin@eurokidsjmdenclave.org>`;
const CC = "admin@eurokidsjmdenclave.org";

// POST /api/fees/payment-receipt  { receipt_id, preview? }
//
// Acknowledges money the school has physically taken. This matters most for
// cash: EPMS will not know about it for days, so without this the parent gets
// chased for money they have already handed over. The balance quoted here is
// our true position, never EPMS's.
export async function POST(req: NextRequest) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });

  let body: { receipt_id?: number | string; preview?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const receiptId = Number(body.receipt_id);
  if (!receiptId) return NextResponse.json({ error: "receipt_id required" }, { status: 400 });
  if (!body.preview && !RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not configured in Vercel." }, { status: 400 });
  }

  // Read the receipt as the caller first, so row-level security decides whether
  // they may see it. Reading with the service role up front let any signed-in
  // account email a receipt for a payer who has no child attached.
  const { data: allowed, error: gateErr } = await userClient(token)
    .from("receipt_offline").select("id").eq("id", receiptId).maybeSingle();
  if (gateErr || !allowed) {
    return NextResponse.json({ error: "You do not have access to this receipt." }, { status: 403 });
  }

  const a = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: r } = await a.schema("eurokids").from("receipt_offline")
    .select("*").eq("id", receiptId).maybeSingle();
  if (!r) return NextResponse.json({ error: "Receipt not found." }, { status: 404 });

  // A receipt may belong to someone who is not on the school roll at all —
  // a day-care family, say. They still get a receipt, just without any fee
  // position attached, because they never had a EuroKids balance.
  let child: ScheduleRow | undefined;
  if (r.uin) {
    let rows: ScheduleRow[];
    try { rows = await loadSchedule(token); }
    catch (e) { return NextResponse.json({ error: "Could not read fee data: " + (e as Error).message }, { status: 403 }); }
    child = rows.find((c) => c.uin === r.uin);
    if (!child) return NextResponse.json({ error: "Child not found for this receipt." }, { status: 404 });
  }

  const payerName = child?.student_name || r.student_name || "";
  const to = child
    ? addressesFor(child)
    : [(r.payer_email || "").trim().toLowerCase()].filter((e) => isRealAddress(e));
  if (!to.length && !body.preview) {
    return NextResponse.json({
      error: r.uin
        ? "No usable parent email on file for this child."
        : "No email address was recorded for this payer, so there is nowhere to send the receipt.",
    }, { status: 400 });
  }

  const isFee = r.purpose === "tuition" && !!child;
  const what = isFee ? "school fees" : (r.purpose_note?.trim() || "school collections");
  const owed = Number(child?.true_due || 0);

  const line = (k: string, v: string) =>
    `<tr><td style="padding:7px 0;color:#4B5563">${k}</td><td style="padding:7px 0;text-align:right">${v}</td></tr>`;

  const balanceBlock = !isFee ? "" : owed <= 1
    ? `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px 16px;margin:18px 0">
         <div style="font-weight:700;color:#15803D">All fees are now settled — thank you.</div>
         <div style="color:#166534;font-size:13px;margin-top:2px">Balance outstanding: <strong>${moneyH(0)}</strong></div>
       </div>`
    : `<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
         ${line("Annual fee", moneyH(child!.final_fee || child!.total_fee || 0))}
         ${Number(child!.our_discount || 0) > 0 ? line("Concession", `<span style="color:#15803D">− ${moneyH(child!.our_discount)}</span>`) : ""}
         ${line("Received to date", `<span style="color:#15803D">− ${moneyH(Number(child!.collected || 0) + Number(child!.uncredited_cash || 0))}</span>`)}
         <tr><td style="padding:10px 0;border-top:2px solid #1A202C;font-weight:700">Balance remaining</td>
             <td style="padding:10px 0;border-top:2px solid #1A202C;text-align:right;font-weight:700;font-size:16px">${moneyH(owed)}</td></tr>
         ${child!.next_due_date ? `<tr><td colspan="2" style="padding-top:8px;color:#4B5563;font-size:13px">Next instalment due <strong>${day(child!.next_due_date)}</strong></td></tr>` : ""}
       </table>`;

  const bodyHtml = `
    <p>Dear Parent,</p>
    <p>Thank you. We have received your payment towards ${esc(what)} for <strong>${esc(payerName)}</strong>.</p>
    <div style="background:#F3F6FB;border:1px solid #DCE5F2;border-radius:10px;padding:16px 18px;margin:18px 0">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6B7280;font-weight:700">Amount received</div>
      <div style="font-size:26px;font-weight:800;color:#21409A;margin:4px 0 10px">${moneyH(r.amount_rupees)}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13.5px">
        <tr><td style="padding:3px 0;color:#4B5563">Received on</td><td style="text-align:right">${day(r.received_on)}</td></tr>
        <tr><td style="padding:3px 0;color:#4B5563">Mode</td><td style="text-align:right">${esc(r.mode)}</td></tr>
        <tr><td style="padding:3px 0;color:#4B5563">Towards</td><td style="text-align:right">${esc(isFee ? "School fees" : what)}</td></tr>
        <tr><td style="padding:3px 0;color:#4B5563">Receipt no.</td><td style="text-align:right">EK-${String(r.id).padStart(5, "0")}</td></tr>
      </table>
    </div>
    ${balanceBlock}
    ${isFee ? `<p style="font-size:13px;color:#4B5563">If you have paid in cash or by UPI at the school, please note it can take a few days to appear on the official EuroKids statement. This receipt is your confirmation in the meantime, and your balance above already accounts for it.</p>` : ""}
    <p>Please retain this email as your record of payment.</p>`;

  const html = renderEmail({
    title: "Payment received — thank you",
    subtitle: `${payerName}${child?.program_name ? " · " + child.program_name : ""}`,
    theme: "calm",
    bodyHtml,
  });

  const text = [
    "Payment received — thank you", "",
    `Dear Parent,`, "",
    `We have received your payment towards ${what} for ${payerName}.`, "",
    `Amount received: ${money(r.amount_rupees)}`,
    `Received on:     ${day(r.received_on)}`,
    `Mode:            ${r.mode}`,
    `Receipt no.:     EK-${String(r.id).padStart(5, "0")}`,
    ...(isFee ? ["", owed <= 1 ? "All fees are now settled — thank you."
                               : `Balance remaining: ${money(owed)}`,
                 ...(child?.next_due_date && owed > 1 ? [`Next instalment due ${day(child.next_due_date)}`] : []),
                 "", "Cash and UPI payments made at the school can take a few days to appear on the official EuroKids statement. Your balance above already accounts for this payment."] : []),
    plainFooter(),
  ].join("\n");

  if (body.preview) return NextResponse.json({ ok: true, preview_html: html, to });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: RESEND_FROM, to, cc: [CC],
      subject: `Payment received — ${money(r.amount_rupees)} for ${payerName} | ${SCHOOL_NAME}`,
      text, html,
    }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Resend ${res.status}: ${(await res.text()).slice(0, 220)}` }, { status: 500 });
  }

  await a.schema("eurokids").from("receipt_offline")
    .update({ receipt_sent_at: new Date().toISOString() }).eq("id", receiptId);

  return NextResponse.json({ ok: true, sent_to: to, cc: CC, amount: Number(r.amount_rupees) });
}
