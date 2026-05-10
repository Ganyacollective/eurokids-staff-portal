import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // for Excel uploads
    },
  },
  // Surface the static cloud portal (public/portal.html) at the root URL.
  async rewrites() {
    return [
      { source: "/", destination: "/portal.html" },
    ];
  },
};

export default nextConfig;
