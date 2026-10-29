import { NextResponse } from "next/server";
import { isKioskHost } from "@/lib/kiosk-host";

// The tablet asks who it is, once, on load.
//
// This is what lets the reception iPad need no setting up at all: open
// kiosk.eurokidsjmdenclave.org and it is the tablet. No key typed into an
// address bar, nothing in local storage to go stale, nothing lost when the
// home-screen icon launches the bare address.
//
// Host, not Origin. The Host header is what routed this request to this
// deployment in the first place — a browser cannot send one host and be
// served another — whereas Origin is a claim the caller makes about itself
// and can be typed by anybody with curl.
//
// What this does NOT do is make the key secret from whoever can reach this
// address. Anyone who loads the kiosk subdomain can read the key out of this
// response, and subdomains are not private — they show up in certificate
// transparency logs. The key still buys something real: it stops a passer-by
// who knows only the public API from posting invented walk-ins with invented
// photographs. It does not stop someone who has deliberately gone looking.
// Putting Vercel's password protection on the kiosk domain closes that, and
// is a setting rather than a code change.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const host = req.headers.get("host");
  if (!isKioskHost(host)) {
    // Not the tablet's address. Say nothing about whether a key exists.
    return NextResponse.json({ kiosk: false }, { status: 404 });
  }
  const key = process.env.ENQUIRY_KIOSK_KEY || null;
  return NextResponse.json(
    { kiosk: true, key },
    // Never let this sit in a shared cache between the two hosts.
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
