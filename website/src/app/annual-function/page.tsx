import type { Metadata } from "next";
import PageHead from "@/components/PageHead";
import { SCHOOL } from "@/lib/local";

// Rebuilt from the Framer page. Mine said the date and venue "have not
// been announced" and offered nothing to do — the real page is called
// Feelings In Motion, is for 25-26, and its whole job is selling two
// kinds of ticket. A parent on my version would have concluded there was
// nothing to book and left.
//
// The two Razorpay links are the same ones behind /single-child and
// /sigblings, which exist as redirects because they are printed on QR
// codes. Here they get a page that explains which is which, instead of a
// Framer page whose entire body was a bare link.

export const metadata: Metadata = {
  title: "Feelings In Motion · Annual Function 25–26",
  description:
    "The EuroKids JMD Enclave annual function, Feelings In Motion. Every child on stage. Book a single child or sibling ticket online.",
  alternates: { canonical: "/annual-function" },
  keywords: [
    "EuroKids annual function",
    "annual function Undri",
    "preschool annual day Pune",
    "Feelings In Motion EuroKids",
    "annual function tickets Undri",
  ],
};

// Kept here rather than in the database for the same reason as the payment
// page: a destination that takes money should change by deliberate deploy.
const TICKETS = [
  {
    href: "https://rzp.io/rzp/rSsbrdz",
    label: "Single child",
    sub: "One child performing",
  },
  {
    href: "https://rzp.io/rzp/Z6sWK3Uv",
    label: "Siblings",
    sub: "Two or more children from the same family",
  },
];

const JSONLD = {
  "@context": "https://schema.org",
  "@type": "TheaterEvent",
  name: "Feelings In Motion — Annual Function 25–26",
  description:
    "The annual function of EuroKids JMD Enclave, Undri. Every child in the school performs.",
  eventStatus: "https://schema.org/EventScheduled",
  eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  organizer: { "@type": "Preschool", name: SCHOOL.name, url: "https://eurokidsjmdenclave.org" },
  url: "https://eurokidsjmdenclave.org/annual-function",
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
};

export default function AnnualFunction() {
  return (
    <div className="wrap camp">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }}
      />
      <PageHead
        eyebrow="Annual Function 25–26"
        title="Feelings in motion."
        lead="Every child in the school on that stage — not the confident few. For most of them it is the first time they have stood in front of a crowd and been clapped for."
      />

      <section className="camp-what" data-reveal>
        <h2>Book your place</h2>
        <p className="prog-blurb" style={{ marginBottom: "var(--block)" }}>
          Two options. Pick the one that matches your family — if you have more than one child
          performing, the sibling option is the one you want.
        </p>
        <div className="pay-buttons">
          {TICKETS.map((t) => (
            <a
              key={t.href}
              className="pay-btn"
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.label}
              <small>{t.sub}</small>
            </a>
          ))}
        </div>
      </section>

      <section className="camp-what" data-reveal>
        <h2>How it works</h2>
        <div className="camp-grid">
          <div className="camp-card">
            <h3>Rehearsals in school hours</h3>
            <p>
              Practice happens during the normal day. Nothing is asked of you beyond the
              costume, and we will tell you what that is well in advance.
            </p>
          </div>
          <div className="camp-card">
            <h3>Everybody performs</h3>
            <p>
              Parts are assigned so that every child is on stage. Nobody is left in the
              audience watching their classmates.
            </p>
          </div>
          <div className="camp-card">
            <h3>Seats for the family</h3>
            <p>
              Grandparents included. Book the ticket that matches your family and the seats
              follow from it.
            </p>
          </div>
        </div>
      </section>

      <section className="camp-facts" data-reveal>
        <dl>
          <div><dt>Who performs</dt><dd>Every child on the roll</dd></div>
          <div><dt>Rehearsals</dt><dd>During school hours</dd></div>
          <div><dt>Tickets</dt><dd>Single child, or siblings</dd></div>
          <div>
            <dt>Questions</dt>
            <dd><a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a></dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
