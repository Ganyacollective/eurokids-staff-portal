import { NextResponse } from "next/server";
import { requireDocuments, admin, logDocEvent } from "@/lib/docs-auth";

// DELETE /api/docs/[id]?mode=cancel|delete — the same two acts as for a
// letter. Withdrawing is the coordinator's to do; deleting is the owner's.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await requireDocuments(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const { id } = await ctx.params;
  const mode = new URL(req.url).searchParams.get("mode") || "cancel";
  const a = admin();

  const { data: r } = await a.from("signature_request")
    .select("id, status, child_name, signed_pdf_path").eq("id", id).maybeSingle();
  if (!r) return NextResponse.json({ ok: false, error: "That form is already gone." }, { status: 404 });

  if (mode === "cancel") {
    if (r.status === "signed") {
      return NextResponse.json({ ok: false,
        error: "This form is already signed, so it cannot be withdrawn. Delete it if it was a test." }, { status: 409 });
    }
    await a.from("signature_request")
      .update({ status: "cancelled", token: null, otp_hash: null, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    await logDocEvent(a, r.id, "cancelled", { by: who.email }, req);
    return NextResponse.json({ ok: true, cancelled: true });
  }

  if (!who.isAdmin) {
    return NextResponse.json({ ok: false,
      error: "Only the owner can delete a signed form outright. You can withdraw it instead." }, { status: 403 });
  }
  if (r.signed_pdf_path) await a.storage.from("documents").remove([r.signed_pdf_path]);
  const { error } = await a.from("signature_request").delete().eq("id", r.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: true });
}
