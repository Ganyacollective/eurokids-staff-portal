// Making a payment.
//
// The old page was two all-caps headings and two identical blue "Pay Now"
// buttons, and parents kept picking the wrong one — which is not a Razorpay
// problem, it is a problem with the moment before Razorpay. A parent arrives
// knowing what they owe in their own words ("the admission form", "this
// month's day care"), not in ours, so the page has to meet them there.
//
// Razorpay's own page handles the actual payment and is not ours to change.
// What is ours is this: say plainly which button is which, what each one is
// for, what to have ready, and what happens afterwards.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Make a payment",
  description:
    "Pay EuroKids JMD Enclave securely — admission form fee, day care fees, summer camp and events. Cards, UPI, net banking and wallets accepted.",
  alternates: { canonical: "/pay" },
};

// The two hosted pages. Kept here rather than in the database because a
// payment destination should change by deliberate deploy, never by an edit
// somebody can make in a hurry.
const PAGES = {
  admission: "https://pages.razorpay.com/pl_S4sFIIKpWqMwp4/view",
  other: "https://pages.razorpay.com/pl_QPss3eP6Cae3Pp/view",
};

type Choice = {
  href: string;
  kicker: string;
  title: string;
  blurb: string;
  examples: string[];
};

const CHOICES: Choice[] = [
  {
    href: PAGES.admission,
    kicker: "Joining us",
    title: "Admission form fee",
    blurb:
      "The one-time fee when you take an admission form for a new child. Pay this if you have just visited us and been asked to register.",
    examples: ["A new admission", "Registration for 26–27", "Taking the form after a visit"],
  },
  {
    href: PAGES.other,
    kicker: "Already with us",
    title: "Day care, fees and everything else",
    blurb:
      "Monthly day care, term fees, summer camp, events and workshops — anything that is not the admission form.",
    examples: ["Monthly day care", "Term or annual fees", "Summer camp", "An event or workshop"],
  },
];

export default function PayPage() {
  return (
    <div className="wrap pay">
      <header className="pay-head">
        <h1>Make a payment</h1>
        <p>
          Two kinds of payment, and most people need the second one. Choose the one that
          matches why you are paying — if you are unsure, call us on{" "}
          <a href="tel:+912069622686">020 6962 2686</a> before paying.
        </p>
      </header>

      <div className="pay-grid">
        {CHOICES.map((c) => (
          <a key={c.href} className="pay-card" href={c.href} target="_blank" rel="noopener noreferrer">
            <span className="pay-kicker">{c.kicker}</span>
            <h2>{c.title}</h2>
            <p>{c.blurb}</p>
            <ul>
              {c.examples.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <span className="pay-go">
              Pay this
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <path
                  d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </a>
        ))}
      </div>

      <section className="pay-note">
        <h3>Before you pay</h3>
        <ul>
          <li>
            <b>Have the child&rsquo;s full name ready.</b> Enter it exactly as it appears on
            our records, so we can match the payment to the right family.
          </li>
          <li>
            <b>Any amount we have told you.</b> The page lets you type it in; we do not set it
            for you.
          </li>
          <li>
            <b>Cards, UPI, net banking and wallets</b> all work. Payment is handled by
            Razorpay — we never see or store your card details.
          </li>
          <li>
            <b>You will get a receipt by email.</b> If it has not arrived within the hour,
            send us the Razorpay payment ID and we will find it.
          </li>
        </ul>
        <p className="pay-fine">
          Fees once paid are non-refundable. Please read the{" "}
          <a href="/refund-cancellation-policy">refund and cancellation policy</a> before
          paying.
        </p>
      </section>
    </div>
  );
}
