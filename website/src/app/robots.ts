// The kiosk form is the one thing that must never be indexed: it carries the
// reception tablet's key in its address, and a search result for it would put
// that key in front of anybody who looked.

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/enquire"] }],
    sitemap: "https://eurokidsjmdenclave.org/sitemap.xml",
    host: "https://eurokidsjmdenclave.org",
  };
}
