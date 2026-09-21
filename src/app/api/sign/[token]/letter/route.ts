import { NextResponse } from "next/server";
import { admin } from "@/lib/letters-auth";
import type { LetterData } from "@/lib/letter-pdf";

// GET /api/sign/[token]/letter — the letter as text, for reading on a phone.
//
// The signing page used to embed the PDF. A PDF is A4 wide whatever the
// screen is, so on a phone you had to scroll sideways to finish a sentence —
// and nobody signs a document they cannot read. The same words are returned
// here as structured text, and the page lays them out at the width of the
// hand holding it. The PDF is still one tap away, and it is still the thing
// that gets signed and filed.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const a = admin();
  const { data: l } = await a.from("appointment_letter")
    .select("snapshot, token_expires_at").eq("token", token).maybeSingle();
  if (!l) return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 404 });
  if (l.token_expires_at && new Date(l.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 410 });
  }

  const d = (l.snapshot as { data?: LetterData })?.data;
  if (!d) return NextResponse.json({ ok: false, error: "This letter has no content." }, { status: 500 });

  return NextResponse.json({
    ok: true,
    letter: {
      title: d.title, issuedOn: d.issuedOn,
      name: d.name, address: d.address || [],
      page1Body: d.page1Body,
      terms: d.terms || [],
      closing: d.closing || null,
      signedByName: d.signedByName, signedByRole: d.signedByRole,
    },
  });
}
