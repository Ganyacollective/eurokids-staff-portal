// The one place an enquiry is created or touched from outside the hub: the
// website form, the tablet at reception, the IVR's call webhook, the hub's
// own "New enquiry" sheet. A phone number is the identity, so the same family
// arriving three ways is one record with three events — and a call that later
// walks in is upgraded, never duplicated.
//
// The shape mirrors the Coda Enquiry Database the school ran for 18 months:
// multi-select programme / lead source / admission stage, a status whose
// "form taken, fee pending" middle state matters, a 0–10 sentiment slider.
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, esc, SCHOOL_NAME, SCHOOL_PHONE, plainFooter } from "@/lib/brand-email";
import { sendWhatsApp } from "@/lib/whatsapp";
import { sendMail, mailReady } from "@/lib/mailer";

export type Source = "Walk In" | "Call" | "Website" | "Leadsquare" | "Instagram" | "Referral" | "Just Dial" | "WhatsApp" | "Others";
export type Status = "in_progress" | "form_taken" | "won" | "almost_lost" | "lost";
export const STATUS_LABEL: Record<Status, string> = {
  in_progress: "In progress", form_taken: "Form taken · fee pending", won: "Won", almost_lost: "Almost lost", lost: "Lost",
};

export type CaptureInput = {
  source: Source;
  child_name?: string | null; dob?: string | null; sex?: "Boy" | "Girl" | null; programs?: string[] | null;
  father_name?: string | null; father_phone?: string | null; father_email?: string | null;
  mother_name?: string | null; mother_phone?: string | null; mother_email?: string | null;
  address?: string | null;
  message?: string | null;
  actor?: string | null;
  at?: string | null;
  detail?: Record<string, unknown>;
  sendWelcome?: boolean;            // hello to the family
  notifySchool?: boolean;           // heads-up to the office
};

export const phoneKey = (p?: string | null) => {
  const d = String(p || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};
export const isEmail = (s?: string | null) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const clean = (s?: string | null, max = 200) => { const v = String(s ?? "").trim().slice(0, max); return v || null; };
const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter(Boolean) as string[])];

export type EnquiryRow = {
  id: number; child_name: string | null; programs: string[]; status: Status; sources: string[]; stages: string[];
  sentiment: number | null; father_name: string | null; father_phone: string | null; father_email: string | null;
  mother_name: string | null; mother_phone: string | null; mother_email: string | null; address: string | null;
  first_visit_at: string | null; visit_at: string | null; welcome_email_sent_at: string | null; welcome_wa_sent_at: string | null;
  phone_key: string | null; dob: string | null; sex: string | null;
};

const EVENT_KIND: Record<Source, string> = {
  "Walk In": "walk_in", Call: "call_in", Website: "website", Leadsquare: "form", Instagram: "form", Referral: "form",
  "Just Dial": "form", WhatsApp: "whatsapp", Others: "form",
};
const EVENT_LABEL: Record<Source, string> = {
  "Walk In": "Walked in", Call: "Called the school", Website: "Enquired on the website", Leadsquare: "Came via Leadsquare",
  Instagram: "Came via Instagram", Referral: "Referred by a parent", "Just Dial": "Came via Just Dial", WhatsApp: "Messaged on WhatsApp", Others: "Enquired",
};
// The admission stage Coda would have ticked for each way of arriving.
const STAGE_FOR: Partial<Record<Source, string>> = { "Walk In": "1st Premise Visit", Call: "1st Call Contact", WhatsApp: "1st Whatsapp Contact", Leadsquare: "Leadsquare" };

