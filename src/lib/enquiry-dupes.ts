// Two records that might be one family.
//
// A phone number already merges on its own the moment an enquiry is captured,
// so everything that reaches here is a case a phone number cannot settle: the
// mother rang from her number in January, the father walked in with his in
// February, and the child is the same child. Of 199 enquiries carried over
// from Coda, exactly one pair looks like this — "Noyan Ashraf" under two
// different numbers — which is the right order of magnitude. This is not a
// bulk cleaning tool; it is for finding the few.
//
// Nothing here merges anything. It proposes, with a reason, and a person
// decides. A wrong merge mixes two families' records together and there is no
// clean way back, so the model is allowed to raise its hand and nothing more.

import type { SupabaseClient } from "@supabase/supabase-js";
import { askJson, MODELS } from "@/lib/claude";

export type Candidate = {
  a: EnqLite; b: EnqLite;
  // What the database noticed. Passed to the model as a hint, and kept if the
  // model is unavailable so the pair is still worth a human glance.
  signal: string;
};

export type EnqLite = {
  id: number; child_name: string | null; dob: string | null; sex: string | null;
  father_name: string | null; father_phone: string | null; father_email: string | null;
  mother_name: string | null; mother_phone: string | null;
  address: string | null; programs: string[]; sources: string[];
  first_contact_at: string; status: string;
};

const FIELDS = "id, child_name, dob, sex, father_name, father_phone, father_email, mother_name, mother_phone, address, programs, sources, first_contact_at, status";

// Pairs worth a second look. Deliberately generous — the model throws the
// rubbish out, and a candidate that is never raised can never be found.
export async function findCandidates(admin: SupabaseClient, limit = 40): Promise<Candidate[]> {
  const { data, error } = await admin.rpc("enquiry_duplicate_candidates", { max_pairs: limit });
  if (error) throw new Error(error.message);
  const rows = (data || []) as { a_id: number; b_id: number; signal: string }[];
  if (!rows.length) return [];

  const ids = [...new Set(rows.flatMap(r => [r.a_id, r.b_id]))];
  const { data: full } = await admin.schema("eurokids").from("enquiry").select(FIELDS).in("id", ids);
  const by = new Map((full || []).map((e) => [e.id as number, e as EnqLite]));

  return rows
    .map(r => ({ a: by.get(r.a_id)!, b: by.get(r.b_id)!, signal: r.signal }))
    .filter(c => c.a && c.b);
}

// ── asking Claude ───────────────────────────────────────────────────────────
//
// Through the shared client in lib/claude, so the key, the timeout and the
// call log are the same here as everywhere else. This one uses the judge
// model rather than the writing model: the answer that earns its keep is the
// refusal — two different boys called Shivansh, different fathers, different
// societies — and that is worth more than the fraction of a paisa saved.

const describe = (e: EnqLite) => [
  `  id: ${e.id}`,
  e.child_name ? `  child: ${e.child_name}` : "  child: (not recorded)",
  e.dob ? `  date of birth: ${e.dob}` : null,
  e.sex ? `  sex: ${e.sex}` : null,
  e.father_name ? `  father: ${e.father_name}` : null,
  e.father_phone ? `  father's phone: ${e.father_phone}` : null,
  e.father_email ? `  father's email: ${e.father_email}` : null,
  e.mother_name ? `  mother: ${e.mother_name}` : null,
  e.mother_phone ? `  mother's phone: ${e.mother_phone}` : null,
  e.address ? `  area: ${e.address}` : null,
  e.programs?.length ? `  programmes: ${e.programs.join(", ")}` : null,
  `  first contact: ${String(e.first_contact_at).slice(0, 10)} via ${e.sources.join(", ") || "unknown"}`,
].filter(Boolean).join("\n");

const PROMPT = `You are helping a preschool in Pune tidy its enquiry book.

Each enquiry is one family asking about admission. The same family sometimes appears twice: they rang in once and walked in later, or the mother gave her number the first time and the father his the second. The school wants those joined into one record — but only when they really are the same family.

Indian names are written many ways across records: "Md Azaz Ashraf" and "Mohd. Azaz" may be one man; "Noyan" and "Noyaan" one child. Weigh that. But two different children with a common first name are NOT the same family, and siblings at the same address are two different children who should stay separate.

For each pair, answer with your confidence that they are the same family:
- 90-100: near certain — the child's name matches and something else corroborates it (area, parent's name, date of birth).
- 70-89: likely, worth a person looking.
- 40-69: possible but thin.
- 0-39: different families, or siblings.

Reply with JSON only: {"results":[{"a":<id>,"b":<id>,"confidence":<0-100>,"reason":"<one short sentence a receptionist would understand>"}]}

About the reason, which somebody will read and act on:

Say what actually matched, naming it — "same child's name, both in Undri" rather than "high similarity". If they are siblings, say so.

Do not write any phone number, and do not compare, transform or reason about digits. You cannot reliably tell whether two numbers are a typo of each other, and a wrong claim about numbers is worse than no claim because it reads as evidence. The system already knows whether the numbers match; say "the numbers differ" if it matters and leave it there.

Every fact in the reason must be one you were given above. Never state a date of birth, an area, a parent's name or a programme that is not written in the record in front of you. If what you have is thin, say that instead of filling the gap — "same child's name and nothing else to go on" is an honest and useful reason.`;

export type Judgement = { a: number; b: number; confidence: number; reason: string };

