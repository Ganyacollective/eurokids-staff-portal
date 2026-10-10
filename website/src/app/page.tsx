import CardMarquee from "@/components/CardMarquee";
import IntakeHead from "@/components/IntakeHead";
import EnquiryForm from "@/components/EnquiryForm";
import { listCards, getSetting } from "@/lib/site";

export const revalidate = 600;

export default async function Home() {
  const [cards, seconds] = await Promise.all([
    listCards(),
    getSetting("marquee_seconds", "55"),
  ]);

  return (
    <>
      {/* The cards are the first thing, with nothing above them. On the
          tablet at reception a family scrolls past a year of the school
          before they reach the first question, which is a better
          introduction than any sentence we could write. */}
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
