// Where we are, and how to reach a person.
//
// Everything on this page is a thing somebody can act on: a number that
// dials, an address that opens in Maps, hours that say whether it is worth
// walking over now. No contact form — the enquiry form on the front page
// already does that job, and two forms asking the same questions is how a
// parent ends up filling in neither.

import type { Metadata } from "next";
import PageHead from "@/components/PageHead";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "EuroKids JMD Enclave — JMD Enclave, Undri, Pune 411060. Call 022 6962 2686, Mon to Sat. Visits welcome; no appointment needed.",
  alternates: { canonical: "/contact-us" },
};

const MAPS =
  "https://www.google.com/maps/search/?api=1&query=EuroKids+JMD+Enclave+Undri+Pune";

export default function ContactUs() {
  return (
    <div className="wrap contact">
      <PageHead
        eyebrow="Visit"
        title="Come and see us"
        lead="The best way to judge a preschool is to stand in it. Walk in any working day — no appointment needed — and somebody will show you around."
      />

      <div className="contact-grid" data-reveal>
        <a className="contact-card" href="tel:+912269622686">
          <span className="contact-kicker">Call the school</span>
          <strong>022 6962 2686</strong>
          <span className="contact-sub">Mon to Sat, 8:00 AM – 6:30 PM</span>
        </a>

        <a className="contact-card" href="https://wa.me/917875096690" target="_blank" rel="noopener noreferrer">
          <span className="contact-kicker">WhatsApp</span>
          <strong>+91 78750 96690</strong>
          <span className="contact-sub">Admissions and fees, Mon to Sat 9–4</span>
        </a>

        <a className="contact-card" href="mailto:admin@eurokidsjmdenclave.org">
          <span className="contact-kicker">Email</span>
          <strong>admin@eurokidsjmdenclave.org</strong>
          <span className="contact-sub">We answer within a working day</span>
        </a>

        <a className="contact-card" href={MAPS} target="_blank" rel="noopener noreferrer">
          <span className="contact-kicker">Visit</span>
          <strong>JMD Enclave, Undri</strong>
          <span className="contact-sub">Pune 411060 — open in Maps</span>
        </a>
      </div>

      <section className="contact-hours" data-reveal>
        <div>
          <h2>Opening hours</h2>
          <dl>
            <div><dt>Preschool</dt><dd>8:30 AM – 12:30 PM, Mon to Sat</dd></div>
            <div><dt>Day care</dt><dd>8:00 AM – 6:30 PM, Mon to Sat</dd></div>
            <div><dt>Office</dt><dd>9:00 AM – 4:00 PM, Mon to Sat</dd></div>
          </dl>
          <p className="contact-fine">
            Closed on Sundays and on the public holidays listed in the school calendar.
          </p>
        </div>
        <div>
          <h2>Getting here</h2>
          <p>
            We are in JMD Enclave, off Hanewadi Road in Undri — a few minutes from Nyati
            Evara, Nyati Eternity and Godrej Greens, and about ten from NIBM and
            Mohammadwadi.
          </p>
          <p>
            <a className="contact-link" href={MAPS} target="_blank" rel="noopener noreferrer">
              Open directions in Google Maps →
            </a>
          </p>
        </div>
      </section>

      <section className="contact-cta" data-reveal>
        <h2>Thinking about admission?</h2>
        <p>
          Tell us about your child and we will have the right person call you back.
        </p>
        <a className="contact-btn" href="/#enquire">Start an enquiry</a>
      </section>
    </div>
  );
}
