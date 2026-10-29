import type { NextConfig } from "next";
import { KIOSK_PREFIX } from "./src/lib/kiosk-host";

// Every URL that is live on Framer today has to keep working, because some of
// them are printed on QR codes that are already out in the world and cannot be
// recalled. The list below was taken from the Framer sitemap rather than from
// memory, and each entry says what it is for.
//
// Three of them are not pages at all — /single-child and /sigblings are Framer
// pages whose entire body is one Razorpay link, and /apply-for-leave is a link
// to the staff portal. A parent or a teacher scanning those expects to land on
// the destination, not on a page about the destination, so they redirect
// straight through.
//
// 307 rather than 308 throughout: a permanent redirect is cached by the
// browser more or less forever, and a URL printed on paper is exactly the kind
// of thing we might need to repoint later.
const LEGACY: Array<{ source: string; destination: string; why: string }> = [
  // Paths I had invented before checking what was already published.
  { source: "/pay", destination: "/makeapayment", why: "my own earlier path" },
  { source: "/c/:slug", destination: "/events/:slug", why: "my own earlier path" },

  // Framer spells three event slugs with a hyphen before the possessive s,
  // and the database does not. The printed URL wins; the database keeps the
  // tidier slug.
  { source: "/events/children-s-day", destination: "/events/childrens-day", why: "Framer slug" },
  { source: "/events/mother-s-day", destination: "/events/mothers-day", why: "Framer slug" },
  { source: "/events/ej-literacy-day", destination: "/events/literacy-day", why: "Framer slug" },

  // Pages that were only ever a link.
  //
  // On Framer these two are a page whose entire body is one Razorpay link,
  // and the printed QR codes point at them. I had changed them to land on
  // /annual-function instead, reasoning that a parent who scanned the wrong
  // code could fix it themselves. That is a tap a QR code should not need,
  // on exactly the flow where somebody is standing there trying to pay, and
  // it is a change to behaviour that is already printed on paper. They go
  // straight through, as they do today.
  //
  // Checked, because getting these wrong is somebody's money: rzp.io/rzp/
  // rSsbrdz resolves to pages.razorpay.com/pl_S6RLD0DB5WvTDI/view and
  // Z6sWK3Uv to pl_S6RBy0DnAYeBdT/view — the same two pages the live Framer
  // site sends them to. /annual-function still carries both tickets for
  // anybody who arrives by browsing rather than by scanning.
  {
    source: "/single-child",
    destination: "https://rzp.io/rzp/rSsbrdz",
    why: "printed QR — single-child ticket",
  },
  {
    source: "/sigblings",
    destination: "https://rzp.io/rzp/Z6sWK3Uv",
    why: "printed QR — sibling ticket (spelling is theirs, and is printed)",
  },
  {
    source: "/teachers",
    destination: "https://admin.eurokidsjmdenclave.org/staff",
    why: "staff portal",
  },
  {
    source: "/apply-for-leave",
    destination: "https://admin.eurokidsjmdenclave.org/teacher",
    why: "the leave form, on the staff portal",
  },

  // Housekeeping: a duplicate and an abandoned Framer draft. Neither should
  // 404 while the old URLs are still floating about.
  { source: "/terms-conditions-2", destination: "/terms-conditions", why: "duplicate" },
  { source: "/final-masonary", destination: "/", why: "abandoned Framer draft" },
];

const nextConfig: NextConfig = {
  redirects: async () =>
    LEGACY.map(({ source, destination }) => ({ source, destination, permanent: false })),

  // Plain <img> throughout rather than next/image: the artwork is already
  // sized correctly in Canva (562x866) and the gallery photos are served by
  // Supabase's CDN, so putting another optimiser in front buys nothing and
  // costs a Vercel image transformation per visitor.
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    },

    // The camera is allowed on one address and forbidden on the other, and
    // the browser enforces it rather than our own code remembering to.
    //
    // camera=(self) used to be sent on every page of the public site. Nothing
    // there ever asked, but "nothing asks today" is a promise about code, and
    // this is a promise about the site: a parent filling the form in at home
    // cannot be prompted for their camera, because the browser will not carry
    // the request at all.
    //
    // It must be (self) and not () on the tablet. An empty allowlist means no
    // origin may use the camera *including this one* — the browser then
    // rejects getUserMedia outright and never shows a prompt, which is
    // precisely what the reception iPad was doing for weeks: the form worked,
    // no dialog ever appeared, and every walk-in was recorded without the
    // photograph that is the whole reason the camera is there.
    {
      source: "/:path*",
      has: [{ type: "host", value: `${KIOSK_PREFIX}(?<rest>.*)` }],
      headers: [
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        // The tablet is a till, not a page to be found in a search result.
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    },
    {
      source: "/:path*",
      missing: [{ type: "host", value: `${KIOSK_PREFIX}(?<rest>.*)` }],
      headers: [
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};

export default nextConfig;
