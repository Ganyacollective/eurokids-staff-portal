// Who hears about a new enquiry.
//
// Not a list of typed-in addresses — the people who already have accounts
// here. An address typed into a settings box goes stale the day somebody
// leaves; an account is revoked when they go, and the notifications stop with
// it. So this lists the hub's own users and records, per person, which sources
// they want to be told about.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES = ["Walk In", "Call", "Website", "Leadsquare", "Instagram", "Referral", "Just Dial", "WhatsApp", "Others"];

async function caller(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await asUser.auth.getUser();
  return data?.user ?? null;
}

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// Changing who is told about families is an admin decision, not an Admission
// one — otherwise anyone with Admission could quietly remove the office from
// the list and nobody would notice until a walk-in went unanswered.
async function mayEdit(db: ReturnType<typeof admin>, userId: string) {
  const { data } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}

export async function GET(req: NextRequest) {
  const user = await caller(req);
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const db = admin();
  // Who may even look.
  //
  // This authenticated and then stopped, so any signed-in account -- a
  // teacher with no grants at all -- could read every hub user's email
  // address and role. The POST was gated correctly; the GET was not, and
  // mayEdit was computed here only to colour a button.
  if (!(await mayEdit(db, user.id))) {
    return NextResponse.json({ ok: false, error: "Only an admin can see or change who is notified." }, { status: 403 });
  }
  // The address is on the auth record, not the profile — profiles carries the
  // name and the role and nothing you could send an email to.
  const [{ data: authList }, { data: profs }, { data: prefs }, { data: links }, { data: grants }] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 200 }),
    db.from("profiles").select("id, full_name, role"),
    db.schema("eurokids").from("enquiry_notify").select("id, user_id, email, sources"),
    db.from("teacher_links").select("user_id"),
    db.from("module_access").select("user_id"),
  ]);

  const by = new Map((prefs || []).filter(p => p.user_id).map(p => [p.user_id, p.sources || []]));
  const prof = new Map((profs || []).map(p => [p.id, p]));

  // Hub users only — the same people Users & Access lists.
  //
  // This listed every account in auth, which is 26 rows, 23 of them teachers
  // created in the Staff Portal along with a few old test accounts. Nobody is
  // ever going to tell a nursery teacher's personal Gmail about a walk-in, so
  // every one of those lines was noise around the three that matter, and the
  // list got longer every time somebody was hired.
  //
  // Both conditions, not either. A teacher is excluded even if somebody grants
  // them a module one day, and an account with no grants is excluded even if
  // it was never linked to a teacher — which is what the leftover test
  // accounts are. If the two ever disagree, the quiet answer is to leave the
  // person out of a list about families.
  const teacher = new Set((links || []).map(l => l.user_id));
  const hasGrant = new Set((grants || []).map(g => g.user_id));

  const people = (authList?.users || [])
    .filter(u => u.email && !teacher.has(u.id) && hasGrant.has(u.id))
    .map(u => ({
      id: u.id,
      name: prof.get(u.id)?.full_name || u.email!,
      email: u.email!,
      role: prof.get(u.id)?.role || null,
      // Someone with no row has never been asked, which is not the same as
      // someone who was asked and said no. Both look unticked here, but
      // notifyRecipients cares: no rows at all means fall back to the office.
      sources: by.get(u.id) || [],
      configured: by.has(u.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Addresses that are not hub users at all — a coordinator who should get
  // the walk-in email and has no business signing in, and whose address
  // often already exists as a Staff Portal teacher login so an account
  // cannot be made for it anyway.
  const extras = (prefs || []).filter(p => p.email).map(p => ({
    id: p.id, email: String(p.email), sources: p.sources || [],
  })).sort((a, b) => a.email.localeCompare(b.email));

  return NextResponse.json({ ok: true, sources: SOURCES, canEdit: await mayEdit(db, user.id), people, extras });
}

export async function POST(req: NextRequest) {
  const user = await caller(req);
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const db = admin();
  if (!(await mayEdit(db, user.id))) {
    return NextResponse.json({ ok: false, error: "Only an admin can change who is notified." }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const userId = String(b.user_id || "");
  const email = String(b.email || "").trim().toLowerCase();

  // Removing an address entirely, rather than unticking every source.
  if (b.remove && email) {
    const { error } = await db.schema("eurokids").from("enquiry_notify").delete().eq("email", email);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, removed: email });
  }

  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: "That does not look like an email address." }, { status: 400 });
    }
    const sources = Array.isArray(b.sources) ? b.sources.filter((x: string) => SOURCES.includes(x)) : [];
    const { error } = await db.schema("eurokids").from("enquiry_notify")
      .upsert({ email, sources, updated_at: new Date().toISOString(), updated_by: user.id }, { onConflict: "email" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, email, sources });
  }

  if (!userId) return NextResponse.json({ ok: false, error: "Which person?" }, { status: 400 });

  // The same test the list applies, applied again on the way in. The GET
  // deciding who is offered is a matter of presentation; this is the one that
  // decides, and a request that never went through the screen is exactly the
  // one that would put a teacher's personal address on the list.
  const [{ data: link }, { data: grant }] = await Promise.all([
    db.from("teacher_links").select("user_id").eq("user_id", userId).maybeSingle(),
    db.from("module_access").select("user_id").eq("user_id", userId).limit(1).maybeSingle(),
  ]);
  if (link || !grant) {
    return NextResponse.json(
      { ok: false, error: "Only people with hub access can be notified. Grant them access in Users & Access first." },
      { status: 400 },
    );
  }

  // Only sources we actually have. An unknown string here would be a row that
  // silently never matches, which looks identical to being switched off.
  const sources = Array.isArray(b.sources) ? b.sources.filter((s: string) => SOURCES.includes(s)) : [];

  const { error } = await db.schema("eurokids").from("enquiry_notify").upsert({
    user_id: userId, sources, updated_at: new Date().toISOString(), updated_by: user.id,
  }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, sources });
}
