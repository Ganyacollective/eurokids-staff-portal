import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // for Excel uploads
    },
  },
  // Surface the static cloud portal (public/portal.html) at the root URL.
  // Using `beforeFiles` so the rewrite wins over the legacy Next.js page.tsx
  // routes that still live in src/app/. Those legacy routes are vestigial; the
  // entire UI is now served by the static portal.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/portal.html" },
        { source: "/teacher", destination: "/teacher.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // Any direct visit to the abandoned Next.js routes is shepherded back to /,
  // which the rewrite above then resolves to the cloud portal.
  async redirects() {
    return [
      { source: "/login",            destination: "/", permanent: false },
      { source: "/dashboard",        destination: "/", permanent: false },
      { source: "/dashboard/:path*", destination: "/", permanent: false },
      { source: "/employees",        destination: "/", permanent: false },
      { source: "/employees/:path*", destination: "/", permanent: false },
      { source: "/holidays",         destination: "/", permanent: false },
      { source: "/attendance",       destination: "/", permanent: false },
      { source: "/anomalies",        destination: "/", permanent: false },
      { source: "/salary",           destination: "/", permanent: false },
      { source: "/reset-password",   destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
