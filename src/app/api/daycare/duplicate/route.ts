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
    period_start: period,
    // The copy must cover the same span as the original. Dropping period_end
    // collapsed a quarterly invoice to a single month, and — because NULLs
    // are distinct in the uniqueness index — quietly took the copy out of the
    // guard that stops two invoices for one child and period.
    period_end: period && src.period_start && src.period_end
      ? (() => {               // shift the end by the same distance the start moved
          const d = new Date(src.period_end + "T00:00:00Z"), s = new Date(src.period_start + "T00:00:00Z");
          const span = (d.getUTCFullYear() - s.getUTCFullYear()) * 12 + (d.getUTCMonth() - s.getUTCMonth());
          let m = period; for (let k = 0; k < span; k++) m = nextMonth(m); return m;
        })()
      : period,
    // "Duplicate last month's and send it" is the most ordinary monthly act
    // there is. Leaving this to its false default sent every copy out with no
    // Pay now button, and nothing on the screen said so.
    online_payment: src.online_payment,
    note: src.note, created_by: who.name,
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
