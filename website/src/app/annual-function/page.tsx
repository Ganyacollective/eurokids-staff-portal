// The annual function.
//
// A page that exists mostly so the link in the header is not a dead end, and
// so that when the date is fixed there is somewhere to put it. It says what
// is known and admits what is not, which is better than a page that claims a
// date nobody has agreed.

import type { Metadata } from "next";
import PageHead from "@/components/PageHead";

export const metadata: Metadata = {
  title: "Annual Function",
  description:
    "The EuroKids JMD Enclave annual function — every child on stage, in front of their family. Details for 26–27 to be announced.",
  alternates: { canonical: "/annual-function" },
};

export default function AnnualFunction() {
  return (
    <div className="wrap camp">
      <PageHead
        eyebrow="Annual Function 26–27"
        title="Every child on that stage."
        lead="Not the confident few. Every child in the school gets a part, a costume and a moment in front of their own family — which for most of them is the first time they have stood in front of a crowd and been clapped for."
      >
        <p className="camp-note">
          The date and venue for 26&ndash;27 have not been announced. Parents of children on
          the roll will hear first, by email and on the WhatsApp group.
        </p>
      </PageHead>

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
              Grandparents included. We will confirm how many seats per child once the venue
              is booked.
            </p>
          </div>
        </div>
      </section>

      <section className="camp-facts" data-reveal>
        <dl>
          <div><dt>Who performs</dt><dd>Every child on the roll</dd></div>
          <div><dt>Rehearsals</dt><dd>During school hours</dd></div>
          <div><dt>Date</dt><dd>To be announced</dd></div>
          <div><dt>Questions</dt><dd><a href="tel:+912269622686">022 6962 2686</a></dd></div>
        </dl>
      </section>
    </div>
  );
}
