import { NextResponse } from "next/server";
import { admin, monthStart, nextMonth } from "@/lib/billing-auth";
import { resolveLine, sendInvoice, type LineInput } from "@/lib/daycare-billing";

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
    const { data: child } = p.child_id
      ? await a.from("billing_child").select("name").eq("id", p.child_id).maybeSingle()
      : { data: null };
    const month = new Date(period + "T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

    const { data: inv, error: e1 } = await a.from("daycare_invoice").insert({
      kind: p.kind, party_id: p.party_id, child_id: p.child_id,
      invoice_date: period, due_date: period, terms_label: "Due on Receipt",
      subject: p.kind === "billing" ? (p.subject || `Your Daycare Invoice is ready for ${month}`) : null,
      period_start: period, recurring_id: p.id, created_by: "monthly run",
    }).select("id").single();

    if (e1 || !inv) {
      // Already there for that month — advance and move on, quietly.
      if (/duplicate key|unique/i.test(e1?.message || "")) {
        await a.from("daycare_recurring").update({ next_month: nextMonth(period) }).eq("id", p.id);
      } else failed.push(`${child?.name || p.party_id}: ${e1?.message}`);
      continue;
    }

    const lines = ((p.lines || []) as LineInput[]).map((l, i) => {
      const r = resolveLine(l);
      return { invoice_id: inv.id, position: i + 1, rate_id: r.rate_id, name: r.name,
        description: r.description, qty: r.qty, rate: r.rate, rate_text: r.rate_text,
        amount: r.amount, amount_is_fixed: r.amount_is_fixed };
    });
    if (lines.length) await a.from("daycare_invoice_line").insert(lines);
    await a.from("daycare_recurring").update({ next_month: nextMonth(period) }).eq("id", p.id);

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
