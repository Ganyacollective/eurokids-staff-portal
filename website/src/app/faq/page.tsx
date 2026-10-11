import type { Metadata } from "next";
import PageHead from "@/components/PageHead";
import { SCHOOL } from "@/lib/local";

export const metadata: Metadata = {
  title: "Questions parents ask",
  description:
    "Fees, timings, admissions, day care, settling in, food and safety at EuroKids JMD Enclave, Undri — answered plainly.",
  alternates: { canonical: "/faq" },
};

// Written as the questions people actually ring up and ask, in their words
// rather than ours. That is also what makes them match a search: somebody
// types "what time does preschool start in Undri", not "timings".
const QA: Array<{ q: string; a: React.ReactNode; plain: string }> = [
  {
    q: "What are the timings?",
    plain:
      "Preschool runs 8:30 AM to 12:30 PM and day care 8:00 AM to 6:30 PM, Monday to Saturday. The office is open 9:00 AM to 4:00 PM.",
    a: (
      <>
        Preschool runs <b>8:30 AM to 12:30 PM</b> and day care <b>8:00 AM to 6:30 PM</b>,
        Monday to Saturday. The office is open 9:00 AM to 4:00 PM.
      </>
    ),
  },
  {
    q: "How much are the fees?",
    plain:
      "Fees depend on the programme and whether day care is included. Call the office on 020 6962 2686 and we will give you the exact figure for your child's year, with nothing added later.",
    a: (
      <>
        It depends on the programme and whether you need day care. Call the office on{" "}
        <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a> and we will give you the exact figure
        for your child&rsquo;s year — with nothing added on later. You can{" "}
        <a href="/makeapayment">pay online</a> once you have it.
      </>
    ),
  },
  {
    q: "Is there an entrance test?",
    plain:
      "No. There is no entrance test for a preschool place, and we are suspicious of preschools that have one.",
    a: (
      <>
        No. There is no entrance test for a three-year-old, and we are suspicious of
        preschools that have one.
      </>
    ),
  },
  {
    q: "Do I need an appointment to visit?",
    plain:
      "No. Walk in on any working day between 8:30 AM and 12:30 PM and somebody will show you around.",
    a: (
      <>
        No. Walk in on any working day between 8:30 and 12:30 and somebody will show you
        around. Mornings are better because the children are there, and a preschool with no
        children in it tells you nothing.
      </>
    ),
  },
  {
    q: "My child has never been away from me. How does that go?",
    plain:
      "Settling in is done gradually over the first week or two, with a parent nearby at first, and the pace is set by the child rather than a schedule.",
    a: (
      <>
        Gradually, and at your child&rsquo;s pace rather than a schedule. For the first week
        or two a parent stays nearby, then in the building, then goes for a coffee. Some
        children are fine on day two and some take a month. Both are normal and neither is a
        problem.
      </>
    ),
  },
  {
    q: "Can my child come only for day care, from another school?",
    plain:
      "Yes. Children from other schools across Undri and NIBM Road attend day care here in the afternoons.",
    a: (
      <>
        Yes, and many do — from schools across Undri and NIBM Road. They do not have to
        attend the preschool here. See <a href="/daycare-in-undri">day care in Undri</a>.
      </>
    ),
  },
  {
    q: "What about food?",
    plain:
      "Day care children get lunch and an afternoon snack. Preschool children bring a small snack box.",
    a: (
      <>
        Day care children get lunch and an afternoon snack. Preschool children bring a small
        snack box. Tell us about allergies in writing at admission and again whenever
        anything changes.
      </>
    ),
  },
  {
    q: "How big is the play area?",
    plain:
      "5,000 sq ft of outdoor play area, used every day. The school won the Best Ambience Award.",
    a: (
      <>
        {SCHOOL.playArea}, outdoors, used every day. It is the main reason to pick a school
        in Undri over one on a main road, and the reason we won the {SCHOOL.award}.
      </>
    ),
  },
  {
    q: "Where exactly are you?",
    plain:
      "JMD Enclave, Undri, Pune 411060 — off Hanewadi Road, beside the Corinthian Club. About ten minutes from NIBM Road and Mohammadwadi.",
    a: (
      <>
        JMD Enclave, off Hanewadi Road in Undri, beside the Corinthian Club. Around ten
        minutes from <a href="/preschool-in-mohammadwadi">Mohammadwadi and NIBM Road</a>.{" "}
        <a href={SCHOOL.maps} target="_blank" rel="noopener noreferrer">
          Open in Maps →
        </a>
      </>
    ),
  },
];

const JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: QA.map((x) => ({
    "@type": "Question",
    name: x.q,
    acceptedAnswer: { "@type": "Answer", text: x.plain },
  })),
};

export default function FAQ() {
  return (
    <div className="wrap prose-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }}
      />
      <PageHead
        eyebrow="FAQ"
        title="Questions parents ask"
        lead="The ones that come up on the phone most often, answered the way we would answer them on the phone."
      />
      <div className="prose faq" data-reveal>
        {QA.map((x) => (
          <section key={x.q}>
            <h2>{x.q}</h2>
            <p>{x.a}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
