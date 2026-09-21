import { NextResponse } from "next/server";
import { requireDocuments, admin, buildDoc, type DocTemplate } from "@/lib/docs-auth";
import { renderDocumentPdf } from "@/lib/doc-pdf";

// POST /api/docs/preview — the document exactly as it would go out. Nothing
// is saved; the coordinator should always be able to read it first.
export async function POST(req: Request) {
  const who = await requireDocuments(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const body = await req.json().catch(() => ({}));
  const a = admin();
  const { data: tpl } = await a.from("document_template").select("*").eq("id", body.template_id).maybeSingle();
  if (!tpl) return NextResponse.json({ ok: false, error: "That form no longer exists." }, { status: 404 });

  const doc = buildDoc(tpl as DocTemplate, {
    childName: body.child_name, childUin: body.child_uin, partyName: body.party_name || "",
    email: body.to_email, phone: body.to_phone, values: body.values || {},
  });
  const pdf = await renderDocumentPdf(doc);
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=\"preview.pdf\"", "Cache-Control": "no-store" },
  });
}
