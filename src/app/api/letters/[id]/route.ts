import { NextResponse } from "next/server";
import { requireLetters, admin, logEvent } from "@/lib/letters-auth";

// DELETE /api/letters/[id]?mode=cancel|delete
//
// Two different acts, kept apart on purpose.
//
//   cancel — the link stops working and the letter is marked cancelled. The
//            row stays, because "we sent her a letter and then withdrew it"
//            is itself a fact worth keeping.
//   delete — the row, its history and the stored PDF are gone. Only the
//            owner, only with a deliberate confirmation, and refused
//            outright for a signed letter unless it is said twice — a signed
//            employment document is not something to lose by a stray tap.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await requireLetters(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const { id } = await ctx.params;
  const mode = new URL(req.url).searchParams.get("mode") || "cancel";
  const a = admin();

  const { data: l } = await a.from("appointment_letter")
    .select("id, status, employee_name, signed_pdf_path").eq("id", id).maybeSingle();
  if (!l) return NextResponse.json({ ok: false, error: "That letter is already gone." }, { status: 404 });

  if (mode === "cancel") {
    if (l.status === "signed") {
      return NextResponse.json({ ok: false,
        error: "This letter is already signed, so it cannot be withdrawn. Delete it if it was a test." }, { status: 409 });
    }
    await a.from("appointment_letter")
      .update({ status: "cancelled", token: null, otp_hash: null, updated_at: new Date().toISOString() })
      .eq("id", l.id);
    await logEvent(a, l.id, "cancelled", { by: who.email }, req);
    return NextResponse.json({ ok: true, cancelled: true });
  }

  if (!who.isAdmin) {
    return NextResponse.json({ ok: false,
      error: "Only the owner can delete a letter outright. You can withdraw it instead." }, { status: 403 });
  }
  if (l.signed_pdf_path) await a.storage.from("letters").remove([l.signed_pdf_path]);
  const { error } = await a.from("appointment_letter").delete().eq("id", l.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: true });
}
