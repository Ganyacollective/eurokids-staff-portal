import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderEmail, esc, money, day, SCHOOL_NAME, SCHOOL_PHONE, plainFooter } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";
import { isEmail } from "@/lib/enquiry";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

// GET /api/cron/promise-reminders — every morning.
// A parent who said "I'll pay on Thursday" hears from us on Thursday, once,
// in their own words. Promises whose money has already arrived are quietly
// marked kept and nothing is sent; promises whose day has passed without
// payment are marked broken so the coordinator sees them at the top of the
// list rather than discovering them a fortnight later.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}` && !dry) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const tbl = admin.schema("eurokids");
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: open } = await tbl.from("v_promise").select("*").eq("status", "open").lte("promised_on", today);
  const kept: number[] = [], broken: number[] = [], mailed: { child: string; to: string[]; result: string }[] = [];

  for (const p of open || []) {
    if (p.fully_paid) { kept.push(p.id); continue; }
    if (p.promised_on < today) { broken.push(p.id); continue; }

    // due today, still owing
    if (!p.remind_parent || p.reminded_at || !mailReady()) continue;
    const to = [p.parent_email1, p.parent_email2].filter(isEmail) as string[];
    if (!to.length) continue;
    const amount = Number(p.expected || 0);
    const html = renderEmail({
      title: "A gentle reminder", subtitle: `${p.student_name}${p.program_name ? " · " + p.program_name : ""}`, theme: "notice",
      bodyHtml: `<p>Dear ${esc(p.father_name || "Parent")},</p>
        <p>Thank you for speaking with us${p.taken_by ? "" : ""}. As discussed, the fee payment of <strong>${money(amount)}</strong> for ${esc(p.student_name)} was to be made today, ${esc(day(p.promised_on))}.</p>
        ${p.note ? `<p style="color:#4B5563;font-size:13px">Your note to us: “${esc(p.note)}”</p>` : ""}
        <p>You can pay online through the EuroKids parent link, or at the school office by UPI, cheque or cash. If it has already been paid today, please ignore this note — payments can take a day to appear on our side.</p>
        <p>If anything has changed, call us on <a href="tel:+912269622686" style="font-weight:700;text-decoration:none">${SCHOOL_PHONE}</a> and we will work it out with you.</p>`,
      footerNote: `Sent by ${SCHOOL_NAME} because a payment date was agreed with you on the phone.`,
    });
    if (!dry) {
      const r = await sendMail({ to,
        subject: `Fee payment for ${p.student_name} — due today as discussed`, html,
        text: [`Dear ${p.father_name || "Parent"},`, "", `As discussed, the fee payment of ${money(amount)} for ${p.student_name} was to be made today, ${day(p.promised_on)}.`, `Call us on ${SCHOOL_PHONE} if anything has changed.`, plainFooter()].join("\n") });
      if (r.ok) await tbl.from("payment_promise").update({ reminded_at: new Date().toISOString() }).eq("id", p.id);
      mailed.push({ child: p.student_name, to, result: r.ok ? "sent" : (r.error || "failed") });
    } else mailed.push({ child: p.student_name, to, result: "dry-run" });
  }

  if (!dry && kept.length) await tbl.from("payment_promise").update({ status: "kept", settled_at: new Date().toISOString() }).in("id", kept);
  if (!dry && broken.length) await tbl.from("payment_promise").update({ status: "broken" }).in("id", broken);
  return NextResponse.json({ ok: true, on: today, kept: kept.length, broken: broken.length, reminded: mailed.length, mailed });
}
