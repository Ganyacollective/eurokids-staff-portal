// UIN → EPMS admission id.
//
// We call a child EK/1769/0170/2627. Every Fee Collection action inside EPMS
// calls the same child 0ef269e3-9ab2-480c-a1b7-60fcbd19167e, and that id is in
// no report — it exists only in the markup of the Admission screen. So this is
// a phone book between the two, and nothing that touches EPMS's payment side
// can work without it.
//
// It is rebuilt automatically: nightly, and again on demand the first time a
// child is found missing from it. Nobody should ever have to run it by hand.
import { SupabaseClient } from "@supabase/supabase-js";
import { epmsLogin, epmsGet, type Jar } from "@/lib/epms-session";

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const UIN = /EK\/\d+\/\d+\/\d+/i;

export async function harvestAdmissionIds(admin: SupabaseClient, jar?: Jar) {
  const j = jar || (await epmsLogin());
  // The roster is a DataTable, and its paging happens in the browser — so the
  // page as the server renders it holds every child, not the first hundred.
  const html = await epmsGet(j, "/Admission/ManageAdmission");

  const seen = new Map<string, { uin: string; admission_id: string; student_name: string | null }>();
  for (const m of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const tr = m[0];
    const uin = tr.match(UIN)?.[0];
    const gid = tr.match(GUID)?.[0];
    if (!uin || !gid) continue;
    const cells = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((c) => c[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim());
    seen.set(uin, { uin, admission_id: gid.toLowerCase(), student_name: cells[2] || null });
  }

  const list = [...seen.values()];
  if (!list.length) throw new Error("Found no rows carrying both a UIN and an id — the Admission page may have changed.");

  const { error } = await admin.schema("epms").from("admission_ids")
    .upsert(list.map((f) => ({ ...f, seen_at: new Date().toISOString() })), { onConflict: "uin" });
  if (error) throw new Error(error.message);
  return { harvested: list.length, jar: j };
}
