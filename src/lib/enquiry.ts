// The one place an enquiry is created or touched from outside the hub: the
// website form, the iPad at reception, the IVR's call webhook, the hub's own
// "New enquiry" sheet. A phone number is the identity, so the same family
// arriving three ways is one record with three events — and a call that later
// walks in is upgraded, never duplicated.
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_PHONE, plainFooter } from "@/lib/brand-email";
import { sendWhatsApp } from "@/lib/whatsapp";

export type Source = "call" | "walk_in" | "website" | "instagram" | "referral" | "just_dial" | "whatsapp" | "other";
export type Stage = "new" | "contacted" | "visit_scheduled" | "visited" | "follow_up" | "admitted" | "lost";

export type CaptureInput = {
  source: Source;
  child_name?: string | null; dob?: string | null; sex?: "Boy" | "Girl" | null; program?: string | null;
  father_name?: string | null; father_phone?: string | null; father_email?: string | null;
  mother_name?: string | null; mother_phone?: string | null; mother_email?: string | null;
  address?: string | null; locality?: string | null;
  message?: string | null;          // free text from a form
  actor?: string | null;            // who recorded it (staff name, "website", "ivr")
  at?: string | null;               // when it happened, if not now
  detail?: Record<string, unknown>; // anything extra worth keeping (raw payload, page URL…)
  sendWelcome?: boolean;            // email + WhatsApp the family straight away
};

