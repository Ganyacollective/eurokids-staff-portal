import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, requireHr } from "../_lib";

// POST /api/admin/reset-password
// Body: { email, new_password? }
// Forcibly resets a user's password to the supplied string (default 'eurokids123').
export async function POST(req: NextRequest) {
  const gate = await requireHr(req);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

  let body: { email?: string; new_password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const email = (body.email || "").trim().toLowerCase();
  const new_password = body.new_password || "eurokids123";
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (new_password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

  const admin = getAdminClient();
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const target = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
  if (!target) return NextResponse.json({ error: "No user with that email" }, { status: 404 });

  const { error } = await admin.auth.admin.updateUserById(target.id, { password: new_password });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, email, new_password });
}
