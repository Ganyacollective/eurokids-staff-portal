import type { Metadata } from "next";
import LocalPage from "@/components/LocalPage";
import { SCHOOL } from "@/lib/local";

export const metadata: Metadata = {
  title: "Preschool near Mohammadwadi & NIBM Road",
  description:
    "Preschool near Mohammadwadi and NIBM Road — ten minutes away in Undri. Play Group to Senior KG, day care to 6:30 PM, 5,000 sq ft of outdoor play.",
  alternates: { canonical: "/preschool-in-mohammadwadi" },
  keywords: [
    "preschool in Mohammadwadi",
    "playschool Mohammadwadi",
    "preschool near NIBM Road",
    "nursery near NIBM",
    "day care Mohammadwadi",
    "best preschool near me Pune",
  ],
};

export default function PreschoolNearMohammadwadi() {
  return (
    <LocalPage
      eyebrow="Mohammadwadi & NIBM"
      title="Ten minutes from Mohammadwadi, and worth the ten minutes"
      lead="We are not in Mohammadwadi. We are in Undri, about ten minutes down the road — and a good number of our families make that drive from Mohammadwadi and NIBM Road every morning. This page is honest about why, and about when you should not bother."
      facts={[
        { k: "From Mohammadwadi", v: "≈ 10 minutes by car" },
        { k: "From NIBM Road", v: "≈ 10–12 minutes" },
        { k: "Ages", v: "1.5 to 5.5 years, day care to 10" },
        { k: "Play area", v: `${SCHOOL.playArea}, outdoors` },
        { k: "Address", v: "JMD Enclave, Undri, Pune 411060" },
      ]}
    >
      <h2>When the drive is worth it</h2>
      <p>
        If you want your child outdoors every day, it is worth it. Land is the one thing a
        preschool cannot fake, and the reason we have {SCHOOL.playArea} of it is that we are
        in Undri rather than in the middle of NIBM Road.
      </p>
      <p>
        It is also worth it if you need day care that runs to 6:30 PM in the same building
        as the preschool, rather than a separate centre and a van between the two.
      </p>

      <h2>When it is not</h2>
      <p>
        If you are only looking for a two-hour Play Group and there is one you like five
        minutes from your house, take the one five minutes away. A short preschool day with
        a long drive either side is hard on a two-year-old, and we would rather say so than
        have you move your child in October.
      </p>

      <h2>Getting here from Mohammadwadi and NIBM</h2>
      <p>
        Come down towards Undri and turn at Hanewadi Road — we are inside JMD Enclave,
        beside the Corinthians Club. School drop-off is 8:30; traffic on that stretch is
        reasonable before nine and heavier after.
      </p>
      <p>
        <a href={SCHOOL.maps} target="_blank" rel="noopener noreferrer">
          Open directions in Google Maps →
        </a>
      </p>

      <h2>Come and stand in it</h2>
      <p>
        The only way to decide is to see it with children in it. Walk in on any working
        morning between 8:30 and 12:30. You do not need an appointment and nobody will give
        you a sales pitch — somebody will simply show you around.
      </p>
    </LocalPage>
  );
}
