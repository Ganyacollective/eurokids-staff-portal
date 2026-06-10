import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// GET /api/teacher/my-leaves
// Returns the calling teacher's combined leave history — both leave_requests
// (submitted via the teacher portal) and entries in portal_state.leaves
// (manually entered by HR). Deduplicates by source_id linkage.
export async function GET(req: NextRequest) {
  // Authenticate caller
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
  const token = match[1];

  const verifier = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userResult, error: verErr } = await verifier.auth.getUser(token);
  if (verErr || !userResult?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const userId = userResult.user.id;

  // Use service role to bypass RLS — we've already authenticated above and
  // scope the queries strictly to this user's own employee record.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Find this user's employee_id via teacher_links
  const { data: link, error: linkErr } = await admin.from("teacher_links").select("employee_id, display_name, department, designation").eq("user_id", userId).maybeSingle();
  if (linkErr || !link) {
    return NextResponse.json({ error: "No employee link for this account. Ask HR." }, { status: 404 });
  }

  // 2) Fetch leave_requests for this user
  const { data: requests } = await admin.from("leave_requests").select("*").eq("user_id", userId).order("applied_at", { ascending: false });
  const requestRows = requests || [];

  // 3) Fetch portal_state and pluck this employee's leaves + leave_credits
  const { data: portal } = await admin.from("portal_state").select("data").eq("id", "main").maybeSingle();
  const blobLeaves = ((portal?.data?.leaves as Array<{ id: string; employee_id: string; leave_type: string; start_date: string; end_date: string; total_days: number; reason?: string; status: string; reviewer_note?: string; applied_at?: string; reviewed_at?: string; source?: string; source_id?: string }>) || [])
    .filter((L) => L.employee_id === link.employee_id);

  // Aggregate leave credits across all reconciled months for this employee
  type Credit = { employee_id: string; leave_id: string; leave_type: string; date: string; days?: number };
  const credits: Credit[] = [];
  const months = (portal?.data?.attendanceMonths as Record<string, { leave_credits?: Credit[] }>) || {};
  for (const monthKey of Object.keys(months)) {
    const monthData = months[monthKey];
    for (const c of (monthData.leave_credits || [])) {
      if (c.employee_id === link.employee_id) credits.push(c);
    }
  }

  // Pluck the per-employee carry-forward additions
  type Emp = {
    id: string;
    cl_carry_forward?: number | null;
    el_carry_forward?: number | null;
    cl_allowance_override?: number | null;  // legacy field
    el_allowance_override?: number | null;  // legacy field
  };
  const employees = (portal?.data?.employees as Emp[]) || [];
  const empRecord = employees.find((e) => e.id === link.employee_id);
  // Carry-forward is additive on top of AY default; legacy override is total (back-compat).
  const carryForward = {
    cl: Number(empRecord?.cl_carry_forward ?? 0),
    el: Number(empRecord?.el_carry_forward ?? 0),
  };
  const legacyOverride = {
    cl: empRecord?.cl_carry_forward == null && empRecord?.cl_allowance_override != null ? empRecord.cl_allowance_override : null,
    el: empRecord?.el_carry_forward == null && empRecord?.el_allowance_override != null ? empRecord.el_allowance_override : null,
  };

  // 4) Merge — leave_request rows are primary. For each leave_request, if there
  //    exists a blob entry with matching source_id, prefer the blob's status &
  //    reviewer_note (HR may have edited after approval). Blob entries with no
  //    matching source_id (HR-only entries) are added as additional rows.
  const blobBySourceId = new Map<string, typeof blobLeaves[0]>();
  for (const L of blobLeaves) if (L.source_id) blobBySourceId.set(L.source_id, L);

  const seenSourceIds = new Set<string>();
  const merged: Array<{ id: string; leave_type: string; start_date: string; end_date: string; total_days: number; reason: string; status: string; reviewer_note?: string; applied_at: string; source: "request" | "blob" }> = [];

  for (const r of requestRows) {
    const blobMatch = blobBySourceId.get(r.id);
    if (blobMatch) seenSourceIds.add(r.id);
    merged.push({
      id: r.id,
      leave_type: blobMatch?.leave_type || r.leave_type,
      start_date: blobMatch?.start_date || r.start_date,
      end_date: blobMatch?.end_date || r.end_date,
      total_days: Number(blobMatch?.total_days ?? r.total_days),
      reason: blobMatch?.reason || r.reason || "",
      status: blobMatch?.status || r.status,
      reviewer_note: blobMatch?.reviewer_note || r.reviewer_note || undefined,
      applied_at: r.applied_at,
      source: "request",
    });
  }

  for (const L of blobLeaves) {
    if (L.source_id && seenSourceIds.has(L.source_id)) continue;
    merged.push({
      id: L.id,
      leave_type: L.leave_type,
      start_date: L.start_date,
      end_date: L.end_date,
      total_days: Number(L.total_days || 0),
      reason: L.reason || "",
      status: L.status,
      reviewer_note: L.reviewer_note,
      applied_at: L.applied_at || L.start_date + "T00:00:00Z",
      source: "blob",
    });
  }

  // 5) Sort newest first by applied_at
  merged.sort((a, b) => (b.applied_at || "").localeCompare(a.applied_at || ""));

  return NextResponse.json({ ok: true, leaves: merged, credits, carry_forward: carryForward, legacy_override: legacyOverride, employee: link });
}
