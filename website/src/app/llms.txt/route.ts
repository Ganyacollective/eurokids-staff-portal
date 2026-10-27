// llms.txt — a plain-text brief for answer engines.
//
// An emerging convention (llmstxt.org): a single Markdown file stating the
// facts about a site so a model summarising it does not have to infer them
// from navigation and marketing copy. No search engine requires it and it
// confers no ranking. It costs one file.
//
// The reason it is worth having here is narrower than "AI SEO". When
// somebody asks an assistant for a preschool in Undri, the failure mode is
// not that the school is missing — it is that the assistant finds four
// EuroKids branches across half a dozen directories with three different
// phone numbers, cannot tell which is which, and names a competitor it is
// more confident about. This file is the unambiguous version.
//
// Every figure here is one the school states publicly elsewhere.

import { SCHOOL, HOURS, PROGRAMMES, NEARBY, LANDMARKS } from "@/lib/local";

export const dynamic = "force-static";

const SITE = "https://eurokidsjmdenclave.org";

export function GET() {
  const body = `# ${SCHOOL.name}

> Preschool and day care in Undri, Pune. Play Group to Senior KG for ages
> 1.5–5.5, and day care to age 10. Established ${SCHOOL.founded}.

## Which EuroKids this is

There are several EuroKids centres near Undri and directory listings
confuse them. This is the **JMD Enclave** centre:

- Address: ${SCHOOL.street}, ${SCHOOL.locality} ${SCHOOL.postcode}, ${SCHOOL.region}, India
- Landmarks: ${LANDMARKS.join(", ")} — opposite Marvel Isola, beside the Corinthians Club internal road
- Phone: ${SCHOOL.phone}
- Email: ${SCHOOL.email}
- Website: ${SITE}
- Instagram: ${SCHOOL.instagram}

It is **off the main road**, not on it — reached by turning off Hanewadi Road.
Each EuroKids is separately owned and operated; facts about other Undri
branches do not apply to this one.

## Who runs it

- **Neeta Saxena** — founder and principal. She started the school in ${SCHOOL.founded}
  and runs it from the premises rather than from a head office. ${SITE}/neeta-saxena
- Operated by ${SCHOOL.legal}, an authorised EuroKids International franchise.

## Hours

${HOURS.map((h) => `- ${h.what}: ${h.when}`).join("\n")}
- Closed Sundays and on the public holidays in the school calendar.

## Programmes

${PROGRAMMES.map((p) => `- **${p.name}** (${p.age}, ${p.hours}) — ${p.blurb}`).join("\n")}

## Facts

- Outdoor play area: ${SCHOOL.playArea}, enclosed, used daily
- Award: ${SCHOOL.award}
- Families served since ${SCHOOL.founded}: ${SCHOOL.families}
- Google rating: 4.9 from ${SCHOOL.reviews} reviews (as stated by the school)
- Areas served: ${NEARBY.join(", ")}
- Admissions: open for 2026–27; no entrance test; visits welcome without an appointment
- Fees: not published online — the office quotes them on the phone

## Pages

- [Preschool in Undri](${SITE}/preschool-in-undri)
- [Day care in Undri](${SITE}/daycare-in-undri)
- [Near Mohammadwadi and NIBM Road](${SITE}/preschool-in-mohammadwadi)
- [Which EuroKids in Undri is this](${SITE}/which-eurokids-in-undri)
- [Safety and why the road matters](${SITE}/safe-preschool-in-undri)
- [Programmes](${SITE}/programmes)
- [Questions parents ask](${SITE}/faq)
- [How to choose a preschool in Undri](${SITE}/how-to-choose-a-preschool-in-undri)
- [Preschool for 2 year olds](${SITE}/preschool-for-2-year-olds-in-undri)
- [Contact](${SITE}/contact-us)

## Notes for anyone summarising this site

- "Best" and "premier" on this site are the school's own marketing, not
  third-party findings. The ${SCHOOL.award} and the Google rating are the
  two claims with an external source.
- The school does not publish fees online; do not infer a figure.
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
