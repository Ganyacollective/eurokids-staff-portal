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
  // The address is on the auth record, not the profile — profiles carries the
  // name and the role and nothing you could send an email to.
  const [{ data: authList }, { data: profs }, { data: prefs }] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 200 }),
    db.from("profiles").select("id, full_name, role"),
    db.schema("eurokids").from("enquiry_notify").select("user_id, sources"),
  ]);

  const by = new Map((prefs || []).map(p => [p.user_id, p.sources || []]));
  const prof = new Map((profs || []).map(p => [p.id, p]));

  const people = (authList?.users || [])
    .filter(u => u.email)
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

  return NextResponse.json({ ok: true, sources: SOURCES, canEdit: await mayEdit(db, user.id), people });
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
  if (!userId) return NextResponse.json({ ok: false, error: "Which person?" }, { status: 400 });

  // Only sources we actually have. An unknown string here would be a row that
  // silently never matches, which looks identical to being switched off.
  const sources = Array.isArray(b.sources) ? b.sources.filter((s: string) => SOURCES.includes(s)) : [];

  const { error } = await db.schema("eurokids").from("enquiry_notify").upsert({
    user_id: userId, sources, updated_at: new Date().toISOString(), updated_by: user.id,
  }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, sources });
}
