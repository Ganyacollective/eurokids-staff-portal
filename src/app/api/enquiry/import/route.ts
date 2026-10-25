// Bringing the Coda enquiry database into the hub, from the browser.
//
// This existed already as scripts/coda_enquiries_to_sql.py, which is why the
// hub was four hundred families behind: importing meant a terminal, a Python
// script and the service-role key, so in practice it happened once and never
// again. The export is a two-click download from Coda; the import should be
// the same, and it should be something Abhinav can do himself at the desk.
//
// The matching rule is the script's, exactly — coda_row_id is
// "coda-" + sha1(child|father_phone|created.isoformat())[:16] — because 196
// rows were loaded with that scheme and a different one would duplicate every
// single one of them. The Python is the reference implementation; the hash
// here is deliberately a literal port, down to the ISO format, and the
// preview below is what proves the two still agree.
//
// Rows that already exist are left completely alone. The hub is the source of
// truth for a family it already knows: somebody has since marked them won, or
// admitted them, or corrected a number, and a re-import must not undo that.
// So this only ever inserts families that are not here yet.

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 602 rows with their notes takes a while; the default would cut it off.
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Importing rewrites the shape of the enquiry list for everybody, so it sits
// behind the same gate as changing who is notified: an admin, not merely
// somebody with Admission.
async function gate(req: NextRequest, db: SupabaseClient) {
  const auth = req.headers.get("authorization") || "";
  if (!/^bearer /i.test(auth)) return "Not signed in.";
  const asUser = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data } = await asUser.auth.getUser();
  if (!data?.user) return "Not signed in.";
  const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (p?.role !== "admin") return "Only an admin can import the enquiry database.";
  return null;
}

/* ── the CSV ──────────────────────────────────────────────────────────
   Hand-rolled rather than a library, because the only hard part is quoted
   fields containing commas and newlines — and Coda's notes columns are full
   of both, which is why the file has 755 lines for 602 families. */
function parseCsv(text: string): Record<string, string>[] {
  const s = text.replace(/^﻿/, "");          // Coda exports with a BOM
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false, atFieldStart = true;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    }
    // A quote only opens a quoted field at the very start of that field.
    // Taking any quote as an opener is what broke this: the notes are full of
    // bare inch marks and stray quotes mid-sentence, one of those flipped the
    // parser into quoted mode, and from there every newline inside a genuinely
    // quoted cell ended a row. One family whose name cell reads
    // "Contacts Name\n\nShaharsh randveer" came out as three rows, two of them
    // nonsense. 604 rows where Python's csv module reads 602.
    else if (c === '"' && atFieldStart) { q = true; atFieldStart = false; }
    else if (c === ",") { row.push(cell); cell = ""; atFieldStart = true; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; atFieldStart = true; }
    else if (c !== "\r") { cell += c; atFieldStart = false; }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// Coda's own header spelling is inconsistent — "Father's Name " has a
