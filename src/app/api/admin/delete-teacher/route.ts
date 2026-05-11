import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, requireHr } from "../_lib";

// POST /api/admin/delete-teacher
// Body: { email }
// Deletes the auth user (cascade removes teacher_links via FK).
export async function POST(req: NextRequest) {
  const gate = await requireHr(req);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

  let body: { email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const email = (body.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const admin = getAdminClient();
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const target = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
  if (!target) return NextResponse.json({ error: "No user with that email" }, { status: 404 });

  const { error } = await admin.auth.admin.deleteUser(target.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, email });
}
