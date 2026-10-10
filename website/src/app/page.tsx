import CardMarquee from "@/components/CardMarquee";
import EnquiryForm from "@/components/EnquiryForm";
import { listCards, getSetting } from "@/lib/site";

// Rebuilt every ten minutes. So the page is static HTML for almost every
// visitor, which is what makes it open quickly on a phone on mobile data,
// which is how most parents arrive here.
export const revalidate = 600;

export default async function Home() {
  const [cards, seconds] = await Promise.all([
    listCards(),
    getSetting("marquee_seconds", "90"),
  ]);

  return (
    <>
      {/* The cards are the first thing, with nothing above them. They are what
          the school actually looks like; a headline about admissions is a
          claim, and a row of children at a Holi party is evidence. */}
      <CardMarquee cards={cards} seconds={Number(seconds) || 90} />

      <section className="tf-section" id="enquire">
        <div className="tf-wrap">
          <p className="tf-kicker">Admissions open 26-27 · Undri, Pune</p>
          <h1 className="tf-title">Come and see us.</h1>
          <p className="tf-sub">
            A few quick questions and we will call you to arrange a visit.
          </p>
          <EnquiryForm />
        </div>
      </section>
    </>
  );
}
