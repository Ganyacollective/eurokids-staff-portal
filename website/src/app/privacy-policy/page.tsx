// The privacy policy, carried over from the Framer site word for word.
// Legal text is not ours to improve; only its typesetting is.

import type { Metadata } from "next";
import Prose from "@/components/Prose";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How EuroKids JMD Enclave, Undri, handles communication, user content, intellectual property and registration information.",
  alternates: { canonical: "/privacy-policy" },
};

export default function PrivacyPolicy() {
  return (
    <Prose
      title="Privacy Policy"
      intro="The Terms and Conditions of use set forth herein apply to the website operated by EuroKids JMD Enclave, an authorized EuroKids International Preschool partner. This content is governed and protected by all applicable laws including, but not limited to, copyright and trademark laws of India."
      updated="October 2026"
    >
      <p>
        By using our website or engaging with our services, you are deemed to have read and
        agreed to the following terms and conditions:
      </p>

      <h2>1. Communication</h2>
      <p>
        You consent to receiving communications from EuroKids JMD Enclave electronically.
        These may include email, SMS, or notices posted on the website. We are not obligated
        to respond to non-electronic communications. Any material submitted to the site must
        not violate intellectual property, contain harmful programs, or be defamatory or
        inappropriate in nature.
      </p>

      <h2>2. User Responsibilities</h2>
      <p>
        You are solely responsible for the content you upload, post, or share via our site or
        services. You must not:
      </p>
      <ul>
        <li>Violate any intellectual property, law, or regulation.</li>
        <li>Post offensive, obscene, defamatory, or illegal content.</li>
        <li>Upload viruses or content that disrupts service functionality.</li>
        <li>Link to prohibited or harmful content.</li>
      </ul>
      <p>
        All such user-contributed content becomes the property of EuroKids and may be used or
        modified without compensation.
      </p>

      <h2>3. Intellectual Property</h2>
      <p>
        All content, branding, designs, logos, and material on this website are the exclusive
        intellectual property of EuroKids JMD Enclave Preschool. No part of this site may be
        copied, redistributed, or reused without express written permission.
      </p>
      <p>
        By submitting content, you grant us a royalty-free, transferable license to use, edit,
        and display that content as necessary.
      </p>

      <h2>4. Site Usage &amp; Access</h2>
      <p>
        We are not responsible for how our website displays or functions on your device. It is
        your responsibility to ensure your browser or operating system supports modern
        standards.
      </p>

      <h2>5. Registration Information</h2>
      <p>
        If any information is collected for registration or inquiry purposes, users are
        required to provide accurate and updated data. Failure to do so may result in
        termination of access.
      </p>

      <h2>6. External Links</h2>
      <p>
        Links to third-party websites, videos, or articles are provided as convenience
        references. We do not endorse nor are we liable for any content on those websites.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        EuroKids JMD Enclave and its associates shall not be held liable for any incidental,
        indirect, or consequential damages, including loss of data, business interruption, or
        unauthorized access, arising from the use of this website.
      </p>

      <h2>8. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless EuroKids JMD Enclave and its affiliates
        against any losses or claims arising from your use of this website, including
        third-party allegations of rights infringement.
      </p>

      <h2>9. Governing Law</h2>
      <p>
        This policy is governed by the laws of India, with jurisdiction solely under the
        courts of Mumbai, Maharashtra.
      </p>

      <h2>10. Disclaimer</h2>
      <p>
        EuroKids JMD Enclave is part of the EuroKids International Preschool network under
        Lighthouse Learning, one of India&rsquo;s leading Early Childhood &amp; K-12 Education
        groups. The group serves over 150,000 children daily across more than 1,200 preschools
        and 44 schools nationwide.
      </p>
    </Prose>
  );
}