export async function captureEnquiry(admin: SupabaseClient, input: CaptureInput) {
  const key = phoneKey(input.father_phone) || phoneKey(input.mother_phone);
  const at = input.at || new Date().toISOString();
  const actor = input.actor || "system";
  const tbl = admin.schema("eurokids");
  const programs = uniq(input.programs || []);

  let existing: EnquiryRow | null = null;
  if (key) {
    const { data } = await tbl.from("enquiry").select("*").eq("phone_key", key)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    existing = (data as EnquiryRow) || null;
  }

  let row: EnquiryRow; let created = false;
  if (existing) {
    // Fill blanks, never overwrite what a person typed earlier. Sources and
    // stages accumulate, the way Coda's multi-selects did.
    const patch: Record<string, unknown> = { updated_by: actor };
    const fill = (k: keyof EnquiryRow, v: string | null | undefined) => { if (v && !existing![k]) patch[k] = v; };
    fill("child_name", clean(input.child_name)); fill("dob", input.dob || null); fill("sex", input.sex || null);
    fill("father_name", clean(input.father_name)); fill("father_email", clean(input.father_email)?.toLowerCase());
    fill("mother_name", clean(input.mother_name)); fill("mother_phone", clean(input.mother_phone, 30));
    fill("mother_email", clean(input.mother_email)?.toLowerCase()); fill("address", clean(input.address, 400));
    patch.programs = uniq([...(existing.programs || []), ...programs]);
    patch.sources = uniq([...(existing.sources || []), input.source]);
    const st = STAGE_FOR[input.source];
    patch.stages = uniq([...(existing.stages || []), st || null]);
    if (input.source === "Walk In" && !existing.first_visit_at) patch.first_visit_at = at;
    const { data } = await tbl.from("enquiry").update(patch).eq("id", existing.id).select("*").maybeSingle();
    row = (data as EnquiryRow) || existing;
  } else {
    const { data, error } = await tbl.from("enquiry").insert({
      sources: [input.source], stages: STAGE_FOR[input.source] ? [STAGE_FOR[input.source]] : [],
      status: "in_progress", sentiment: input.source === "Walk In" ? 6 : 5,
      child_name: clean(input.child_name), dob: input.dob || null, sex: input.sex || null, programs,
      father_name: clean(input.father_name), father_phone: clean(input.father_phone, 30), father_email: clean(input.father_email)?.toLowerCase() || null,
      mother_name: clean(input.mother_name), mother_phone: clean(input.mother_phone, 30), mother_email: clean(input.mother_email)?.toLowerCase() || null,
      address: clean(input.address, 400),
      first_contact_at: at, first_visit_at: input.source === "Walk In" ? at : null,
      updated_by: actor,
    }).select("*").maybeSingle();
    if (error || !data) throw new Error(error?.message || "Could not save the enquiry");
    row = data as EnquiryRow; created = true;
  }

  const summary = `${EVENT_LABEL[input.source]}${created ? "" : " again"}${input.message ? ` — “${String(input.message).trim().slice(0, 160)}”` : ""}`;
  await tbl.from("enquiry_event").insert({
    enquiry_id: row.id, at, kind: created ? "created" : EVENT_KIND[input.source], summary, actor,
    detail: { ...(input.detail || {}), source: input.source, message: clean(input.message, 2000) },
  });
  if (created) await tbl.from("enquiry_event").insert({ enquiry_id: row.id, at, kind: EVENT_KIND[input.source], summary: EVENT_LABEL[input.source], actor });

  // ── hello to the family ────────────────────────────────────────────────
  const welcome: { email?: string; whatsapp?: string } = {};
  if (input.sendWelcome) {
    const to = uniq([row.father_email, row.mother_email].filter(isEmail));
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
      const r = await sendWhatsApp({ to: wa, template: process.env.WHATSAPP_WELCOME_TEMPLATE || "enquiry_welcome", params: [row.child_name || "your child"] });
      welcome.whatsapp = r.status;
      if (r.status === "sent") {
        await tbl.from("enquiry").update({ welcome_wa_sent_at: new Date().toISOString() }).eq("id", row.id);
        await tbl.from("enquiry_event").insert({ enquiry_id: row.id, kind: "whatsapp", summary: `Welcome WhatsApp sent to ${wa}`, actor: "system" });
      }
    }
  }
  // ── heads-up to the office ─────────────────────────────────────────────
  if (input.notifySchool) await notifySchool(row, input.source, created);
  return { enquiry: row, created, welcome };
}

