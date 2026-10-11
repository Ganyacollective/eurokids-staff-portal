// "I changed it and nothing happened."
//
// Every page here is cached — the homepage and each card page are rendered
// once and served from the edge, which is why the site is fast. The cache was
// set to expire after ten minutes, so a card edited in the hub did eventually
// appear, roughly nine minutes after the person who edited it had decided the
// feature was broken and gone away.
//
// So the hub now says when something changed, and the page is rebuilt on the
// spot. The ten-minute expiry stays as a safety net for anything that misses
// this call.

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.SITE_REVALIDATE_SECRET;
  // No secret configured means no way to tell a real caller from anyone else,
  // and this endpoint can be used to make the site rebuild itself in a loop.
  if (!secret) {
    return NextResponse.json({ ok: false, error: "SITE_REVALIDATE_SECRET is not set." }, { status: 500 });
  }
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (given !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  // A slug may be given so only that card's page is rebuilt; the homepage is
  // always rebuilt, because it carries every card's artwork and order.
  const slug = typeof body.slug === "string" ? body.slug.replace(/[^a-z0-9-]/gi, "") : null;

  const done = ["/"];
  revalidatePath("/");
  if (slug) { revalidatePath(`/events/${slug}`); done.push(`/events/${slug}`); }

  return NextResponse.json({ ok: true, revalidated: done, at: new Date().toISOString() });
}
