import type { Metadata } from "next";
import LocalPage from "@/components/LocalPage";
import { SCHOOL } from "@/lib/local";

// Age-intent. The ChatGPT result for "best preschool in Undri" came back
// with a question — "what is your child's age, and your approximate
// budget?" — which is a direct statement of how the decision is actually
// segmented. Parents do not search for a preschool; they search for a
// preschool for a two-year-old. Nothing on this site answered that.

export const metadata: Metadata = {
  title: "Preschool for 2 year olds in Undri",
  description:
    "Starting preschool at two in Undri, Pune. What a 2-year-old's morning looks like, how settling in works, and whether two is too early — answered honestly.",
  alternates: { canonical: "/preschool-for-2-year-olds-in-undri" },
  keywords: [
    "preschool for 2 year old Undri",
    "play group for 2 year old Pune",
    "best age to start preschool India",
    "playgroup admission Undri",
    "toddler preschool Mohammadwadi",
  ],
};

export default function TwoYearOlds() {
  return (
    <LocalPage
      eyebrow="Ages 1.5 – 2.5"
      title="Starting preschool at two"
      lead="Play Group is two hours, which is about as long as a two-year-old can be away from home before the day stops being fun. Most of what happens in it is not academic, and that is deliberate."
      facts={[
        { k: "Programme", v: "Play Group" },
        { k: "Age", v: "About 1.5 to 2.5 years" },
        { k: "Length of day", v: "2 hours" },
        { k: "Toilet trained?", v: "Not required" },
        { k: "Day care", v: "Available either side" },
      ]}
    >
      <h2>Is two too early?</h2>
      <p>
        Sometimes. A two-year-old who is still feeding to sleep, who has never been left with
        anybody but a parent or grandparent, and who is not yet saying much, will often do
        better starting at two and a half. There is no academic cost to waiting six months —
        nothing taught in Play Group is needed later.
      </p>
      <p>
        What two <i>is</i> good for: a child who follows other children around, who is bored
        at home, or whose parents are both back at work. The gain is not letters. It is being
        comfortable away from you, which is the whole job of this year.
      </p>

      <h2>What two hours actually contains</h2>
      <ul>
        <li>Arrival, shoes off, bag away — slower and more important than it sounds.</li>
        <li>Circle time: names, a song, who is here today.</li>
        <li>Messy play. Sand, water, dough, paint.</li>
        <li>Snack, eaten sitting down, mostly unaided by the end of the year.</li>
        <li>Outdoors in the {SCHOOL.playArea} play area.</li>
        <li>A story, then collection.</li>
      </ul>

      <h2>Settling in</h2>
      <p>
        You stay. For the first few days you are in the room, then outside it, then away for
        twenty minutes, then away. Some children are fine on day three and some take a month.
        We go at your child&rsquo;s pace rather than a schedule, and we will tell you honestly
        if we think they are not ready yet.
      </p>

      <h2>Nappies, naps and the practical things</h2>
      <p>
        Toilet training is not a condition of admission and we would rather you did not rush
        it for us. Two hours is short enough that a nap is not needed; if you want a longer
        day, day care runs either side of the Play Group morning to 6:30 PM.
      </p>

      <h2>Older or younger?</h2>
      <p>
        See <a href="/programmes">all five programmes</a> — Nursery at about two and a half,
        Euro Junior around three and a half, Euro Senior around four and a half. Children join
        where they fit rather than where their birthday says.
      </p>
    </LocalPage>
  );
}
