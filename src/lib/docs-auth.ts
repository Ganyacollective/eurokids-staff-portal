// Who may send a parent declaration, and the shared plumbing for doing it.
//
// Deliberately a different gate from the appointment letters: the coordinator
// runs admissions and day care and must be able to send these, and must never
// be able to open a letter with a salary in it.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { fillDoc, type DocData } from "./doc-pdf";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

export type Caller = { ok: true; email: string; userId: string } | { ok: false; status: number; error: string };

export async function requireDocuments(req: Request): Promise<Caller> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { ok: false, status: 401, error: "Not signed in." };
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return { ok: false, status: 401, error: "Not signed in." };

  const a = admin();
  const [{ data: mods }, { data: prof }] = await Promise.all([
    a.from("module_access").select("module").eq("user_id", who.user.id).in("module", ["admission", "finance"]),
    a.from("profiles").select("role").eq("id", who.user.id).maybeSingle(),
  ]);
  if (!((mods && mods.length) || prof?.role === "admin")) {
    return { ok: false, status: 403, error: "You need the Admission or Finance permission to send documents for signature." };
  }
  return { ok: true, email: who.user.email || "", userId: who.user.id };
}

export type DocTemplate = {
  id: number; slug: string; name: string; title: string; intro: string;
  clauses: { heading: string; body: string }[];
  fields: { key: string; label: string; placeholder?: string; required?: boolean }[];
  declaration: string;
};

export const longDate = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

// Turn a template plus what the coordinator typed into the document itself.
export function buildDoc(
  tpl: DocTemplate,
  input: { childName?: string | null; childUin?: string | null; partyName: string;
           email?: string | null; phone?: string | null; values: Record<string, string> },
  opts: { issuedOn?: Date; signUrl?: string | null; signedByName?: string; signedByRole?: string } = {},
): DocData {
  const vars: Record<string, string> = {
    ...input.values,
    child_name: input.childName || "your child",
    parent_name: input.partyName,
    school: "EuroKids JMD Enclave",
  };
  const issued = opts.issuedOn || new Date();
  return {
    title: fillDoc(tpl.title, vars),
    issuedOn: longDate(issued),
    intro: fillDoc(tpl.intro, vars),
    clauses: (tpl.clauses || []).map((c) => ({ heading: c.heading, body: fillDoc(c.body, vars) })),
    declaration: fillDoc(tpl.declaration, vars),
    partyName: input.partyName,
    partyRole: "Parent / Guardian",
    childName: input.childName || null,
    childUin: input.childUin || null,
    contact: { email: input.email || null, phone: input.phone || null },
    signedByName: opts.signedByName || "Neeta Saxena",
    signedByRole: opts.signedByRole || "Owner and Director",
    signUrl: opts.signUrl ?? null,
  };
}

// What is still missing before this can be sent or signed.
export function missingForDoc(tpl: DocTemplate, input: {
  childName?: string | null; partyName?: string | null; email?: string | null;
  values: Record<string, string>; channel: "link" | "in_person";
}): string[] {
  const gaps: string[] = [];
  if (!input.childName?.trim()) gaps.push("the child's name");
  if (!input.partyName?.trim()) gaps.push("the parent's name");
  if (input.channel === "link" && !input.email?.trim()) gaps.push("an email address to send it to");
  for (const f of tpl.fields || []) {
    if (f.required && !String(input.values?.[f.key] || "").trim()) gaps.push(f.label.toLowerCase());
  }
  return gaps;
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

export function clientIp(req: Request) {
  const h = req.headers;
  return (h.get("x-forwarded-for") || "").split(",")[0].trim()
    || h.get("x-real-ip") || h.get("cf-connecting-ip") || "";
}

export async function logDocEvent(a: SupabaseClient, requestId: number, event: string,
                                  detail: Record<string, unknown> = {}, req?: Request) {
  await a.from("signature_event").insert({
    request_id: requestId, event, detail,
    ip: req ? clientIp(req) : null,
    agent: req ? (req.headers.get("user-agent") || "").slice(0, 300) : null,
  });
}
