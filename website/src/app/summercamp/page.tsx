import type { Metadata } from "next";
import PageHead from "@/components/PageHead";
import { SCHOOL } from "@/lib/local";

// Rebuilt from the Framer page rather than from my own imagination.
//
// The version I shipped said the dates were "not fixed yet" and that the
// camp ran five weeks. Both were invented. The live page says Summer Fun
// 2026, 4–23 May, eighteen days, three chapters, invite-only, limited
// places. A parent reading my version would have made plans around a camp
// that does not exist on those terms.
//
// The headline on Framer reads "The Most Awaited Expereince Is Back" —
// the typo is theirs. Not reproduced here; a misspelling in 60px type is
// not a brand asset.

export const metadata: Metadata = {
  title: "Summer Fun 2026 · Pune's most awaited kids camp",
  description:
    "Limited places. Three weeks. EuroKids JMD Enclave's invite-only summer camp returns 4–23 May 2026 in Undri, Pune. Register today.",
  alternates: { canonical: "/summercamp" },
  keywords: [
    "summer camp Undri",
    "summer camp Pune 2026",
    "kids summer camp Mohammadwadi",
    "summer camp for 2 year olds Pune",
    "May 2026 summer camp Undri",
    "EuroKids summer camp",
  ],
};

const CHAPTERS = [
  {
    n: "Week one",
    when: "4 – 9 May",
    p: "The opening chapter. New faces, new room, and the first theme of the three — enough structure to feel safe and enough mess to be worth turning up for.",
  },
  {
    n: "Week two",
    when: "11 – 16 May",
    p: "By now nobody is shy. The theme changes completely, and the children who were watching in week one are the ones running it.",
  },
  {
    n: "Week three",
    when: "18 – 23 May",
    p: "The last chapter, and the one they talk about in June. A third theme, and an ending the children know is coming.",
  },
];

// An Event in the structured data, so a search for "summer camp Pune May
// 2026" can surface the dates rather than a blue link.
const JSONLD = {
  "@context": "https://schema.org",
  "@type": "Event",
  name: "Summer Fun 2026 — EuroKids JMD Enclave",
  description:
    "An eighteen-day, three-chapter summer camp for children in Undri, Pune. A different theme each week.",
  startDate: "2026-05-04",
  endDate: "2026-05-23",
  eventStatus: "https://schema.org/EventScheduled",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  location: {
    "@type": "Place",
    name: SCHOOL.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: SCHOOL.street,
      addressLocality: SCHOOL.locality,
      addressRegion: SCHOOL.region,
      postalCode: SCHOOL.postcode,
      addressCountry: "IN",
    },
  },
  organizer: { "@type": "Preschool", name: SCHOOL.name, url: "https://eurokidsjmdenclave.org" },
  url: "https://eurokidsjmdenclave.org/summercamp",
};

export default function SummerCamp() {
  return (
    <div className="wrap camp">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }}
      />
      <PageHead
        eyebrow="Summer Fun 2026"
        title="The most awaited experience is back"
        lead="Eighteen days, three chapters. A different theme each week — every morning a new little adventure. 4 to 23 May 2026, in Undri."
      >
        <div className="hero-do">
          <a className="btn btn-solid" href="/#enquire">
            Register my child
          </a>
          <a className="btn btn-quiet" href={SCHOOL.phoneHref}>
            {SCHOOL.phone}
          </a>
        </div>
        <p className="camp-note">
          Invite-only, and places are limited. Register early — the camp has filled before the
          dates were widely announced in previous years.
        </p>
      </PageHead>

      <section className="camp-facts" data-reveal>
        <dl>
          <div><dt>Dates</dt><dd>4 – 23 May 2026</dd></div>
          <div><dt>Length</dt><dd>Eighteen days, three chapters</dd></div>
          <div><dt>Themes</dt><dd>A different one each week</dd></div>
          <div><dt>Places</dt><dd>Limited, invite-only</dd></div>
          <div><dt>Where</dt><dd>{SCHOOL.name}, Undri — {SCHOOL.playArea} of play area</dd></div>
          <div><dt>Register</dt><dd><a href="/#enquire">Leave your details</a></dd></div>
        </dl>
      </section>

      <section className="camp-what" data-reveal>
        <h2>The itinerary</h2>
        <div className="prog-list">
          {CHAPTERS.map((c, i) => (
            <article key={c.n} className="prog" style={{ ["--i" as string]: i }}>
              <div className="prog-meta">
                <h3>{c.n}</h3>
                <p className="prog-age">{c.when}</p>
              </div>
              <p className="prog-blurb">{c.p}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="camp-what" data-reveal>
        <h2>Who it is for</h2>
        <p className="prog-blurb">
          Children from the school and children who have never set foot in it. If your child is
          at another preschool in Undri, Mohammadwadi or NIBM Road, they are as welcome as
          anybody — the camp is not an admissions funnel and nobody will ring you in June about
          a school place.
        </p>
        <p className="prog-blurb" style={{ marginTop: "var(--s4)" }}>
          Day care runs either side of the camp day for families where both parents work.
          See <a href="/daycare-in-undri">day care in Undri</a>.
        </p>
      </section>
    </div>
  );
}
