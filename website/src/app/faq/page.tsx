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
const QA: Array<{ q: string; a: React.ReactNode; plain: string; g?: string }> = [
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
      "Fees depend on the programme and whether day care is included. Call the office on 022 696 22 686 and we will give you the exact figure for your child's year, with nothing added later.",
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
      "JMD Enclave, Undri, Pune 411060 — off Hanewadi Road, beside the Corinthians Club. About ten minutes from NIBM Road and Mohammadwadi.",
    a: (
      <>
        JMD Enclave, off Hanewadi Road in Undri, beside the Corinthians Club. Around ten
        minutes from <a href="/preschool-in-mohammadwadi">Mohammadwadi and NIBM Road</a>.{" "}
        <a href={SCHOOL.maps} target="_blank" rel="noopener noreferrer">
          Open in Maps →
        </a>
      </>
    ),
  },
  // ── Safety ──
  { g:"Safety", q:"Is the school on the main road?",
    plain:"No. EuroKids JMD Enclave is off the main road — you turn off Hanewadi Road in Undri to reach it, so no classroom door opens onto traffic.",
    a:<>No. You turn off Hanewadi Road to reach us, so no door opens onto traffic. More on <a href="/safe-preschool-in-undri">why that matters</a>.</> },
  { g:"Safety", q:"Can I visit without telling you first?",
    plain:"Yes. Walk in on any working morning between 8:30 AM and 12:30 PM. You can ask to see the kitchen and the toilets without notice.",
    a:<>Yes, and you should. Walk in on a working morning and ask to see the kitchen and the toilets with no notice. A school that minds is telling you something.</> },
  { g:"Safety", q:"How do you know a child left with the right adult?",
    plain:"Collection is supervised at a single entrance and children are released only to the adults a parent has named. Tell the office in advance if someone different is collecting.",
    a:<>Collection is supervised at one entrance, and we release a child only to the adults you have named. If somebody different is coming, tell the office that morning.</> },
  { g:"Safety", q:"What happens if my child is hurt?",
    plain:"Staff deal with it immediately and the office calls the parent the same day, not at pick-up time.",
    a:<>We deal with it, then we ring you — the same day, not when you arrive at collection. You should hear it from us first.</> },
  // ── The school ──
  { g:"The school", q:"Who runs EuroKids JMD Enclave?",
    plain:"Neeta Saxena is the founder of EuroKids JMD Enclave in Undri, Pune. She is usually in the building on a working morning.",
    a:<>The founder is <b>Neeta Saxena</b>. She is usually in the building on a working morning — if you want to ask somebody the hard questions about the school, ask her rather than us.</> },
  { g:"The school", q:"How long has the school been open?",
    plain:"EuroKids JMD Enclave opened in 2017 in Undri, Pune.",
    a:<>Since {SCHOOL.founded}. Long enough that the first children through the door have finished primary school.</> },
  // ── Which EuroKids ──
  { g:"Which EuroKids", q:"Is this the same as the other EuroKids in Undri?",
    plain:"No. There is more than one EuroKids near Undri. This is the JMD Enclave centre, beside the Corinthians Club. Each EuroKids is run by its own partner in its own building.",
    a:<>No — there are several near Undri and they are separately owned. We are the <a href="/which-eurokids-in-undri">JMD Enclave centre, beside the Corinthians Club</a>.</> },
  { g:"Which EuroKids", q:"I found a phone number online — is it yours?",
    plain:"Our number is 022 696 22 686. Directory listings frequently mix up the Undri EuroKids branches.",
    a:<>Ours is <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a>. Directory sites mix the Undri branches up constantly — if you reached someone else, ring us and we will point you at the right centre.</> },
  // ── Admissions ──
  { g:"Admissions", q:"When do admissions for 26–27 open?",
    plain:"Admissions for 2026-27 are open now. Visit the school, take an admission form, and we confirm a place.",
    a:<>They are open now. Visit, take a form, and we confirm the place. You can <a href="/makeapayment">pay the admission form fee online</a>.</> },
  { g:"Admissions", q:"What age can my child start?",
    plain:"Play Group takes children from about 1.5 years. Day care takes children from 1.5 to 10 years.",
    a:<>Play Group from about 1.5 years, and day care from 1.5 to 10. See <a href="/programmes">the five programmes</a> — children join where they fit rather than where their birthday says.</> },
  { g:"Admissions", q:"Can my child join part-way through the year?",
    plain:"Yes, if there is a place in that year group. Call the office to check.",
    a:<>Yes, if there is room in that year group. Ring the office and ask — it changes month to month.</> },
  { g:"Admissions", q:"What should I bring to a visit?",
    plain:"Nothing. Just come during working hours. Bring your child if you can.",
    a:<>Nothing at all. Bring your child if you can — watching how they react to the place is most of the decision.</> },
  // ── The day ──
  { g:"The day", q:"How long is the preschool day?",
    plain:"Two hours for Play Group, two and a half for Nursery, and three hours for Euro Junior and Euro Senior.",
    a:<>Two hours for Play Group, two and a half for Nursery, three for Euro Junior and Euro Senior. <a href="/programmes">Full breakdown</a>.</> },
  { g:"The day", q:"Does my child nap at school?",
    plain:"Day care children have a proper nap after lunch on their own bedding. The preschool day is too short for a nap.",
    a:<>Day care children do, after lunch, on their own bedding. The preschool morning is too short for one.</> },
  { g:"The day", q:"How much time is spent outdoors?",
    plain:"Children use the 5,000 sq ft outdoor play area every day, weather permitting.",
    a:<>Every day the weather allows. It is the main reason to choose a school with {SCHOOL.playArea} of ground over one without.</> },
  { g:"The day", q:"What if my child cries at drop-off?",
    plain:"Most children do at first. Settling in is gradual, with a parent nearby for the first week or two.",
    a:<>Most do, for a while. We settle children in gradually rather than to a schedule, and we would rather you stayed nearby for a week than forced it in two days.</> },
  // ── Fees and payment ──
  { g:"Fees", q:"Can I pay fees online?",
    plain:"Yes. Use the Make a payment page — one button for the admission form fee and one for day care and everything else.",
    a:<>Yes — <a href="/makeapayment">two buttons</a>, one for the admission form fee and one for day care and everything else.</> },
  { g:"Fees", q:"Are fees refundable if we move away?",
    plain:"No. Admission, tuition and day care fees are non-refundable. The full terms are on the refund policy page.",
    a:<>No. Fees are non-refundable once paid — the <a href="/refund-cancellation-policy">full policy</a> spells out each case. We would rather you read it before paying than after.</> },
  { g:"Fees", q:"Is there a sibling discount?",
    plain:"Ask the office on 022 696 22 686. Arrangements for siblings are handled case by case.",
    a:<>Ask the office on <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a> — siblings are handled case by case rather than by a fixed rule.</> },
  // ── Day care ──
  { g:"Day care", q:"How late can I collect?",
    plain:"Day care runs to 6:30 PM, Monday to Saturday.",
    a:<>6:30 PM, Monday to Saturday. If you are running late, ring — somebody stays with your child.</> },
  { g:"Day care", q:"Do you help with homework?",
    plain:"Yes. Older day care children do homework in the afternoon before outdoor play.",
    a:<>Yes, in the afternoon, before they go outside. It is the order that matters — outside afterwards is the incentive.</> },
  { g:"Day care", q:"Is day care open in the school holidays?",
    plain:"Day care follows the school calendar. Check with the office for specific dates.",
    a:<>It follows the school calendar — ring the office for the dates that matter to you, because they move year to year.</> },
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
