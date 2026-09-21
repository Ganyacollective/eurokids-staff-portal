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
        // The hub is the front door: one sign-in, then a choice of app.
        { source: "/", destination: "/hub.html" },
        // The HR console is unchanged — it just moved off the root.
        { source: "/staff", destination: "/portal.html" },
        // Teachers are untouched.
        { source: "/teacher", destination: "/teacher.html" },
        // The enquiry form: on the school iPad, embedded on the website, or linked.
        { source: "/enquire", destination: "/enquire.html" },
        // A signing link reads better without the extension.
        { source: "/sign", destination: "/sign.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // Headers every response carries. The site already redirects HTTP to HTTPS
  // and sends HSTS for two years; these close the rest. They matter most on
  // /sign.html, which shows someone their salary and takes their signature:
  //   · nobody may frame the page, so it cannot be wrapped in a fake one;
  //   · the browser may not second-guess a content type;
  //   · a referrer never leaks the signing token to another site;
  //   · camera, microphone and location are refused outright.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
      ],
    }, {
      // A signing link is a bearer token in a URL fragment. It should never be
      // cached by a proxy, and never handed to another origin as a referrer.
      source: "/sign.html",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store, max-age=0" },
      ],
    }];
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
