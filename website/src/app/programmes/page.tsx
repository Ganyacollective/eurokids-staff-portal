import type { Metadata } from "next";
import PageHead from "@/components/PageHead";
import { PROGRAMMES, SCHOOL } from "@/lib/local";

export const metadata: Metadata = {
  title: "Programmes — Play Group to Senior KG",
  description:
    "Play Group, Nursery, Euro Junior, Euro Senior and Day Care at EuroKids JMD Enclave, Undri. Ages, hours and what a child actually does in each year.",
  alternates: { canonical: "/programmes" },
  keywords: [
    "play group Undri",
    "nursery admission Undri Pune",
    "junior KG Undri",
    "senior KG Undri",
    "EuroKids programmes",
    "preschool classes Pune",
  ],
};

// Each programme as a Course, which is what lets a search engine show the
// age range and the provider rather than just a blue link.
const JSONLD = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: PROGRAMMES.map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: {
      "@type": "Course",
      name: p.name,
      description: `${p.blurb} Ages ${p.age}.`,
      provider: { "@type": "Preschool", name: SCHOOL.name, sameAs: "https://eurokidsjmdenclave.org" },
    },
  })),
};

export default function Programmes() {
  return (
    <div className="wrap camp">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }}
      />
      <PageHead
        eyebrow="Programmes"
        title="Five years, and what happens in each"
        lead="From the first two-hour morning away from home to the year that decides how a child walks into Class 1. Ages are a guide — children join where they fit, not where their birthday says."
      />

      <section className="prog-list" data-reveal>
        {PROGRAMMES.map((p, i) => (
          <article key={p.slug} className="prog" style={{ ["--i" as string]: i }}>
            <div className="prog-meta">
              <h2>{p.name}</h2>
              <p className="prog-age">{p.age}</p>
              <p className="prog-hours">{p.hours}</p>
            </div>
            <p className="prog-blurb">{p.blurb}</p>
          </article>
        ))}
      </section>

      <section className="camp-facts" data-reveal>
        <dl>
          <div>
            <dt>Admissions</dt>
            <dd>Open for 26–27</dd>
          </div>
          <div>
            <dt>Entrance test</dt>
            <dd>None</dd>
          </div>
          <div>
            <dt>Day care</dt>
            <dd>Available with every programme</dd>
          </div>
          <div>
            <dt>Fees</dt>
            <dd>
              Call the office on <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
