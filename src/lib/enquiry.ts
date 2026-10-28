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
  // Which parent the number belongs to, when somebody actually asked. Null
  // means it is parked, not claimed, and the family may move it themselves.
  phone_owner?: "mother" | "father" | null;
  message?: string | null;
  actor?: string | null;
  at?: string | null;
  detail?: Record<string, unknown>;
  sendWelcome?: boolean;            // hello to the family
  notifySchool?: boolean;           // heads-up to the office
  // Set false when the caller writes a better line of its own. A logged call
  // already appears in the timeline from call_log, with who took it and how
  // long it lasted; "Called the school" underneath that is the same fact
  // twice, in less detail.
  logArrival?: boolean;
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
  // Which parent the number belongs to, when somebody actually said so.
  phone_owner: "mother" | "father" | null;
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

// Did the family type this themselves, or did we write it down for them?
// The tablet at reception and the website form are the family's own words;
// everything else is a member of staff's record of a conversation.
const fromFamilySource = (s: Source) => s === "Walk In" || s === "Website";

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
  // Conflicts found while merging, so they can be put on the record below.
  const clashes: { field: string; was: string; now: string }[] = [];
  if (existing) {
    // Who typed it decides who wins.
    //
    // This used to fill blanks and never overwrite, on the reasoning that a
    // person had typed the earlier value. True, but the wrong person: a name
    // taken down over the phone is us hearing it, and we mishear. When the
    // same family then stands at reception and types it themselves, theirs is
    // the correct spelling of their own child's name — and it was being
    // discarded in favour of our mishearing, silently.
    //
    // So: anything the family entered themselves wins. Anything a member of
    // staff recorded only fills a blank, as before. Every field that
    // disagreed is listed in the timeline and the record is marked for
    // somebody to confirm, because an overwrite nobody can see is just a
    // different way of losing the data.
    const fromFamily = fromFamilySource(input.source);
    const patch: Record<string, unknown> = { updated_by: actor };

    // A parked number finds its owner.
    //
    // When a call came in and nobody asked whose number it was, it sits on
    // father_phone with phone_owner null. If the family then types that same
    // number into the mother's box at reception, it is hers — so it moves,
    // and the father's field is emptied rather than left holding a number
    // that was never his. Only ever a parked number: one somebody actually
    // stated is left alone.
    if (fromFamily && !existing.phone_owner) {
      const same = (a?: string | null, b2?: string | null) => !!a && !!b2 && phoneKey(a) === phoneKey(b2);
      const saidMother = clean(input.mother_phone, 30);
      const saidFather = clean(input.father_phone, 30);
      if (saidMother && same(saidMother, existing.father_phone) && !same(saidMother, saidFather)) {
        patch.mother_phone = saidMother; patch.father_phone = saidFather || null;
        if (!saidFather && existing.father_name && !existing.mother_name) {
          patch.mother_name = existing.father_name; patch.father_name = null;
        }
        patch.phone_owner = "mother";
      } else if (saidFather && same(saidFather, existing.mother_phone) && !same(saidFather, saidMother)) {
        patch.father_phone = saidFather; patch.mother_phone = saidMother || null;
        if (!saidMother && existing.mother_name && !existing.father_name) {
          patch.father_name = existing.mother_name; patch.mother_name = null;
        }
        patch.phone_owner = "father";
      } else if (saidMother || saidFather) {
        patch.phone_owner = saidMother && !saidFather ? "mother" : "father";
      }
    }
    const put = (k: keyof EnquiryRow, v: string | null | undefined, label: string) => {
      if (!v) return;
      const was = existing![k] as string | null;
      if (!was) { patch[k] = v; return; }                 // a blank is always filled
      if (String(was).trim() === String(v).trim()) return; // nothing to argue about
      if (!fromFamily) return;                             // staff never overwrite staff
      patch[k] = v;
      clashes.push({ field: label, was: String(was), now: String(v) });
    };
    put("child_name", clean(input.child_name), "Child's name");
    put("dob", input.dob || null, "Date of birth");
    put("sex", input.sex || null, "Boy / Girl");
    put("father_name", clean(input.father_name), "Father's name");
    put("father_phone", clean(input.father_phone, 30), "Father's phone");
    put("father_email", clean(input.father_email)?.toLowerCase(), "Father's email");
    put("mother_name", clean(input.mother_name), "Mother's name");
    put("mother_phone", clean(input.mother_phone, 30), "Mother's phone");
    put("mother_email", clean(input.mother_email)?.toLowerCase(), "Mother's email");
    put("address", clean(input.address, 400), "Address");
    patch.programs = uniq([...(existing.programs || []), ...programs]);
    patch.sources = uniq([...(existing.sources || []), input.source]);
    const st = STAGE_FOR[input.source];
    patch.stages = uniq([...(existing.stages || []), st || null]);
    if (input.source === "Walk In" && !existing.first_visit_at) patch.first_visit_at = at;
    if (clashes.length) patch.needs_check = true;
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
      // A family filling the form themselves has said which box is whose.
      phone_owner: input.phone_owner
        ?? (fromFamilySource(input.source) ? (clean(input.mother_phone, 30) && !clean(input.father_phone, 30) ? "mother" : clean(input.father_phone, 30) ? "father" : null) : null),
      first_contact_at: at, first_visit_at: input.source === "Walk In" ? at : null,
      updated_by: actor,
    }).select("*").maybeSingle();
    if (error || !data) throw new Error(error?.message || "Could not save the enquiry");
    row = data as EnquiryRow; created = true;
  }

  // One line per thing that actually happened.
  //
  // This wrote two events for a single arrival — "Called the school — “…”"
  // and then "Called the school" again a line below — and the message was
  // echoed into the first, while the same message was also saved as a note
  // and shown in its own right. One logged call produced four entries in the
  // timeline, three of them saying the same thing. The note is the note; the
  // event is what happened.
  //
  // "again" also meant the wrong thing. It was appended whenever the record
  // already existed, so a family who had only ever phoned and then walked in
  // for the first time was recorded as having "Walked in again". It now means
  // what it says: this is not the first time they have arrived THIS way.
  const seenBefore = !created && (existing?.sources || []).includes(input.source);
  const summary = `${EVENT_LABEL[input.source]}${seenBefore ? " again" : ""}`;
  const events: Record<string, unknown>[] = [];
  if (input.logArrival !== false) {
    events.push({
      enquiry_id: row.id, at, kind: created ? "created" : EVENT_KIND[input.source], summary, actor,
      detail: { ...(input.detail || {}), source: input.source, message: clean(input.message, 2000) },
    });
  }
  // What the family corrected, in their words and ours, so the old value is
  // never simply gone.
  if (clashes.length) {
    events.push({
      enquiry_id: row.id, at, kind: "conflict", actor,
      summary: `The family corrected ${clashes.length === 1 ? "something" : clashes.length + " things"} we had down differently — `
        + clashes.map(c => `${c.field}: “${c.was}” → “${c.now}”`).join("; "),
      detail: { clashes, source: input.source },
    });
  }
  if (events.length) await tbl.from("enquiry_event").insert(events);

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
  // `admin` is passed on so the recipients come from the table rather than
  // the old environment variable.
  if (input.notifySchool) await notifySchool(row, input.source, created, admin);
  return { enquiry: row, created, welcome };
}

