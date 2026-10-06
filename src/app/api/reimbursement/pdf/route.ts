import { NextResponse } from "next/server";
import { requireBilling, admin } from "@/lib/billing-auth";
import { renderCertificatePdf, type CertificateDoc } from "@/lib/certificate-pdf";
import { pdfDisposition } from "@/lib/pdf-name";

// GET /api/reimbursement/pdf?id=42 — rebuilt from the frozen copy every time,
// so the file and the record can never drift apart.
export async function GET(req: Request) {
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "Which certificate?" }, { status: 400 });
  const { data: cert } = await admin().from("reimbursement_certificate")
    .select("doc").eq("id", id).maybeSingle();
  if (!cert) return NextResponse.json({ ok: false, error: "No such certificate." }, { status: 404 });

  const doc = cert.doc as CertificateDoc;
  return new NextResponse(Buffer.from(await renderCertificatePdf(doc)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfDisposition(["Fee receipt", doc.childName, doc.periodLabel]),
      "Cache-Control": "no-store",
    },
  });
}
