import type { Metadata } from "next";
import EnquiryForm from "@/components/EnquiryForm";
import IntakeHead from "@/components/IntakeHead";
import KioskStatus from "@/components/KioskStatus";

// The reception tablet, as its own address.
//
// Until now the tablet was the home page: install the site, and the icon
// opened the marquee of posters with the form a scroll below it, under the
// site header, with twelve footer links at the bottom. Fine for a parent at
// home. Wrong for a device that is handed across a counter — the first thing
// a family sees should be the first question, and there should be nothing on
// the screen to wander off into.
//
// So: same form, same API, no header, no breadcrumb, no footer, and its own
// manifest, so the installed app is called Enquiry, opens here rather than at
// the top of the marketing site, and is scoped to this page.
//
// noindex, because a bare form with no prose is exactly the kind of page that
// gets flagged as thin content, and nobody searching for a preschool wants to
// land on the reception desk.

export const metadata: Metadata = {
  title: "Enquiry desk",
  description: "The reception tablet at EuroKids JMD Enclave.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/kiosk" },
  manifest: "/kiosk.webmanifest",
  appleWebApp: { capable: true, title: "Enquiry", statusBarStyle: "default" },
};

export default function Kiosk() {
  return (
    <div className="kioskpage">
      <div className="tf-wrap">
        <IntakeHead />
        <EnquiryForm />
        <KioskStatus />
      </div>
    </div>
  );
}
