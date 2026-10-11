import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCard, listCards, mediaUrl, embedUrl } from "@/lib/site";

// A safety net, not the mechanism. The hub calls /api/revalidate the moment
// a card changes, so an edit shows up at once; this is only here to catch
// anything that misses that call. It used to be 600, which meant an edit
// could take ten minutes to appear — long enough for the person who made it
// to conclude the whole thing was broken.
export const revalidate = 60;

// Every published card gets a page built ahead of time, so Watch now opens
// instantly rather than waiting on a round trip to the database.
export async function generateStaticParams() {
  return (await listCards()).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getCard(slug);
  if (!found) return { title: "Not found" };
  const art = mediaUrl(found.card.artwork_path);
  return {
    title: found.card.title,
    // The fallback was "<Title> at EuroKids JMD Enclave, Undri." — 41
    // characters, which is a description in name only: too thin for a
    // search result and nothing for an answer engine to extract. If the
    // hub has not been given a blurb, say something that stands on its own.
    description:
      found.card.blurb ||
      `${found.card.title} at EuroKids JMD Enclave, the preschool and day care in Undri, Pune. Photos from the day, and what the children did.`,
    openGraph: {
      title: found.card.title,
      description: found.card.blurb || undefined,
      images: art ? [art] : undefined,
    },
  };
}

export default async function CardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getCard(slug);
  if (!found) notFound();
  const { card, media } = found;

  const frame = embedUrl(card.video_url);
  const file = mediaUrl(card.video_path);

  return (
    <article className="card-page">
      <div className="wrap">
        <Link href="/" className="back">← Everything else</Link>
        <h1 className="card-title">{card.title}</h1>
        {card.blurb && (
          <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "var(--fs-lead)",
                      maxWidth: 620, margin: "-18px auto 30px" }}>
            {card.blurb}
          </p>
        )}

        {(file || frame) && (
          <div className="player">
            {file ? (
              // An uploaded film. controls, and nothing else: no autoplay, no
              // sound starting by itself in somebody's office.
              <video src={file} controls preload="metadata" playsInline
                     poster={mediaUrl(card.artwork_path) || undefined} />
            ) : (
              <iframe
                src={frame!}
                title={card.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        )}

        {media.length > 0 && (
          <div className="gallery">
            {media.map((m) => {
              const src = mediaUrl(m.path)!;
              return (
                <figure key={m.id}>
                  {m.kind === "video" ? (
                    <video src={src} controls preload="metadata" playsInline />
                  ) : (
                    <img src={src} alt={m.caption || `${card.title} at EuroKids JMD Enclave preschool, Undri, Pune`} loading="lazy" decoding="async" />
                  )}
                  {m.caption && <figcaption>{m.caption}</figcaption>}
                </figure>
              );
            })}
          </div>
        )}

        {!file && !frame && media.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--muted)" }}>
            Photographs from this one are on their way.
          </p>
        )}
      </div>

      {/* An event page is where a parent lands from a shared photo link.
          Without this it is a dead end — for them, and for a crawler that
          has just found fourteen pages with no route to the rest of the
          site. */}
      <aside className="event-more wrap">
        <h2>About the school</h2>
        <p>
          EuroKids JMD Enclave is a <a href="/preschool-in-undri">preschool in Undri, Pune</a>,
          with <a href="/daycare-in-undri">day care until 6:30 PM</a> in the same building.
          Admissions are open for 26&ndash;27 — <a href="/programmes">see the programmes</a>,{" "}
          <a href="/faq">read what parents ask</a>, or walk in on any working morning.
        </p>
      </aside>
    </article>
  );
}
