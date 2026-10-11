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
  {
    source: "/single-child",
    destination: "https://rzp.io/rzp/rSsbrdz",
    why: "printed QR — fees for one child",
  },
  {
    source: "/sigblings",
    destination: "https://rzp.io/rzp/Z6sWK3Uv",
    why: "printed QR — fees for siblings (spelling is theirs, and is printed)",
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
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};

export default nextConfig;
