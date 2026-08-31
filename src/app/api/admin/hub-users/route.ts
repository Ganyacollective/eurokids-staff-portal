import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Only the owner may manage hub users. Module grants (incl. finance) are
// deliberately NOT something HR/admin roles can hand out — see access model.
const OWNER_EMAILS = new Set(["abhinav@ganya.in"]);

const VALID_MODULES = new Set([
  "staff_portal", "epms_admin", "pulse", "payroll", "fees", "kits", "admission", "finance",
]);

async function requireOwner(req: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; status: number; message: string }> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, status: 401, message: "Missing bearer token" };
  const verifier = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await verifier.auth.getUser(m[1]);
  if (error || !data?.user) return { ok: false, status: 401, message: "Invalid token" };
  if (!OWNER_EMAILS.has((data.user.email || "").toLowerCase()))
    return { ok: false, status: 403, message: "Only the owner can manage users" };
  return { ok: true, userId: data.user.id };
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
}

// GET — list users with their profile + module grants
export async function GET(req: NextRequest) {
  const gate = await requireOwner(req);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  const a = admin();

  const { data: list, error: listErr } = await a.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const { data: profiles } = await a.from("profiles").select("id, role, full_name");
  const { data: grants } = await a.from("module_access").select("user_id, module");
  const profById = new Map((profiles || []).map(p => [p.id, p]));
  const grantsById = new Map<string, string[]>();
  for (const g of grants || []) {
    if (!grantsById.has(g.user_id)) grantsById.set(g.user_id, []);
    grantsById.get(g.user_id)!.push(g.module);
  }

  // Teacher accounts are managed in the staff portal — mark them so the UI can set them apart.
  const { data: links } = await a.from("teacher_links").select("user_id");
  const teacherIds = new Set((links || []).map(l => l.user_id));

  const users = (list?.users || []).map(u => ({
    id: u.id,
    email: u.email,
    full_name: profById.get(u.id)?.full_name || null,
    role: profById.get(u.id)?.role || null,
    modules: grantsById.get(u.id) || [],
    is_teacher: teacherIds.has(u.id),
    last_sign_in_at: u.last_sign_in_at || null,
    created_at: u.created_at,
  })).sort((x, y) => (x.email || "").localeCompare(y.email || ""));

  return NextResponse.json({ ok: true, users });
}

// POST — { action: 'create'|'set_modules'|'reset_password'|'delete', ... }
export async function POST(req: NextRequest) {
  const gate = await requireOwner(req);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  const a = admin();

  let body: { action?: string; email?: string; password?: string; full_name?: string; modules?: string[]; user_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = body.action || "";

  if (action === "create") {
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const full_name = (body.full_name || "").trim();
    const modules = (body.modules || []).filter(mod => VALID_MODULES.has(mod));
    if (!email || !full_name) return NextResponse.json({ error: "email and full_name required" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

    // Auth Admin API — never raw SQL into auth.users (NULL token columns break GoTrue).
    const { data: created, error: createErr } = await a.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name },
    });
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    const uid = created.user!.id;

    // Profile — role 'staff': keeps them out of is_admin()-gated surfaces by default.
    const { error: profErr } = await a.from("profiles").upsert({ id: uid, role: "staff", full_name });
    if (profErr) return NextResponse.json({ error: "Profile: " + profErr.message }, { status: 500 });

    if (modules.length) {
      const rows = modules.map(mod => ({ user_id: uid, module: mod, granted_by: gate.userId }));
      const { error: grantErr } = await a.from("module_access").insert(rows);
      if (grantErr) return NextResponse.json({ error: "Grants: " + grantErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, user_id: uid, email, modules });
  }

  if (action === "set_modules") {
    const uid = body.user_id || "";
    const modules = (body.modules || []).filter(mod => VALID_MODULES.has(mod));
    if (!uid) return NextResponse.json({ error: "user_id required" }, { status: 400 });
    const { error: delErr } = await a.from("module_access").delete().eq("user_id", uid);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    if (modules.length) {
      const rows = modules.map(mod => ({ user_id: uid, module: mod, granted_by: gate.userId }));
      const { error: insErr } = await a.from("module_access").insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, user_id: uid, modules });
  }

  if (action === "reset_password") {
    const uid = body.user_id || "";
    const password = body.password || "";
    if (!uid || password.length < 8) return NextResponse.json({ error: "user_id and password (≥8 chars) required" }, { status: 400 });
    const { error } = await a.auth.admin.updateUserById(uid, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const uid = body.user_id || "";
    if (!uid) return NextResponse.json({ error: "user_id required" }, { status: 400 });
    if (uid === gate.userId) return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
    await a.from("module_access").delete().eq("user_id", uid);
    const { error } = await a.auth.admin.deleteUser(uid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
