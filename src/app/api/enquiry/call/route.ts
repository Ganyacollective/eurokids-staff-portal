// Logging a call by hand.
//
// The Calls screen was only ever the IVR's. "Log a Call" opened the new-enquiry
// sheet, which created or merged a family and then nothing — no call row, so
// the call itself disappeared. Somebody rang, somebody answered, somebody
// wrote it down, and the Calls list stayed empty.
//
// A call logged here goes to the same two places an IVR call goes: the call
// log, so it shows up among the calls; and the family's card, so their history
// reads as one sequence whoever recorded it. The family is found by number,
// exactly as everywhere else, so logging a call about someone already known
// never makes a second record of them.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { captureEnquiry, phoneKey } from "@/lib/enquiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTCOMES = ["answered", "missed", "voicemail"] as const;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const [{ data: mods }, { data: prof }] = await Promise.all([
    admin.from("module_access").select("module").eq("user_id", who.user.id).in("module", ["admission", "finance"]),
    admin.from("profiles").select("role, full_name").eq("id", who.user.id).maybeSingle(),
  ]);
  if (!((mods && mods.length) || prof?.role === "admin")) {
    return NextResponse.json({ ok: false, error: "You need Admission or Finance." }, { status: 403 });
  }
  const actor = prof?.full_name || who.user.email || "someone";

  const b = await req.json().catch(() => ({}));
  const phone = String(b.phone || "").trim();
  const key = phoneKey(phone);
  if (!key) return NextResponse.json({ ok: false, error: "A 10-digit mobile number is needed." }, { status: 400 });

  const direction = b.direction === "outbound" ? "outbound" : "inbound";
  const status = OUTCOMES.includes(b.status) ? b.status : "answered";
  const minutes = Math.max(0, Math.min(600, Number(b.minutes) || 0));
  const note = String(b.note || "").trim().slice(0, 1000);
  const at = b.at && !isNaN(Date.parse(b.at)) ? new Date(b.at).toISOString() : new Date().toISOString();

  const tbl = admin.schema("eurokids");

  // Find the family first. An outbound call is us ringing somebody we already
  // know, so it never creates a record — if we cannot find them, that is worth
  // saying rather than quietly inventing an enquiry for a number we dialled.
  const { data: known } = await tbl.from("enquiry").select("id, child_name, father_name")
    .eq("phone_key", key).order("created_at", { ascending: false }).limit(1).maybeSingle();

  let enquiryId: number | null = known?.id ?? null;
  let created = false;

  if (!known) {
    if (direction === "outbound" && !b.createIfUnknown) {
      return NextResponse.json({ ok: false, error: "No family has that number. Add them as an enquiry first, or tick to create one." }, { status: 404 });
    }
    // Whose number it is, if whoever took the call knew.
    //
    // This used to file every call under father_phone and father_name
    // regardless. Half the time it is the mother who rings, and often nobody
    // asked — so the record asserted a fact about a family that we had simply
    // made up, and the tablet then deferred to it.
    //
    // Unstated numbers are parked on the father's field because that is what
    // phone_key reads, but phone_owner stays null to say nobody has claimed
    // it. captureEnquiry moves it the moment a parent types it into their own
    // box at reception.
    const whose = b.whose === "mother" || b.whose === "father" ? b.whose : null;
    const r = await captureEnquiry(admin, {
      source: "Call",
      father_phone: whose === "mother" ? null : phone,
      father_name: whose === "mother" ? null : (b.caller_name || null),
      mother_phone: whose === "mother" ? phone : null,
      mother_name: whose === "mother" ? (b.caller_name || null) : null,
      phone_owner: whose,
      child_name: b.child_name || null, actor, at,
      message: note || null, sendWelcome: false, notifySchool: false,
      // The call_log row below is the better line: it carries who took it and
      // how long it lasted. "Called the school" above it says less, twice.
      logArrival: false,
    });
    enquiryId = r.enquiry.id;
    created = r.created;
  }

  // Unique per provider, so a double-tap on Save cannot write the call twice.
  //
  // To the minute, not the millisecond. When the "when" field is left blank
  // the browser sends null and `at` becomes the moment the request arrived,
  // so two taps were two distinct keys and the upsert inserted both -- which
  // is exactly what this key existed to prevent.
  const callId = `manual-${key}-${at.slice(0, 16)}`;
  // caller_key is generated from caller by the database — setting it here is
  // rejected outright, which would have been a 500 on the first call anybody
  // logged.
  const { error } = await tbl.from("call_log").upsert({
    provider: "manual", provider_call_id: callId, direction,
    caller: phone, agent: actor, started_at: at,
    duration_s: minutes ? Math.round(minutes * 60) : null,
    status, enquiry_id: enquiryId,
    raw: { logged_by: actor, logged_at: new Date().toISOString(), note: note || null },
  }, { onConflict: "provider,provider_call_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // No enquiry_event for the call itself.
  //
  // The drawer already builds the timeline from call_log as well as
  // enquiry_event, so the row written just above appears as "They called ·
  // Sunita · 2 min" on its own. Writing an event too put the same call on
  // screen twice — and that event repeated the note's text, which is already
  // its own entry a line below. One call, one line.

  if (note) {
    await tbl.from("enquiry_note").insert({
      enquiry_id: enquiryId, body: note, author: actor, created_by: who.user.id,
    });
  }

  // A date, or nothing. An unchecked string reaches a date column, Postgres
  // refuses it, and the route still answered ok with the call-back quietly
  // missing.
  let followUpSet: string | null = null;
  if (b.follow_up_on && /^\d{4}-\d{2}-\d{2}$/.test(String(b.follow_up_on))) {
    const { error: fErr } = await tbl.from("enquiry")
      .update({ follow_up_on: String(b.follow_up_on) }).eq("id", enquiryId);
    if (!fErr) followUpSet = String(b.follow_up_on);
  }

  return NextResponse.json({
    ok: true, enquiry_id: enquiryId, created, follow_up_on: followUpSet,
    family: known ? (known.child_name || known.father_name || phone) : null,
  });
}
