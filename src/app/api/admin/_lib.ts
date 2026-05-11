import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const HR_EMAILS = new Set([
  "hr@eurokidsjmdenclave.org",
  "admin@eurokidsjmdenclave.org",
]);

export function getAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Verifies the caller is HR by extracting the Bearer token from the request,
 * resolving it to a user, and checking the email matches the HR allow-list.
 * Returns the user object on success, or null with a description on failure.
 */
export async function requireHr(req: NextRequest): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; status: number; message: string }
> {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, message: "Missing bearer token" };
  const token = match[1];

  // Validate the token against Supabase by calling getUser with it
  const verifier = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data?.user)
    return { ok: false, status: 401, message: "Invalid or expired token" };
  const email = (data.user.email || "").toLowerCase();
  if (!HR_EMAILS.has(email))
    return { ok: false, status: 403, message: "Caller is not HR" };

  return { ok: true, userId: data.user.id, email };
}
