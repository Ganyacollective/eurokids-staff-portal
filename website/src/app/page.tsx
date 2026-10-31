import Link from "next/link";
import CardMarquee from "@/components/CardMarquee";
import IntakeHead from "@/components/IntakeHead";
import EnquiryForm from "@/components/EnquiryForm";
import { listCards, getSetting } from "@/lib/site";
import { SCHOOL, HOURS, NEARBY } from "@/lib/local";

// A safety net, not the mechanism. The hub calls /api/revalidate the moment
// a card changes, so an edit shows up at once; this is only here to catch
// anything that misses that call. It used to be 600, which meant an edit
// could take ten minutes to appear — long enough for the person who made it
// to conclude the whole thing was broken.
export const revalidate = 60;

export default async function Home() {
  const [cards, seconds] = await Promise.all([
    listCards(),
    getSetting("marquee_seconds", "55"),
  ]);

  return (
    <>
      {/* The posters are the first thing, with nothing above them. I had put
          a hero here; Abhinav took it out, and he is right that a family at
          the reception tablet should meet a year of the school before they
          meet a sentence about it. */}
      <CardMarquee cards={cards} seconds={Number(seconds) || 55} />

      <section className="tf-section" id="enquire">
        <div className="tf-wrap">
          <IntakeHead />
          {/* Which of the two sites this is gets worked out in the browser
              from the address, and the key is fetched from an endpoint that
              only answers on the tablet's host. Deliberately not read here
              with headers(): that would opt this page out of being cached
              and make every visitor to the public site wait on a fresh
              render, to answer a question only the tablet ever asks. */}
          <EnquiryForm />
        </div>
      </section>

      {/* Below the form, deliberately.
       *
       * The posters and the form stay the whole of the first screen — that was
       * the decision and nothing here moves it. But this page carried 163
       * words, which is the one real weakness in an otherwise well-built site:
       * it is the page that should answer "preschool in Undri", and it said
       * almost nothing a search engine or a parent could read.
       *
       * So: the questions people actually ring up and ask, answered plainly,
       * from lib/local.ts so they cannot drift from the rest of the site.
       * Every one of these is a fact the school already publishes. The links
       * are the other half of the point — the pages that do the ranking were
       * reachable only from the footer. */}
      <section className="tf-section" aria-labelledby="ask">
        <div className="wrap">
          <h2 id="ask">What parents ask before they visit</h2>

          <h3>How old does my child have to be?</h3>
          <p>
            Play Group takes children from about 1.5 years, and Senior KG runs to
            about 5.5. Day care takes children up to 10, including school-going
            children who come to us after their own school day.{" "}
            <Link href="/programmes">The four programmes are set out here</Link>,
            with what a day looks like in each.
          </p>

          <h3>What are the timings?</h3>
          <ul>
            {HOURS.map((h) => (
              <li key={h.what}>
                <strong>{h.what}</strong> — {h.when}
              </li>
            ))}
          </ul>
          <p>
            Day care runs past the end of the preschool morning, so one drop-off
            covers both.{" "}
            <Link href="/daycare-in-undri">More on how day care works</Link>.
          </p>

          <h3>Where exactly are you?</h3>
          <p>
            {SCHOOL.street}, {SCHOOL.locality} {SCHOOL.postcode} — opposite Marvel
            Isola and beside the Corinthians Club. Families come to us from{" "}
            {NEARBY.slice(0, -1).join(", ")} and {NEARBY[NEARBY.length - 1]}.{" "}
            <a href={SCHOOL.maps} target="_blank" rel="noopener">
              Open it in Google Maps
            </a>
            , or read about the school for{" "}
            <Link href="/preschool-in-undri">parents in Undri</Link> and{" "}
            <Link href="/preschool-in-mohammadwadi">Mohammadwadi</Link>.
          </p>

          <h3>Can we just come and look?</h3>
          <p>
            Yes — any working day between{" "}
            {HOURS.find((h) => h.what === "Office")?.when}. There is no
            appointment and nothing to book. Ask to see the play area and the
            room your child would actually be in, and ask what the fee includes
            before you pay anything. That last one is worth asking everywhere,
            not only here —{" "}
            <Link href="/how-to-choose-a-preschool-in-undri">
              what to look for when you compare preschools
            </Link>
            .
          </p>

          <h3>Is this the EuroKids on Pisoli Road?</h3>
          <p>
            No. There is more than one EuroKids near Undri and parents mix them
            up constantly. We are the JMD Enclave branch, open since{" "}
            {SCHOOL.founded}, run by Neeta Saxena.{" "}
            <Link href="/which-eurokids-in-undri">
              Here is how to tell the Undri branches apart
            </Link>
            , so you ring the right one.
          </p>

          <p>
            Anything else, call{" "}
            <a href={SCHOOL.phoneHref}>{SCHOOL.phone}</a> or{" "}
            <a href={SCHOOL.whatsappHref} target="_blank" rel="noopener">
              message us on WhatsApp
            </a>
            . <Link href="/faq">The longer list of questions is here</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
