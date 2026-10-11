import type { Metadata } from "next";
import LocalPage from "@/components/LocalPage";
import { SCHOOL } from "@/lib/local";

// "Is it safe" is the question under every other question a parent asks
// about a preschool, and almost nobody writes a page about it because it is
// easier to write about curriculum.
//
// What is on this page is only what can be verified from where the school
// physically is: inside a residential society, off the main road, behind
// the society gate. Those are facts about the address.
//
// What is deliberately NOT here: any claim to be "certified safest", any
// safety award, any numbers about staff vetting, CCTV, fire clearance or
// first aid training. Abhinav asked whether we certify as the safest
// preschool. I have no evidence of such a certification and I am not going
// to assert one on a page parents will use to decide where to leave a
// three-year-old. The moment he tells me what is actually in place — fire
// NOC, CCTV coverage, police verification, staff first-aid training — it
// goes here, because those are the things that would make this page
// genuinely strong.

export const metadata: Metadata = {
  title: "A safe preschool in Undri — off the main road",
  description:
    "Why being inside JMD Enclave rather than on the main Undri road matters for a three-year-old: no gate onto traffic, one supervised entrance, and 5,000 sq ft of enclosed outdoor play.",
  alternates: { canonical: "/safe-preschool-in-undri" },
  keywords: [
    "safe preschool Undri",
    "safest preschool Pune",
    "preschool safety Undri",
    "gated preschool Undri",
    "preschool not on main road Pune",
  ],
};

export default function SafePreschool() {
  return (
    <LocalPage
      eyebrow="Safety"
      title="The safest thing about this school is where it is"
      lead="Every preschool will tell you it is safe. The difference you can actually verify by standing outside is the road. We are inside a residential enclave, through a society gate, with no classroom door that opens onto traffic."
      facts={[
        { k: "Location", v: "Inside JMD Enclave, a residential society" },
        { k: "Main road", v: "Not on one — you turn off Hanewadi Road" },
        { k: "Outdoor play", v: `${SCHOOL.playArea}, enclosed` },
        { k: "Entrance", v: "One, supervised at drop-off and collection" },
        { k: "Day care", v: "Same building, same staff, to 6:30 PM" },
      ]}
    >
      <h2>Why the road matters more than it sounds</h2>
      <p>
        A two-year-old has no traffic sense at all, and a four-year-old has very little. The
        single highest-consequence risk in a preschool day is not inside the classroom — it
        is the ten seconds between a door and a car.
      </p>
      <p>
        A school in a commercial unit on the main Undri or NIBM road manages that risk with
        supervision, because it has no other option. Here the risk is largely designed out:
        you turn off the main road, through the enclave, and the school is inside. A child
        who got out of a door would be in a residential society, not in a traffic lane.
      </p>

      <h2>What that also buys</h2>
      <ul>
        <li>
          <b>Quiet.</b> Classrooms off a main road are loud, and a room where a teacher is
          competing with horns is a room where quiet children stop speaking up.
        </li>
        <li>
          <b>Air.</b> Arterial-road dust and exhaust are a real consideration for small
          lungs over a three-hour day, five days a week, for three years.
        </li>
        <li>
          <b>Enclosed outdoor play.</b> {SCHOOL.playArea} that children can use without
          being walked anywhere, because it is part of the same site.
        </li>
      </ul>

      <h2>What you should ask us, and any other school</h2>
      <p>
        Do not take a website&rsquo;s word for any of this, including ours. When you visit —
        here or anywhere — these are the questions worth asking, and a school that answers
        them easily is telling you something:
      </p>
      <ul>
        <li>Who is at the gate at collection time, and how do you know a child left with the right adult?</li>
        <li>What happens if a child is hurt — who decides, who calls, how fast do I hear?</li>
        <li>How many adults are with the children, including at nap and in the play area?</li>
        <li>Who has been in the building today besides staff and children?</li>
        <li>Can I see the kitchen and the toilets, right now, without notice?</li>
      </ul>
      <p>
        Ask us those on a working morning. Nobody will mind, and you will learn more in ten
        minutes than from any page on this site.
      </p>
    </LocalPage>
  );
}
