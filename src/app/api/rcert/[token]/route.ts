import { NextResponse } from "next/server";
import { admin } from "@/lib/billing-auth";
import { renderInvoicePdf, type InvoiceDoc } from "@/lib/invoice-pdf";
import { pdfDisposition } from "@/lib/pdf-name";

// GET /api/rcert/<token> — the family's own copy, no account.
//
// Public by design: a parent forwards this to their employer's finance team,
// who have no reason to hold a login for a preschool. Rebuilt from the frozen
// copy, so the link and the emailed attachment can never say different things.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { data: inv } = await admin().from("daycare_invoice")
    .select("doc, status").eq("public_token", token).maybeSingle();
  if (!inv?.doc) return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 404 });
  if (inv.status === "void") {
    return NextResponse.json({ ok: false, error: "This document was cancelled. Please ask the school for a fresh one." }, { status: 410 });
  }
  const doc = inv.doc as InvoiceDoc;
  return new NextResponse(Buffer.from(await renderInvoicePdf(doc)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfDisposition([
        doc.kind === "reimbursement" ? "Fee receipt" : "Daycare invoice", doc.childName, doc.number]),
      "Cache-Control": "no-store",
    },
  });
}
