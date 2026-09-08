import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  renderEmail, textToHtml, money, day, plainFooter,
  SCHOOL_NAME, statementHtml, statementText, type ThemeKey, type LedgerLine,
} from "@/lib/brand-email";
import { applyFilters, addressesFor, summarise, isRealAddress, type Filters, type ScheduleRow } from "@/lib/recipients";
import { loadSchedule, bearer } from "@/lib/fee-data";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || `${SCHOOL_NAME} <admin@eurokidsjmdenclave.org>`;
const CC = "admin@eurokidsjmdenclave.org";

export const maxDuration = 300;

// Only used when attachments force one-at-a-time sending. Resend's default
// allowance is 2 requests a second; the old 120 ms gap issued roughly eight,
// so most of a large send came back 429.
const SEND_GAP_MS = 550;

type Attachment = { filename: string; content: string };  // content = base64

// Merge fields the office can drop into the message body.
function merge(text: string, r: ScheduleRow) {
  const first = (r.student_name || "").split(" ")[0];
  const map: Record<string, string> = {
    "{{child}}": r.student_name || "",
    "{{first_name}}": first,
    "{{class}}": r.program_name || "",
    "{{batch}}": r.batch || "",
    "{{amount_due}}": money(r.true_due),
    "{{next_amount}}": money(r.next_amount),
    "{{due_date}}": day(r.next_due_date),
    "{{father}}": r.father_name || "",
  };
  return Object.entries(map).reduce((s, [k, v]) => s.split(k).join(v), String(text || ""));
}


