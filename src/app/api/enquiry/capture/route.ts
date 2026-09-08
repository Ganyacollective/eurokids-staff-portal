import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { captureEnquiry, phoneKey, type CaptureInput } from "@/lib/enquiry";
import { sendWhatsApp, waLink } from "@/lib/whatsapp";
import { bearer } from "@/lib/fee-data";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Signed-in staff: the hub's "New enquiry" sheet and the one-tap welcome
// actions. RLS decides who may — the same admission/finance rule as the tables.
async function gate(token: string) {
  const user = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: me } = await user.auth.getUser();
  if (!me?.user) return null;
  const { data } = await user.from("module_access").select("module").eq("user_id", me.user.id);
  const mods = (data || []).map((r) => r.module);
  if (!mods.includes("admission") && !mods.includes("finance")) return null;
  return me.user;
}

export async function POST(req: NextRequest) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ ok: false, error: "Missing bearer token" }, { status: 401 });
  const me = await gate(token);
  if (!me) return NextResponse.json({ ok: false, error: "You do not have access to enquiries." }, { status: 403 });

  let b: { action?: string; input?: CaptureInput; id?: number; kind?: string; text?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const who = (me.user_metadata?.full_name as string) || me.email || "staff";

  if (b.action === "capture") {
    const input = b.input || ({} as CaptureInput);
    if (!phoneKey(input.father_phone) && !phoneKey(input.mother_phone)) {
      return NextResponse.json({ ok: false, error: "A 10-digit mobile number is needed to file an enquiry." }, { status: 400 });
    }
    try {
      const r = await captureEnquiry(admin, { ...input, actor: input.actor || who });
      return NextResponse.json({ ok: true, id: r.enquiry.id, existing: !r.created, welcome: r.welcome });
    } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 }); }
  }

  if (b.action === "welcome" && b.id) {
    // Re-send the hello to an existing enquiry (email and/or WhatsApp).
    const { data: e } = await admin.schema("eurokids").from("enquiry").select("*").eq("id", b.id).maybeSingle();
    if (!e) return NextResponse.json({ ok: false, error: "Enquiry not found" }, { status: 404 });
    const { sendEnquiryWelcomeEmail, isEmail } = await import("@/lib/enquiry");
    const out: Record<string, string> = {};
    const to = [e.father_email, e.mother_email].filter(isEmail) as string[];
    if (to.length && b.kind !== "whatsapp") {
      out.email = await sendEnquiryWelcomeEmail(to, e);
      if (out.email === "sent") {
        await admin.schema("eurokids").from("enquiry").update({ welcome_email_sent_at: new Date().toISOString() }).eq("id", e.id);
        await admin.schema("eurokids").from("enquiry_event").insert({ enquiry_id: e.id, kind: "email", summary: `Welcome email sent to ${to.join(", ")}`, actor: who });
      }
    }
    const phone = e.father_phone || e.mother_phone;
    if (phone && b.kind !== "email") {
      const r = await sendWhatsApp({ to: phone, template: process.env.WHATSAPP_WELCOME_TEMPLATE || "enquiry_welcome", params: [e.child_name || "your child"] });
      out.whatsapp = r.status;
      if (r.status === "sent") {
        await admin.schema("eurokids").from("enquiry").update({ welcome_wa_sent_at: new Date().toISOString() }).eq("id", e.id);
        await admin.schema("eurokids").from("enquiry_event").insert({ enquiry_id: e.id, kind: "whatsapp", summary: `Welcome WhatsApp sent to ${phone}`, actor: who });
      } else if (r.status === "not_configured") {
        out.wa_link = waLink(phone, b.text || `Hello${e.father_name ? " " + e.father_name : ""}, thank you for enquiring at EuroKids JMD Enclave${e.child_name ? " for " + e.child_name : ""}. I'm from the school — happy to answer any questions and book a visit for you. When would suit?`);
      }
    }
    return NextResponse.json({ ok: true, ...out });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}
