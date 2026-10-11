import type { Metadata } from "next";
import LocalPage from "@/components/LocalPage";
import { SCHOOL } from "@/lib/local";

// There is more than one EuroKids in and around Undri, and parents mix them
// up constantly — the phone number they find on a directory listing often
// belongs to a different centre entirely.
//
// This page exists because that confusion is a real search with no good
// answer on the internet, and being the page that clears it up is worth
// more than another page asserting we are the best. It is also the honest
// way to make the point: we do not claim to be better than the other
// franchises — that is their business and ours is not to run them down —
// we just say plainly which one we are and where.

export const metadata: Metadata = {
  title: "Which EuroKids in Undri? JMD Enclave, explained",
  description:
    "There is more than one EuroKids near Undri. This is the JMD Enclave centre — Bungalow 1, off Hanewadi Road, beside the Corinthians Club. How to tell it apart and how to reach us.",
  alternates: { canonical: "/which-eurokids-in-undri" },
  keywords: [
    "EuroKids Undri",
    "EuroKids JMD Enclave",
    "EuroKids Mohammadwadi",
    "EuroKids Undri contact number",
    "EuroKids near Corinthians Club",
    "which EuroKids Undri",
  ],
};

export default function WhichEuroKids() {
  return (
    <LocalPage
      eyebrow="Which one are we"
      title="There is more than one EuroKids near Undri. This is JMD Enclave."
      lead="Parents ring us for other centres and ring other centres for us, several times a month. If you are trying to work out which EuroKids you were told about, this page should settle it in under a minute."
      facts={[
        { k: "This centre", v: "EuroKids JMD Enclave" },
        { k: "Address", v: "Bungalow 1, JMD Enclave, Undri" },
        { k: "Landmark", v: "Beside the Corinthians Club" },
        { k: "Phone", v: <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a> },
        { k: "Opened", v: SCHOOL.founded },
      ]}
    >
      <h2>How to tell you have the right one</h2>
      <p>
        We are <b>EuroKids JMD Enclave</b>, inside the JMD Enclave society off Hanewadi Road
        in Undri, beside the <b>Corinthians Club</b>. If the listing you are looking at says
        Landmark Society, Amit Colori, or an address on the main Undri or NIBM road, that is
        a different centre.
      </p>
      <p>
        The surest check is the phone number. Ours is{" "}
        <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a>. Directory sites — Justdial, Sulekha,
        ProEves and the rest — mix the Undri branches up routinely, and the reviews on those
        pages often belong to a centre other than the one named at the top.
      </p>

      <h2>Are they the same school?</h2>
      <p>
        Same curriculum, same brand, different owners. EuroKids is a franchise: each centre
        is run by its own partner, in its own building, with its own staff. What the children
        are taught is set centrally. Everything you would actually visit a school to judge —
        the building, the outdoor space, the teachers, how the place feels at half past eight
        in the morning — is particular to the centre.
      </p>
      <p>
        So the useful thing is not to ask which EuroKids is best. It is to go and stand in
        the two or three nearest you. We would say that even if you were on your way to one
        of the others.
      </p>

      <h2>What is particular about this one</h2>
      <ul>
        <li>
          <b>It is inside a residential enclave, not on a main road.</b> You turn off
          Hanewadi Road into JMD Enclave and the school is inside. No child is ever let out
          of a gate onto passing traffic, and the noise and dust of a main road do not reach
          the classrooms.
        </li>
        <li>
          <b>{SCHOOL.playArea} of outdoor play area.</b> That is a function of being inside
          a society with land rather than in a commercial unit on a arterial road.
        </li>
        <li>
          <b>The {SCHOOL.award}.</b> Which is a judgement about this building, not about the
          brand.
        </li>
        <li>
          <b>Day care to 6:30 PM in the same building</b> as the preschool.
        </li>
      </ul>

      <h2>If you want the other ones</h2>
      <p>
        Call us anyway and we will tell you which centre you are thinking of and point you at
        their number. It takes a minute and it saves you a wasted drive, which is worth more
        to us than pretending the other branches do not exist.
      </p>
    </LocalPage>
  );
}
