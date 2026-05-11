import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, requireHr } from "../_lib";

// POST /api/admin/create-teacher
// Body: { email, password, employee_id, display_name, department, designation }
// Creates a Supabase Auth user and the corresponding teacher_links row.
// Idempotent: if the user already exists, returns 409 with their id.
export async function POST(req: NextRequest) {
  const gate = await requireHr(req);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

  let body: {
    email?: string;
    password?: string;
    employee_id?: string;
    display_name?: string;
    department?: string;
    designation?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "eurokids123";
  const employee_id = (body.employee_id || "").trim();
  const display_name = (body.display_name || "").trim();
  const department = (body.department || "").trim();
  const designation = (body.designation || "").trim();

  if (!email || !employee_id || !display_name) {
    return NextResponse.json(
      { error: "email, employee_id, and display_name are required" },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const admin = getAdminClient();

  // 1) Create the auth user (idempotent)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name, employee_id, department },
  });

  let userId: string;
  if (createErr) {
    if (/already been registered|already exists/i.test(createErr.message)) {
      // Look up existing user
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
      if (!found) return NextResponse.json({ error: "User exists but lookup failed" }, { status: 500 });
      userId = found.id;
    } else {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
  } else {
    userId = created.user!.id;
  }

  // 2) Upsert teacher_links
  const { error: linkErr } = await admin.from("teacher_links").upsert({
    user_id: userId,
    employee_id,
    display_name,
    department,
    designation,
  });
  if (linkErr) return NextResponse.json({ error: "Linking failed: " + linkErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, user_id: userId, email, password });
}
