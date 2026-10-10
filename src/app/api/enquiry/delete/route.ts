// Deleting an enquiry.
//
// A real delete, not a hidden flag: a duplicate or a mistyped walk-in should
// leave nothing behind. Its events and notes go with it (the foreign keys
// cascade), and so does the photograph the reception tablet took — that file
// is a person's face and has no reason to outlive the record it belongs to.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const [{ data: mods }, { data: prof }] = await Promise.all([
    admin.from("module_access").select("module").eq("user_id", who.user.id)
      .in("module", ["admission", "finance"]),
    admin.from("profiles").select("role, full_name").eq("id", who.user.id).maybeSingle(),
  ]);
  if (!((mods && mods.length) || prof?.role === "admin")) {
    return NextResponse.json({ ok: false, error: "You need Admission or Finance." }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!id) return NextResponse.json({ ok: false, error: "Which enquiry?" }, { status: 400 });

  const tbl = admin.schema("eurokids");
  const { data: row } = await tbl.from("enquiry")
    .select("id, child_name, father_name, father_phone, intake_photo").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "No such enquiry." }, { status: 404 });

  // The photo first. If the row went and this failed, the file would be
  // orphaned in a bucket with nothing left pointing at it.
  if (row.intake_photo) {
    const { error } = await admin.storage.from("intake").remove([row.intake_photo]);
    if (error) {
      return NextResponse.json({ ok: false,
        error: `The photo could not be removed, so nothing was deleted: ${error.message}` }, { status: 500 });
    }
  }

  const { error } = await tbl.from("enquiry").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Who removed what, kept outside the enquiry so it survives the deletion.
  // before_json holds the row as it was: the point of the entry is being able
  // to say who the family were, which the deleted row can no longer answer.
  const { error: logErr } = await admin.from("audit_log").insert({
    actor_id: who.user.id,
    action: "enquiry_deleted", entity_type: "enquiry", entity_id: String(id),
    before_json: {
      by: prof?.full_name || who.user.email,
      child: row.child_name, parent: row.father_name, phone: row.father_phone,
      had_photo: !!row.intake_photo,
    },
  });
  // Said out loud rather than swallowed. The deletion has already happened, so
  // this is not a failure to undo — but a trail nobody is told is missing is
  // worse than no trail at all.
  if (logErr) console.error("[enquiry delete] it went, but the audit entry did not:", logErr.message);

  return NextResponse.json({ ok: true, deleted: row.child_name || row.father_name || String(id) });
}
