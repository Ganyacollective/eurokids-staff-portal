// Day care billing: who may use it, and the shared plumbing.
//
// A fee certificate carries a family's name, a child's name, an employer and
// an amount. That is the office's business and nobody else's, so the gate is
// the same people who already handle admissions and money — not a new
// permission for the sake of one.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "eurokids" },
  });

export type Caller =
  | { ok: true; email: string; name: string; userId: string; isAdmin: boolean }
  | { ok: false; status: number; error: string };

export async function requireBilling(req: Request): Promise<Caller> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { ok: false, status: 401, error: "Not signed in." };
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return { ok: false, status: 401, error: "Not signed in." };

  const pub = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const [{ data: mods }, { data: prof }] = await Promise.all([
    pub.from("module_access").select("module").eq("user_id", who.user.id)
      .in("module", ["finance", "receipts", "admission"]),
    pub.from("profiles").select("role, full_name").eq("id", who.user.id).maybeSingle(),
  ]);
  if (!((mods && mods.length) || prof?.role === "admin")) {
    return { ok: false, status: 403, error: "You need Admission, Finance or Receipts to issue fee certificates." };
  }
  return { ok: true, email: who.user.email || "", name: prof?.full_name || who.user.email || "",
           userId: who.user.id, isAdmin: prof?.role === "admin" };
}

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

// Dates as plain strings. A Date object picks up a timezone somewhere between
// the server and the page, and a certificate for October quietly becomes one
// for September.
export const monthStart = (d: string) => d.slice(0, 7) + "-01";
export const monthEnd = (d: string) => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
export const nextMonth = (d: string) => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10);
};
export const monthLabel = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
export const longDate = (d: string | Date) =>
  new Date(typeof d === "string" ? d + "T00:00:00Z" : d)
    .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const ENTITY = "EuroKids JMD Enclave, operated by Veena Educational Services";
export const SIGNATORY = { name: "Neeta Saxena", role: "Owner and Director" };