export const phoneKey = (p?: string | null) => {
  const d = String(p || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};
export const isEmail = (s?: string | null) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const clean = (s?: string | null, max = 200) => { const v = String(s ?? "").trim().slice(0, max); return v || null; };

export type EnquiryRow = {
  id: number; child_name: string | null; program: string | null; stage: Stage; source: Source; heat: number;
  father_name: string | null; father_phone: string | null; father_email: string | null;
  mother_name: string | null; mother_phone: string | null; mother_email: string | null;
  first_visit_at: string | null; welcome_email_sent_at: string | null; welcome_wa_sent_at: string | null;
  phone_key: string | null;
};

const SOURCE_EVENT: Record<Source, string> = {
  call: "call_in", walk_in: "walk_in", website: "website", instagram: "form", referral: "form",
  just_dial: "form", whatsapp: "whatsapp", other: "form",
};
const SOURCE_LABEL: Record<Source, string> = {
  call: "Called the school", walk_in: "Walked in", website: "Enquired on the website", instagram: "Came via Instagram",
  referral: "Referred by a parent", just_dial: "Came via Just Dial", whatsapp: "Messaged on WhatsApp", other: "Enquired",
};

export async function captureEnquiry(admin: SupabaseClient, input: CaptureInput) {
  const key = phoneKey(input.father_phone) || phoneKey(input.mother_phone);
  const at = input.at || new Date().toISOString();
  const actor = input.actor || "system";
  const tbl = admin.schema("eurokids");

  // ── find the family ────────────────────────────────────────────────────
  let existing: EnquiryRow | null = null;
  if (key) {
    const { data } = await tbl.from("enquiry").select("*").eq("phone_key", key)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    existing = (data as EnquiryRow) || null;
  }

  let row: EnquiryRow; let created = false;
  if (existing) {
    // Fill blanks, never overwrite what a person typed earlier. A walk-in
    // after a call is the journey moving forward: stamp the visit.
    const patch: Record<string, unknown> = {};
    const fill = (k: keyof EnquiryRow, v: string | null | undefined) => { if (v && !existing![k]) patch[k] = v; };
    fill("child_name", clean(input.child_name)); fill("program", clean(input.program, 60));
    fill("father_name", clean(input.father_name)); fill("father_email", clean(input.father_email)?.toLowerCase());
    fill("mother_name", clean(input.mother_name)); fill("mother_phone", clean(input.mother_phone, 30));
    fill("mother_email", clean(input.mother_email)?.toLowerCase());
    if (input.dob) patch.dob = input.dob;
    if (input.sex) patch.sex = input.sex;
    if (clean(input.address, 400)) patch.address = clean(input.address, 400);
    if (input.source === "walk_in" && !existing.first_visit_at) {
      patch.first_visit_at = at;
      if (!["admitted", "lost"].includes(existing.stage)) patch.stage = "visited";
    } else if (existing.stage === "new" && input.source !== "call") {
      patch.stage = "contacted";
    }
    if (Object.keys(patch).length) {
      const { data } = await tbl.from("enquiry").update(patch).eq("id", existing.id).select("*").maybeSingle();
      row = (data as EnquiryRow) || existing;
    } else row = existing;
  } else {
    const { data, error } = await tbl.from("enquiry").insert({
      source: input.source,
      stage: input.source === "walk_in" ? "visited" : "new",
      child_name: clean(input.child_name), dob: input.dob || null, sex: input.sex || null, program: clean(input.program, 60),
      father_name: clean(input.father_name), father_phone: clean(input.father_phone, 30), father_email: clean(input.father_email)?.toLowerCase() || null,
      mother_name: clean(input.mother_name), mother_phone: clean(input.mother_phone, 30), mother_email: clean(input.mother_email)?.toLowerCase() || null,
      address: clean(input.address, 400), locality: clean(input.locality, 120),
      first_contact_at: at, first_visit_at: input.source === "walk_in" ? at : null,
      heat: input.source === "walk_in" ? 3 : 2,
    }).select("*").maybeSingle();
    if (error || !data) throw new Error(error?.message || "Could not save the enquiry");
    row = data as EnquiryRow; created = true;
  }

  // ── the event ──────────────────────────────────────────────────────────
  const summary = `${SOURCE_LABEL[input.source]}${created ? "" : " again"}${input.message ? ` — “${String(input.message).trim().slice(0, 160)}”` : ""}`;
  await tbl.from("enquiry_event").insert({
    enquiry_id: row.id, at, kind: created ? "created" : SOURCE_EVENT[input.source], summary, actor,
    detail: { ...(input.detail || {}), source: input.source, message: clean(input.message, 2000) },
  });
  if (created) await tbl.from("enquiry_event").insert({ enquiry_id: row.id, at, kind: SOURCE_EVENT[input.source], summary: SOURCE_LABEL[input.source], actor });

  // ── say hello ──────────────────────────────────────────────────────────
  const welcome: { email?: string; whatsapp?: string } = {};
  if (input.sendWelcome) {
    const to = [row.father_email, row.mother_email].filter(isEmail) as string[];
    if (to.length && !row.welcome_email_sent_at) {
      const r = await sendEnquiryWelcomeEmail(to, row);
      welcome.email = r;
      if (r === "sent") {
        await tbl.from("enquiry").update({ welcome_email_sent_at: new Date().toISOString() }).eq("id", row.id);
        await tbl.from("enquiry_event").insert({ enquiry_id: row.id, kind: "email", summary: `Welcome email sent to ${to.join(", ")}`, actor: "system" });
      }
    }
    const wa = row.father_phone || row.mother_phone;
    if (wa && !row.welcome_wa_sent_at) {
      const r = await sendWhatsApp({ to: wa, template: process.env.WHATSAPP_WELCOME_TEMPLATE || "enquiry_welcome",
        params: [row.child_name || "your child"] });
      welcome.whatsapp = r.status;
      if (r.status === "sent") {
        await tbl.from("enquiry").update({ welcome_wa_sent_at: new Date().toISOString() }).eq("id", row.id);
        await tbl.from("enquiry_event").insert({ enquiry_id: row.id, kind: "whatsapp", summary: `Welcome WhatsApp sent to ${wa}`, actor: "system" });
      }
    }
  }
  return { enquiry: row, created, welcome };
}

// The first email a family gets. Warm, short, and useful: what we are, where
// we are, and that a real person will call.
export async function sendEnquiryWelcomeEmail(to: string[], e: EnquiryRow): Promise<"sent" | "skipped" | string> {
  const key = process.env.RESEND_API_KEY; if (!key) return "skipped";
  const from = process.env.RESEND_FROM || `${SCHOOL_NAME} <admin@eurokidsjmdenclave.org>`;
  const parent = e.father_name || e.mother_name || "Parent";
  const child = e.child_name ? ` for ${esc(e.child_name)}` : "";
  const html = renderEmail({
    title: `Thank you for enquiring`, subtitle: SCHOOL_NAME, theme: "school",
    bodyHtml: `
      <p>Dear ${esc(parent)},</p>
      <p>Thank you for your interest in ${SCHOOL_NAME}${child}. We are a EuroKids preschool in Undri, Pune — Est. 2017, trusted by 3000+ parents — with a 6,000 sq ft play area and programmes from Play Group to Euro Senior${e.program ? `, including <strong>${esc(e.program)}</strong>` : ""}.</p>
      <p>One of us will call you shortly to answer your questions and, if you like, book a visit so ${e.child_name ? esc(e.child_name) : "your child"} can see the school. If you would rather not wait, call us on <a href="tel:+912269622686" style="font-weight:700;text-decoration:none">${SCHOOL_PHONE}</a> or simply reply to this email.</p>
      <p>We look forward to meeting you.</p>`,
    footerNote: `You are receiving this because you enquired at ${SCHOOL_NAME}. If that was not you, please ignore this email.`,
  });
  const text = [`Dear ${parent},`, "", `Thank you for your interest in ${SCHOOL_NAME}${e.child_name ? " for " + e.child_name : ""}. One of us will call you shortly to answer your questions and book a visit. Or call us on ${SCHOOL_PHONE}.`, plainFooter()].join("\n");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from, to, cc: ["admin@eurokidsjmdenclave.org"], subject: `Thank you for enquiring at ${SCHOOL_NAME}`, html, text }),
  });
  return r.ok ? "sent" : `failed:${r.status}`;
}

// A crude but honest rate limit for the public endpoints, using audit_log the
// same way forgot-password does: too many hits from one IP in ten minutes
// and we stop answering.
export async function tooManyHits(admin: SupabaseClient, action: string, ip: string, max = 20) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin.from("audit_log").select("id", { count: "exact", head: true })
    .eq("action", action).eq("entity_id", ip).gte("created_at", since);
  if ((count || 0) >= max) return true;
  await admin.from("audit_log").insert({ action, entity_type: "public", entity_id: ip }).then(() => {}, () => {});
  return false;
}