// trailing space in the export — so columns are matched case- and
// space-insensitively rather than by exact string.
const g = (r: Record<string, string>, ...names: string[]): string | null => {
  for (const n of names) {
    for (const k of Object.keys(r)) {
      if (k.trim().toLowerCase() === n.toLowerCase()) {
        const v = (r[k] || "").trim();
        if (v) return v;
      }
    }
  }
  return null;
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "Fri, 23 Oct 2026, 10:52 AM", "10 March 2024", "Tue 27 Oct" (no year).
// Coda writes "Sept" for September, which no date parser accepts.
function stamp(v: string | null, defaultYear?: number): Date | null {
  if (!v) return null;
  const s = v.replace(/\bSept\b/g, "Sep").replace(/^[A-Za-z]{3},?\s+/, "").trim();
  const m = s.match(
    /^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?(?:,?\s+(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm])?$/,
  );
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon === undefined) return null;
    const year = m[3] ? Number(m[3]) : defaultYear;
    if (!year) return null;
    let h = m[4] ? Number(m[4]) : 0;
    if (m[6]) { const pm = m[6].toLowerCase() === "p"; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
    return new Date(year, mon, Number(m[1]), h, m[5] ? Number(m[5]) : 0, 0, 0);
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

// Python's datetime.isoformat() — seconds always present, never a timezone.
// The hash depends on this string character for character.
const isoLocal = (d: Date) => {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
// Written as +05:30 because that is the clock the dates were typed on.
const tsIST = (d: Date) => `${isoLocal(d)}+05:30`;
const dateOnly = (d: Date) => isoLocal(d).slice(0, 10);
const multi = (v: string | null) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);

type Parsed = {
  rows: Record<string, unknown>[];
  notes: { cid: string; body: string; author: string; at: string }[];
  unparsed: string[];
};

function build(csv: string): Parsed {
  const rows: Record<string, unknown>[] = [];
  const notes: Parsed["notes"] = [];
  const unparsed = new Set<string>();

  for (const r of parseCsv(csv)) {
    const created = stamp(g(r, "Created on")) || new Date();
    const st = multi(g(r, "Inquiry Status"));
    // Coda lets more than one status be ticked, and "Won" alongside "In
    // progress" is the admissions form having been taken but not returned —
    // which is a stage of its own here, not a win.
    let status = "in_progress";
    if (st.includes("Won") && st.includes("In progress")) status = "form_taken";
    else if (st.includes("Won")) status = "won";
    else if (st.includes("Almost Lost")) status = "almost_lost";
    else if (st.includes("Lost") || st.includes("Closed")) status = "lost";

    const stages = multi(g(r, "Admission Stage"));
    const srcs = multi(g(r, "Lead Source"));
    for (const c of ["Follow-Up Date", "Call Date", "Vist Schedule"]) {
      const v = g(r, c);
      if (v && !stamp(v, created.getFullYear())) unparsed.add(`${c}: ${v}`);
    }
    const fu = stamp(g(r, "Follow-Up Date"), created.getFullYear());
    const cd = stamp(g(r, "Call Date"), created.getFullYear());
    const vs = stamp(g(r, "Vist Schedule"), created.getFullYear());
    const dob = stamp(g(r, "Date of Birth"));
    const worked = stamp(g(r, "Worked Last On"));
    const sentRaw = g(r, "Sentiment Tracker");
    const child = g(r, "Child's Name");
    const fphone = g(r, "Father Phone Number");
    const sex = g(r, "Sex");

    // The script's key, character for character — and "character for
    // character" is the whole job. Python formats a missing value into an
    // f-string as "None"; JavaScript writes "null". 248 of the 602 rows have
    // no child name or no father's number, so interpolating them the
    // JavaScript way changed the hash on 41% of the file and would have
    // inserted a second copy of every one of those families. Verified by
    // emitting both implementations' hash input and diffing them, which is
    // the only way this kind of mismatch shows itself.
    const py = (v: string | null) => (v === null ? "None" : v);
    const cid = "coda-" + createHash("sha1")
      .update(`${py(child)}|${py(fphone)}|${isoLocal(created)}`)
      .digest("hex").slice(0, 16);

    rows.push({
      coda_row_id: cid,
      created_at: tsIST(created),
      updated_at: tsIST(worked || created),
      updated_by: g(r, "Edited Last By"),
      academic_year: g(r, "Academic Year") || "26-27",
      child_name: child,
      dob: dob ? dateOnly(dob) : null,
      sex: sex === "Boy" || sex === "Girl" ? sex : null,
      programs: multi(g(r, "Program")),
      father_name: g(r, "Father's Name", "Father's Name "),
      father_phone: fphone,
      father_email: (g(r, "Father's Email") || "").toLowerCase() || null,
      mother_name: g(r, "Mother's Name"),
      mother_phone: g(r, "Mother's Phone Number"),
      mother_email: (g(r, "Mother's Email") || "").toLowerCase() || null,
      address: g(r, "Address"),
      sources: srcs,
      stages,
      status,
      sentiment: sentRaw ? Math.trunc(Number(sentRaw)) : null,
      visit_at: vs ? tsIST(vs) : null,
      call_status: g(r, "Call Status"),
      call_date: cd ? dateOnly(cd) : null,
      follow_up_on: fu ? dateOnly(fu) : null,
      first_contact_at: tsIST(created),
      // A premise visit on the record means they came; the date Coda kept is
      // the date of the enquiry, which for a walk-in is the same day.
      first_visit_at: stages.includes("1st Premise Visit") ? tsIST(created) : null,
    });

    for (const [who, coln] of [["Neeta", "Neeta Notes"], ["Diya", "Diya's Notes"], ["Sunita", "Sunita's Notes"]]) {
      const v = g(r, coln);
      if (v) notes.push({ cid, body: v, author: who, at: tsIST(worked || created) });
    }
  }
  return { rows, notes, unparsed: [...unparsed].slice(0, 12) };
}

export async function POST(req: NextRequest) {
  const db = admin();
  const bad = await gate(req, db);
  if (bad) return NextResponse.json({ ok: false, error: bad }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const csv = String(body.csv || "");
  const dryRun = body.commit !== true;
  if (!csv.trim()) return NextResponse.json({ ok: false, error: "No file." }, { status: 400 });

  let parsed: Parsed;
  try { parsed = build(csv); } catch (e) {
    return NextResponse.json({ ok: false, error: `That file did not read as a Coda export: ${(e as Error).message}` }, { status: 400 });
  }
  if (!parsed.rows.length) {
    return NextResponse.json({ ok: false, error: "No rows in that file. Is it the Enquiry Database export?" }, { status: 400 });
  }

  const tbl = db.schema("eurokids");
  const ids = parsed.rows.map((r) => r.coda_row_id as string);
  // Which of these are already here. Chunked, because a few hundred ids in
  // one `in` list is a very long URL.
  const present = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await tbl.from("enquiry").select("coda_row_id").in("coda_row_id", ids.slice(i, i + 200));
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    for (const r of data || []) present.add(r.coda_row_id as string);
  }

  const fresh = parsed.rows.filter((r) => !present.has(r.coda_row_id as string));
  const summary = {
    in_file: parsed.rows.length,
    already_here: parsed.rows.length - fresh.length,
    to_add: fresh.length,
    notes_in_file: parsed.notes.length,
    unparsed_dates: parsed.unparsed,
    sample: fresh.slice(0, 5).map((r) => ({
      child: r.child_name, phone: r.father_phone, created: r.created_at, status: r.status,
    })),
  };
  // Preview first, always. Four hundred families is not something to find out
  // about afterwards.
  if (dryRun) return NextResponse.json({ ok: true, dry_run: true, ...summary });

  let added = 0;
  for (let i = 0; i < fresh.length; i += 100) {
    const chunk = fresh.slice(i, i + 100);
    const { error } = await tbl.from("enquiry").insert(chunk);
    if (error) {
      return NextResponse.json(
        { ok: false, error: `Stopped after ${added}: ${error.message}`, ...summary, added },
        { status: 500 },
      );
    }
    added += chunk.length;
  }

  // Notes and the opening timeline entry, for the rows that now exist.
  // Keyed through coda_row_id rather than the id we just inserted, so this is
  // the same whether a row arrived now or in the first import.
  let notesAdded = 0;
  if (parsed.notes.length) {
    const byCid = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await tbl.from("enquiry").select("id, coda_row_id").in("coda_row_id", ids.slice(i, i + 200));
      for (const r of data || []) byCid.set(r.coda_row_id as string, r.id as number);
    }
    // Only for families added in this run: re-adding a note somebody has
    // since edited in the hub would be a second copy of it.
    const freshIds = new Set(fresh.map((r) => r.coda_row_id as string));
    const payload = parsed.notes
      .filter((n) => freshIds.has(n.cid) && byCid.has(n.cid))
      .map((n) => ({ enquiry_id: byCid.get(n.cid)!, body: n.body, author: n.author, created_at: n.at }));
    for (let i = 0; i < payload.length; i += 200) {
      const { error } = await tbl.from("enquiry_note").insert(payload.slice(i, i + 200));
      if (!error) notesAdded += Math.min(200, payload.length - i);
    }

    const events = fresh.map((r) => ({
      enquiry_id: byCid.get(r.coda_row_id as string)!,
      at: r.first_contact_at,
      kind: "created",
      summary: `Imported from Coda${(r.sources as string[]).length ? ` (${(r.sources as string[]).join(", ")})` : ""}`,
      actor: "coda import",
    })).filter((e) => e.enquiry_id);
    for (let i = 0; i < events.length; i += 200) {
      await tbl.from("enquiry_event").insert(events.slice(i, i + 200));
    }
  }

  return NextResponse.json({ ok: true, dry_run: false, ...summary, added, notes_added: notesAdded });
}
