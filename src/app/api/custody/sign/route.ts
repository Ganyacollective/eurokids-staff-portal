import { NextResponse } from "next/server";
import { requireMoney, admin, clientIp, sha256, istStamp, istShort } from "@/lib/money-auth";
import { renderCustodyPdf, type CustodyAck, type CustodyKind } from "@/lib/custody-pdf";

// POST /api/custody/sign
//
// One link in the cash chain, signed by the person taking the money. The
// signature is captured on the school's own tablet with the two of them
// standing there, so there is no code to email and nobody to verify — the
// evidence is that a named person drew this, at this minute, on this device,
// and that the entry was made by a signed-in member of staff who is also
// named on the page.
//
// The row is written first and the PDF second. A handover that was agreed
// must never be lost because a render failed.
export async function POST(req: Request) {
  const who = await requireMoney(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const b = await req.json().catch(() => ({}));
  const receiptId = Number(b.receipt_id);
  const kind = (["collected", "handover", "banked"].includes(b.kind) ? b.kind : "handover") as CustodyKind;
  if (!receiptId) return NextResponse.json({ ok: false, error: "Which receipt is this?" }, { status: 400 });

  const toPerson = String(b.to_person || "").trim() || null;
  const fromPerson = String(b.from_person || "").trim() || null;
  const note = String(b.note || "").trim() || null;
  const signedName = String(b.signed_name || "").trim() || toPerson || "";
  const png = typeof b.signature_png === "string" && b.signature_png.startsWith("data:image/png")
    ? b.signature_png : null;

  // The bank does not sign our tablet. Everything else does.
  if (kind !== "banked") {
    if (!toPerson) return NextResponse.json({ ok: false, error: "Who is taking it?" }, { status: 400 });
    if (!png) return NextResponse.json({ ok: false, error: "Please ask them to sign in the box." }, { status: 400 });
    if (signedName.length < 2) return NextResponse.json({ ok: false, error: "Please type the name of the person signing." }, { status: 400 });
    if (png.length > 400_000) return NextResponse.json({ ok: false, error: "That signature image is too large." }, { status: 413 });
  }

  const a = admin();
  const { data: rec } = await a.from("receipt_offline")
    .select("id, student_name, amount_rupees, mode, purpose, purpose_note, received_on, received_by, cheque_number, cheque_bank, voided_at")
    .eq("id", receiptId).maybeSingle();
  if (!rec) return NextResponse.json({ ok: false, error: "That receipt no longer exists." }, { status: 404 });
  if (rec.voided_at) {
    return NextResponse.json({ ok: false, error: "This receipt has been struck through. Nothing can be handed over against it." }, { status: 409 });
  }

  const now = new Date();
  const at = b.at ? new Date(String(b.at)) : now;
  const ip = clientIp(req);
  const agent = (req.headers.get("user-agent") || "").slice(0, 300);

  const { data: row, error } = await a.from("receipt_custody").insert({
    receipt_id: receiptId, kind,
    from_person: fromPerson, to_person: toPerson,
    at: at.toISOString(), note, logged_by: who.name,
    signed_name: png ? signedName : null,
    signature_png: png,
    signed_at: png ? now.toISOString() : null,
    signed_agent: png ? agent : null,
    signed_ip: png ? ip || null : null,
  }).select("id").single();
  if (error || !row) {
    return NextResponse.json({ ok: false, error: error?.message || "Could not record it." }, { status: 500 });
  }

  const reference = `EK-CASH-${String(row.id).padStart(5, "0")}`;

  // Everything this money has done so far, for the foot of the page — so the
  // person signing can see the chain they are joining.
  const { data: chain } = await a.from("receipt_custody")
    .select("at, kind, from_person, to_person").eq("receipt_id", receiptId).order("at");
  const WORDS = (c: { kind: string; from_person: string | null; to_person: string | null }) =>
    c.kind === "collected" ? `Taken from ${rec.student_name || "the payer"} by ${c.to_person || "the office"}`
      : c.kind === "banked" ? "Deposited in the bank"
        : `${c.from_person || "the office"} handed it to ${c.to_person || "—"}`;
  const history = (chain || []).map((c) => ({ at: istShort(c.at as string), what: WORDS(c as never) }));

  const ack: CustodyAck = {
    reference, kind,
    amount: Number(rec.amount_rupees || 0),
    mode: String(rec.mode || "Cash"),
    purpose: rec.purpose === "other" ? (rec.purpose_note || "other") : String(rec.purpose || ""),
    payer: rec.student_name || null,
    chequeNumber: rec.cheque_number, chequeBank: rec.cheque_bank,
    receiptId,
    receivedOn: rec.received_on ? istShort(String(rec.received_on) + "T12:00:00Z").split(" ·")[0] : null,
    fromPerson, toPerson,
    at: istStamp(at),
    note,
    signedName: png ? signedName : null,
    signaturePng: png,
    loggedBy: who.name,
    ip: ip || null, agent,
    history,
  };

  try {
    const pdf = await renderCustodyPdf(ack);
    const path = `custody/${receiptId}/${row.id}-${kind}.pdf`;
    const up = await a.storage.from("receipts").upload(path, Buffer.from(pdf), {
      contentType: "application/pdf", upsert: true,
    });
    await a.from("receipt_custody").update({
      ack_ref: reference,
      pdf_path: up.error ? null : path,
      pdf_sha256: await sha256(pdf),
    }).eq("id", row.id);
    return NextResponse.json({ ok: true, id: row.id, reference, pdf_path: up.error ? null : path });
  } catch (e) {
    // The handover is recorded; only the paper failed.
    await a.from("receipt_custody").update({ ack_ref: reference }).eq("id", row.id);
    return NextResponse.json({ ok: true, id: row.id, reference, pdf_path: null,
      note: `Recorded and signed, but the acknowledgement could not be drawn: ${(e as Error).message}` });
  }
}
