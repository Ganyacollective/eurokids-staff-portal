import type { NextConfig } from "next";

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
        // camera=(self), not camera=().
        //
        // An empty allowlist means no origin at all may use the camera —
        // including this one. The browser then rejects getUserMedia outright
        // and never shows a permission prompt, which is exactly what the
        // reception tablet was doing: the form worked, no dialog ever
        // appeared, and every walk-in was recorded without the photograph
        // that is the whole reason the camera is there. The hook treats a
        // refusal as "no camera on this device" and carries on silently, so
        // nothing on screen said anything was wrong.
        //
        // (self) is still restrictive: our own pages may ask, and the answer
        // is still the parent's or the staff member's to give. Microphone and
        // location stay shut — nothing here has any use for either.
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      ],
    },
  ],
};

export default nextConfig;
