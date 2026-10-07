import { NextResponse } from "next/server";
import { admin, monthStart, nextMonth } from "@/lib/billing-auth";
import { resolveLine, sendInvoice, monthsBetween, type LineInput } from "@/lib/daycare-billing";

// The monthly run, on the 1st.
//
// It GENERATES. It only SENDS where the family is marked for it — a
// reimbursement invoice is a benefit a parent claims against their employer,
// and a family behind on their own fees should not receive one until somebody
// decides they should. Everything else lands in drafts with a Send button.
//
// Idempotent: the unique index on (kind, child, month) refuses a second
// invoice, so a double run, a replay and a person pressing the button at the
// same moment still produce one.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "No." }, { status: 401 });
  }
  const a = admin();
  const today = new Date(Date.now() + 19800000).toISOString().slice(0, 10);
  const thisMonth = monthStart(today);

  const { data: profiles, error } = await a.from("daycare_recurring").select("*")
    .eq("status", "active").lte("next_month", thisMonth);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const drafted: string[] = [], sent: string[] = [], held: string[] = [], failed: string[] = [];
  for (const p of profiles || []) {
    if (p.end_month && p.next_month > p.end_month) {
      await a.from("daycare_recurring").update({ status: "ended" }).eq("id", p.id);
      continue;
    }
    const period = p.next_month;
    // How many months this document covers, and how far the schedule steps
    // afterwards. A quarterly arrangement raises one invoice for three months
    // and then waits three, rather than raising three invoices.
    const span = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 }[p.frequency as string] || 1;
    // Clipped to the arrangement's own end. A quarterly schedule ending in
    // November would otherwise raise an invoice covering October, November
    // AND December — billing a family for a month after they had stopped.
    const periodEnd = (() => {
      let m = period;
      for (let k = 1; k < span; k++) {
        const next = nextMonth(m);
        if (p.end_month && next > p.end_month) break;
        m = next;
      }
      return m;
    })();
    const advance = nextMonth(periodEnd);
    const { data: child } = p.child_id
      ? await a.from("billing_child").select("name").eq("id", p.child_id).maybeSingle()
      : { data: null };
    const month = new Date(period + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

    const { data: inv, error: e1 } = await a.from("daycare_invoice").insert({
      kind: p.kind, party_id: p.party_id, child_id: p.child_id,
      invoice_date: period, due_date: period, terms_label: "Due on Receipt",
      // A quarterly invoice says so. It used to name only the first month,
      // so the same document told two different stories depending on whether
      // the office raised it or the monthly run did.
      subject: p.kind === "billing"
        ? (p.subject || (periodEnd > period
            ? `Your Daycare Invoice is ready for ${month} to ${new Date(periodEnd + "T00:00:00Z")
                .toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`
            : `Your Daycare Invoice is ready for ${month}`))
        : null,
      period_start: period, period_end: periodEnd, recurring_id: p.id, created_by: "monthly run",
      online_payment: p.kind === "billing",
    }).select("id").single();

    if (e1 || !inv) {
      // Already there for that month — advance and move on, quietly.
      if (/duplicate key|unique/i.test(e1?.message || "")) {
        await a.from("daycare_recurring").update({ next_month: advance }).eq("id", p.id);
      } else failed.push(`${child?.name || p.party_id}: ${e1?.message}`);
      continue;
    }

    // A quarterly arrangement covers three months, so it charges for three —
    // a line each, which is what a finance team prefers because every month
    // can be checked on its own. Spanning three months and billing one was
    // the bug waiting here the moment frequency existed.
    const months = monthsBetween(period, periodEnd);
    const monthName = (m: string) => new Date(m + "T00:00:00Z")
      .toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    const own = (p.lines || []) as LineInput[];
    const expanded: { l: LineInput; label: string }[] = months.length > 1
      ? own.flatMap((l) => months.map((m: string) => ({ l, label: monthName(m) })))
      : own.map((l) => ({ l, label: "" }));

    const lines = expanded.map(({ l, label }, i: number) => {
      const r = resolveLine(l);
      return { invoice_id: inv.id, position: i + 1, rate_id: r.rate_id, name: r.name,
        description: label ? (r.description ? `${label} · ${r.description}` : label) : r.description,
        qty: r.qty, rate: r.rate, rate_text: r.rate_text,
        amount: r.amount, amount_is_fixed: r.amount_is_fixed };
    });
    if (lines.length) await a.from("daycare_invoice_line").insert(lines);
    await a.from("daycare_recurring").update({ next_month: advance }).eq("id", p.id);

    const { data: party } = await a.from("billing_party")
      .select("display_name, hold_reimbursement").eq("id", p.party_id).maybeSingle();
    const blocked = p.kind === "reimbursement" && party?.hold_reimbursement;
    if (p.auto_send && !blocked) {
      const r = await sendInvoice(a, inv.id, "monthly run");
      if (r.ok) sent.push(`${child?.name || party?.display_name} ${r.number}`);
      else failed.push(`${child?.name || party?.display_name}: ${r.error}`);
    } else {
      (blocked ? held : drafted).push(`${child?.name || party?.display_name} ${month}`);
    }
  }
  return NextResponse.json({ ok: true, drafted, sent, held, failed });
}
