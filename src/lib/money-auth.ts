// Who may move money, and the plumbing for signing that it moved.
//
// A separate gate from documents and from letters: the people who handle cash
// are not the people who write appointment letters, and neither set should
// inherit the other's reach.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// The cash book lives in the eurokids schema, so this client is bound to it.
export const admin = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "eurokids" },
  });

export type Caller =
  | { ok: true; email: string; name: string; userId: string; isAdmin: boolean }
  | { ok: false; status: number; error: string };

export async function requireMoney(req: Request): Promise<Caller> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { ok: false, status: 401, error: "Not signed in." };
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return { ok: false, status: 401, error: "Not signed in." };

  const pub = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const [{ data: mods }, { data: prof }] = await Promise.all([
    pub.from("module_access").select("module").eq("user_id", who.user.id).in("module", ["finance", "receipts"]),
    pub.from("profiles").select("role, full_name").eq("id", who.user.id).maybeSingle(),
  ]);
  if (!((mods && mods.length) || prof?.role === "admin")) {
    return { ok: false, status: 403, error: "You need the Finance or Receipts permission to record money changing hands." };
  }
  return {
    ok: true,
    email: who.user.email || "",
    name: prof?.full_name || who.user.email || "",
    userId: who.user.id,
    isAdmin: prof?.role === "admin",
  };
}

export function clientIp(req: Request) {
  const h = req.headers;
  return (h.get("x-forwarded-for") || "").split(",")[0].trim()
    || h.get("x-real-ip") || h.get("cf-connecting-ip") || "";
}

export async function sha256(bytes: Uint8Array | string) {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const h = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const istStamp = (d: Date) =>
  d.toLocaleString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  }) + " IST";

export const istShort = (t: string | Date) =>
  new Date(t).toLocaleString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
  }).replace(",", " ·") + " IST";
