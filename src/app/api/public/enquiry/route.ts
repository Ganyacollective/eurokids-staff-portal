import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { captureEnquiry, phoneKey, isEmail, tooManyHits, type Source } from "@/lib/enquiry";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// Optional: the iPad at reception sends this so a walk-in is trusted as a
// walk-in. Anything without it is treated as a website enquiry.
const KIOSK_KEY = process.env.ENQUIRY_KIOSK_KEY;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

// POST /api/public/enquiry — the website form and the reception iPad.
// Body: { child_name, program, dob, sex, parent_name, phone, email, mother_name,
//         mother_phone, address, message, source?, kiosk_key?, company? (honeypot) }
export async function POST(req: NextRequest) {
  if (!SERVICE_ROLE) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500, headers: CORS });
  let b: Record<string, string | undefined>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400, headers: CORS }); }

  // Bots fill every field, including the one people cannot see.
  if (b.company) return NextResponse.json({ ok: true }, { headers: CORS });

  const phone = String(b.phone || "").trim();
  if (!phoneKey(phone)) return NextResponse.json({ ok: false, error: "Please enter a 10-digit mobile number." }, { status: 400, headers: CORS });
  if (b.email && !isEmail(b.email)) return NextResponse.json({ ok: false, error: "That email address does not look right." }, { status: 400, headers: CORS });
  const parent = String(b.parent_name || "").trim();
  if (!parent && !String(b.child_name || "").trim()) return NextResponse.json({ ok: false, error: "Please tell us your name or your child's." }, { status: 400, headers: CORS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (await tooManyHits(admin, "public_enquiry", ip, 30)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Please call us instead." }, { status: 429, headers: CORS });
  }

  const kiosk = !!KIOSK_KEY && b.kiosk_key === KIOSK_KEY;
  const wanted = String(b.source || "") as Source;
  const source: Source = kiosk ? (wanted === "call" ? "call" : "walk_in")
    : (["website", "instagram", "referral", "just_dial", "other"].includes(wanted) ? wanted : "website");

  try {
    const r = await captureEnquiry(admin, {
      source, actor: kiosk ? "reception iPad" : "website",
      child_name: b.child_name, dob: b.dob || null, sex: b.sex === "Boy" || b.sex === "Girl" ? b.sex : null, program: b.program,
      father_name: parent, father_phone: phone, father_email: b.email,
      mother_name: b.mother_name, mother_phone: b.mother_phone, address: b.address, locality: b.locality,
      message: b.message, sendWelcome: true,
      detail: { page: b.page || req.headers.get("referer") || null, ua: req.headers.get("user-agent")?.slice(0, 160) || null, ip },
    });
    return NextResponse.json({ ok: true, existing: !r.created, welcome: r.welcome }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: CORS });
  }
}
