// Making a payment.
//
// Two buttons. That is the whole page.
//
// The first version of this had kickers, example chips and a four-point
// "before you pay" list, which is a lot of reading to put between a parent
// and a payment they already decided to make. Everything that was in that
// list is on the Razorpay page anyway.
//
// The labels say the whole thing — "Pay for admission form", "Pay for
// daycare or others" — so they need nothing underneath them, and there is
// no "not sure? call us" line either: most people paying this are standing
// in the office with somebody who can answer them.

import type { Metadata } from "next";
import PageHead from "@/components/PageHead";

export const metadata: Metadata = {
  title: "Make a payment",
  description:
    "Pay EuroKids JMD Enclave securely — admission form fee, day care and school fees. Cards, UPI, net banking and wallets accepted.",
  alternates: { canonical: "/makeapayment" },
};

// The two hosted pages. Kept here rather than in the database because a
// payment destination should change by deliberate deploy, never by an edit
// somebody can make in a hurry.
const ADMISSION = "https://pages.razorpay.com/pl_S4sFIIKpWqMwp4/view";
const EVERYTHING_ELSE = "https://pages.razorpay.com/pl_QPss3eP6Cae3Pp/view";

export default function PayPage() {
  return (
    <div className="wrap pay">
      <PageHead eyebrow="Fees" title="Make a payment" />

      <div className="pay-buttons" data-reveal>
        <a className="pay-btn" href={ADMISSION} target="_blank" rel="noopener noreferrer">
          Pay for admission form
        </a>
        <a className="pay-btn" href={EVERYTHING_ELSE} target="_blank" rel="noopener noreferrer">
          Pay for daycare or others
        </a>
      </div>
    </div>
  );
}
