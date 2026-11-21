// What was agreed with a parent for next year.
//
// The ordering problem this exists for: the fee is settled across a desk in
// November, and the child does not appear in next year's roster until
// somebody graduates them in EPMS and the sync pulls them in — possibly
// weeks later. Until now there was nowhere to put the number in between, so
// it lived in somebody's memory, and the school and the parent occasionally
// remembered different figures.
//
// So this writes against child_id, which does not change when the year does.
// Next year's UIN is just another row in child_uin pointing at the same
// child, and the agreement is already waiting when it arrives. Nobody has to
// visit EPMS first, and nothing has to be retyped afterwards.
//
// The parent is emailed the figure as soon as it is agreed, because a number
// only one side has written down is the problem, not the solution.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderEmail, esc, money, SCHOOL_NAME, SCHOOL_EMAIL, phoneLinks, plainFooter } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";
import { isRealAddress } from "@/lib/recipients";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const NEXT_YEAR = "27-28";

type Who = { id: string; name: string };

async function gate(req: NextRequest): Promise<Who | null> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const user = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${m[1]}` } }, auth: { persistSession: false },
  });
  const { data: me } = await user.auth.getUser();
  if (!me?.user) return null;

  // Finance or Admission, with the admin fallback every sibling route has.
  const { data: mods } = await user.from("module_access").select("module").eq("user_id", me.user.id);
  const held = (mods || []).map((r) => r.module);
  if (!held.includes("finance") && !held.includes("admission")) {
    const { data: prof } = await user.from("profiles").select("role").eq("id", me.user.id).maybeSingle();
    if (prof?.role !== "admin") return null;
  }
  return { id: me.user.id, name: (me.user.user_metadata?.full_name as string) || me.user.email || "staff" };
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(req: NextRequest) {
  const who = await gate(req);
  if (!who) return NextResponse.json({ ok: false, error: "You need Finance or Admission." }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const a = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "eurokids" },
  });
  const action = String(b.action || "save");

  // ── record or amend ─────────────────────────────────────────────────────
  if (action === "save") {
    const childId = clean(b.child_id, 64);
    const agreed = num(b.agreed_fee);
    if (!childId) return NextResponse.json({ ok: false, error: "Which child?" }, { status: 400 });
    if (agreed === null || agreed < 0) {
      return NextResponse.json({ ok: false, error: "Enter the fee you have agreed." }, { status: 400 });
    }

    // The row the screen was looking at, re-read here so the stored copy of
    // the name and the programme is the database's, not the browser's.
    const { data: row } = await a.from("v_next_year").select("*").eq("child_id", childId).maybeSingle();
    if (!row) return NextResponse.json({ ok: false, error: "That child is not on this year's roll." }, { status: 404 });

    const gross = num(b.gross_fee);
    const ekDisc = num(b.eurokids_discount) ?? 0;
    // Our own concession. Derived when it is not given but the gross is, so
    // the two numbers can never disagree on the same row.
    const ourDisc = num(b.franchisee_discount)
      ?? (gross !== null ? Math.max(0, Math.round((gross - ekDisc - agreed) * 100) / 100) : 0);

    const payload = {
      child_id: childId,
      academic_year: NEXT_YEAR,
      child_name: row.child_name,
      from_uin: row.this_year_uin,
      epms_program_id: row.next_program_id,
      next_program_name: row.next_program_name,
      joining_month: "2027-04-01",
      discount_code: clean(b.discount_code, 32) || "none",
      gross_fee: gross,
      eurokids_discount: ekDisc,
      franchisee_discount: ourDisc,
      final_fee: agreed,
      instalments: clean(b.instalments, 200) || null,
      notes: clean(b.notes, 2000) || null,
      agreed_by: who.id,
      status: "agreed",
    };

    // Read then write, rather than upsert.
    //
    // The unique index is partial — (child_id, academic_year) WHERE status
    // <> 'withdrawn', so a family that pulls out and comes back is not
    // stuck — and Postgres cannot infer a partial index from an ON CONFLICT
    // clause that does not repeat the same WHERE. PostgREST has no way to
    // send that WHERE, so an upsert here fails outright with "no unique or
    // exclusion constraint matching the ON CONFLICT specification". Checked
    // against the live table rather than assumed; it fails on the first
    // save, not on some edge case.
    const { data: existing } = await a.from("fee_agreement")
      .select("agreement_id")
      .eq("child_id", childId).eq("academic_year", NEXT_YEAR).neq("status", "withdrawn")
      .maybeSingle();

    const q = existing
      // Amending: the history trigger keeps the previous figure, which is
      // the whole point of being able to change it.
      ? a.from("fee_agreement").update(payload).eq("agreement_id", existing.agreement_id)
      : a.from("fee_agreement").insert(payload);

    const { data: saved, error } = await q
      .select("agreement_id, final_fee, child_name, next_program_name, confirmed_at")
      .single();
    if (error) {
      return NextResponse.json({ ok: false,
        error: error.code === "23505"
          ? "Somebody else just recorded an agreement for this child. Reload and check it."
          : error.message }, { status: error.code === "23505" ? 409 : 500 });
    }

    return NextResponse.json({ ok: true, agreement: saved, amended: !!existing });
  }

  // ── tell the parent ─────────────────────────────────────────────────────
  if (action === "confirm") {
    const id = clean(b.agreement_id, 64);
    if (!id) return NextResponse.json({ ok: false, error: "Which agreement?" }, { status: 400 });

    const { data: ag } = await a.from("fee_agreement").select("*").eq("agreement_id", id).maybeSingle();
    if (!ag) return NextResponse.json({ ok: false, error: "No such agreement." }, { status: 404 });

    const { data: row } = await a.from("v_next_year").select("*").eq("child_id", ag.child_id).maybeSingle();
    const to = [row?.parent_email1, row?.parent_email2].filter(isRealAddress) as string[];
    if (!to.length) {
      return NextResponse.json({ ok: false,
        error: "There is no usable parent email on this family, so there is nobody to send it to." }, { status: 400 });
    }
    if (!mailReady()) return NextResponse.json({ ok: false, error: "Email is not configured." }, { status: 503 });

    // Already told, unless asked again. The point of the email is that one
    // figure is on the record; two copies of it is clutter, not safety.
    if (ag.confirmed_at && b.resend !== true) {
      return NextResponse.json({ ok: false,
        error: `This was already confirmed to the parent on ${new Date(ag.confirmed_at)
          .toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}.`,
        already_sent_at: ag.confirmed_at }, { status: 409 });
    }

    const line = (k: string, v: string, strong = false) =>
      `<tr><td style="padding:7px 0;color:#4B5563">${k}</td>`
      + `<td style="padding:7px 0;text-align:right${strong ? ";font-weight:700;font-size:16px" : ""}">${v}</td></tr>`;

    const bodyHtml = `
      <p>Dear Parent,</p>
      <p>Thank you for coming in to discuss ${esc(ag.child_name || "your child")}&rsquo;s place for the
         ${esc(NEXT_YEAR.replace("-", "–"))} academic year. This is a note of what we agreed, so that
         we both have the same figure written down.</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
        ${line("Class from April 2027", esc(ag.next_program_name || "—"))}
        ${ag.gross_fee ? line("Full fee for the year", money(ag.gross_fee)) : ""}
        ${Number(ag.eurokids_discount) > 0 ? line("EuroKids scheme", `<span style="color:#15803D">− ${money(ag.eurokids_discount)}</span>`) : ""}
        ${Number(ag.franchisee_discount) > 0 ? line("Concession from the school", `<span style="color:#15803D">− ${money(ag.franchisee_discount)}</span>`) : ""}
        <tr><td style="padding:12px 0;border-top:2px solid #1A202C;font-weight:700">Agreed fee for the year</td>
            <td style="padding:12px 0;border-top:2px solid #1A202C;text-align:right;font-weight:700;font-size:17px">${money(ag.final_fee)}</td></tr>
        ${ag.instalments ? `<tr><td colspan="2" style="padding-top:10px;color:#4B5563;font-size:13px">Payable: ${esc(ag.instalments)}</td></tr>` : ""}
      </table>
      <p style="font-size:13px;color:#4B5563">This is the fee we have agreed for the year. Your child&rsquo;s place
         will be moved up to the new class on the school&rsquo;s records closer to April, and the first
         instalment is not due until then.</p>
      <p style="font-size:13px;color:#4B5563">If any of the above does not match your understanding, please tell us
         now rather than later — call ${phoneLinks("font-weight:700;text-decoration:none;color:#A8120B")}
         or reply to this email.</p>`;

    const text = [
      "Dear Parent,",
      "",
      `A note of what we agreed for ${ag.child_name} for ${NEXT_YEAR}:`,
      "",
      `Class from April 2027: ${ag.next_program_name || "—"}`,
      ...(ag.gross_fee ? [`Full fee for the year: ${money(ag.gross_fee)}`] : []),
      ...(Number(ag.eurokids_discount) > 0 ? [`EuroKids scheme: -${money(ag.eurokids_discount)}`] : []),
      ...(Number(ag.franchisee_discount) > 0 ? [`Concession from the school: -${money(ag.franchisee_discount)}`] : []),
      `Agreed fee for the year: ${money(ag.final_fee)}`,
      ...(ag.instalments ? [`Payable: ${ag.instalments}`] : []),
      "",
      "If any of this does not match your understanding, please tell us now rather than later.",
      plainFooter(SCHOOL_EMAIL),
    ].join("\n");

    const r = await sendMail({
      to, subject: `Fee agreed for ${ag.child_name} — ${NEXT_YEAR.replace("-", "–")} | ${SCHOOL_NAME}`,
      html: renderEmail({ title: "The fee we agreed", subtitle: `${ag.child_name} · ${NEXT_YEAR.replace("-", "–")}`,
        theme: "school", bodyHtml, contactEmail: SCHOOL_EMAIL }),
      text,
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error || "The email did not go." }, { status: 502 });

    await a.from("fee_agreement")
      .update({ confirmed_at: new Date().toISOString(), confirmed_to: to })
      .eq("agreement_id", id);

    return NextResponse.json({ ok: true, sent_to: to });
  }

  if (action === "withdraw") {
    const id = clean(b.agreement_id, 64);
    const { error } = await a.from("fee_agreement")
      .update({ status: "withdrawn", notes: clean(b.notes, 2000) || null }).eq("agreement_id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
