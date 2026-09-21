// Who may see a salary, and where the roster lives.
//
// The salary is the whole reason this module is separate. HR runs attendance
// and leave and never needs to know what anyone is paid, so the grant is
// checked on the server against the database — not inferred from what the
// browser claims, and not merely hidden on screen.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { StaffRecord } from "./letter-merge";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

export type Caller = { ok: true; email: string; userId: string } | { ok: false; status: number; error: string };

// The bearer token the hub sends is the user's own session. We ask Supabase
// who it belongs to, then ask the database what they are allowed to do —
// never the other way round.
export async function requireLetters(req: Request): Promise<Caller> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { ok: false, status: 401, error: "Not signed in." };
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return { ok: false, status: 401, error: "Not signed in." };

  const a = admin();
  const [{ data: mods }, { data: prof }] = await Promise.all([
    a.from("module_access").select("module").eq("user_id", who.user.id).eq("module", "letters"),
    a.from("profiles").select("role").eq("id", who.user.id).maybeSingle(),
  ]);
  const allowed = (mods && mods.length > 0) || prof?.role === "admin";
  if (!allowed) {
    return { ok: false, status: 403,
      error: "Appointment letters are a separate permission because they carry a salary. Ask Abhinav to switch on Letters for your account." };
  }
  return { ok: true, email: who.user.email || "", userId: who.user.id };
}

// ── the roster ───────────────────────────────────────────────────────────
// It lives in portal_state.data.employees, which is what the staff portal
// edits. public.employees is the older table from the payroll app and is no
// longer the source of truth; reading both would mean two versions of an
// address and no way to tell which is current.
export async function loadStaff(a: SupabaseClient): Promise<StaffRecord[]> {
  const { data } = await a.from("portal_state").select("data").eq("id", "main").maybeSingle();
  const list = (data?.data?.employees || []) as StaffRecord[];
  return list.filter((e) => e && e.id && e.display_name);
}

export async function findStaff(a: SupabaseClient, id: string): Promise<StaffRecord | null> {
  return (await loadStaff(a)).find((e) => e.id === id) || null;
}

// The pay book, read with the service key — the caller's grant was checked
// above, so this is the module answering for itself.
export async function salaryOf(a: SupabaseClient, employeeId: string): Promise<number> {
  const { data } = await a.from("employee_salary")
    .select("monthly_salary, effective_from").eq("employee_id", employeeId)
    .order("effective_from", { ascending: false }).limit(1);
  return Number(data?.[0]?.monthly_salary || 0);
}

export async function currentTemplate(a: SupabaseClient) {
  const { data } = await a.from("letter_template").select("*")
    .eq("kind", "appointment").eq("is_current", true)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  return data;
}

// A letter's private link. 32 bytes of randomness, so it cannot be guessed
// and does not need to be secret in the way a password is.
export function newToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function sha256(bytes: Uint8Array | string) {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const h = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request) {
  const h = req.headers;
  return (h.get("x-forwarded-for") || "").split(",")[0].trim()
    || h.get("x-real-ip") || h.get("cf-connecting-ip") || "";
}

export async function logEvent(a: SupabaseClient, letterId: number, event: string,
                               detail: Record<string, unknown> = {}, req?: Request) {
  await a.from("letter_event").insert({
    letter_id: letterId, event, detail,
    ip: req ? clientIp(req) : null,
    agent: req ? (req.headers.get("user-agent") || "").slice(0, 300) : null,
  });
}
