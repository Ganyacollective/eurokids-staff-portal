import CardMarquee from "@/components/CardMarquee";
import IntakeHead from "@/components/IntakeHead";
import EnquiryForm from "@/components/EnquiryForm";
import { listCards, getSetting } from "@/lib/site";

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
    </>
  );
}
