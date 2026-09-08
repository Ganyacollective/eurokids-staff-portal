import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { captureEnquiry, phoneKey } from "@/lib/enquiry";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const IVR_WEBHOOK_KEY = process.env.IVR_WEBHOOK_KEY;

// POST /api/public/ivr-webhook?key=…   (also accepts form-encoded bodies)
// Every Indian IVR provider — Exotel, MyOperator, Knowlarity, Servetel, Ozonetel,
// Tata Tele, and the rest — can call a URL when a call ends. They all name the
// fields differently, so this reads the common aliases and keeps the raw
// payload for anything it did not understand. One provider, one line in the
// map below, and the calls flow into the hub.
const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k]; if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
};
const flatten = (o: Record<string, unknown>, out: Record<string, unknown> = {}, prefix = ""): Record<string, unknown> => {
  for (const [k, v] of Object.entries(o || {})) {
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Record<string, unknown>, out, prefix + k + ".");
    else { out[prefix + k] = v; out[k] = out[k] ?? v; }
  }
  return out;
};

export async function POST(req: NextRequest) {
  if (!SERVICE_ROLE) return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("x-webhook-key");
  if (!IVR_WEBHOOK_KEY || key !== IVR_WEBHOOK_KEY) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });

  let raw: Record<string, unknown> = {};
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) raw = await req.json();
    else { const f = await req.formData(); f.forEach((v, k) => { raw[k] = String(v); }); }
  } catch { return NextResponse.json({ ok: false, error: "Unreadable body" }, { status: 400 }); }
  // some providers put the event in the query string instead
  req.nextUrl.searchParams.forEach((v, k) => { if (k !== "key" && raw[k] == null) raw[k] = v; });
  const o = flatten(raw);

  const caller = pick(o, "caller", "caller_id", "callerid", "CallerId", "from", "From", "customer_number", "caller_number", "CallFrom", "callfrom", "phone", "mobile", "number");
  const called = pick(o, "called", "did", "virtual_number", "to", "To", "CallTo", "callto", "destination", "ivr_number");
  const dirRaw = (pick(o, "direction", "Direction", "call_type", "type", "CallType") || "inbound").toLowerCase();
  const direction = /out/.test(dirRaw) ? "outbound" : "inbound";
  const agent = pick(o, "agent", "agent_name", "AgentName", "answered_by", "employee", "user", "extension");
  const started = pick(o, "start_time", "StartTime", "call_start", "time", "timestamp", "date", "started_at", "created_at");
  const duration = pick(o, "duration", "Duration", "call_duration", "talk_time", "conversation_duration", "billsec");
  const statusRaw = (pick(o, "status", "Status", "call_status", "CallStatus", "disposition", "result", "outcome") || "").toLowerCase();
  const status = !statusRaw ? "answered"
    : /miss|no.?answer|not.?pick|unanswer|busy|fail|abandon/.test(statusRaw) ? "missed"
    : /voice|mail/.test(statusRaw) ? "voicemail" : "answered";
  const recording = pick(o, "recording_url", "RecordingUrl", "recording", "recordingurl", "call_recording", "recording_link", "audio_url");
  const callId = pick(o, "call_id", "CallSid", "callsid", "id", "uuid", "call_uuid", "unique_id", "uniqueid", "reference") || `${caller || "?"}-${started || Date.now()}`;
  const provider = pick(o, "provider") || req.nextUrl.searchParams.get("provider") || "ivr";

  if (!caller || !phoneKey(caller)) return NextResponse.json({ ok: false, error: "No caller number in payload", saw: Object.keys(o).slice(0, 40) }, { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const at = started && !isNaN(Date.parse(started)) ? new Date(started).toISOString() : new Date().toISOString();

  // Only inbound calls create enquiries; an outbound call is us calling
  // someone we already know, and is logged against them if we do.
  let enquiryId: number | null = null;
  const k = phoneKey(caller)!;
  const { data: known } = await admin.schema("eurokids").from("enquiry").select("id").eq("phone_key", k)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (known) enquiryId = known.id;
  else if (direction === "inbound") {
    const r = await captureEnquiry(admin, { source: "Call", father_phone: caller, actor: "ivr", at,
      detail: { agent, status, provider }, sendWelcome: false });
    enquiryId = r.enquiry.id;
  }

  const { error } = await admin.schema("eurokids").from("call_log").upsert({
    provider, provider_call_id: callId, direction, caller, called_number: called, agent,
    started_at: at, duration_s: duration ? Math.round(Number(duration)) || null : null,
    status, recording_url: recording, enquiry_id: enquiryId, raw,
  }, { onConflict: "provider,provider_call_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (enquiryId && known) {
    await admin.schema("eurokids").from("enquiry_event").insert({
      enquiry_id: enquiryId, at, actor: agent || "ivr",
      kind: direction === "outbound" ? "call_out" : status === "missed" ? "missed_call" : "call_in",
      summary: `${direction === "outbound" ? "We called" : status === "missed" ? "Missed call" : "Called the school"}${agent ? " · " + agent : ""}${duration ? " · " + Math.round(Number(duration)) + "s" : ""}`,
      detail: { recording_url: recording, status },
    });
  }
  return NextResponse.json({ ok: true, enquiry_id: enquiryId, status });
}

// A GET so the provider's "test webhook" button gets a friendly answer.
export async function GET() {
  return NextResponse.json({ ok: true, expects: "POST with the call's caller number, time, duration, status and recording URL" });
}
