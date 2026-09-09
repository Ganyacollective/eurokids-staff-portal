// UIN → EPMS admission id.
//
// We call a child EK/1769/0170/2627. Every Fee Collection action inside EPMS
// calls the same child 0ef269e3-9ab2-480c-a1b7-60fcbd19167e, and that id is in
// no report — it exists only on the Admission screen. So this is a phone book
// between the two, and nothing that touches EPMS's payment side works without it.
//
// Fetching /Admission/ManageAdmission returns 64 KB of page with a single table
// row in it: the header. The 192 children arrive afterwards, because the grid is
// a DataTables 1.9 table with bServerSide, which POSTs back to that same URL and
// gets JSON. So we skip the page entirely and make that POST ourselves.
//
// Legacy DataTables sends its parameters flat (sEcho, iDisplayStart, …) or as an
// indexed array of {name,value} pairs, depending on how jQuery serialised them,
// and which one the server reads is an implementation detail of whichever helper
// EPMS used. We try flat first and fall back, rather than guessing.
//
// It is rebuilt automatically: nightly, and again on demand the first time a
// child is found missing from it. Nobody should have to run it by hand.
import { SupabaseClient } from "@supabase/supabase-js";
import { epmsLogin, EPMS, jarHeader, jarAdd, type Jar } from "@/lib/epms-session";

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const UIN = /EK\/\d+\/\d+\/\d+/i;
const GRID = "/Admission/ManageAdmission?ProgramName=";

// The 11 columns the grid declares, in order. Only their count matters to the
// server; the names are here so the request looks like the browser's.
const COLS = ["AdmissionDate", "UIN", "Student.StudentName", "Student.FatherName",
  "ProgramName", "BatchName", "Mobile1", "Mobile2", "AdmissionType", "Action", "Id"];

function flatParams(start: number, length: number) {
  const p = new URLSearchParams({
    sEcho: "1", sColumns: COLS.join(","), iColumns: String(COLS.length),
    iDisplayStart: String(start), iDisplayLength: String(length),
    sSearch: "", bRegex: "false", iSortingCols: "0",
  });
  COLS.forEach((c, i) => {
    p.append(`mDataProp_${i}`, String(i));
    p.append(`bSearchable_${i}`, "true");
    p.append(`sSearch_${i}`, "");
    p.append(`bRegex_${i}`, "false");
    p.append(`bSortable_${i}`, "true");
  });
  return p;
}

// jQuery's serialisation of DataTables' aoData array: [0][name]=…&[0][value]=…
function indexedParams(start: number, length: number) {
  const flat = flatParams(start, length);
  const p = new URLSearchParams();
  let i = 0;
  for (const [name, value] of flat) {
    p.append(`[${i}][name]`, name);
    p.append(`[${i}][value]`, value);
    i++;
  }
  return p;
}

async function post(jar: Jar, body: URLSearchParams) {
  const res = await fetch(`${EPMS}${GRID}`, {
    method: "POST",
    headers: {
      Cookie: jarHeader(jar),
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${EPMS}/Admission/ManageAdmission`,
    },
    body: body.toString(),
  });
  jarAdd(jar, res);
  return res.text();
}

type Grid = { aaData?: unknown[][]; iTotalRecords?: number; iTotalDisplayRecords?: number };

export async function harvestAdmissionIds(admin: SupabaseClient, jar?: Jar) {
  const j = jar || (await epmsLogin());

  // 500 covers a school of 192 several times over; if EPMS ever caps the page
  // size, the total it reports tells us and we walk the rest.
  let text = await post(j, flatParams(0, 500));
  let grid: Grid | null = null;
  try { grid = JSON.parse(text) as Grid; } catch { /* try the other shape */ }
  if (!grid?.aaData) {
    text = await post(j, indexedParams(0, 500));
    try { grid = JSON.parse(text) as Grid; } catch { grid = null; }
  }
  if (!grid?.aaData) {
    if (/name="UserName"/i.test(text)) throw new Error("EPMS bounced back to the login page.");
    throw new Error(`The Admission grid did not return JSON (${text.slice(0, 120).replace(/\s+/g, " ")}…)`);
  }

  const rows: unknown[][] = [...grid.aaData];

  // Walk the remaining pages if the grid held more than one.
  const total = Number(grid.iTotalDisplayRecords ?? grid.iTotalRecords ?? rows.length);
  for (let start = rows.length; start < total && start < 5000; start += 500) {
    const more = await post(j, flatParams(start, 500));
    try {
      const g = JSON.parse(more) as Grid;
      if (!g.aaData?.length) break;
      rows.push(...g.aaData);
    } catch { break; }
  }

  // Each row is an array of cells, some of them HTML. The UIN sits in one cell
  // and the id is buried in the action links of another, so the whole row is
  // searched rather than any particular column — EPMS can reorder them freely.
  const seen = new Map<string, { uin: string; admission_id: string; student_name: string | null }>();
  for (const row of rows) {
    const cells = row.map((c) => String(c ?? ""));
    const line = cells.join(" | ");
    const uin = line.match(UIN)?.[0];
    const gid = line.match(GUID)?.[0];
    if (!uin || !gid) continue;
    const name = cells.map((c) => c.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim())
      .find((c) => c && !UIN.test(c) && !GUID.test(c) && !/^\d{2}-\d{2}-\d{4}$/.test(c)) || null;
    seen.set(uin, { uin, admission_id: gid.toLowerCase(), student_name: name });
  }

  const list = [...seen.values()];
  if (!list.length) throw new Error(`The grid returned ${rows.length} row(s) but none carried both a UIN and an id.`);

  const { error } = await admin.schema("epms").from("admission_ids")
    .upsert(list.map((f) => ({ ...f, seen_at: new Date().toISOString() })), { onConflict: "uin" });
  if (error) throw new Error(error.message);
  return { harvested: list.length, jar: j };
}
