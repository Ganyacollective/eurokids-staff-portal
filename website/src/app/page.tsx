import CardMarquee from "@/components/CardMarquee";
import IntakeHead from "@/components/IntakeHead";
import EnquiryForm from "@/components/EnquiryForm";
import PageHead from "@/components/PageHead";
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
      {/* The page had no hero at all — it opened straight onto a moving row
          of posters. That is why it read as something assembled rather than
          designed: a visitor arrived with nothing told to them and no
          hierarchy to follow. One sentence, at the largest size on the
          scale, and then the posters as evidence for it. */}
      <section className="hero wrap">
        <PageHead
          eyebrow="Admissions open 26–27"
          title={
            <>
              A place your child
              <br />
              runs into.
            </>
          }
          lead="Preschool and day care in Undri, Pune. Est. 2017, and trusted by more than three thousand families since."
          display
        >
          <div className="hero-do">
            <a className="btn btn-solid" href="#enquire">
              Book a visit
            </a>
            <a className="btn btn-quiet" href="tel:+912069622686">
              020 6962 2686
            </a>
          </div>
        </PageHead>
      </section>

      {/* A year of the school, scrolling past. A family at the reception
          tablet sees this before they reach the first question, which is a
          better introduction than any sentence we could write. */}
      <CardMarquee cards={cards} seconds={Number(seconds) || 55} />

      <section className="tf-section" id="enquire">
        <div className="tf-wrap">
          <IntakeHead />
          <EnquiryForm />
        </div>
      </section>
    </>
  );
}
