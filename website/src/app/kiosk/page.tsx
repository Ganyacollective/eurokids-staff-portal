import type { Metadata } from "next";
import CardMarquee from "@/components/CardMarquee";
import IntakeHead from "@/components/IntakeHead";
import EnquiryForm from "@/components/EnquiryForm";
import KioskSW from "@/components/KioskSW";
import { listCards, getSetting } from "@/lib/site";

// The reception tablet's own front door.
//
// The kiosk was meant to be its own subdomain, and that is still the tidiest
// answer — but it needs a DNS record that does not exist, and the tablet is
// in use now. This is the version that works without one.
//
// Why a path at all, when ?kiosk=<key> already marks the tablet: because the
// tablet is installed to the home screen, and the icon launches the
// manifest's start_url, which is "/" with no query string. The key survives
// in local storage, so the enquiry still files as a walk-in — but the
// Permissions-Policy header is decided per request, and a request to "/" is
// indistinguishable from a parent at home, so the camera is refused and the
// photograph is silently lost. That is the whole bug, and no amount of
// remembering on the device fixes it, because the header is decided before
// any of our JavaScript runs.
//
// So the tablet gets an address it can be launched at. /kiosk carries its own
// manifest whose start_url is /kiosk, so "Add to Home Screen" from here
// installs an icon that comes back here, and the middleware allows the camera
// on this path.
//
// The key is NOT in the manifest and not in this page. It is handed over once
// during setup by opening /kiosk?kiosk=<key>, which stores it on the device.
// A manifest is public; a key in it would be published.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Reception",
  // Its own manifest, so the installed icon returns to /kiosk rather than to
  // the public home page.
  manifest: "/kiosk.webmanifest",
  robots: { index: false, follow: false },
};

export default async function Kiosk() {
  const [cards, seconds] = await Promise.all([
    listCards(),
    getSetting("marquee_seconds", "55"),
  ]);

  return (
    <>
      <KioskSW />
      <CardMarquee cards={cards} seconds={Number(seconds) || 55} />

      <section className="tf-section" id="enquire">
        <div className="tf-wrap">
          <IntakeHead />
          {/* kioskHost, because being on this page IS the statement that this
              is the tablet — it does not depend on a query string that the
              home-screen icon throws away. The key still comes from the
              device, so the server has something to check. */}
          <EnquiryForm kioskHost />
        </div>
      </section>
    </>
  );
}
