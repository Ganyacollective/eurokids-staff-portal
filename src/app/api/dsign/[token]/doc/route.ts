import { NextResponse } from "next/server";
import { admin } from "@/lib/docs-auth";
import type { DocData } from "@/lib/doc-pdf";

// The declaration as text, so it can be read at the width of a phone rather
// than scrolled sideways as an A4 PDF.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const { data: r } = await admin().from("signature_request")
    .select("doc, token_expires_at").eq("token", token).maybeSingle();
  if (!r) return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 404 });
  if (r.token_expires_at && new Date(r.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 410 });
  }
  const d = r.doc as DocData;
  return NextResponse.json({ ok: true, doc: {
    title: d.title, issuedOn: d.issuedOn, intro: d.intro, clauses: d.clauses,
    declaration: d.declaration, childName: d.childName, partyName: d.partyName,
    signedByName: d.signedByName, signedByRole: d.signedByRole,
  } });
}