// "A walk-in just arrived": email to the office and a WhatsApp to the owner's
// phone (CallMeBot, the same self-notification the leave form uses).
// Who should hear about this one.
//
// This used to be an environment variable: one list of addresses, the same for
// every source, changeable only by a deploy. It is now the people who already
// have accounts here, each having said which sources they want — so the person
// who needs to know a family is standing at reception is not the person
// drowning in Instagram messages.
//
// If nobody has chosen anything yet, the old address still gets it. An empty
// table means the feature has not been set up, not that the office should stop
// being told.
//
// "Nobody has chosen anything" has to mean no row has a single source ticked,
// not merely that the table has no rows. A row with sources: [] is exactly
// what you get from opening the notification settings and saving without
// ticking a box, and for two months that silently turned off every enquiry
// email — website, walk-in and all — because the table was not empty so the
// fallback never fired, and no user wanted any source so the list came back
// empty. Enquiries were being saved and nobody was being told about them.
const fallbackRecipients = () =>
  (process.env.ENQUIRY_NOTIFY_EMAIL || "admin@eurokidsjmdenclave.org").split(/[,\s]+/).filter(Boolean);

export async function notifyRecipients(admin: SupabaseClient, source: Source): Promise<string[]> {
  // select("*") rather than naming the columns.
  //
  // Naming them couples this query to PostgREST's cached view of the table.
  // The email column was added minutes before a deploy, the cache had not
  // caught up, the select was rejected — and the line below treated that
  // rejection as "nobody is configured", quietly posted the enquiry to the
  // old office address and reported success. Nothing in the timeline said
  // anything had gone wrong. select("*") returns whatever the table has.
  const { data, error } = await admin.schema("eurokids").from("enquiry_notify").select("*");

  // A failure here must never again look like an empty list. The office
  // address is still the right thing to fall back to — somebody must hear
  // about the family — but the reason is now on the record instead of
  // vanishing.
  if (error) {
    // audit_log, not enquiry_event: enquiry_id is NOT NULL there, so the
    // record of the failure would itself have failed, silently, which is the
    // same joke twice.
    await admin.from("audit_log").insert({
      action: "enquiry_notify_unreadable",
      entity_type: "enquiry_notify",
      entity_id: source,
      after_json: { message: error.message, code: (error as { code?: string }).code ?? null },
    }).then(() => {}, () => {});
    console.error("notifyRecipients: enquiry_notify unreadable", error);
    return fallbackRecipients();
  }
  if (!data?.length) return fallbackRecipients();
  // Has anybody expressed a preference at all?
  if (!data.some(r => (r.sources || []).length)) return fallbackRecipients();

  const picked = data.filter(r => (r.sources || []).includes(source));
  // A row is either a hub user or a bare address.
  //
  // Hearing about a walk-in and being able to sign in are different things,
  // and tying them together meant a coordinator had to be given a hub account
  // purely to be emailed — which also fails outright when the address already
  // exists as a Staff Portal teacher login, as most of them do.
  const plain = picked.filter(r => r.email).map(r => String(r.email));
  const wants = new Set(picked.filter(r => r.user_id).map(r => r.user_id));
  if (!wants.size) return plain;
  // Addresses live on the auth record, not on profiles.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const users = (list?.users || []).filter(u => wants.has(u.id) && u.email).map(u => u.email!) as string[];
  return [...new Set([...users, ...plain])];
}

