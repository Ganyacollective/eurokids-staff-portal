// The school mailbox, read-only, behind its own permission.
//
// GET /api/inbox            → the latest messages
// GET /api/inbox?q=sharma   → server-side search
// GET /api/inbox?uid=123    → one message with its body
//
// Nothing here can send, delete or mark anything read. The mailbox is opened
// with a readonly lock in lib/inbox, so a coordinator glancing at this screen
// cannot change what the person actually working the mailbox sees in Gmail.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { list, one, mailboxReady, mailboxAddress } from "@/lib/inbox";

// IMAP is a long-lived TCP connection, which the edge runtime cannot open.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// The mailbox permission is not implied by being an admin. admin@ receives
// head office, bank and vendor mail as well as parents', and "can open the
// hub" must not quietly mean "can read all of that" — so this one is granted
// explicitly or not at all.
async function allowed(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { ok: false as const, status: 401, error: "Not signed in." };

  const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return { ok: false as const, status: 401, error: "Not signed in." };

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { data: mods } = await svc.from("module_access")
    .select("module").eq("user_id", who.user.id).eq("module", "mailbox");

  if (!mods?.length) {
    return { ok: false as const, status: 403, error: "You do not have the Mailbox permission." };
  }
  return { ok: true as const };
}

export async function GET(req: Request) {
  const gate = await allowed(req);
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  if (!mailboxReady()) {
    return NextResponse.json({
      ok: false,
      error: "The mailbox is not configured. IMAP_USER/IMAP_PASS, or the existing SMTP_USER/SMTP_PASS, must be set.",
    }, { status: 503 });
  }

  const url = new URL(req.url);
  const uid = Number(url.searchParams.get("uid") || 0);
  const box = url.searchParams.get("box") || "INBOX";

  try {
    if (uid) {
      const msg = await one(uid, box);
      if (!msg) return NextResponse.json({ ok: false, error: "That message is no longer there." }, { status: 404 });
      return NextResponse.json({ ok: true, message: msg });
    }
    const q = url.searchParams.get("q") || "";
    const limit = Math.min(100, Math.max(5, Number(url.searchParams.get("limit") || 40)));
    const messages = await list(box, limit, q);
    return NextResponse.json({ ok: true, address: mailboxAddress(), messages });
  } catch (e) {
    // An IMAP failure is almost always one of three things and the message
    // from the library says which, so it is passed through rather than
    // flattened into "could not load": a rejected app password, IMAP turned
    // off on the account, or the host being wrong.
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `Could not read the mailbox: ${msg}` }, { status: 502 });
  }
}
