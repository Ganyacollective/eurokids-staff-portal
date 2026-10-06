import { NextResponse } from "next/server";
import { requireBilling, admin } from "@/lib/billing-auth";
import { buildDocFor } from "@/lib/daycare-billing";
import { renderInvoicePdf, type InvoiceDoc } from "@/lib/invoice-pdf";
import { pdfDisposition } from "@/lib/pdf-name";

// A sent invoice is rebuilt from its frozen copy; a draft is built live, so
// the preview shows what pressing Send would produce.
export async function GET(req: Request) {
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "Which invoice?" }, { status: 400 });

  const a = admin();
  const { data: inv } = await a.from("daycare_invoice").select("doc, status").eq("id", id).maybeSingle();
  if (!inv) return NextResponse.json({ ok: false, error: "No such invoice." }, { status: 404 });
  const doc = (inv.status === "sent" && inv.doc ? inv.doc : await buildDocFor(a, id)) as InvoiceDoc | null;
  if (!doc) return NextResponse.json({ ok: false, error: "Could not build it." }, { status: 500 });

  return new NextResponse(Buffer.from(await renderInvoicePdf(doc)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfDisposition([
        doc.kind === "reimbursement" ? "Fee receipt" : "Daycare invoice", doc.childName, doc.number]),
      "Cache-Control": "no-store",
    },
  });
}
