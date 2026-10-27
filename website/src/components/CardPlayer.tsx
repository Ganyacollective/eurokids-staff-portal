"use client";

import { useEffect, useRef } from "react";
import { mediaUrl, embedUrl, type Card } from "@/lib/site";

// The video, over the page it was opened from.
//
// The old site gave every event a page of its own because it could not play
// a video in place. That is a page load, a back button and a lost scroll
// position between a parent and twelve seconds of their child dancing. Now
// the poster opens the film where it is.
//
// The event pages stay. Some of them are on printed QR codes, and a page
// with the photographs on it is still the right thing for an event with no
// film — so a card with no video still navigates, exactly as before. Only a
// card that has something to play is intercepted.

export const hasVideo = (c: Card) => !!(c.video_path || c.video_url);

export default function CardPlayer({
  cards, index, onClose, onNext,
}: {
  cards: Card[];
  index: number;
  onClose: () => void;
  onNext: () => void;
}) {
  const card = cards[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  const file = card?.video_path ? mediaUrl(card.video_path) : null;
  const frame = !file ? embedUrl(card?.video_url) : null;
  // Is there a second film to go on to, or is this the only one?
  const more = cards.filter(hasVideo).length > 1;

  // Escape closes, and the page behind does not scroll while this is over it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && more) onNext();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The keyboard lands on Back rather than wherever it was on the page
    // underneath, which is now hidden behind a black sheet.
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, onNext, more]);

  if (!card) return null;

  return (
    <div
      className="vplay"
      role="dialog"
      aria-modal="true"
      aria-label={`${card.title} — video`}
      // Clicking the surround closes it. Clicking the film does not, or
      // every attempt to scrub would shut the thing.
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="vplay-bar">
        <button ref={closeRef} className="vplay-btn" onClick={onClose}>
          <span aria-hidden>&larr;</span> Take me back
        </button>
        <span className="vplay-title">{card.title}</span>
        {more ? (
          <button className="vplay-btn vplay-next" onClick={onNext}>
            Watch the next one <span aria-hidden>&rarr;</span>
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="vplay-stage">
        {file ? (
          // A file we host: real controls, and it starts by itself because
          // the parent has just asked for it by tapping the poster.
          <video
            key={file}
            src={file}
            controls
            autoPlay
            playsInline
            poster={card.artwork_path ? mediaUrl(card.artwork_path) ?? undefined : undefined}
          />
        ) : frame ? (
          <iframe
            key={frame}
            src={`${frame}${frame.includes("?") ? "&" : "?"}autoplay=1&rel=0&playsinline=1`}
            title={card.title}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : null}
      </div>
    </div>
  );
}
