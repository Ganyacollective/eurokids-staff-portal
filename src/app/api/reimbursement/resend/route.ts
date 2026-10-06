import { NextResponse } from "next/server";
import { requireBilling, admin } from "@/lib/billing-auth";
import { sendCertificateEmail } from "@/lib/reimbursement";
import { renderCertificatePdf, type CertificateDoc } from "@/lib/certificate-pdf";

// POST /api/reimbursement/resend — "I need January's again."
//
// Re-renders the FROZEN copy. It must not become a new certificate with
// today's prices and today's spelling of the family's name; it is the same
// document, sent twice.
export async function POST(req: Request) {
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const b = await req.json().catch(() => ({}));
  const a = admin();
  const { data: cert } = await a.from("reimbursement_certificate")
    .select("id, doc, email_to, party_id, cancelled_at").eq("id", Number(b.id)).maybeSingle();
  if (!cert) return NextResponse.json({ ok: false, error: "No such certificate." }, { status: 404 });
  if (cert.cancelled_at) return NextResponse.json({ ok: false, error: "That certificate was cancelled." }, { status: 409 });

  let to = String(b.to || cert.email_to || "").trim();
  if (!to) {
    const { data: party } = await a.from("billing_party").select("email").eq("id", cert.party_id).maybeSingle();
    to = String(party?.email || "").trim();
  }
  if (!to) return NextResponse.json({ ok: false, error: "There is no email address for this family." }, { status: 400 });

  const doc = cert.doc as CertificateDoc;
  const pdf = await renderCertificatePdf(doc);
  const r = await sendCertificateEmail(a, cert.id, pdf, doc, to);
  return r.ok ? NextResponse.json({ ok: true, sent_to: to })
              : NextResponse.json({ ok: false, error: r.error }, { status: 502 });
}