// "A walk-in just arrived": email to the office and a WhatsApp to the owner's
// phone (CallMeBot, the same self-notification the leave form uses).
export async function notifySchool(e: EnquiryRow, source: Source, created: boolean) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://admin.eurokidsjmdenclave.org";
  const who = e.child_name || e.father_name || e.father_phone || "someone";
  const line = `${source === "Walk In" ? "Walk-in" : source} · ${who}${e.programs?.length ? " · " + e.programs.join(", ") : ""}${e.father_phone ? " · " + e.father_phone : ""}${created ? "" : " (known family)"}`;
  const to = (process.env.ENQUIRY_NOTIFY_EMAIL || "admin@eurokidsjmdenclave.org").split(/[,\s]+/).filter(Boolean);
  if (mailReady() && to.length) {
    const html = renderEmail({
      title: source === "Walk In" ? "A family just walked in" : `New enquiry — ${source}`, subtitle: who, theme: "celebration",
      bodyHtml: `<table style="font-size:14px;border-collapse:collapse">
        ${[["Child", e.child_name], ["Programme", (e.programs || []).join(", ")], ["Father", e.father_name], ["Phone", e.father_phone], ["Email", e.father_email],
           ["Mother", e.mother_name], ["Mother's phone", e.mother_phone], ["Area", e.address], ["Sex", e.sex], ["Date of birth", e.dob]]
          .filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#4B5563">${k}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`).join("")}
        </table>
        <p style="margin-top:16px"><a href="${site}/?open=enq_list" style="background:#0A7AFF;color:#fff;padding:9px 14px;border-radius:8px;text-decoration:none;font-weight:600">Open in the hub</a></p>
        ${created ? "" : "<p style='color:#4B5563;font-size:13px'>This family was already on record; this contact has been added to their card.</p>"}`,
    });
    await sendMail({ to, subject: `${source === "Walk In" ? "Walk-in" : "New enquiry"}: ${who}`, html, text: line }).catch(() => {});
  }
  const cmPhone = process.env.WHATSAPP_PHONE, cmKey = process.env.WHATSAPP_API_KEY;
  if (cmPhone && cmKey) {
    await fetch(`https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cmPhone)}&text=${encodeURIComponent("🧒 " + line)}&apikey=${encodeURIComponent(cmKey)}`).catch(() => {});
  }
}

export async function sendEnquiryWelcomeEmail(to: string[], e: EnquiryRow): Promise<"sent" | "skipped" | string> {
  if (!mailReady()) return "skipped";
  const parent = e.father_name || e.mother_name || "Parent";
  const child = e.child_name ? ` for ${esc(e.child_name)}` : "";
  const prog = (e.programs || [])[0];
  const html = renderEmail({
    title: `Thank you for enquiring`, subtitle: SCHOOL_NAME, theme: "school",
    bodyHtml: `
      <p>Dear ${esc(parent)},</p>
      <p>Thank you for your interest in ${SCHOOL_NAME}${child}. We are a EuroKids preschool in Undri, Pune — Est. 2017, trusted by 3000+ parents — with a 6,000 sq ft play area and programmes from Play Group to Euro Senior${prog ? `, including <strong>${esc(prog)}</strong>` : ""}.</p>
      <p>One of us will call you shortly to answer your questions and, if you like, book a visit so ${e.child_name ? esc(e.child_name) : "your child"} can see the school. If you would rather not wait, call us on <a href="tel:+912269622686" style="font-weight:700;text-decoration:none">${SCHOOL_PHONE}</a> or simply reply to this email.</p>
      <p>We look forward to meeting you.</p>`,
    footerNote: `You are receiving this because you enquired at ${SCHOOL_NAME}. If that was not you, please ignore this email.`,
  });
  const text = [`Dear ${parent},`, "", `Thank you for your interest in ${SCHOOL_NAME}${e.child_name ? " for " + e.child_name : ""}. One of us will call you shortly to answer your questions and book a visit. Or call us on ${SCHOOL_PHONE}.`, plainFooter()].join("\n");
  const r = await sendMail({ to, cc: ["admin@eurokidsjmdenclave.org"], subject: `Thank you for enquiring at ${SCHOOL_NAME}`, html, text });
  return r.ok ? "sent" : `failed:${r.status}`;
}

// A crude but honest rate limit for the public endpoints, using audit_log the
// same way forgot-password does.
export async function tooManyHits(admin: SupabaseClient, action: string, ip: string, max = 20) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count } = await admin.from("audit_log").select("id", { count: "exact", head: true })
    .eq("action", action).eq("entity_id", ip).gte("created_at", since);
  if ((count || 0) >= max) return true;
  await admin.from("audit_log").insert({ action, entity_type: "public", entity_id: ip }).then(() => {}, () => {});
  return false;
}
