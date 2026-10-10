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
// Called through plain fetch rather than the SDK: one request, one shape, and
// no dependency to keep patched for the sake of it.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

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

The reason must say what actually matched, naming it — "same child and both in Undri", not "high similarity". If they are siblings, say so.`;

export type Judgement = { a: number; b: number; confidence: number; reason: string };

export async function judge(cands: Candidate[]): Promise<Judgement[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set, so pairs cannot be judged.");
  if (!cands.length) return [];

  const body = cands.map((c, i) =>
    `Pair ${i + 1} (the database noticed: ${c.signal})\nA:\n${describe(c.a)}\nB:\n${describe(c.b)}`
  ).join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2000, system: PROMPT,
      messages: [{ role: "user", content: body }],
    }),
  });

  if (!res.ok) throw new Error(`Claude said ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const text: string = (json.content || []).map((c: { text?: string }) => c.text || "").join("");

  // The model is told to return JSON and does, but a stray sentence either
  // side would otherwise throw away a whole batch of real answers.
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Claude's answer was not JSON.");
  const parsed = JSON.parse(m[0]) as { results?: Judgement[] };

  const valid = new Set(cands.map(c => `${c.a.id}|${c.b.id}`));
  return (parsed.results || [])
    .map(r => ({ a: Number(r.a), b: Number(r.b), confidence: Math.max(0, Math.min(100, Number(r.confidence) || 0)), reason: String(r.reason || "").slice(0, 300) }))
    // Only pairs we actually asked about: a hallucinated id would otherwise
    // become a suggestion to merge two families nobody compared.
    .filter(r => valid.has(`${Math.min(r.a, r.b)}|${Math.max(r.a, r.b)}`));
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