// `admin` is required, not optional.
//
// It was optional, and the public enquiry route — the website form and the
// reception tablet, which is where every real enquiry comes from — never
// passed it. The optional parameter meant that omission compiled, ran, sent
// an email, and reported success, while quietly addressing it to the old
// office address and ignoring every choice made in Setup. Nobody could have
// seen that from the outside: the mail arrived, just to one wrong place.
//
// Required, the compiler catches it. There is no sensible default for "who
// should hear about this family", so there should never have been one.
export async function notifySchool(e: EnquiryRow, source: Source, created: boolean, admin: SupabaseClient) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://admin.eurokidsjmdenclave.org";
  const who = e.child_name || e.father_name || e.father_phone || "someone";
  const line = `${source === "Walk In" ? "Walk-in" : source} · ${who}${e.programs?.length ? " · " + e.programs.join(", ") : ""}${e.father_phone ? " · " + e.father_phone : ""}${created ? "" : " (known family)"}`;
  const to = await notifyRecipients(admin, source);
  if (mailReady() && to.length) {
    const html = renderEmail({
      title: source === "Walk In" ? "A family just walked in" : `New enquiry — ${source}`, subtitle: who, theme: "celebration",
      bodyHtml: `<table style="font-size:14px;border-collapse:collapse">
        ${[["Child", e.child_name], ["Programme", (e.programs || []).join(", ")], ["Father", e.father_name], ["Phone", e.father_phone], ["Email", e.father_email],
           ["Mother", e.mother_name], ["Mother's phone", e.mother_phone], ["Area", e.address], ["Sex", e.sex], ["Date of birth", e.dob]]
          .filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#4B5563">${k}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`).join("")}
        </table>
        <p style="margin-top:16px"><a href="${site}/hub.html?open=enquiry&id=${e.id}" style="background:#0A7AFF;color:#fff;padding:9px 14px;border-radius:8px;text-decoration:none;font-weight:600">Open ${esc(who)}</a></p>
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
      <p>One of us will call you shortly to answer your questions and, if you like, book a visit so ${e.child_name ? esc(e.child_name) : "your child"} can see the school. If you would rather not wait, call us on <a href="tel:+912069622686" style="font-weight:700;text-decoration:none">${SCHOOL_PHONE}</a> or simply reply to this email.</p>
      <p>We look forward to meeting you.</p>`,
    footerNote: `You are receiving this because you enquired at ${SCHOOL_NAME}. If that was not you, please ignore this email.`,
  });
  const text = [`Dear ${parent},`, "", `Thank you for your interest in ${SCHOOL_NAME}${e.child_name ? " for " + e.child_name : ""}. One of us will call you shortly to answer your questions and book a visit. Or call us on ${SCHOOL_PHONE}.`, plainFooter()].join("\n");
  const r = await sendMail({ to, subject: `Thank you for enquiring at ${SCHOOL_NAME}`, html, text });
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
