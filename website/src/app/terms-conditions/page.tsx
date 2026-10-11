import type { Metadata } from "next";
import Prose from "@/components/Prose";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms governing use of the EuroKids JMD Enclave website — security rules, prohibited content, enforcement and governing law.",
  alternates: { canonical: "/terms-conditions" },
};

export default function TermsConditions() {
  return (
    <Prose
      title="Terms & Conditions"
      intro="These Terms & Conditions govern your use of the website operated by EuroKids JMD Enclave, an authorized EuroKids International Preschool partner. By accessing our site or using our services, you agree to comply with the terms outlined below."
      updated="October 2026"
    >
      <h2>1. Security Rules</h2>
      <p>
        Visitors are strictly prohibited from attempting to violate the security of this
        website, including (but not limited to) the following actions:
      </p>
      <ul>
        <li>Accessing data not intended for them or logging into servers or accounts they are not authorized to access.</li>
        <li>Probing, scanning, or testing the vulnerability of the website or attempting to breach security or authentication measures without proper authorization.</li>
        <li>Interfering with services, including introducing viruses, overloading, &ldquo;flooding,&rdquo; &ldquo;mail bombing,&rdquo; or crashing the website.</li>
        <li>Sending unsolicited electronic mail, including promotional or advertising content.</li>
      </ul>
      <p>
        Violation of system or network security may result in civil and/or criminal liability.
        EuroKids JMD Enclave reserves the right to investigate and cooperate with law
        enforcement in prosecuting users involved in such violations.
      </p>

      <h2>2. Prohibited User Content</h2>
      <p>
        The following types of content are considered illegal or prohibited and must not be
        uploaded, posted, shared, or transmitted via our website. EuroKids JMD Enclave
        reserves the right to remove any such content and take legal action as required.
      </p>
      <p>Prohibited content includes, but is not limited to:</p>
      <ul>
        <li>Personal or sensitive personal information about yourself or others.</li>
        <li>Obscene, offensive, racist, hateful, or harmful content.</li>
        <li>Harassment or promotion of harassment.</li>
        <li>Content containing nudity, graphic violence, or offensive material.</li>
        <li>Junk mail, chain letters, or unsolicited mass emails.</li>
        <li>False or misleading information; promotion of illegal or abusive conduct.</li>
        <li>Exploitation of individuals in any sexual or violent manner.</li>
        <li>Posting of private contact details (addresses, phone numbers, emails, etc.).</li>
        <li>Copyrighted or trademarked material without authorization.</li>
        <li>Promotion of criminal activities or illegal instructions.</li>
        <li>Requests for passwords or personal data for illegal or commercial use.</li>
        <li>Hosting contests, donations, or commercial sales without prior written approval.</li>
      </ul>

      <h2>3. Website Use Policy</h2>
      <p>
        You agree not to use this site for unlawful purposes or in ways that may damage,
        disable, or overburden our network. You also agree not to interfere with any other
        party&rsquo;s use and enjoyment of the website.
      </p>

      <h2>4. Enforcement &amp; Termination</h2>
      <p>
        Violation of these Terms may result in temporary suspension or permanent termination
        of access to our website and services. We reserve the right to remove any content or
        user without prior notice if the content is deemed inappropriate or harmful.
      </p>

      <h2>5. Changes to Terms</h2>
      <p>
        EuroKids JMD Enclave reserves the right to revise these Terms &amp; Conditions at any
        time. It is the responsibility of the user to regularly review this page to stay
        updated. Continued use of the website constitutes acceptance of these changes.
      </p>

      <h2>6. Governing Law</h2>
      <p>
        These Terms are governed by the laws of India. Any disputes shall fall under the
        exclusive jurisdiction of the courts in Mumbai, Maharashtra.
      </p>
    </Prose>
  );
}
