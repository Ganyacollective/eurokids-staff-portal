import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "EuroKids JMD Enclave <admin@eurokidsjmdenclave.org>";
const CC = "admin@eurokidsjmdenclave.org";

const money = (n: number) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const day = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-IN",
    { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

// POST /api/fees/welcome-email  { uin }
// Sends the personalised fee-schedule letter to both parent addresses, CC'ing the office.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  const verifier = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: u, error: uErr } = await verifier.auth.getUser(m[1]);
  if (uErr || !u?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  let body: { uin?: string; kind?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const uin = (body.uin || "").trim();
  // 'welcome'  — first letter, warm, introduces the school and the schedule
  // 'schedule' — a plain re-send of the payment terms when a parent asks again
  const kind = body.kind === "schedule" ? "schedule" : "welcome";
  if (!uin) return NextResponse.json({ error: "uin required" }, { status: 400 });
  if (!RESEND_API_KEY) return NextResponse.json({ error: "RESEND_API_KEY is not configured in Vercel." }, { status: 400 });

  const a = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: child } = await a.schema("epms").from("fee_invoices")
    .select("student_name, father_name, program_name, admission_date").eq("uin", uin).maybeSingle();
  if (!child) return NextResponse.json({ error: "Child not found — sync from EPMS first." }, { status: 404 });

  const { data: plan } = await a.schema("eurokids").from("payment_plan")
    .select("total_fee, our_discount, final_fee, note").eq("uin", uin).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Save the payment plan before sending the letter." }, { status: 400 });

  const { data: items } = await a.schema("eurokids").from("payment_plan_item")
    .select("seq, amount, due_date").eq("uin", uin).order("seq");
  if (!items?.length) return NextResponse.json({ error: "This plan has no instalments." }, { status: 400 });

  const { data: contact } = await a.schema("eurokids").from("child_contact")
    .select("parent_email1, parent_email2").eq("uin", uin).maybeSingle();
  const to = [contact?.parent_email1, contact?.parent_email2]
    .map(x => (x || "").trim()).filter(Boolean) as string[];
  if (!to.length) return NextResponse.json({ error: "No parent email on file for this child." }, { status: 400 });

  const rows = items.map(i => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #E5E7EB">Payment ${i.seq}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #E5E7EB">${day(i.due_date)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:600">${money(Number(i.amount))}</td>
    </tr>`).join("");

  const discountLine = Number(plan.our_discount) > 0 ? `
      <tr><td style="padding:6px 0;color:#4B5563">Special discount</td>
          <td style="padding:6px 0;text-align:right;color:#15803D">− ${money(Number(plan.our_discount))}</td></tr>` : "";

  // The opening differs by letter type; everything below it is shared.
  const opening = kind === "welcome" ? `
      <p>Dear Parent,</p>
      <p>We hope this email finds you well.</p>
      <p>We are proud to formally welcome <strong>${child.student_name}</strong> to EuroKids JMD Enclave — a community shaped by educators committed to nurturing the thinkers, leaders and creators of tomorrow.</p>
      <p>By enrolling with us, you are now part of the EuroKids family and its legacy of excellence in early childhood education.</p>
      <p>Below is the detailed payment schedule for this academic year. This email serves as an official financial communication from the school. We request you to flag this email and retain it for future reference, as it will be used for all fee-related clarity and correspondence going forward.</p>`
    : `
      <p>Dear Parent,</p>
      <p>As requested, here is the payment schedule for <strong>${child.student_name}</strong> (${child.program_name}) for this academic year.</p>
      <p>This email serves as an official financial communication from the school; please retain it for your reference.</p>`;

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A202C;max-width:600px;line-height:1.6">
    <div style="background:#21409A;padding:22px 26px;border-radius:12px 12px 0 0">
      <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-.3px">${kind === "welcome" ? "Welcome to EuroKids JMD Enclave" : "Your fee payment schedule"}</div>
      <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:3px">${child.student_name} · ${child.program_name}</div>
    </div>
    <div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;padding:24px 26px">
      ${opening}

      <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
        <tr><td style="padding:6px 0;color:#4B5563">Total fee</td>
            <td style="padding:6px 0;text-align:right">${money(Number(plan.total_fee))}</td></tr>
        ${discountLine}
        <tr><td style="padding:10px 0;border-top:2px solid #1A202C;font-weight:700">Final payable</td>
            <td style="padding:10px 0;border-top:2px solid #1A202C;text-align:right;font-weight:700;font-size:16px">${money(Number(plan.final_fee))}</td></tr>
      </table>

      <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6B7280;margin:22px 0 8px">Payment schedule</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#F3F6FB">
          <th style="padding:9px 12px;text-align:left;font-size:12px;color:#4B5563">Instalment</th>
          <th style="padding:9px 12px;text-align:left;font-size:12px;color:#4B5563">Due on</th>
          <th style="padding:9px 12px;text-align:right;font-size:12px;color:#4B5563">Amount</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      ${plan.note ? `<p style="background:#FFF9E6;border-left:3px solid #FFC737;padding:10px 14px;margin:18px 0;font-size:13px">${String(plan.note).replace(/</g, "&lt;")}</p>` : ""}

      <p style="margin-top:20px">Payments are due within 10 days of the invoice being generated. Late payments attract a late fee, and all fees are non-refundable.</p>
      ${Number(plan.our_discount) > 0 ? `<p style="font-size:13px;background:#FFF9E6;border-left:3px solid #FFC737;padding:10px 14px;border-radius:0 8px 8px 0">Please note: the invoice generated by EuroKids will display the standard fee. <strong>The discounted amounts in this letter are what apply to you.</strong></p>` : ""}

      <p style="margin-top:22px">Warm regards,<br>
        <strong>Team EuroKids JMD Enclave</strong><br>
        <span style="color:#6B7280;font-size:13px">admin@eurokidsjmdenclave.org</span></p>
    </div>
  </div>`;

  const text = [
    kind === "welcome" ? `Welcome to EuroKids JMD Enclave` : `Your fee payment schedule`, ``,
    `Dear Parent,`, ``,
    kind === "welcome"
      ? `We are proud to formally welcome ${child.student_name} to EuroKids JMD Enclave (${child.program_name}). Below is the detailed payment schedule for this academic year.`
      : `As requested, here is the payment schedule for ${child.student_name} (${child.program_name}).`, ``,
    `Total fee:      ${money(Number(plan.total_fee))}`,
    ...(Number(plan.our_discount) > 0 ? [`Discount:       − ${money(Number(plan.our_discount))}`] : []),
    `Final payable:  ${money(Number(plan.final_fee))}`, ``,
    `Payment schedule:`,
    ...items.map(i => `  Payment ${i.seq} — ${day(i.due_date)} — ${money(Number(i.amount))}`),
    ...(plan.note ? ["", String(plan.note)] : []), ``,
    `Payments are due within 10 days of the invoice being generated. Late payments attract a late fee, and all fees are non-refundable.`,
    ...(Number(plan.our_discount) > 0
      ? [``, `Please note: the EuroKids invoice will show the standard fee. The discounted amounts above are what apply to you.`] : []),
    `Please retain this email as official communication.`, ``,
    `Warm regards,`, `Team EuroKids JMD Enclave`,
  ].join("\n");

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: RESEND_FROM, to, cc: [CC],
      subject: kind === "welcome"
        ? `Welcome to EuroKids JMD Enclave | Fee Payment Schedule for ${child.student_name}`
        : `Fee Payment Schedule for ${child.student_name} | EuroKids JMD Enclave`,
      text, html,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    return NextResponse.json({ error: `Resend ${r.status}: ${err.slice(0, 220)}` }, { status: 500 });
  }

  await a.schema("eurokids").from("payment_plan")
    .update({ welcome_sent_at: new Date().toISOString() }).eq("uin", uin);

  return NextResponse.json({ ok: true, sent_to: to, cc: CC });
}
