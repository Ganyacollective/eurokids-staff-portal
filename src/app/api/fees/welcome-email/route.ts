import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderEmail, moneyH, money, day, plainFooter, esc, SCHOOL_NAME, statementHtml, statementText, type LedgerLine } from "@/lib/brand-email";
import { loadSchedule, bearer } from "@/lib/fee-data";
import { addressesFor, type ScheduleRow } from "@/lib/recipients";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || `${SCHOOL_NAME} <admin@eurokidsjmdenclave.org>`;
const CC = "admin@eurokidsjmdenclave.org";

type Kind = "welcome" | "schedule" | "receipt" | "statement";

// POST /api/fees/welcome-email  { uin, kind }
//  welcome  — the warm first letter, sent once when a child joins
//  schedule — a plainer re-send of the same terms when a parent asks again
//  receipt  — sent once everything is paid: shows a nil balance, never a due
export async function POST(req: NextRequest) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });

  let body: { uin?: string; kind?: string; preview?: boolean; testTo?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const uin = (body.uin || "").trim();
  if (!uin) return NextResponse.json({ error: "uin required" }, { status: 400 });
  const kind: Kind = body.kind === "schedule" ? "schedule" : body.kind === "receipt" ? "receipt"
                   : body.kind === "statement" ? "statement" : "welcome";
  if (!body.preview && !RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not configured in Vercel." }, { status: 400 });
  }

  let rows: ScheduleRow[];
  try { rows = await loadSchedule(token); }
  catch (e) { return NextResponse.json({ error: "Could not read fee data: " + (e as Error).message }, { status: 403 }); }

  const child = rows.find((r) => r.uin === uin);
  if (!child) return NextResponse.json({ error: "Child not found — run a sync from EPMS first." }, { status: 404 });

  const a = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: items } = await a.schema("eurokids").from("payment_plan_item")
    .select("seq, amount, due_date, label").eq("uin", uin).order("seq");

  if (kind !== "receipt" && kind !== "statement" && !items?.length) {
    return NextResponse.json({
      error: "This child has no payment schedule yet. Add the instalments first — that is the coordinator's job before any letter goes out.",
    }, { status: 400 });
  }

  const to = addressesFor(child);
  if (!to.length && !body.preview) {
    return NextResponse.json({
      error: "No usable parent email on file for this child. Placeholder addresses like na@… are ignored on purpose.",
    }, { status: 400 });
  }

  const finalFee = Number(child.final_fee || child.total_fee || 0);

  // A letter quoting a zero fee is worse than no letter — it tells the parent
  // they owe nothing. Refuse rather than embarrass the school.
  if (finalFee <= 0 && kind !== "receipt" && kind !== "statement") {
    return NextResponse.json({
      error: "This child's fee is still ₹0. Set the agreed fee before sending anything to the parent.",
    }, { status: 400 });
  }
  // "Nothing further is outstanding" must be true. One mis-click on a family
  // owing forty thousand would otherwise tell them their fees are settled.
  if (kind === "receipt" && Number(child.true_due || 0) > 1) {
    return NextResponse.json({
      error: `${child.student_name} still owes ₹${Number(child.true_due).toLocaleString("en-IN")}. A paid-in-full receipt would tell the parent they owe nothing.`,
    }, { status: 400 });
  }

  // The schedule must equal the fee. Too little and the letter under-bills;
  // too much and it bills for money never agreed. Either way the parent gets a
  // letter whose own numbers disagree.
  const scheduled = (items || []).reduce((s, i) => s + Number(i.amount || 0), 0);
  if (kind !== "receipt" && kind !== "statement" && finalFee > 0 && Math.abs(scheduled - finalFee) > 1) {
    const over = scheduled > finalFee;
    return NextResponse.json({
      error: `The instalments add up to ₹${scheduled.toLocaleString("en-IN")} but the agreed fee is ₹${finalFee.toLocaleString("en-IN")} — ${over ? "₹" + (scheduled - finalFee).toLocaleString("en-IN") + " too much" : "₹" + (finalFee - scheduled).toLocaleString("en-IN") + " short"}. Fix the schedule before sending, or the parent receives a letter that contradicts itself.`,
    }, { status: 400 });
  }
  const { data: ledgerRows } = await a.schema("eurokids").from("v_child_ledger")
    .select("on_date,description,mode,amount,counts_to_fees,still_held,source").eq("uin", uin).order("on_date");
  const ledger = (ledgerRows || []) as LedgerLine[];

  const discount = Number(child.our_discount || 0);
  // Everything the family has actually paid us: what EuroKids has recorded plus
  // cash we are holding that has not been posted to them yet.
  const received = Number(child.paid_so_far ?? (Number(child.collected || 0) + Number(child.uncredited_cash || 0)));
  const owed = Number(child.true_due || 0);

  // ── the opening paragraph differs by letter; the rest is shared ───────────
  const opening =
    kind === "welcome" ? `
      <p>Dear Parent,</p>
      <p>We hope this email finds you well.</p>
      <p>We are proud to formally welcome <strong>${esc(child.student_name)}</strong> to ${SCHOOL_NAME} — a community shaped by educators committed to nurturing the thinkers, leaders and creators of tomorrow.</p>
      <p>By enrolling with us, you are now part of the EuroKids family and its legacy of excellence in early childhood education.</p>
      <p>Below is the detailed payment schedule for this academic year. This email serves as an official financial communication from the school. We request you to flag this email and retain it for future reference, as it will be used for all fee-related clarity and correspondence going forward.</p>`
    : kind === "receipt" ? `
      <p>Dear Parent,</p>
      <p>Thank you — the fees for <strong>${esc(child.student_name)}</strong> are fully settled for this academic year. Nothing further is outstanding.</p>
      <p>Please keep this email as your record of payment.</p>`
    : kind === "statement" ? `
      <p>Dear Parent,</p>
      <p>Here is the fee statement for <strong>${esc(child.student_name)}</strong> (${esc(child.program_name)}) for this academic year, showing every payment we have received and what remains.</p>`
    : `
      <p>Dear Parent,</p>
      <p>As requested, here is the payment schedule for <strong>${esc(child.student_name)}</strong> (${esc(child.program_name)}) for this academic year.</p>
      <p>This email serves as an official financial communication from the school; please retain it for your reference.</p>`;

  // ── the money summary ────────────────────────────────────────────────────
  const line = (k: string, v: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#4B5563">${k}</td><td style="padding:6px 0;text-align:right${strong ? ";font-weight:700" : ""}">${v}</td></tr>`;

  const summary = kind === "statement"
    ? statementHtml(child, ledger)
    : kind === "receipt"
    ? `<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
         ${line("Annual fee", moneyH(Number(child.total_fee || finalFee)))}
         ${discount > 0 ? line("Concession", `<span style="color:#15803D">− ${moneyH(discount)}</span>`) : ""}
         ${line("Total received", moneyH(finalFee || received))}
         <tr><td style="padding:10px 0;border-top:2px solid #15803D;font-weight:700;color:#15803D">Balance outstanding</td>
             <td style="padding:10px 0;border-top:2px solid #15803D;text-align:right;font-weight:700;font-size:16px;color:#15803D">${moneyH(0)}</td></tr>
       </table>`
    : `<table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
         ${line("Total fee", moneyH(Number(child.total_fee || finalFee)))}
         ${discount > 0 ? line("Concession", `<span style="color:#15803D">− ${moneyH(discount)}</span>`) : ""}
         <tr><td style="padding:10px 0;border-top:2px solid #1A202C;font-weight:700">Fee payable</td>
             <td style="padding:10px 0;border-top:2px solid #1A202C;text-align:right;font-weight:700;font-size:16px">${moneyH(finalFee)}</td></tr>
         ${received > 0 ? line("Received so far", `<span style="color:#15803D">− ${moneyH(received)}</span>`) : ""}
         ${received > 0 ? `<tr><td style="padding:8px 0;font-weight:700">Balance</td>
             <td style="padding:8px 0;text-align:right;font-weight:700">${moneyH(owed)}</td></tr>` : ""}
       </table>`;

  const rowsHtml = (items || []).map((i) => {
    const label = i.label || `Payment ${i.seq}`;
    return `<tr>
      <td style="padding:9px 12px;border-bottom:1px solid #E5E7EB">${esc(label)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #E5E7EB">${day(i.due_date)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:600">${moneyH(Number(i.amount))}</td>
    </tr>`;
  }).join("");

  const schedule = kind === "receipt" || kind === "statement" || !rowsHtml ? "" : `
    <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6B7280;margin:22px 0 8px">Payment schedule</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
      <thead><tr style="background:#F3F6FB">
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#4B5563">Instalment</th>
        <th style="padding:9px 12px;text-align:left;font-size:12px;color:#4B5563">Due on</th>
        <th style="padding:9px 12px;text-align:right;font-size:12px;color:#4B5563">Amount</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  const terms = (kind === "receipt" || kind === "statement") ? "" : `
    <p style="margin-top:20px">Payments are due within 10 days of the invoice being generated. Late payments attract a late fee, and all fees are non-refundable.</p>
    ${discount > 0 ? `<p style="font-size:13px;background:#FFF9E6;border-left:3px solid #FFC737;padding:10px 14px;border-radius:0 8px 8px 0">Please note: the online fee portal shows the standard fee before this concession. <strong>The amounts in this letter are what apply to you.</strong></p>` : ""}`;

  const html = renderEmail({
    title: kind === "welcome" ? `Welcome to ${SCHOOL_NAME}`
         : kind === "receipt" ? "Fees fully paid — thank you"
         : kind === "statement" ? "Your fee statement"
         : "Your fee payment schedule",
    subtitle: `${child.student_name} · ${child.program_name}`,
    theme: kind === "receipt" ? "calm" : "school",
    footerNote: kind === "statement" ? `Statement as of ${day(new Date().toISOString().slice(0,10))}. Payments made at the school office may take a few days to appear on the online portal; this statement already includes them.` : undefined,
    bodyHtml: opening + summary + schedule + terms,
  });

  const text = kind === "statement" ? [
    "Your fee statement", "", "Dear Parent,", "",
    `Fee statement for ${child.student_name} (${child.program_name}):`, "",
    statementText(child, ledger), plainFooter(),
  ].join("\n") : [
    kind === "welcome" ? `Welcome to ${SCHOOL_NAME}`
      : kind === "receipt" ? "Fees fully paid — thank you" : "Your fee payment schedule", "",
    `Dear Parent,`, "",
    kind === "welcome"
      ? `We are proud to formally welcome ${child.student_name} to ${SCHOOL_NAME} (${child.program_name}). Below is the detailed payment schedule for this academic year.`
      : kind === "receipt"
      ? `Thank you — the fees for ${child.student_name} are fully settled for this academic year. Nothing further is outstanding.`
      : `As requested, here is the payment schedule for ${child.student_name} (${child.program_name}).`, "",
    `Total fee:      ${money(child.total_fee || finalFee)}`,
    ...(discount > 0 ? [`Concession:     − ${money(discount)}`] : []),
    kind === "receipt" ? `Total received: ${money(finalFee || received)}` : `Fee payable:    ${money(finalFee)}`,
    ...(kind === "receipt" ? [`Balance:        ${money(0)}`] : []),
    ...(kind !== "receipt" && received > 0 ? [`Received:       − ${money(received)}`, `Balance:        ${money(owed)}`] : []),
    ...(kind !== "receipt" && items?.length ? ["", "Payment schedule:",
      ...items.map((i) => `  ${i.label || "Payment " + i.seq} — ${day(i.due_date)} — ${money(Number(i.amount))}`)] : []),
    ...(kind !== "receipt" ? ["", "Payments are due within 10 days of the invoice being generated. Late payments attract a late fee, and all fees are non-refundable."] : []),
    plainFooter(),
  ].join("\n");

  if (body.preview) return NextResponse.json({ ok: true, preview_html: html, to });

  const subject =
    kind === "welcome" ? `Welcome to ${SCHOOL_NAME} | Fee Payment Schedule for ${child.student_name}`
    : kind === "receipt" ? `Fees fully paid — thank you | ${child.student_name}`
    : kind === "statement" ? `Fee statement for ${child.student_name} | ${SCHOOL_NAME}`
    : `Fee Payment Schedule for ${child.student_name} | ${SCHOOL_NAME}`;

  // A test goes to one chosen address and nowhere near the parents, so the
  // exact letter can be checked before it is sent for real.
  const isTest = !!(body.testTo || "").trim();
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: isTest ? [body.testTo!.trim()] : to,
      ...(isTest ? {} : { cc: [CC] }),
      subject: isTest ? `[TEST — would go to ${to.join(", ")}] ${subject}` : subject,
      text, html,
    }),
  });
  if (!r.ok) {
    return NextResponse.json({ error: `Resend ${r.status}: ${(await r.text()).slice(0, 220)}` }, { status: 500 });
  }

  if (isTest) {
    return NextResponse.json({ ok: true, kind, test: true, sent_to: [body.testTo!.trim()], would_go_to: to });
  }

  if (kind === "welcome") {
    await a.schema("eurokids").from("payment_plan")
      .update({ welcome_sent_at: new Date().toISOString() }).eq("uin", uin);
  }

  return NextResponse.json({ ok: true, kind, sent_to: to, cc: CC });
}
