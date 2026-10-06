import { NextResponse } from "next/server";
import { admin } from "@/lib/billing-auth";
import { renderCertificatePdf, type CertificateDoc } from "@/lib/certificate-pdf";
import { pdfDisposition } from "@/lib/pdf-name";

// GET /api/rcert/<token> — the parent's own copy, no account.
//
// Public by design: a parent forwards this to their employer's finance team,
// who have no reason to hold a login for a preschool. The token is 24 random
// bytes, and the document carries nothing a finance team should not see.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { data: cert } = await admin().from("reimbursement_certificate")
    .select("doc, cancelled_at").eq("public_token", token).maybeSingle();
  if (!cert) return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 404 });
  if (cert.cancelled_at) return NextResponse.json({ ok: false, error: "This receipt was cancelled. Please ask the school for a fresh one." }, { status: 410 });

  const doc = cert.doc as CertificateDoc;
  return new NextResponse(Buffer.from(await renderCertificatePdf(doc)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfDisposition(["Fee receipt", doc.childName, doc.periodLabel]),
      "Cache-Control": "no-store",
    },
  });
}
