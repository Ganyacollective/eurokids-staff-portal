// Enquiries that have quietly become children.
//
// GET  — what the roll says, without changing anything.
// POST — close the confident ones.
//
// The daily EPMS pull calls the POST path too, so this stays true on its own
// rather than only when somebody remembers to look.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findAdmitted, closeAdmitted } from "@/lib/enquiry-epms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function gate(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { error: "Not signed in.", status: 401 as const };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return { error: "Not signed in.", status: 401 as const };

  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const [{ data: mods }, { data: prof }] = await Promise.all([
    admin.from("module_access").select("module").eq("user_id", who.user.id).eq("module", "admission"),
    admin.from("profiles").select("role, full_name").eq("id", who.user.id).maybeSingle(),
  ]);
  if (!((mods && mods.length) || prof?.role === "admin")) return { error: "You need Admission.", status: 403 as const };
  return { admin, name: prof?.full_name || who.user.email || "someone" };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { matches, scanned, roll } = await findAdmitted(g.admin);
  return NextResponse.json({
    ok: true, scanned, roll,
    confident: matches.filter(m => m.confident),
    unsure: matches.filter(m => !m.confident),
  });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { admin, name } = g;

  const b = await req.json().catch(() => ({}));

  // Closing one by hand, from the "not sure" list, after a person has looked.
  if (b.id && b.uin) {
    const now = new Date().toISOString();
    const { error } = await admin.schema("eurokids").from("enquiry").update({
      status: "won", won_at: now, admitted_uin: String(b.uin), updated_at: now, updated_by: name,
    }).eq("id", Number(b.id)).in("status", ["in_progress", "form_taken", "almost_lost"]);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    await admin.schema("eurokids").from("enquiry_event").insert({
      enquiry_id: Number(b.id), at: now, kind: "won", actor: name,
      summary: `Joined — on the EuroKids roll as ${b.uin}. Confirmed by ${name}.`,
      detail: { uin: String(b.uin), from_epms: true, confirmed_by_hand: true },
    });
    return NextResponse.json({ ok: true, closed: 1 });
  }

  const { matches } = await findAdmitted(admin);
  const closed = await closeAdmitted(admin, matches, name);
  return NextResponse.json({ ok: true, closed, left: matches.filter(m => !m.confident).length });
}
