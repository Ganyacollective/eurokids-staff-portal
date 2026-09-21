import { NextResponse } from "next/server";
import { admin } from "@/lib/letters-auth";
import { renderLetterPdf, LetterData } from "@/lib/letter-pdf";

// The letter itself, rebuilt from the frozen snapshot every time.
//
// Rebuilt rather than stored, before signing: the snapshot is the source of
// truth and a stored file could drift from it. After signing the rendered
// bytes include the signature and the audit block, and the hash recorded at
// send time still covers the unsigned original.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const a = admin();
  const { data: l } = await a.from("appointment_letter")
    .select("id, employee_name, snapshot, status, token_expires_at")
    .eq("token", token).maybeSingle();
  if (!l) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (l.token_expires_at && new Date(l.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 410 });
  }

  const data = (l.snapshot as { data: LetterData })?.data;
  if (!data) return NextResponse.json({ ok: false, error: "This letter has no content." }, { status: 500 });

  const pdf = await renderLetterPdf(data);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Appointment Letter - ${l.employee_name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