export async function judge(cands: Candidate[], log?: SupabaseClient, actor?: string | null): Promise<Judgement[]> {
  if (!cands.length) return [];

  const body = cands.map((c, i) =>
    `Pair ${i + 1} (the database noticed: ${c.signal})\nA:\n${describe(c.a)}\nB:\n${describe(c.b)}`
  ).join("\n\n");

  const parsed = await askJson<{ results?: Judgement[] }>({
    feature: "duplicate_judge", model: MODELS.judge, maxTokens: 2000,
    system: PROMPT, user: body, log, actor,
    entityId: cands.map(c => `${c.a.id}/${c.b.id}`).join(","),
  });

  const valid = new Set(cands.map(c => `${c.a.id}|${c.b.id}`));
  return (parsed.results || [])
    .map(r => ({
      a: Number(r.a), b: Number(r.b),
      confidence: Math.max(0, Math.min(100, Number(r.confidence) || 0)),
      reason: scrubReason(String(r.reason || "")),
    }))
    // Only pairs we actually asked about: a hallucinated id would otherwise
    // become a suggestion to merge two families nobody compared.
    .filter(r => valid.has(`${Math.min(r.a, r.b)}|${Math.max(r.a, r.b)}`));
}

// The reason is the part a person reads and acts on, so it is the part that
// has to be true.
//
// Asked about Noyan Ashraf, the model reached the right answer — same child,
// probably one family — and then explained it by saying the two numbers
// "differ by only one digit (8789761799 vs 8789731799)". The second number
// does not exist in the record or anywhere else. The verdict was sound and
// the evidence was invented, which is the worse half: a coordinator reads a
// specific-sounding justification and merges two families on it.
//
// The prompt now forbids writing numbers at all. This is the part that does
// not depend on the model having listened. Any run of digits long enough to
// be a phone number is cut out, and a reason that was mostly such a claim is
// replaced rather than left as a sentence with a hole in it.
function scrubReason(raw: string): string {
  const reason = raw.trim().slice(0, 300);
  if (!/\d{5,}/.test(reason)) return reason;

  const cleaned = reason
    .replace(/\(?\s*\+?\d[\d\s-]{4,}\d\s*(vs\.?|and|versus)?\s*\+?[\d\s-]*\)?/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();

  // If stripping the invented digits left nothing that still argues anything,
  // say plainly that the reason was discarded. Silence is better than a
  // confident fragment.
  return cleaned.length < 25
    ? "The model's explanation mentioned phone numbers it could not have known, so it was discarded. Compare the two records yourself."
    : cleaned;
}

// ── joining two records ─────────────────────────────────────────────────────
//
// The older record survives, because its id is the one already written on
// paper, in emails and in anybody's memory. Everything the younger one knows
// that the older one does not is copied across — never the reverse, so a blank
// can fill a blank but nothing overwrites a fact. Its events, notes and calls
// are re-pointed, and only then is it deleted.
export async function mergeEnquiries(admin: SupabaseClient, keepId: number, dropId: number, actor: string) {
  const tbl = admin.schema("eurokids");
  const { data: rows } = await tbl.from("enquiry").select("*").in("id", [keepId, dropId]);
  const keep = rows?.find(r => r.id === keepId);
  const drop = rows?.find(r => r.id === dropId);
  if (!keep || !drop) throw new Error("One of those enquiries is no longer there.");

  const fill = ["child_name", "dob", "sex", "father_name", "father_phone", "father_email",
    "mother_name", "mother_phone", "mother_email", "address", "admitted_uin", "intake_photo", "intake_photo_at"] as const;

  const patch: Record<string, unknown> = {};
  for (const f of fill) if (!keep[f] && drop[f]) patch[f] = drop[f];

  const union = (a?: string[] | null, b?: string[] | null) => [...new Set([...(a || []), ...(b || [])])];
  patch.programs = union(keep.programs, drop.programs);
  patch.sources = union(keep.sources, drop.sources);
  patch.stages = union(keep.stages, drop.stages);

  // The earliest contact is the truth about when this family first appeared,
  // whichever row happens to be surviving.
  if (drop.first_contact_at < keep.first_contact_at) patch.first_contact_at = drop.first_contact_at;
  if (drop.first_visit_at && (!keep.first_visit_at || drop.first_visit_at < keep.first_visit_at)) patch.first_visit_at = drop.first_visit_at;
  patch.updated_at = new Date().toISOString();
  patch.updated_by = actor;

  const { error: upErr } = await tbl.from("enquiry").update(patch).eq("id", keepId);
  if (upErr) throw new Error(upErr.message);

  // History moves before the row goes, so nothing is orphaned if this fails
  // halfway: the worst case is two records that both hold the whole story.
  for (const t of ["enquiry_event", "enquiry_note", "call_log"]) {
    const { error } = await tbl.from(t).update({ enquiry_id: keepId }).eq("enquiry_id", dropId);
    if (error) throw new Error(`Could not move the ${t.replace("_", " ")}: ${error.message}`);
  }

  await tbl.from("enquiry_event").insert({
    enquiry_id: keepId, kind: "note", actor,
    summary: `Merged enquiry #${dropId} into this one — ${drop.child_name || drop.father_name || drop.father_phone || "no name"}.`,
  });

  const { error: delErr } = await tbl.from("enquiry").delete().eq("id", dropId);
  if (delErr) throw new Error(delErr.message);

  return { keptId: keepId, droppedId: dropId, filled: Object.keys(patch) };
}
