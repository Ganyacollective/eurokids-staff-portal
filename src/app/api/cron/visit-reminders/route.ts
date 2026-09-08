import { NextRequest, NextResponse } from "next/server";
import { sendMail } from "@/lib/mailer";
import { createClient } from "@supabase/supabase-js";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_PHONE, plainFooter } from "@/lib/brand-email";
import { sendWhatsApp } from "@/lib/whatsapp";
import { isEmail } from "@/lib/enquiry";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || `${SCHOOL_NAME} <admin@eurokidsjmdenclave.org>`;

// GET /api/cron/visit-reminders — every morning (09:00 IST). Families with a
// visit booked for tomorrow get "see you at 10 tomorrow" by email, and by
// WhatsApp once the Business API is connected. Each visit is reminded once.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}` && !dry) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // "tomorrow" in Indian time
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  const tomorrow = new Date(ist); tomorrow.setUTCDate(ist.getUTCDate() + 1);
  const d0 = tomorrow.toISOString().slice(0, 10);
  const from = new Date(`${d0}T00:00:00+05:30`).toISOString(), to = new Date(`${d0}T23:59:59+05:30`).toISOString();

  const { data: rows } = await admin.schema("eurokids").from("enquiry").select("*")
    .gte("visit_at", from).lte("visit_at", to).is("visit_reminder_sent_at", null).not("status", "in", "(won,lost)");
  const out: { id: number; child: string | null; email?: string; whatsapp?: string }[] = [];
  for (const e of rows || []) {
    const when = new Date(e.visit_at).toLocaleString("en-IN", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
    const r: (typeof out)[number] = { id: e.id, child: e.child_name };
    const emails = [e.father_email, e.mother_email].filter(isEmail) as string[];
    if (!dry && RESEND_API_KEY && emails.length) {
      const html = renderEmail({
        title: "See you tomorrow", subtitle: SCHOOL_NAME, theme: "calm",
        bodyHtml: `<p>Dear ${esc(e.father_name || e.mother_name || "Parent")},</p>
          <p>A gentle reminder that your visit to ${SCHOOL_NAME}${e.child_name ? ` with <strong>${esc(e.child_name)}</strong>` : ""} is booked for <strong>${esc(when)}</strong>.</p>
          <p>We are at JMD Enclave, Undri. Please allow about 45 minutes — you will see the classrooms, the play area, and meet the teachers. If the time no longer suits, call us on <a href="tel:+912269622686" style="font-weight:700;text-decoration:none">${SCHOOL_PHONE}</a> and we will move it.</p>
          <p>Looking forward to meeting you.</p>`,
      });
      const res = await sendMail({ to: emails, cc: ["admin@eurokidsjmdenclave.org"], subject: `Your visit to ${SCHOOL_NAME} — ${when}`, html,
          text: [`Dear ${e.father_name || "Parent"},`, "", `Reminder: your visit to ${SCHOOL_NAME} is booked for ${when}. Call ${SCHOOL_PHONE} to reschedule.`, plainFooter()].join("\n") });
      r.email = res.ok ? "sent" : `failed:${res.status}`;
    }
    const phone = e.father_phone || e.mother_phone;
    if (!dry && phone) {
      const w = await sendWhatsApp({ to: phone, template: process.env.WHATSAPP_VISIT_TEMPLATE || "visit_reminder", params: [e.child_name || "your child", when] });
      r.whatsapp = w.status;
    }
    if (!dry) {
      await admin.schema("eurokids").from("enquiry").update({ visit_reminder_sent_at: new Date().toISOString() }).eq("id", e.id);
      await admin.schema("eurokids").from("enquiry_event").insert({ enquiry_id: e.id, kind: "reminder", actor: "system",
        summary: `Visit reminder for ${when}${r.email ? " · email " + r.email : ""}${r.whatsapp && r.whatsapp !== "not_configured" ? " · WhatsApp " + r.whatsapp : ""}` });
    }
    out.push(r);
  }
  return NextResponse.json({ ok: true, for: d0, reminded: out.length, out });
}
