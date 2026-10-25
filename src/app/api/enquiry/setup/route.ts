import { NextRequest, NextResponse } from "next/server";
import { mailReady } from "@/lib/mailer";
import { createClient } from "@supabase/supabase-js";
import { bearer } from "@/lib/fee-data";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://admin.eurokidsjmdenclave.org";

// GET /api/enquiry/setup — the links and keys the Setup page shows. Keys are
// secrets, so only a signed-in finance user (the owner) sees them filled in.
export async function GET(req: NextRequest) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ ok: false, error: "Missing bearer token" }, { status: 401 });
  const user = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: me } = await user.auth.getUser();
  if (!me?.user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { data } = await user.from("module_access").select("module").eq("user_id", me.user.id);
  const mods = (data || []).map((r) => r.module);
  if (!mods.includes("finance")) return NextResponse.json({ ok: false, error: "Finance access needed" }, { status: 403 });

  const kiosk = process.env.ENQUIRY_KIOSK_KEY || "";
  const ivr = process.env.IVR_WEBHOOK_KEY || "";
  // The tablet is the public website's home page with the key on the end of
  // it: the posters, then the form. Open it once on the device and use
  // Chrome's "Install app" (or Safari's Add to Home Screen). The key is
  // remembered on that device, which is what keeps the icon being the tablet
  // when the manifest launches it with no query string.
  //
  // This used to hand out admin.eurokidsjmdenclave.org/enquire?src=walkin&k=…
  // — the wrong host, and a parameter the endpoint does not read.
  const WEB = (process.env.NEXT_PUBLIC_WEBSITE_URL || "https://eurokidsjmdenclave.org").replace(/\/$/, "");
  return NextResponse.json({
    ok: true, site: SITE, website: WEB,
    kiosk_key_set: !!kiosk,
    kiosk_url: kiosk ? `${WEB}/?kiosk=${encodeURIComponent(kiosk)}` : null,
    embed_url: `${WEB}/#enquire`,
    ivr_key_set: !!ivr,
    ivr_url: ivr ? `${SITE}/api/public/ivr-webhook?key=${encodeURIComponent(ivr)}` : null,
    whatsapp_configured: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    whatsapp_template: process.env.WHATSAPP_WELCOME_TEMPLATE || "enquiry_welcome",
    email_configured: mailReady(),
  });
}
