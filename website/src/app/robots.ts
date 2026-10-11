// The kiosk form is the one thing that must never be indexed: it carries the
// reception tablet's key in its address, and a search result for it would put
// that key in front of anybody who looked.

import type { MetadataRoute } from "next";

// The AI crawlers are named explicitly rather than left to the wildcard.
// The wildcard already allows them, so this changes no behaviour today —
// what it does is make the intent unambiguous, so that nobody tightening
// robots.txt in a year accidentally cuts the school out of the answer
// engines, and so an operator reading the file can see the decision was
// made rather than defaulted into.
//
// Two groups, deliberately:
//   - the search/answer bots that can send a parent here (OAI-SearchBot,
//     PerplexityBot, ClaudeBot, Bingbot, Googlebot) — allowed
//   - the training-corpus crawlers (GPTBot, Google-Extended,
//     anthropic-ai, CCBot) — also allowed, because a school that wants to
//     be the answer to "preschool in Undri" wants to be in the corpus
//     those answers are built from
const AI_AGENTS = [
  "OAI-SearchBot", "ChatGPT-User", "GPTBot",
  "PerplexityBot", "Perplexity-User",
  "ClaudeBot", "Claude-User", "anthropic-ai",
  "Google-Extended", "Applebot-Extended", "CCBot", "Bytespider", "Amazonbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/enquire"] },
      ...AI_AGENTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: ["/api/", "/enquire"],
      })),
    ],
    sitemap: "https://eurokidsjmdenclave.org/sitemap.xml",
    host: "https://eurokidsjmdenclave.org",
  };
}
