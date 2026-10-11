// What Google should know exists.
//
// Built from the database rather than typed out, so a card added in the hub
// is in the sitemap the next time it is fetched, without anybody remembering
// this file exists.

import type { MetadataRoute } from "next";
import { listCards } from "@/lib/site";

export const revalidate = 3600;

const SITE = "https://eurokidsjmdenclave.org";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    // The pages that answer a search rather than a visitor who is already
    // here. Weighted above the event pages for that reason.
    { url: `${SITE}/preschool-in-undri`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/daycare-in-undri`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/preschool-in-mohammadwadi`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/programmes`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/which-eurokids-in-undri`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/safe-preschool-in-undri`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/how-to-choose-a-preschool-in-undri`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/preschool-for-2-year-olds-in-undri`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/summercamp`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/annual-function`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/contact-us`, lastModified: now, changeFrequency: "yearly", priority: 0.7 },
    { url: `${SITE}/makeapayment`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE}/terms-conditions`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/refund-cancellation-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE}/privacy-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  // A card that is not published is not on the site, so it must not be here
  // either — listCards only returns published rows.
  let cards: MetadataRoute.Sitemap = [];
  try {
    cards = (await listCards()).map((c) => ({
      url: `${SITE}/events/${c.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // A sitemap missing the cards is worth more than a 500 that leaves
    // Google with nothing at all.
  }

  return [...fixed, ...cards];
}
