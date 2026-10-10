import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
