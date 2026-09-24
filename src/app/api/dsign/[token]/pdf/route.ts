import { NextResponse } from "next/server";
import { admin } from "@/lib/docs-auth";
import { renderDocumentPdf, type DocData } from "@/lib/doc-pdf";
import { pdfDisposition } from "@/lib/pdf-name";

// Rebuilt from the frozen copy every time, so the file and the record can
// never drift apart.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { data: r } = await admin().from("signature_request")
    .select("doc, child_name, party_name, status, signed_at, token_expires_at").eq("token", token).maybeSingle();
  if (!r) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (r.token_expires_at && new Date(r.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 410 });
  }
  const pdf = await renderDocumentPdf(r.doc as DocData);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfDisposition([
        (r.doc as DocData).title,
        r.child_name || r.party_name,
        r.status === "signed" ? `signed ${String(r.signed_at || "").slice(0, 10)}` : null,
      ]),
      "Cache-Control": "no-store",
    },
  });
}
