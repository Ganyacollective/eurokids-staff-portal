import { NextResponse } from "next/server";
import { requireDocuments, admin } from "@/lib/docs-auth";

// GET /api/docs/list — what has been sent, and what came back.
export async function GET(req: Request) {
  const who = await requireDocuments(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const { data } = await admin().from("signature_request")
    .select("id, template_slug, status, child_name, child_uin, party_name, to_email, channel, sent_at, signed_at, signer_name, token")
    .order("id", { ascending: false }).limit(300);
  return NextResponse.json({ ok: true, requests: data || [] });
}
