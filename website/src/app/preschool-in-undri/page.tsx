import type { Metadata } from "next";
import LocalPage from "@/components/LocalPage";
import { SCHOOL } from "@/lib/local";

export const metadata: Metadata = {
  title: "Preschool in Undri, Pune",
  description:
    "Preschool in Undri, Pune. Play Group to Senior KG, 5,000 sq ft of outdoor play, day care to 6:30 PM. Best Ambience Award winner. Walk in any working day.",
  alternates: { canonical: "/preschool-in-undri" },
  keywords: [
    "preschool in Undri",
    "best preschool in Undri",
    "playschool Undri Pune",
    "nursery admission Undri",
    "preschool near Corinthian Club",
    "EuroKids Undri",
  ],
};

export default function PreschoolInUndri() {
  return (
    <LocalPage
      eyebrow="Undri, Pune"
      title="A preschool in Undri, five minutes from your door"
      lead="EuroKids JMD Enclave has been on Hanewadi Road since 2017. Play Group through Senior KG, day care until 6:30 PM, and a 5,000 sq ft play area that most preschools in Undri simply do not have the land for."
      facts={[
        { k: "Ages", v: "1.5 to 5.5 years, plus day care to 10" },
        { k: "Programmes", v: "Play Group, Nursery, Euro Junior, Euro Senior" },
        { k: "Play area", v: `${SCHOOL.playArea}, outdoors` },
        { k: "Opened", v: SCHOOL.founded },
        { k: "Address", v: "JMD Enclave, Undri, Pune 411060" },
      ]}
    >
      <h2>Where we are, and how far that is from you</h2>
      <p>
        We are inside JMD Enclave, just off Hanewadi Road, beside the Corinthian Club. For
        most of Undri that is a five to eight minute drive: a few minutes from{" "}
        <b>Nyati Evara</b>, <b>Nyati Eternity</b> and <b>Godrej Greens</b>, around ten from{" "}
        <b>NIBM Road</b> and <b>Mohammadwadi</b>, and fifteen from <b>Pisoli</b> and{" "}
        <b>Kondhwa</b>.
      </p>
      <p>
        That matters more than it sounds. A preschool day is short — two to three hours —
        so the drive is a real part of it. Parents who pick a school forty minutes away
        usually move their child within a year.
      </p>

      <h2>What makes this one different</h2>
      <p>
        Three things, and we would rather be specific than say we are the best preschool in
        Undri and leave you to guess what that means.
      </p>
      <ul>
        <li>
          <b>The space.</b> {SCHOOL.playArea} of outdoor play area. Most preschools in Undri
          operate from a flat or a row house and have a terrace. Children here run, climb and
          ride outdoors every day, which is most of the reason they sleep well.
        </li>
        <li>
          <b>The ambience.</b> We won the {SCHOOL.award} for it. You will see what that means
          in thirty seconds of standing in the building, which is why we would rather you
          visited than read about it.
        </li>
        <li>
          <b>Day care in the same building.</b> Not a separate centre across town. Your child
          finishes preschool and stays where they already are, with staff they already know,
          until 6:30 PM.
        </li>
      </ul>

      <h2>Admissions for 26–27</h2>
      <p>
        Open now. The process is short: visit the school, take an admission form, and we
        confirm a place. There is no entrance test for a three-year-old and we are suspicious
        of preschools that have one.
      </p>
      <p>
        Come on a working morning between 8:30 and 12:30 if you want to see the school with
        children in it — which is the only way to judge it. Nobody will mind that you did not
        call first.
      </p>
    </LocalPage>
  );
}
