import type { Metadata } from "next";
import PageHead from "@/components/PageHead";
import { SCHOOL } from "@/lib/local";

// The person who runs the school.
//
// Worth a page of its own for a reason that is not vanity. A parent choosing
// a preschool is choosing a person to leave their child with, and "who runs
// it" is one of the first things they ask. Search engines have a name for the
// same instinct — experience, expertise, authoritativeness, trust — and the
// thing they look for is a named, accountable human being attached to the
// organisation rather than an anonymous "our team".
//
// Everything here is either a fact Abhinav has stated or something anybody
// can verify by walking in. There is no invented biography: no years of
// experience, no qualifications, no previous schools, no quotes she has not
// said. Those would be the easiest sentences on this page to write and the
// only ones that could embarrass her, and a made-up credential attached to a
// real, named woman is not a thing this site is going to publish. The
// paragraphs waiting on her own words are listed in the commit message.

export const metadata: Metadata = {
  title: "Neeta Saxena — Founder and Principal",
  description:
    "Neeta Saxena founded EuroKids JMD Enclave in Undri, Pune in 2017 and is its principal. Meet her on a visit — no appointment needed.",
  alternates: { canonical: "/neeta-saxena" },
  keywords: [
    "Neeta Saxena",
    "Neeta Saxena EuroKids",
    "EuroKids JMD Enclave principal",
    "preschool principal Undri",
    "who runs EuroKids Undri",
  ],
  openGraph: {
    title: "Neeta Saxena — Founder and Principal, EuroKids JMD Enclave",
    description: "The person who started the school in 2017 and still runs it.",
  },
};

const JSONLD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Neeta Saxena",
  jobTitle: "Founder and Principal",
  url: "https://eurokidsjmdenclave.org/neeta-saxena",
  worksFor: {
    "@type": "Preschool",
    name: SCHOOL.name,
    url: "https://eurokidsjmdenclave.org",
    address: {
      "@type": "PostalAddress",
      streetAddress: SCHOOL.street,
      addressLocality: SCHOOL.locality,
      addressRegion: SCHOOL.region,
      postalCode: SCHOOL.postcode,
      addressCountry: "IN",
    },
  },
  // founder + employee on the organisation, Person here. The two point at
  // each other, which is what lets an answer engine treat them as one entity
  // rather than two people who happen to share a name.
  knowsAbout: ["Early childhood education", "Preschool admissions", "Day care"],
};

export default function Neeta() {
  return (
    <div className="wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }} />
      <PageHead
        eyebrow="Founder and Principal"
        title="Neeta Saxena"
        lead="She started EuroKids JMD Enclave in 2017 and still runs it. If you visit, she is who you will meet."
      />

      <section className="prose" data-reveal>
        <h2>The school has a person in charge, and she is on the premises</h2>
        <p>
          A great many preschools are run by a company. This one is run by Neeta Saxena, who
          founded it in {SCHOOL.founded}, is its principal, and is at the school rather than at a head
          office. That is worth saying plainly because of what it changes for a parent: when
          something about your child needs a decision, the person who can make it is in the
          building.
        </p>
        <p>
          It also means there is somebody accountable. Not a form, not a support address — a
          named person who put her own name on the school and has been answering for it since
          2017.
        </p>

        <h2>Meet her before you decide anything</h2>
        <p>
          The honest version of a page like this is that you should not take a website&rsquo;s word
          for what somebody is like. Come and see. Visits do not need an appointment, there is
          no admissions pitch waiting, and you are welcome to turn up during a normal working
          day and watch an ordinary morning rather than a prepared one.
        </p>
        <p>
          Ask her the hard questions while you are there — what happens when a child will not
          settle, who is with them at nap time, what the staff turnover has been, how an
          incident gets reported to you. A principal who is in the building can answer those
          without checking.
        </p>
        <p>
          Call <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a>, Monday to Saturday, or just come to{" "}
          {SCHOOL.street}, {SCHOOL.locality} {SCHOOL.postcode}.
        </p>

        <h2>The school she built</h2>
        <p>
          EuroKids JMD Enclave is an authorised EuroKids franchise in Undri, operated by{" "}
          {SCHOOL.legal}, running programmes from Play Group through Euro Senior along with day
          care. It sits off the main road on a bungalow plot with {SCHOOL.playArea} of outdoor
          play area and mature trees — a quieter, greener setting than a preschool on a
          main-road ground floor, and a safer one to walk a small child in and out of.
        </p>
        <p>
          More on that in <a href="/safe-preschool-in-undri">how the school handles safety</a>,{" "}
          <a href="/programmes">the programmes</a>, and{" "}
          <a href="/which-eurokids-in-undri">which EuroKids this is</a> — there is more than one
          in the area, and parents mix them up.
        </p>
      </section>
    </div>
  );
}
