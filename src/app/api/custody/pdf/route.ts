import { NextResponse } from "next/server";
import { requireMoney, admin } from "@/lib/money-auth";
import { pdfDisposition } from "@/lib/pdf-name";

// GET /api/custody/pdf?id=123 — open a stored acknowledgement.
// Behind the same permission as signing it: a cash acknowledgement names who
// is holding the school's money, which is nobody else's business.
export async function GET(req: Request) {
  const who = await requireMoney(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "Which acknowledgement?" }, { status: 400 });

  const a = admin();
  const { data: row } = await a.from("receipt_custody").select("pdf_path, ack_ref, kind, to_person").eq("id", id).maybeSingle();
  if (!row?.pdf_path) return NextResponse.json({ ok: false, error: "No acknowledgement was stored for this one." }, { status: 404 });

  const { data, error } = await a.storage.from("receipts").download(row.pdf_path);
  if (error || !data) return NextResponse.json({ ok: false, error: "That file could not be opened." }, { status: 404 });

  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfDisposition([
        row.kind === "banked" ? "Deposit record" : "Money acknowledgement",
        row.to_person, row.ack_ref]),
      "Cache-Control": "no-store",
    },
  });
}
