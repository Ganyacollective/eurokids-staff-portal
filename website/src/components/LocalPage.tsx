// The shell the location and service pages are built from.
//
// A word on what this is not. The brief was "hidden pages so Google gets a
// lot of things". Hidden text and doorway pages are a named violation of
// Google's spam policies, and the penalty lands on the domain rather than
// the page — which would be a bad trade for a school about to move its
// whole site onto that domain.
//
// So these are ordinary pages. They target exactly the searches that were
// asked for — preschool in Undri, day care in Mohammadwadi, playschool near
// NIBM — but they do it by answering the question a parent typing that has:
// where is it, how far is it from me, what are the hours, what does my
// child actually do there, how do I see it. Each page carries its own
// content rather than the same paragraphs with the place name swapped,
// because near-identical pages are thin content and get filtered out too.

import type { ReactNode } from "react";
import PageHead from "@/components/PageHead";
import { SCHOOL, HOURS } from "@/lib/local";

export type Fact = { k: string; v: ReactNode };

export default function LocalPage({
  eyebrow,
  title,
  lead,
  facts,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  facts: Fact[];
  children: ReactNode;
}) {
  return (
    <div className="wrap local">
      <PageHead eyebrow={eyebrow} title={title} lead={lead}>
        <div className="hero-do">
          <a className="btn btn-solid" href="/#enquire">
            Book a visit
          </a>
          <a className="btn btn-quiet" href={SCHOOL.phoneHref}>
            {SCHOOL.phone}
          </a>
        </div>
      </PageHead>

      <section className="local-facts" data-reveal>
        <dl>
          {facts.map((f) => (
            <div key={f.k}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="prose local-body" data-reveal>
        {children}
      </div>

      <section className="local-hours" data-reveal>
        <h2>Hours</h2>
        <dl>
          {HOURS.map((h) => (
            <div key={h.what}>
              <dt>{h.what}</dt>
              <dd>{h.when}</dd>
            </div>
          ))}
        </dl>
        <p className="contact-fine">
          Closed on Sundays and on the public holidays listed in the school calendar.
        </p>
      </section>

      <section className="contact-cta" data-reveal>
        <h2>Come and see it</h2>
        <p>
          Walk in any working day — no appointment needed. Or tell us about your child and
          we will call you back.
        </p>
        <a className="contact-btn" href="/#enquire">
          Start an enquiry
        </a>
      </section>
    </div>
  );
}
