import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, requireHr } from "../_lib";

// POST /api/admin/create-teacher
// Body: { email, password, employee_id, display_name, department, designation }
// Idempotent end-to-end:
//   * If no auth user exists with `email` → creates one with that password.
//   * If one DOES exist → updates the password to the supplied one.
//   * Either way → upserts the teacher_links row.
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
  let userId: string;
  let action: "created" | "updated";

  // 1) Attempt to create the auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name, employee_id, department },
  });

  if (createErr) {
    if (/already been registered|already exists/i.test(createErr.message)) {
      // Locate existing user — paginate through all pages defensively
      let found: { id: string; email?: string | null } | undefined;
      for (let page = 1; page <= 20 && !found; page++) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (listErr) return NextResponse.json({ error: "Lookup failed: " + listErr.message }, { status: 500 });
        const users = list?.users || [];
        found = users.find((u) => (u.email || "").toLowerCase() === email);
        if (users.length < 200) break;
      }
      if (!found) {
        return NextResponse.json({ error: "User reported as existing but could not be located" }, { status: 500 });
      }
      userId = found.id;

      // Update the password on the existing user
      const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: { display_name, employee_id, department },
      });
      if (updErr) return NextResponse.json({ error: "Password update failed: " + updErr.message }, { status: 500 });
      action = "updated";
    } else {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
  } else {
    userId = created.user!.id;
    action = "created";
  }

  // 2) Upsert teacher_links so HR↔auth mapping stays consistent
  const { error: linkErr } = await admin.from("teacher_links").upsert({
    user_id: userId,
    employee_id,
    display_name,
    department,
    designation,
  });
  if (linkErr) return NextResponse.json({ error: "Linking failed: " + linkErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, action, user_id: userId, email });
}
