import { NextResponse } from "next/server";
import { admin, logDocEvent } from "@/lib/docs-auth";

// The public face of a declaration: who it is about, and whether it is done.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const a = admin();
  const { data: r } = await a.from("signature_request")
    .select("id, status, child_name, party_name, to_email, to_phone, channel, witnessed_by, doc, token_expires_at, signed_at, signer_name")
    .eq("token", token).maybeSingle();
  if (!r) return NextResponse.json({ ok: false, error: "This link is not valid. Ask the school to send it again." }, { status: 404 });
  if (r.token_expires_at && new Date(r.token_expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "This link has expired. Ask the school for a fresh one." }, { status: 410 });
  }
  if (r.status === "sent") {
    await a.from("signature_request").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", r.id);
    await logDocEvent(a, r.id, "viewed", {}, req);
  }
  const mask = (s?: string | null) => {
    const v = String(s || "");
    if (!v.includes("@")) return v ? "•••• " + v.slice(-4) : "";
    const [u, d] = v.split("@");
    return `${u.slice(0, 2)}${"•".repeat(Math.max(2, u.length - 2))}@${d}`;
  };
  return NextResponse.json({
    // witnessed_by is deliberately not returned: it is a staff email address,
    // the signing page has no use for it, and this response goes to whoever
    // holds the link.
    ok: true, status: r.status, channel: r.channel,
    title: (r.doc as { title?: string })?.title || "Declaration",
    child_name: r.child_name, party_name: r.party_name,
    email_hint: mask(r.to_email), phone_hint: mask(r.to_phone),
    has_phone: !!String(r.to_phone || "").replace(/\D/g, ""),
    signed_at: r.signed_at, signer_name: r.signer_name,
  });
}
