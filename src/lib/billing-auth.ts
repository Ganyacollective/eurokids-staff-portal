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

// The two halves are separately grantable, and separately enforced.
//
// Day care billing takes money from a family. Reimbursement certificates are
// receipts a parent hands to their employer. Somebody may well do one and not
// the other, and until now both rode on finance/receipts/admission — so
// letting a coordinator raise day care invoices meant handing over the
// school's books or the cash desk, and neither half could be granted at all.
//
// `need` is the kind of document the route is about to touch, not merely
// which door the person came through. A route that acts on an existing
// invoice must pass that invoice's own kind: the screen can be trusted to
// show the right buttons, but the screen is not the gate.
export type BillingKind = "billing" | "reimbursement";

export type Caller =
  | { ok: true; email: string; name: string; userId: string; isAdmin: boolean;
      canBill: boolean; canCertify: boolean }
  | { ok: false; status: number; error: string };

const NEEDS: Record<BillingKind, { module: string; said: string }> = {
  billing:       { module: "daycare_billing", said: "Day care billing" },
  reimbursement: { module: "reimbursements",  said: "Reimbursements" },
};

export async function requireBilling(req: Request, need?: BillingKind): Promise<Caller> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { ok: false, status: 401, error: "Not signed in." };
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return { ok: false, status: 401, error: "Not signed in." };

  const pub = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const [{ data: mods }, { data: prof }] = await Promise.all([
    pub.from("module_access").select("module").eq("user_id", who.user.id)
      .in("module", ["daycare_billing", "reimbursements"]),
    pub.from("profiles").select("role, full_name").eq("id", who.user.id).maybeSingle(),
  ]);
  const held = new Set((mods || []).map((m) => m.module as string));
  const isAdmin = prof?.role === "admin";
  const canBill = isAdmin || held.has("daycare_billing");
  const canCertify = isAdmin || held.has("reimbursements");

  if (!canBill && !canCertify) {
    return { ok: false, status: 403,
      error: "You do not have Day care billing or Reimbursements. Ask the owner to switch one on in Users & Access." };
  }
  if (need && !(need === "billing" ? canBill : canCertify)) {
    return { ok: false, status: 403,
      error: `You do not have ${NEEDS[need].said}. Ask the owner to switch it on in Users & Access.` };
  }

  return { ok: true, email: who.user.email || "", name: prof?.full_name || who.user.email || "",
           userId: who.user.id, isAdmin, canBill, canCertify };
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
