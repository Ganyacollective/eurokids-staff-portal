// Ask EPMS to send a family their payment link.
//
// EPMS's own Generate Link button is two GETs, with no anti-forgery token, so
// a signed-in session is all it takes:
//
//   GET /Receipt/LinkStatus?admissionID=…            → "UnExpired" | "GQActive" | free
//   GET /Receipt/SendLinkSMSAndEmail?admissionID=…&amount=…&isEMI=…  → "Success"
//
// EPMS delivers it itself, by SMS, WhatsApp and email, through GrayQuest —
// exactly as it does when the office presses the button. Nothing about what the
// parent receives changes; what changes is that nobody has to open EPMS, find
// the child, and copy the balance across 124 times.
//
//   POST { uin, amount? }             one family
//   POST { uin, check: true }         a rehearsal — stops short of sending
//   POST { uins: [...] }              several, after a confirmation
//
// EMI is not a setting here. EPMS offers it between ₹10,000 and ₹1,00,000 and
// we do exactly the same, so a parent sees the same options however the link
// was triggered.
//
// Needs EPMS_USER / EPMS_PASS in the environment.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { epmsLogin, epmsGet, type Jar } from "@/lib/epms-session";
import { harvestAdmissionIds } from "@/lib/epms-admissions";

export const maxDuration = 300;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Row = { uin: string; student_name: string | null; true_due: number | null; epms_due: number | null };

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Read as the caller, so only someone who may see fees can send a link.
  const asUser = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: who } = await asUser.auth.getUser(token);
  if (!who?.user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const me = (who.user.email || "").split("@")[0];

  const body = await req.json().catch(() => ({}));
  const uins: string[] = body.uins?.length ? body.uins : body.uin ? [body.uin] : [];
  if (!uins.length) return NextResponse.json({ error: "Which child?" }, { status: 400 });
  if (uins.length > 200) return NextResponse.json({ error: "Too many at once." }, { status: 400 });

  const { data: rows, error } = await asUser.schema("eurokids").from("v_schedule")
    .select("uin,student_name,true_due,epms_due").in("uin", uins);
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  if (!rows?.length) return NextResponse.json({ error: "Nobody matched, or you may not see their fees." }, { status: 403 });

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const readIds = async () => {
    const { data } = await admin.schema("epms").from("admission_ids").select("uin,admission_id").in("uin", uins);
    return new Map((data || []).map((r) => [r.uin, r.admission_id as string]));
  };
  let idFor = await readIds();

  let jar: Jar;
  try { jar = await epmsLogin(); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }

  // A child admitted since the last harvest has no id yet. Rather than refuse
  // and make somebody go and press a button they should never have heard of,
  // rebuild the phone book on the spot and carry on.
  if (rows.some((r) => !idFor.has(r.uin))) {
    try { await harvestAdmissionIds(admin, jar); idFor = await readIds(); }
    catch { /* the per-child refusal below will say so plainly */ }
  }

  const results: { uin: string; name: string; status: string; detail: string; amount: number }[] = [];

  for (const r of rows as Row[]) {
    const name = r.student_name || r.uin;
    const gid = idFor.get(r.uin);
    const push = (status: string, detail: string, amount = 0, emi = false) => {
      results.push({ uin: r.uin, name, status, detail, amount });
      return admin.schema("eurokids").from("payment_link")
        .insert({ uin: r.uin, amount, is_emi: emi, sent_by: me, status, detail })
        .then(() => {}, () => {});
    };

    if (!gid) { await push("refused", "EPMS has no admission record under this UIN."); continue; }

    // EPMS refuses any amount above the balance it believes in, and its balance
    // ignores our concession. Asking for the smaller of the two is the only
    // figure both sides accept; the difference is reported, never hidden.
    const ours = Math.round(Number(r.true_due || 0));
    const theirs = Math.round(Number(r.epms_due || 0));
    const asked = Math.round(Number(body.amount) > 0 ? Number(body.amount) : Math.min(ours || theirs, theirs || ours));
    if (asked <= 0) { await push("refused", "Nothing outstanding."); continue; }
    if (theirs > 0 && asked > theirs) {
      await push("refused", `We show ${ours} outstanding but EPMS only shows ${theirs}; it will not accept the larger figure.`, asked);
      continue;
    }

    try {
      const live = (await epmsGet(jar, `/Receipt/LinkStatus?admissionID=${gid}`)).trim();
      if (/UnExpired/i.test(live)) {
        await push("already_live", "A link is already out and has not expired yet.", asked);
        continue;
      }
      // A rehearsal: everything up to the send — the login, the session, the
      // admission id, EPMS's own view of whether a link may go out — without a
      // single message reaching a family.
      if (body.check === true) {
        results.push({ uin: r.uin, name, amount: asked, status: "ready",
          detail: `EPMS is ready to send ${asked}. Nothing has gone out.` });
        continue;
      }
      // Exactly what EPMS's own button does: EMI between ₹10,000 and ₹1,00,000.
      // Not our decision to make — the parent should get the same offer either
      // way, and the school is paid in full regardless of how they settle it.
      const emi = asked > 10000 && asked <= 100000;
      const res = (await epmsGet(jar,
        `/Receipt/SendLinkSMSAndEmail?admissionID=${gid}&amount=${asked}&isEMI=${emi}`)).trim();
      if (/Success/i.test(res)) await push("sent", `Sent by SMS, WhatsApp and email${emi ? ", with EMI offered" : ""}.`, asked, emi);
      else await push("failed", res.slice(0, 200) || "EPMS gave no answer.", asked, emi);
    } catch (e) {
      await push("failed", (e as Error).message, asked);
    }
  }

  const count = (s: string) => results.filter((r) => r.status === s).length;
  return NextResponse.json({
    ok: true, results,
    summary: { sent: count("sent"), already_live: count("already_live"),
               refused: count("refused"), failed: count("failed") },
  });
}
