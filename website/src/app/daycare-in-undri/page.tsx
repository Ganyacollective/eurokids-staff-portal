import type { Metadata } from "next";
import LocalPage from "@/components/LocalPage";
import { SCHOOL } from "@/lib/local";

export const metadata: Metadata = {
  title: "Day Care in Undri, Pune",
  description:
    "Day care in Undri, Pune. 8:00 AM to 6:30 PM, Mon to Sat, ages 1.5 to 10. Meals, nap, homework help and 5,000 sq ft of outdoor play. Open to any school.",
  alternates: { canonical: "/daycare-in-undri" },
  keywords: [
    "day care in Undri",
    "daycare Undri Pune",
    "creche in Undri",
    "after school care Undri",
    "day care near NIBM",
    "full day day care Pune",
  ],
};

export default function DaycareInUndri() {
  return (
    <LocalPage
      eyebrow="Day care"
      title="Day care in Undri, until half past six"
      lead="For families where both parents work full time. Children from 1.5 to 10 years, 8:00 AM to 6:30 PM, Monday to Saturday — including the children who go to big school elsewhere and come to us afterwards."
      facts={[
        { k: "Hours", v: "8:00 AM – 6:30 PM, Mon to Sat" },
        { k: "Ages", v: "1.5 to 10 years" },
        { k: "Includes", v: "Meals, nap, homework help, outdoor play" },
        { k: "Open to", v: "Children from any school" },
        { k: "Fees", v: <a href="/makeapayment">Pay for day care</a> },
      ]}
    >
      <h2>What a day care day looks like</h2>
      <p>
        Children arrive from 8:00 AM. Preschoolers go into their own class for the morning
        and come back at half past twelve. Older children arrive from their own school
        through the afternoon.
      </p>
      <p>
        Lunch, then a proper nap for the little ones on their own bedding. Afternoons are
        homework first and then outside — the same {SCHOOL.playArea} play area the preschool
        uses, which by three o&rsquo;clock belongs entirely to the day care children. Snack
        at four. Collection any time until 6:30 PM.
      </p>

      <h2>Honest answers to the things parents actually ask</h2>
      <ul>
        <li>
          <b>Can my child come only after school?</b> Yes. Many do, from schools across
          Undri and NIBM Road. They do not have to attend the preschool here.
        </li>
        <li>
          <b>Can we use it only on some days?</b> Talk to the office. Monthly is simplest,
          but we would rather find something that works than lose you to a centre that is
          only slightly closer.
        </li>
        <li>
          <b>What happens if I am late?</b> Ring us. Somebody stays with your child. Nobody
          is put outside at 6:31.
        </li>
        <li>
          <b>Who is with them?</b> Our own staff, in our own building, the same people every
          day. Day care is not subcontracted to someone else.
        </li>
      </ul>

      <h2>Why in the same building matters</h2>
      <p>
        A lot of day care in Undri runs out of a flat some distance from the school, with a
        van in between. For a four-year-old that is a transfer, a new set of adults and a
        second set of rules in the middle of a long day.
      </p>
      <p>
        Here, the child finishes class and walks down the corridor. Same building, same play
        area, same faces. It is the whole reason the afternoons are calm.
      </p>
    </LocalPage>
  );
}
