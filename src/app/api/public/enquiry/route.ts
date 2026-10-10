import { NextRequest, NextResponse, after } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { captureEnquiry, phoneKey, isEmail, tooManyHits, notifySchool, type Source } from "@/lib/enquiry";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// Optional: the iPad at reception sends this so a walk-in is trusted as a
// walk-in. Anything without it is treated as a website enquiry.
const KIOSK_KEY = process.env.ENQUIRY_KIOSK_KEY;

// Two megabytes of base64 is a generous 1.5 MB photo. Beyond that something
// is wrong — the tablet sends a 720-wide JPEG, which lands around 60 KB — and
// an unbounded data: URL on a public endpoint is a way to fill a bucket.
const MAX_PHOTO_B64 = 2_000_000;

// Stored, then linked to the enquiry. Never fatal: a family who filled the
// form in must be recorded whether or not the camera worked, so every failure
// here is swallowed after being written to the event trail.
async function storeIntakePhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>, enquiryId: number, dataUrl: string,
) {
  try {
    if (dataUrl.length > MAX_PHOTO_B64) return;
    const [head, b64] = dataUrl.split(",", 2);
    if (!b64) return;
    const type = head.includes("webp") ? "image/webp" : "image/jpeg";
    const ext = type === "image/webp" ? "webp" : "jpg";
    const bytes = Buffer.from(b64, "base64");
    if (!bytes.length) return;

    const now = new Date();
    const path = `${now.toISOString().slice(0, 7)}/${enquiryId}-${now.getTime()}.${ext}`;
    const { error } = await admin.storage.from("intake")
      .upload(path, bytes, { contentType: type, upsert: false });
    if (error) throw new Error(error.message);

    const tbl = admin.schema("eurokids");
    await tbl.from("enquiry")
      .update({ intake_photo: path, intake_photo_at: now.toISOString() }).eq("id", enquiryId);
    await tbl.from("enquiry_event").insert({
      enquiry_id: enquiryId, kind: "note", actor: "reception tablet",
      summary: "Photo taken at the tablet when the form was submitted",
    });
  } catch (e) {
    await admin.schema("eurokids").from("enquiry_event").insert({
      enquiry_id: enquiryId, kind: "note", actor: "reception tablet",
      summary: `The tablet could not save a photo: ${(e as Error).message}`,
    }).then(() => {}, () => {});
  }
}

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
  let b: Record<string, string | string[] | undefined>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400, headers: CORS }); }

  // Bots fill every field, including the one people cannot see.
  if (b.company) return NextResponse.json({ ok: true }, { headers: CORS });

  const phone = String(b.phone || "").trim();
  if (!phoneKey(phone)) return NextResponse.json({ ok: false, error: "Please enter a 10-digit mobile number." }, { status: 400, headers: CORS });
  if (b.email && !isEmail(String(b.email))) return NextResponse.json({ ok: false, error: "That email address does not look right." }, { status: 400, headers: CORS });
  const parent = String(b.parent_name || "").trim();
  if (!parent && !String(b.child_name || "").trim()) return NextResponse.json({ ok: false, error: "Please tell us your name or your child's." }, { status: 400, headers: CORS });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (await tooManyHits(admin, "public_enquiry", ip, 30)) {
    return NextResponse.json({ ok: false, error: "Too many requests. Please call us instead." }, { status: 429, headers: CORS });
  }

  const kiosk = !!KIOSK_KEY && b.kiosk_key === KIOSK_KEY;
  const wanted = String(b.source || "") as Source;
  const source: Source = kiosk ? "Walk In"
    : (["Website", "Instagram", "Referral", "Just Dial", "Others"].includes(wanted) ? wanted : "Website");
  const programs = Array.isArray(b.programs) ? (b.programs as string[]) : b.program ? [String(b.program)] : [];
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(", ") : v) || null;

  try {
    // Only the database write is awaited. The welcome email, the WhatsApp,
    // the note to the office and the photograph used to happen before this
    // route replied, which is why Submit sat there for several seconds with a
    // family watching it — an SMTP handshake and two HTTP calls, none of
    // which the person pressing the button has any reason to wait for.
    const r = await captureEnquiry(admin, {
      source, actor: kiosk ? "reception tablet" : "website",
      child_name: str(b.child_name), dob: str(b.dob), sex: b.sex === "Boy" || b.sex === "Girl" ? b.sex : null, programs,
      father_name: parent, father_phone: phone, father_email: str(b.email),
      mother_name: str(b.mother_name), mother_phone: str(b.mother_phone), mother_email: str(b.mother_email), address: str(b.address),
      message: str(b.message), sendWelcome: false, notifySchool: false,
      detail: { page: str(b.page) || req.headers.get("referer") || null, ua: req.headers.get("user-agent")?.slice(0, 160) || null, ip },
    });

    // Everything else runs after the reply has gone. after() keeps the
    // function alive to finish it, so this is deferred rather than abandoned.
    after(async () => {
      const row = r.enquiry;
      try {
        if (kiosk && typeof b.photo === "string" && b.photo.startsWith("data:image/")) {
          await storeIntakePhoto(admin, row.id, b.photo);
        }
        // No welcome email to the family. They are standing at the desk, or
        // they have just filled a form online and will be rung; an automatic
        // "welcome" on top of that is noise, and it was the slowest thing
        // here. Only the office is told, so somebody picks the enquiry up.
        await notifySchool(row, source, r.created);
      } catch (e) {
        await admin.schema("eurokids").from("enquiry_event").insert({
          enquiry_id: row.id, kind: "note", actor: "system",
          summary: `Saved, but the follow-up afterwards failed: ${(e as Error).message}`,
        }).then(() => {}, () => {});
      }
    });
    return NextResponse.json({ ok: true, existing: !r.created, welcome: r.welcome }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: CORS });
  }
}
