import { NextResponse, type NextRequest } from "next/server";
import { isKioskHost } from "@/lib/kiosk-host";

// Who is allowed to ask for the camera.
//
// This was a pair of rules in next.config.ts keyed on the hostname: the
// kiosk subdomain got camera=(self), everything else got camera=(). The
// reasoning was right and the consequence was not — kiosk.eurokidsjmdenclave.org
// has no DNS record yet, so no host on earth matched, and the reception
// tablet was served camera=() like everyone else. The browser then refuses
// getUserMedia outright without ever showing a prompt, which is the exact
// silent failure the comment in useKiosk.ts was written about: the form
// works, no dialog appears, and every walk-in is recorded with no photograph.
// I caused that when I split the hosts.
//
// So the test is now what actually identifies the tablet today, not what
// will identify it once the DNS is done:
//
//   • the kiosk subdomain, for when that record exists; or
//   • ?kiosk=<key> in the address, which is how the tablet is set up now.
//
// A parent filling the form in at home has neither, and is still sent
// camera=() — the browser will not carry their camera request at all.
//
// Why middleware rather than next.config: two header rules that both match
// would emit Permissions-Policy twice, and a header you cannot reason about
// is how this went wrong the first time. One place, one decision.
export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const isTablet =
    isKioskHost(req.headers.get("host")) || req.nextUrl.searchParams.has("kiosk");

  res.headers.set(
    "Permissions-Policy",
    isTablet
      ? "camera=(self), microphone=(), geolocation=()"
      : "camera=(), microphone=(), geolocation=()",
  );

  // The tablet is a till, not a page to be found in a search result.
  if (isKioskHost(req.headers.get("host"))) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return res;
}

export const config = {
  // Everything except Next's own assets and the files served straight from
  // /public — none of those open a camera and all of them are cached hard.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|mp4)$).*)"],
};
