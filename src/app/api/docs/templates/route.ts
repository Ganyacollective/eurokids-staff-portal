import { NextResponse } from "next/server";
import { requireDocuments, admin } from "@/lib/docs-auth";

// GET /api/docs/templates — the forms the coordinator can choose from.
export async function GET(req: Request) {
  const who = await requireDocuments(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const { data } = await admin().from("document_template")
    .select("id, slug, name, title, intro, clauses, fields, declaration")
    .eq("is_active", true).eq("audience", "parent").order("sort");
  return NextResponse.json({ ok: true, templates: data || [] });
}
