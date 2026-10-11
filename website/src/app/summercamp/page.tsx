// Summer camp.
//
// Dates are not set yet, so the page does not pretend they are. Inventing a
// date on a public page is how a parent turns up in the wrong week. It says
// what the camp is, who it is for, and takes a name for when dates are
// fixed — through the same enquiry book everything else goes through, so
// nobody has to remember a separate list.

import type { Metadata } from "next";
import PageHead from "@/components/PageHead";

export const metadata: Metadata = {
  title: "Summer Camp",
  description:
    "Summer camp at EuroKids JMD Enclave, Undri — water play, art, music, movement and cooking for children from 2 to 8. Open to children from any school.",
  alternates: { canonical: "/summercamp" },
};

const DAYS = [
  { t: "Water play", d: "Sprinklers, splash pools and the slide, on the days it is hot enough to earn it." },
  { t: "Messy art", d: "Clay, paint, paper and glue, with aprons and no expectation that anything stays clean." },
  { t: "Music and movement", d: "Dance, rhythm games and instruments loud enough to be satisfying." },
  { t: "Little cooks", d: "No-fire recipes children can actually make, and then eat." },
  { t: "Stories and dress-up", d: "Reading, acting it out, and the costume box." },
  { t: "Outdoor games", d: "The 5,000 sq ft play area, used properly." },
];

export default function SummerCamp() {
  return (
    <div className="wrap camp">
      <PageHead
        eyebrow="Summer Camp"
        title="Somewhere to be, all summer."
        lead="Five weeks of water, paint, music and noise for children from 2 to 8 — including children who do not go to school here. Half day or full day, with day care available either side."
      >
        <a className="btn btn-solid" href="/#enquire">Put my child&rsquo;s name down</a>
        <p className="camp-note">
          Dates for the next camp are not fixed yet. Leave your details and we will call you
          the moment they are, before it opens to everybody else.
        </p>
      </PageHead>

      <section className="camp-what" data-reveal>
        <h2>What a week looks like</h2>
        <div className="camp-grid">
          {DAYS.map((x) => (
            <div key={x.t} className="camp-card">
              <h3>{x.t}</h3>
              <p>{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="camp-facts" data-reveal>
        <dl>
          <div><dt>Ages</dt><dd>2 to 8 years</dd></div>
          <div><dt>Open to</dt><dd>Any child, from any school</dd></div>
          <div><dt>Timings</dt><dd>Half day or full day</dd></div>
          <div><dt>Day care</dt><dd>Available before and after camp</dd></div>
          <div><dt>Where</dt><dd>JMD Enclave, Undri — 5,000 sq ft of play area</dd></div>
          <div><dt>Fees</dt><dd>Call the office on <a href="tel:+912269622686">022 6962 2686</a></dd></div>
        </dl>
      </section>
    </div>
  );
}
