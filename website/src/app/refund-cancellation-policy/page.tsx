import type { Metadata } from "next";
import Prose from "@/components/Prose";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "EuroKids JMD Enclave operates a strict no-refund policy on admission, tuition, day care and event fees. The full terms, in plain language.",
  alternates: { canonical: "/refund-cancellation-policy" },
};

export default function RefundPolicy() {
  return (
    <Prose
      title="Refund & Cancellation Policy"
      intro="At EuroKids JMD Enclave, we maintain a strict No Refund Policy for all our services. By enrolling your child or availing of any service, you acknowledge and agree to the following terms."
      updated="October 2026"
    >
      <h2>1. Admission Fees</h2>
      <ul>
        <li>
          All admission, registration, and onboarding fees are <b>non-refundable</b> under any
          circumstances, including withdrawal of admission or cancellation by the
          parent/guardian.
        </li>
      </ul>

      <h2>2. Tuition / Annual Fees</h2>
      <ul>
        <li>Once paid, tuition and annual fees are <b>non-refundable</b>, whether in full or in part.</li>
        <li>Fees are applicable for the academic year/session and remain due regardless of attendance or voluntary withdrawal.</li>
      </ul>

      <h2>3. Daycare Fees</h2>
      <ul>
        <li>Monthly daycare fees are <b>non-refundable</b>, irrespective of usage, absenteeism, or early withdrawal from the program.</li>
        <li>No adjustments or credits will be carried over to future months.</li>
      </ul>

      <h2>4. Withdrawal / Discontinuation</h2>
      <ul>
        <li>
          If a parent chooses to withdraw their child from the preschool or daycare after
          admission or during the academic year, <b>no fees will be refunded</b> under any
          circumstances.
        </li>
      </ul>

      <h2>5. Special Programs / Events</h2>
      <ul>
        <li>
          Fees paid for events, workshops, special days, or short-term programs are also{" "}
          <b>non-refundable</b> once registration is confirmed.
        </li>
      </ul>

      <h2>6. Mode of Payment</h2>
      <ul>
        <li>All fees must be paid in full, either through bank transfer, UPI, cheque, or cash as directed by the centre.</li>
        <li>Refunds are not applicable even in the case of excess payments unless verified and approved solely by the school management.</li>
      </ul>

      <p>
        If you have any questions regarding this policy, you may reach out to our
        administrative office at{" "}
        <a href="mailto:admin@eurokidsjmdenclave.org">admin@eurokidsjmdenclave.org</a> or call
        us directly at <a href="tel:+917875096690">+91 78750 96690</a>, Mon–Sat 9:00 AM to
        4:00 PM.
      </p>
      <p>Thank you for your understanding and cooperation.</p>
    </Prose>
  );
}
