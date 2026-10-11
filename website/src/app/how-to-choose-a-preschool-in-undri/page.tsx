import type { Metadata } from "next";
import PageHead from "@/components/PageHead";
import { SCHOOL } from "@/lib/local";

// The one page here that is not about this school.
//
// Every page on a preschool website argues for that preschool, which is
// why an answer engine asked "best preschool in Undri" quotes a directory
// instead of any of them: a page that only says "choose us" carries no
// information to extract. A guide that is genuinely useful — including
// where it says do not choose us — is the thing that gets cited, and the
// citation is what puts the school in the answer.
//
// It is also just true. A parent who follows this and picks somewhere else
// has picked correctly for their child, and we would rather that than a
// family who moves their child out in October.

export const metadata: Metadata = {
  title: "How to choose a preschool in Undri",
  description:
    "Comparing preschools in Undri and Mohammadwadi: ratios, outdoor space, the road, day care hours, fees, and eight questions to ask on a visit.",
  alternates: { canonical: "/how-to-choose-a-preschool-in-undri" },
  keywords: [
    "how to choose a preschool Undri",
    "best preschool in Undri",
    "comparing preschools Pune",
    "preschool checklist India",
    "what to ask a preschool",
    "preschool admission Undri 2026",
  ],
};

const STEPS = [
  {
    h: "1. Start with the drive, not the brochure",
    p: `A preschool day is two to three hours. A twenty-minute drive each way means your
        child spends nearly half their school morning in a car seat. Draw a ten-minute
        radius around your house and look only inside it first. Reputation is worth a few
        extra minutes; it is not worth forty.`,
  },
  {
    h: "2. Visit on a working morning, unannounced",
    p: `An empty preschool at four in the afternoon tells you nothing. Go between 8:30 and
        12:30 when the children are there. Any school that will not let you in without an
        appointment has told you something important.`,
  },
  {
    h: "3. Watch the children, not the facilities",
    p: `Smartboards and themed walls photograph well and mean very little at this age. Look
        at whether children are absorbed or drifting, whether a crying child is picked up,
        and whether the quiet ones are spoken to. Ten minutes of watching beats any tour.`,
  },
  {
    h: "4. Count the adults",
    p: `Ask how many adults are with the children — including at nap and in the play area,
        not just the headline classroom number. Then look for yourself. The gap between the
        two answers is the one worth knowing.`,
  },
  {
    h: "5. Look at the outdoor space, and whether it is used",
    p: `Many preschools in Undri and Mohammadwadi operate from a flat or a row house with a
        terrace. Some have real ground. Ask how often children are outside and on what days
        they are not — the second question gets a more honest answer.`,
  },
  {
    h: "6. Check what is on the other side of the door",
    p: `A school on a main road manages traffic risk with supervision because it has no
        other option. A school off the main road has the risk designed out. This is the one
        thing you can verify from the pavement before you walk in.`,
  },
  {
    h: "7. Settle the day care question now, not in June",
    p: `If both parents work, ask whether day care is in the same building with the same
        staff, or a separate centre with a van between. For a four-year-old that transfer
        is a second set of adults and a second set of rules in the middle of a long day.`,
  },
  {
    h: "8. Get the fees in writing, including what is not in them",
    p: `Ask for the annual figure, then ask specifically what is extra: uniform, books,
        transport, events, summer camp, and whether day care is billed monthly or termly.
        Most fee disputes are about the second list rather than the first.`,
  },
];

const ASK = [
  "How many adults are with the children at nap time?",
  "What happens if my child is hurt — who decides, who calls, how fast do I hear?",
  "Who is at the gate at collection, and how do you know a child left with the right adult?",
  "Can I see the kitchen and the toilets right now, without notice?",
  "How many children left mid-year last year, and why?",
  "What is extra on top of the fee I have just been quoted?",
  "What happens on a day my child will not let go of me?",
  "Can I speak to a parent who is not on your list of references?",
];

const JSONLD = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to choose a preschool in Undri",
  description:
    "An eight-step guide to comparing preschools in Undri and Mohammadwadi, Pune.",
  step: STEPS.map((s, i) => ({
    "@type": "HowToStep",
    position: i + 1,
    name: s.h.replace(/^\d+\.\s*/, ""),
    text: s.p.replace(/\s+/g, " ").trim(),
  })),
};

export default function HowToChoose() {
  return (
    <div className="wrap prose-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }}
      />
      <PageHead
        eyebrow="A guide"
        title="How to choose a preschool in Undri"
        lead="Written by a preschool in Undri, which you should factor in. It is still the advice we give friends, and following it honestly will sometimes point you somewhere other than here."
      />

      <div className="prose" data-reveal>
        {STEPS.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            <p>{s.p}</p>
          </section>
        ))}

        <h2>Eight questions worth asking on a visit</h2>
        <p>
          Ask these at every school you see, including ours. How easily they are answered is
          most of the answer.
        </p>
        <ul>
          {ASK.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>

        <h2>Where we would not be your best choice</h2>
        <p>
          If you live in Kondhwa or beyond Pisoli and want a two-hour Play Group, take the
          nearest decent one. If you need a school bus — we do not run transport. If you
          want an academically pushed preschool with worksheets from two and a half, we are
          not that, and you will be happier somewhere that is.
        </p>

        <h2>Where we would</h2>
        <p>
          If you want your child outdoors every day, if you need day care to 6:30 in the same
          building, or if being <a href="/safe-preschool-in-undri">off the main road</a>{" "}
          matters to you, come and look. Walk in any working morning, or ring{" "}
          <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a>.
        </p>
        <p>
          And if you are comparing EuroKids branches specifically, there are several near
          Undri — <a href="/which-eurokids-in-undri">here is which one is which</a>.
        </p>
      </div>
    </div>
  );
}
