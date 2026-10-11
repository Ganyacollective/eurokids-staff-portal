"use client";

import { usePathname } from "next/navigation";

// BreadcrumbList for every page, derived from the path.
//
// Done per-page this gets written on three pages and forgotten on the rest.
// Here it is in the layout once: the path becomes the trail, and a page
// added next year is covered without anybody remembering this file.
//
// The visible trail matters as much as the markup — somebody who lands on
// /safe-preschool-in-undri from a search result has no idea what site they
// are on until they see it.

const LABELS: Record<string, string> = {
  "preschool-in-undri": "Preschool in Undri",
  "daycare-in-undri": "Day care in Undri",
  "preschool-in-mohammadwadi": "Near Mohammadwadi",
  "preschool-for-2-year-olds-in-undri": "For 2 year olds",
  "safe-preschool-in-undri": "Safety",
  "which-eurokids-in-undri": "Which EuroKids",
  "how-to-choose-a-preschool-in-undri": "Choosing a preschool",
  programmes: "Programmes",
  faq: "Questions parents ask",
  makeapayment: "Make a payment",
  "contact-us": "Contact",
  summercamp: "Summer camp",
  "annual-function": "Annual function",
  events: "Events",
  "terms-conditions": "Terms and Conditions",
  "refund-cancellation-policy": "Refund Policy",
  "privacy-policy": "Privacy Policy",
};

const SITE = "https://eurokidsjmdenclave.org";
const title = (s: string) =>
  LABELS[s] ?? s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function Crumbs() {
  const path = usePathname() || "/";
  if (path === "/") return null;

  const parts = path.split("/").filter(Boolean);
  const trail = parts.map((p, i) => ({
    name: title(p),
    href: "/" + parts.slice(0, i + 1).join("/"),
  }));

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", href: "/" }, ...trail].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: SITE + (c.href === "/" ? "" : c.href),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }}
      />
      <nav className="crumbs wrap" aria-label="Breadcrumb">
        <a href="/">EuroKids JMD Enclave</a>
        {trail.map((c, i) => (
          <span key={c.href}>
            <span aria-hidden="true"> / </span>
            {i === trail.length - 1 ? (
              <span aria-current="page">{c.name}</span>
            ) : (
              <a href={c.href}>{c.name}</a>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
