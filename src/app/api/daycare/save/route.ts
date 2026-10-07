import { NextResponse } from "next/server";
import { requireBilling, admin, monthStart } from "@/lib/billing-auth";
import { resolveLine, monthsBetween, type LineInput } from "@/lib/daycare-billing";

// POST /api/daycare/save — raise or edit a draft. Never numbers it and never
// sends it: both of those happen when somebody presses Send.
export async function POST(req: Request) {
  const who = await requireBilling(req);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const b = await req.json().catch(() => ({}));
  const a = admin();

  // What kind of document is being raised decides which permission is needed.
  // Taken from the body, so somebody holding only Reimbursements cannot post
  // a day care bill past a screen that never offered them one.
  const wantKind = b.kind === "reimbursement" ? "reimbursement" : "billing";
  if (!(wantKind === "billing" ? who.canBill : who.canCertify)) {
    return NextResponse.json({ ok: false, error: wantKind === "billing"
      ? "You do not have Day care billing." : "You do not have Reimbursements." }, { status: 403 });
  }
  // And an existing draft cannot be flipped into the other kind by someone who
  // only holds one of them.
  if (b.id) {
    const { data: was } = await a.from("daycare_invoice").select("kind").eq("id", Number(b.id)).maybeSingle();
    if (was && !(was.kind === "billing" ? who.canBill : who.canCertify)) {
      return NextResponse.json({ ok: false, error: "That draft is not yours to edit." }, { status: 403 });
    }
  }

  if (!b.party_id) return NextResponse.json({ ok: false, error: "Which family?" }, { status: 400 });
  const lines = (b.lines || []) as LineInput[];
  if (!lines.length) return NextResponse.json({ ok: false, error: "An invoice needs at least one line." }, { status: 400 });

  const header = {
    kind: b.kind === "reimbursement" ? "reimbursement" : "billing",
    party_id: Number(b.party_id),
    child_id: b.child_id ? Number(b.child_id) : null,
    invoice_date: b.invoice_date || null,
    due_date: b.due_date || b.invoice_date || null,
    terms_label: b.terms_label || "Due on Receipt",
    subject: b.subject || null,
    period_start: b.period ? monthStart(String(b.period)) : null,
    period_end: b.period_end ? monthStart(String(b.period_end))
              : (b.period ? monthStart(String(b.period)) : null),
    note: b.note || null,
    // A bill offers online payment unless somebody turns it off — the whole
    // point of wiring Razorpay was that nobody has to remember to tick it.
    // A reimbursement certificate never does: it is already paid.
    online_payment: b.kind === "reimbursement" ? false : b.online_payment !== false,
  };

  let id = Number(b.id) || 0;
  if (id) {
    const { data: cur } = await a.from("daycare_invoice").select("status").eq("id", id).maybeSingle();
    if (cur?.status === "sent") {
      return NextResponse.json({ ok: false, error: "That invoice has been sent. Duplicate it instead of editing it." }, { status: 409 });
    }
    const { error } = await a.from("daycare_invoice").update({ ...header, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    await a.from("daycare_invoice_line").delete().eq("invoice_id", id);
  } else {
    const { data, error } = await a.from("daycare_invoice")
      .insert({ ...header, created_by: who.name }).select("id").single();
    if (error || !data) {
      const dupe = /duplicate key|unique/i.test(error?.message || "");
      return NextResponse.json({ ok: false, error: dupe
        ? "There is already an invoice of this kind for that child and month."
        : (error?.message || "Could not save it.") }, { status: dupe ? 409 : 500 });
    }
    id = data.id;
  }

  // A quarter asked for in October is three months on one invoice. Either a
  // line each — which is what a finance team prefers, because each month can
  // be checked on its own — or one line for the whole run.
  const months = (header.period_start && header.period_end)
    ? monthsBetween(header.period_start, header.period_end) : [];
  const perMonth = months.length > 1 && b.split !== "combined";
  const monthName = (m: string) => new Date(m + "T00:00:00Z")
    .toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

  const expanded: (LineInput & { _desc?: string; _times?: number })[] = [];
  for (const l of lines) {
    if (months.length > 1 && perMonth) {
      for (const m of months) expanded.push({ ...l, _desc: monthName(m) });
    } else if (months.length > 1) {
      expanded.push({ ...l, _times: months.length,
        _desc: `${monthName(months[0])} to ${monthName(months[months.length - 1])}` });
    } else {
      expanded.push(l);
    }
  }

  const rows = expanded.map((l, i) => {
    const r = resolveLine(l);
    // A combined line multiplies the hours, never the rate — the rate per
    // hour is the same in June as it was in April.
    const times = l._times || 1;
    return {
      invoice_id: id, position: i + 1, rate_id: r.rate_id, name: r.name,
      description: l._desc ? (r.description ? `${l._desc} · ${r.description}` : l._desc) : r.description,
      qty: Math.round(r.qty * times * 100) / 100,
      rate: r.rate, rate_text: r.rate_text,
      amount: Math.round(r.amount * times * 100) / 100,
      amount_is_fixed: r.amount_is_fixed,
    };
  });
  const { error: e2 } = await a.from("daycare_invoice_line").insert(rows);
  if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 500 });

  const { data: fresh } = await a.from("daycare_invoice").select("*").eq("id", id).maybeSingle();
  return NextResponse.json({ ok: true, id, invoice: fresh,
    breakups: lines.map((l) => resolveLine(l).breakup) });
}
