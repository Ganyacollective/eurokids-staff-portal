// Telling a teacher what happened to their leave.
//
// Until now, nothing did. Applying notified HR; approving or rejecting
// updated a row and stopped there, so the only way a teacher learned the
// answer was to open the portal and look. People do not do that — they ask,
// in the corridor, and somebody has to go and check.
//
// Three messages, all to the teacher:
//   applied   — we have it, here is what you asked for
//   approved  — it is granted
//   rejected  — it is not, and why
//
// The address is the account they sign in with, not employees.email. That
// column is empty for all twenty-four staff, and leave_requests.employee_id
// is a blob id like "e18" that does not match the employees table at all —
// nought of thirty-five rows join. user_id resolves to an auth user with a
// real address for thirty-five of thirty-five, so that is what is used.
//
// Sent from hr@, not admin@: a teacher's reply about their own leave should
// not land in the mailbox the whole office reads.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderEmail, esc, HR_EMAIL } from "@/lib/brand-email";
import { sendMail, mailReady } from "@/lib/mailer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Kind = "applied" | "approved" | "rejected";

const fmt = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-IN",
    { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const verifier = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error: verErr } = await verifier.auth.getUser(m[1]);
  if (verErr || !who?.user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let body: { request_id?: string; kind?: string; updated?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const requestId = String(body.request_id || "").trim();
  const kind = String(body.kind || "") as Kind;
  // The same decision, re-sent because the dates or the reason changed. The
  // wording has to say so, or a teacher whose leave moved gets "your leave
  // has been approved" twice and has to work out which one is current.
  const updated = body.updated === true;
  if (!requestId) return NextResponse.json({ ok: false, error: "request_id required" }, { status: 400 });
  if (!["applied", "approved", "rejected"].includes(kind)) {
    return NextResponse.json({ ok: false, error: "kind must be applied, approved or rejected" }, { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // One leave system, so one lookup.
  //
  // This route used to carry a second branch: if the id was not a uuid in
  // leave_requests, go and look for it inside portal_state.data.leaves,
  // because applications filed without signing in lived there. Both systems
  // have been merged into the table, so that branch is gone — and with it the
  // bug where approving a leave in one place sent nothing because the other
  // place still said Pending.
  type Leave = {
    id: string; leave_type: string; start_date: string; end_date: string;
    total_days: number | string; reason?: string; status: string;
    reviewer_note?: string; user_id?: string | null; employee_id: string;
  };

  const { data: row } = await admin.from("leave_requests")
    .select("id, leave_type, start_date, end_date, total_days, reason, status, reviewer_note, user_id, employee_id")
    .eq("id", requestId).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "That request no longer exists." }, { status: 404 });
  const lr = row as Leave;

  // Where to write to. Two places hold an address, and they are not equally
  // good: the account she signs in with is verified, the one on the employee
  // record is whatever was typed. The account wins where there is one, and a
  // leave applied for without signing in has none — so the employee record
  // is the fallback rather than the first choice.
  let to = "";
  let name = "";

  if (lr.user_id) {
    const { data: teacher } = await admin.auth.admin.getUserById(String(lr.user_id));
    to = (teacher?.user?.email || "").trim();
  }
  // Oldest link wins; four people have two, and maybeSingle() would throw.
  const { data: links } = await admin.from("teacher_links")
    .select("display_name, created_at").eq("employee_id", lr.employee_id)
    .order("created_at", { ascending: true }).limit(1);
  name = (links?.[0]?.display_name || "").trim();

  if (!to || !name) {
    const { data: ps } = await admin.from("portal_state").select("data").eq("id", "main").maybeSingle();
    const emps = ((ps?.data || {}) as { employees?: { id: string; display_name?: string; email?: string }[] }).employees || [];
    const emp = emps.find(e => e.id === lr.employee_id);
    if (!to) to = (emp?.email || "").trim();
    if (!name) name = (emp?.display_name || to.split("@")[0] || "").trim();
  }

  // Who may send which. A teacher can trigger their own "we have it";
  // announcing a decision is the reviewer's to make, and letting anyone send
  // an approval email would mean a teacher could mail themselves one.
  const { data: me } = await admin.from("profiles").select("role").eq("id", who.user.id).maybeSingle();
  const isStaff = me?.role === "admin" || me?.role === "hr";
  if (kind === "applied" && lr && lr.user_id && lr.user_id !== who.user.id && !isStaff) {
    return NextResponse.json({ ok: false, error: "That is not your leave application." }, { status: 403 });
  }
  if (kind !== "applied" && !isStaff) {
    return NextResponse.json({ ok: false, error: "Only HR or an admin can send a decision." }, { status: 403 });
  }

  // The decision has to have actually been recorded. Otherwise a mistaken
  // click mails a teacher that their leave is approved while the row still
  // says Pending, and the email becomes the more believable of the two.
  if (kind === "approved" && lr.status !== "Approved") {
    return NextResponse.json({ ok: false, error: `This request is ${lr.status}, not Approved.` }, { status: 409 });
  }
  if (kind === "rejected" && lr.status !== "Rejected") {
    return NextResponse.json({ ok: false, error: `This request is ${lr.status}, not Rejected.` }, { status: 409 });
  }

  if (!to) {
    return NextResponse.json({ ok: false,
      error: "There is no email address on file for this person, so nothing could be sent." }, { status: 400 });
  }
  if (!mailReady("hr")) {
    return NextResponse.json({ ok: false, error: "The HR mailbox is not configured to send." }, { status: 503 });
  }
  const first = (name || to.split("@")[0]).split(/\s+/)[0];

  const days = Number(lr.total_days);
  const dayText = `${days} day${days === 1 ? "" : "s"}`;
  const dates = lr.start_date === lr.end_date ? fmt(lr.start_date) : `${fmt(lr.start_date)} to ${fmt(lr.end_date)}`;

  const facts = `
    <table cellpadding="0" cellspacing="0" style="margin:14px 0 4px;font-size:15px">
      <tr><td style="padding:3px 18px 3px 0;color:#5F5F66">Leave</td><td><strong>${esc(lr.leave_type)}</strong></td></tr>
      <tr><td style="padding:3px 18px 3px 0;color:#5F5F66">Dates</td><td><strong>${esc(dates)}</strong></td></tr>
      <tr><td style="padding:3px 18px 3px 0;color:#5F5F66">Days</td><td><strong>${esc(dayText)}</strong></td></tr>
    </table>`;

  let subject: string, title: string, subtitle: string, bodyHtml: string;
  // Green for granted, red for refused. A teacher should know which it is
  // from the shape of the thing before reading a word of it — and the two
  // arriving in the same blue made them look like the same email twice.
  let theme: "school" | "calm" | "sombre" = "school";

  if (kind === "applied") {
    subject = `We have your ${lr.leave_type} application (${dayText})`;
    title = "Your leave application has been received";
    subtitle = "Nothing is decided yet — this is only to confirm it reached us.";
    bodyHtml = `<p>Dear ${esc(first)},</p>
      <p>Your application has been received and is with the office.</p>${facts}
      <p>You will get another email the moment it is decided. There is no need to follow up in the meantime.</p>`;
    theme = "school";
  } else if (kind === "approved") {
    theme = "calm";
    subject = updated ? `Updated — your approved leave has changed (${dates})`
                      : `Approved — ${lr.leave_type}, ${dates}`;
    title = updated ? "Your approved leave has been changed" : "Your leave has been approved";
    subtitle = updated ? "These are the details as they now stand." : "";
    bodyHtml = `<p>Dear ${esc(first)},</p>
      <p>${updated
          ? "Your leave is still approved, but the details have been changed. This is what is on record now:"
          : "Good news — your leave has been approved. Enjoy the time off."}</p>${facts}
      <p>Please hand your class over before you go, and let the office know if anything changes.</p>`;
  } else {
    theme = "sombre";
    subject = updated ? `Updated — ${lr.leave_type}, ${dates}`
                      : `Not approved — ${lr.leave_type}, ${dates}`;
    title = updated ? "Your rejected leave has been changed" : "Your leave has not been approved";
    subtitle = updated ? "These are the details as they now stand." : "";
    bodyHtml = `<p>Dear ${esc(first)},</p>
      <p>${updated ? "This application is still not approved, and the details have changed:"
                   : "I am sorry — this application has not been approved."}</p>${facts}
      ${lr.reviewer_note ? `<p style="margin-top:14px"><strong>Reason given:</strong><br>${esc(lr.reviewer_note)}</p>` : ""}
      <p>If you need to discuss it, speak to the office — replying to this email reaches HR.</p>`;
  }

  const r = await sendMail({
    to: [to],
    subject,
    from: "hr",
    html: renderEmail({ title, subtitle, bodyHtml, theme, contactEmail: HR_EMAIL }),
    text: `${title}\n\n${lr.leave_type} · ${dates} · ${dayText}`
      + (kind === "rejected" && lr.reviewer_note ? `\n\nReason: ${lr.reviewer_note}` : ""),
  });

  if (!r.ok) return NextResponse.json({ ok: false, error: r.error || "The email did not go." }, { status: 502 });
  return NextResponse.json({ ok: true, sent_to: to });
}