// POST /api/fees/bulk-send
export async function POST(req: NextRequest) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  if (!RESEND_API_KEY) return NextResponse.json({ error: "RESEND_API_KEY is not configured in Vercel." }, { status: 400 });

  let body: {
    filters?: Filters; subject?: string; message?: string;
    theme?: ThemeKey; title?: string; includeFees?: boolean;
    attachments?: Attachment[]; ccOffice?: boolean;
    testTo?: string;          // send one copy here instead of to parents
    confirm?: boolean;        // must be true to actually send
    extraEmails?: string[];   // arbitrary addresses, with no child attached
    sendId?: string;          // idempotency: a retry must not send twice
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const subject = (body.subject || "").trim();
  const message = (body.message || "").trim();
  if (!subject) return NextResponse.json({ error: "Please give the email a subject." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Please write a message." }, { status: 400 });

  let rows: ScheduleRow[];
  try { rows = await loadSchedule(token); }
  catch (e) { return NextResponse.json({ error: "Could not read fee data: " + (e as Error).message }, { status: 403 }); }

  // rows comes from a finance-gated view: an account with no access gets an
  // empty list. Without this check such an account could still send branded
  // mail from the school's address through the typed-address path.
  if (!rows.length && (body.extraEmails || []).length) {
    return NextResponse.json({
      error: "You do not have access to send email on behalf of the school.",
    }, { status: 403 });
  }

  const matched = applyFilters(rows, body.filters || {});

  // Addresses typed in by hand belong to nobody in particular — a supplier, a
  // parent whose child has left, the landlord. They get the school's branding
  // and nothing else: no merge fields, no fee block, no balance.
  const extras = [...new Set((body.extraEmails || [])
    .map((e) => (e || "").trim().toLowerCase())
    .filter(isRealAddress))];

  const sum = { ...summarise(matched) };
  sum.reachable += extras.length;
  sum.addresses += extras.length;

  // Each family's dated payments, for the statement block.
  const ledgerBy = new Map<string, LedgerLine[]>();
  if (body.includeFees && matched.length) {
    const admin0 = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: led } = await admin0.schema("eurokids").from("v_child_ledger")
      .select("uin,on_date,description,mode,amount,counts_to_fees,still_held,source")
      .in("uin", matched.map((r) => r.uin));
    for (const l of (led || []) as (LedgerLine & { uin: string })[]) {
      if (!ledgerBy.has(l.uin)) ledgerBy.set(l.uin, []);
      ledgerBy.get(l.uin)!.push(l);
    }
  }

  const attachments = (body.attachments || [])
    .filter((a) => a && a.filename && a.content)
    .map((a) => ({ filename: a.filename, content: a.content }));

  const build = (r: ScheduleRow) => {
    const bodyHtml = textToHtml(merge(message, r)) + (body.includeFees ? statementHtml(r, ledgerBy.get(r.uin) || []) : "");
    return {
      html: renderEmail({
        title: merge(body.title || subject, r),
        subtitle: `${r.student_name}${r.program_name ? " · " + r.program_name : ""}`,
        bodyHtml, theme: body.theme,
      }),
      text: [merge(message, r), ...(body.includeFees ? ["", statementText(r, ledgerBy.get(r.uin) || [])] : []),
        plainFooter()].join("\n"),
    };
  };

  // A plain send, with no child to personalise against.
  const buildPlain = () => ({
    html: renderEmail({ title: body.title || subject, bodyHtml: textToHtml(message), theme: body.theme }),
    text: [message, plainFooter()].join("\n"),
  });

  // ── test send ─────────────────────────────────────────────────────────────
  if (body.testTo) {
    const sample = matched[0];
    if (!sample && !extras.length && !rows.length) {
      return NextResponse.json({ error: "Nobody is selected, so there is nothing to preview." }, { status: 400 });
    }
    const { html, text } = sample ? build(sample) : buildPlain();
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: RESEND_FROM, to: [body.testTo],
        subject: `[TEST — would go to ${sum.reachable} recipients] `
                 + (sample ? merge(subject, sample) : subject),
        html, text, attachments,
      }),
    });
    if (!r.ok) return NextResponse.json({ error: `Resend ${r.status}: ${(await r.text()).slice(0, 300)}` }, { status: 500 });
    return NextResponse.json({ ok: true, mode: "test", sent_to: body.testTo, sample: sample?.student_name || "a plain copy", summary: sum });
  }

  // ── dry run is the default; sending needs an explicit confirm ─────────────
  if (!body.confirm) {
    const sample = matched[0];
    return NextResponse.json({
      ok: true, mode: "preview", summary: sum,
      preview_html: sample ? build(sample).html : (extras.length ? buildPlain().html : null),
      preview_for: sample?.student_name || (extras.length ? extras[0] : null),
    });
  }

  if (!sum.reachable) return NextResponse.json({ error: "Nobody in this selection has an email address on file." }, { status: 400 });

  // ── send ──────────────────────────────────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const sent: string[] = [];
  const failed: { name: string; error: string }[] = [];

  // Every message, already personalised, ready to post.
  type Outgoing = { label: string; to: string[]; subject: string; html: string; text: string };
  const queue: Outgoing[] = [
    ...matched
      .filter((r) => addressesFor(r).length)
      .map((r) => {
        const { html, text } = build(r);
        return { label: r.student_name, to: addressesFor(r), subject: merge(subject, r), html, text };
      }),
    ...extras.map((addr) => {
      const { html, text } = buildPlain();
      return { label: addr, to: [addr], subject, html, text };
    }),
  ];

  const ccPart = body.ccOffice === false ? {} : { cc: [CC] };
  // An idempotency key means a retry after a dropped connection cannot send a
  // second copy — Resend remembers the key for 24 hours.
  const runId = body.sendId || randomUUID();

  if (!attachments.length) {
    // Resend's batch endpoint takes 100 messages per call, so a school-wide
    // send is two requests and a couple of seconds rather than 191 requests
    // paced against a rate limit. It does not accept attachments, hence the
    // fallback below.
    for (let i = 0; i < queue.length; i += 100) {
      const chunk = queue.slice(i, i + 100);
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Idempotency-Key": `${runId}-${i / 100}`,
          },
          body: JSON.stringify(chunk.map((m) => ({
            from: RESEND_FROM, to: m.to, ...ccPart,
            subject: m.subject, html: m.html, text: m.text,
          }))),
        });
        if (res.ok) chunk.forEach((m) => sent.push(m.label));
        else {
          const why = `Resend ${res.status}: ${(await res.text()).slice(0, 160)}`;
          chunk.forEach((m) => failed.push({ name: m.label, error: why }));
        }
      } catch (e) {
        chunk.forEach((m) => failed.push({ name: m.label, error: (e as Error).message }));
      }
    }
  } else {
    // With attachments there is no batch endpoint, so send one at a time and
    // stay inside Resend's 2-per-second allowance.
    for (const m of queue) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Idempotency-Key": `${runId}-${m.to[0]}`,
          },
          body: JSON.stringify({
            from: RESEND_FROM, to: m.to, ...ccPart,
            subject: m.subject, html: m.html, text: m.text, attachments,
          }),
        });
        if (res.ok) sent.push(m.label);
        else failed.push({ name: m.label, error: `Resend ${res.status}: ${(await res.text()).slice(0, 160)}` });
      } catch (e) {
        failed.push({ name: m.label, error: (e as Error).message });
      }
      await new Promise((s) => setTimeout(s, SEND_GAP_MS));
    }
  }

  // Keep a record of what went out, so nobody has to guess later.
  await admin.schema("eurokids").from("email_log").insert({
    subject, theme: body.theme || "school",
    filters: body.filters || {},
    recipients: sent.length, failures: failed.length,
    detail: { failed: failed.slice(0, 50), summary: sum },
  }).then(() => {}, () => {});   // logging must never block a send

  return NextResponse.json({
    ok: true, mode: "sent", sent: sent.length, failed: failed.length,
    failures: failed.slice(0, 30), summary: sum,
  });
}
