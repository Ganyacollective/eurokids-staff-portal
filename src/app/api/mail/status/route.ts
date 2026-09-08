import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mailStatus, dailyCap } from "@/lib/mailer";
import { bearer } from "@/lib/fee-data";

// GET /api/mail/status — which mailbox goes out through which provider, so
// nobody has to trust a comment in the code. Signed-in staff only; no keys
// are ever returned, just hosts and addresses.
export async function GET(req: NextRequest) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  const u = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: me } = await u.auth.getUser();
  if (!me?.user) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, ...mailStatus(), daily_cap: dailyCap() });
}
