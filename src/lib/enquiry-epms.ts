// An enquiry closes itself when the child turns up on the roll.
//
// 195 of 198 enquiries sat open. Not because anybody was careless — because
// closing one is a chore with no reward, and the person who knows the family
// joined is the person entering them into EPMS, not the person who owns the
// enquiry book. So the two books never met and conversion could not be
// measured at all.
//
// EPMS already lands here every morning: epms.children holds 227 of them. The
// join simply was not being made.
//
// Matching is on names, because EPMS gives us no phone numbers at all —
// mobile1 and mobile2 are null on every row. That is a weaker key than a
// number, so the rule is deliberately conservative: the child's name must
// match exactly, and the father's name must agree too. Where the father's
// name is missing or disagrees, nothing is closed and a person is asked.

import type { SupabaseClient } from "@supabase/supabase-js";

export type EpmsChild = {
  uin: string; student_name: string; father_name: string | null;
  program_name: string | null; student_status: string | null; academic_year: string | null;
};

export type EnqLite = {
  id: number; child_name: string | null; father_name: string | null; mother_name: string | null;
  status: string; first_contact_at: string; programs: string[] | null;
};

export type Match = {
  enquiry_id: number; uin: string;
  child: string; enquiry_father: string | null; epms_father: string | null;
  programme: string | null; epms_status: string | null;
  confident: boolean; why: string;
};

const norm = (s?: string | null) => String(s || "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const words = (s?: string | null) => new Set(norm(s).split(" ").filter(w => w.length > 2));

// Do two Indian names refer to one person? "Amit sinha" and "Amit Kumar
// Sinha"; "Aliasgar shabbirHusain Saifee" and "Aliasagar Shabbirhusain
// Saifee"; "Ranjan Rakesh" and "Mr Ranjan Rakesh". A shared distinctive word
// is worth more than an exact string, and titles are noise.
const TITLES = new Set(["mr", "mrs", "ms", "dr", "shri", "smt"]);
function samePerson(a?: string | null, b?: string | null): "yes" | "maybe" | "no" {
  const A = [...words(a)].filter(w => !TITLES.has(w));
  const B = [...words(b)].filter(w => !TITLES.has(w));
  if (!A.length || !B.length) return "maybe";          // one side is blank: unknown, not wrong
  const shared = A.filter(w => B.includes(w));
  if (shared.length >= 2) return "yes";
  if (shared.length === 1) {
    // One shared word is enough only when it is most of both names — "Sunil
    // Gawas" against "Sunil Prakash Gawas" — not when two long names happen
    // to share a common surname.
    return (A.length <= 2 || B.length <= 2) ? "yes" : "maybe";
  }
  // No shared word at all. EPMS sometimes has the child's own name in the
  // father field, which is their data error and not a different family.
  return "no";
}

// Someone who actually joined. Quit and TransferOut are children who left;
// their enquiry should not be marked won on the strength of a name.
const JOINED = ["newadmission", "transferin", "carriedforward"];

export async function findAdmitted(admin: SupabaseClient): Promise<{ matches: Match[]; scanned: number; roll: number }> {
  const [{ data: enq }, { data: kids }] = await Promise.all([
    admin.schema("eurokids").from("enquiry")
      .select("id, child_name, father_name, mother_name, status, first_contact_at, programs")
      .not("status", "in", "(won,lost)"),
    admin.schema("epms").from("children")
      .select("uin, student_name, father_name, program_name, student_status, academic_year"),
  ]);

  const enquiries = (enq || []) as EnqLite[];
  const roll = (kids || []) as EpmsChild[];

  // One child's name can belong to two children on a roll of 227, and closing
  // the wrong enquiry is the kind of error nobody ever goes looking for.
  const byName = new Map<string, EpmsChild[]>();
  for (const k of roll) {
    if (!JOINED.includes(norm(k.student_status).replace(/\s/g, ""))) continue;
    const n = norm(k.student_name);
    if (!n) continue;
    const list = byName.get(n);
    if (list) list.push(k); else byName.set(n, [k]);
  }

  const matches: Match[] = [];
  for (const e of enquiries) {
    const n = norm(e.child_name);
    if (!n) continue;
    const candidates = byName.get(n);
    if (!candidates?.length) continue;

    if (candidates.length > 1) {
      matches.push({
        enquiry_id: e.id, uin: candidates[0].uin, child: e.child_name!,
        enquiry_father: e.father_name, epms_father: candidates[0].father_name,
        programme: candidates[0].program_name, epms_status: candidates[0].student_status,
        confident: false,
        why: `${candidates.length} children on the roll share this name, so which one this family is cannot be decided from a name.`,
      });
      continue;
    }

    const k = candidates[0];

    // EPMS sometimes holds the child's own name in the father field — Izhaan
    // Khan's record says his father is Izhaan Khan. The surname then agrees
    // with almost any family of that name, so the corroboration is worthless
    // exactly where it looks strongest. Their record is malformed; a person
    // should glance at it rather than have it closed on a shared "Khan".
    const fatherIsChild = norm(k.father_name) === norm(k.student_name);

    const agree = samePerson(e.father_name, k.father_name);
    const confident = agree === "yes" && !fatherIsChild;
    matches.push({
      enquiry_id: e.id, uin: k.uin, child: e.child_name!,
      enquiry_father: e.father_name, epms_father: k.father_name,
      programme: k.program_name, epms_status: k.student_status,
      confident,
      why: confident
        ? `On the roll as ${k.program_name || "a pupil"}, and the father's name agrees.`
        : fatherIsChild
          ? `On the roll as ${k.program_name || "a pupil"}, but the EPMS record has the child's own name in the father's field, so there is nothing there to confirm the family.`
          : agree === "maybe"
            ? `On the roll as ${k.program_name || "a pupil"}, but there is no father's name on one side to confirm it.`
            : `On the roll with this child's name, but the father's name does not match what we have.`,
    });
  }

  return { matches, scanned: enquiries.length, roll: roll.length };
}

// Closing them. Only the confident ones, and only ever from open to won — an
// enquiry somebody deliberately marked lost is not reopened by a name.
export async function closeAdmitted(admin: SupabaseClient, matches: Match[], actor: string) {
  const tbl = admin.schema("eurokids");
  const now = new Date().toISOString();
  let closed = 0;

  for (const m of matches.filter(x => x.confident)) {
    const { error } = await tbl.from("enquiry").update({
      status: "won", won_at: now, admitted_uin: m.uin, updated_at: now, updated_by: actor,
    }).eq("id", m.enquiry_id).in("status", ["in_progress", "form_taken", "almost_lost"]);
    if (error) continue;

    await tbl.from("enquiry_event").insert({
      enquiry_id: m.enquiry_id, at: now, kind: "won", actor,
      summary: `Joined — on the EuroKids roll as ${m.uin}${m.programme ? `, ${m.programme}` : ""}.`,
      detail: { uin: m.uin, matched_on: "child and father name", from_epms: true },
    });
    closed++;
  }
  return closed;
}
