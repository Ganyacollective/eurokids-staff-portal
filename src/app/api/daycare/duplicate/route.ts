import { NextResponse } from "next/server";
import { requireBilling, admin, nextMonth } from "@/lib/billing-auth";

// Copy an invoice into a fresh draft — same lines, next month, no number.
// The copy is never a copy of the number: a reference somebody quoted on the
// phone must point at one document.
export async function POST(req: Request) {
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const b = await req.json().catch(() => ({}));
  const a = admin();

  const { data: src } = await a.from("daycare_invoice").select("*").eq("id", Number(b.id)).maybeSingle();
  if (!src) return NextResponse.json({ ok: false, error: "No such invoice." }, { status: 404 });
  const period = b.period ? String(b.period).slice(0, 7) + "-01"
    : (src.period_start ? nextMonth(src.period_start) : null);

  const { data: copy, error } = await a.from("daycare_invoice").insert({
    kind: src.kind, party_id: src.party_id, child_id: src.child_id,
    invoice_date: period || src.invoice_date, due_date: period || src.due_date,
    terms_label: src.terms_label,
    subject: src.subject && period
      ? src.subject.replace(/for .*$/, `for ${new Date(period + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`)
      : src.subject,
    period_start: period, note: src.note, created_by: who.name,
  }).select("id").single();
  if (error || !copy) {
    const dupe = /duplicate key|unique/i.test(error?.message || "");
    return NextResponse.json({ ok: false, error: dupe
      ? "There is already an invoice of this kind for that child and month."
      : (error?.message || "Could not copy it.") }, { status: dupe ? 409 : 500 });
  }

  const { data: lines } = await a.from("daycare_invoice_line").select("*").eq("invoice_id", src.id).order("position");
  if (lines?.length) {
    await a.from("daycare_invoice_line").insert(lines.map((l) => ({
      invoice_id: copy.id, position: l.position, rate_id: l.rate_id, name: l.name,
      description: l.description, qty: l.qty, rate: l.rate, amount: l.amount,
      amount_is_fixed: l.amount_is_fixed })));
  }
  return NextResponse.json({ ok: true, id: copy.id });
}
