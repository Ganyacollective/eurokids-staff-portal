// Making a payment.
//
// Two buttons. That is the whole page.
//
// The first version of this had kickers, example chips and a four-point
// "before you pay" list, which is a lot of reading to put between a parent
// and a payment they already decided to make. Everything that was in that
// list is on the Razorpay page anyway.
//
// The labels say the whole thing — "Pay for the admission form", "Pay for
// day care or anything else" — so they need nothing underneath them.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Make a payment",
  description:
    "Pay EuroKids JMD Enclave securely — admission form fee, day care and school fees. Cards, UPI, net banking and wallets accepted.",
  alternates: { canonical: "/pay" },
};

// The two hosted pages. Kept here rather than in the database because a
// payment destination should change by deliberate deploy, never by an edit
// somebody can make in a hurry.
const ADMISSION = "https://pages.razorpay.com/pl_S4sFIIKpWqMwp4/view";
const EVERYTHING_ELSE = "https://pages.razorpay.com/pl_QPss3eP6Cae3Pp/view";

export default function PayPage() {
  return (
    <div className="wrap pay">
      <h1>Make a payment</h1>

      <div className="pay-buttons">
        <a className="pay-btn" href={ADMISSION} target="_blank" rel="noopener noreferrer">
          Pay for admission form
        </a>
        <a className="pay-btn" href={EVERYTHING_ELSE} target="_blank" rel="noopener noreferrer">
          Pay for daycare or others
        </a>
      </div>

      <p className="pay-fine">
        Not sure which? Call us on <a href="tel:+912069622686">020 6962 2686</a>.
      </p>
    </div>
  );
}
