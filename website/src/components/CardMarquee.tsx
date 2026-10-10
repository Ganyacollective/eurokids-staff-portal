import Link from "next/link";
import { mediaUrl, type Card } from "@/lib/site";

// The posters drifting across the home page.
//
// The track holds the cards twice and slides exactly half its own width, so
// the moment the first copy leaves the screen the second is sitting in the
// identical place and the loop is invisible. That is also why the duration is
// worked out from the number of cards rather than fixed: a constant duration
// would make four cards crawl and forty cards fly past unreadably.
export default function CardMarquee({ cards, seconds = 90 }: { cards: Card[]; seconds?: number }) {
  if (!cards.length) return null;

  // Set in the hub. It is the time to travel one full length of the row, so
  // adding cards makes it slower rather than faster — which is right: the
  // speed a card passes your eye should not depend on how many there are.
  const dur = Math.max(10, seconds) * (cards.length / 8);
  const row = [...cards, ...cards];

  return (
    <section className="marquee" id="cards" aria-label="What we have been up to">
      <div className="marquee-track" style={{ ["--dur" as string]: `${dur.toFixed(1)}s` }}>
        {row.map((c, i) => {
          // The second copy is scenery. A screen reader that read it would
          // announce every event twice, and a keyboard would need two passes
          // to get through the row.
          const ghost = i >= cards.length;
          const art = mediaUrl(c.artwork_path);
          return (
            <Link
              key={`${c.id}-${i}`}
              href={`/c/${c.slug}`}
              className="card"
              aria-hidden={ghost || undefined}
              tabIndex={ghost ? -1 : undefined}
            >
              {art && (
                <img
                  src={art}
                  alt={ghost ? "" : c.title}
                  loading={i < 4 ? "eager" : "lazy"}
                  decoding="async"
                />
              )}
              <span className="card-watch" aria-hidden={ghost || undefined}>
                WATCH
                <br />
                NOW
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
