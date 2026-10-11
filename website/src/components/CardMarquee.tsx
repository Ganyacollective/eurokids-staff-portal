"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { mediaUrl, type Card } from "@/lib/site";

// The posters drifting across the home page.
//
// This was a CSS animation with `animation-play-state: paused` on hover,
// which has two faults you feel immediately. The row stopped when the cursor
// crossed the whitespace between cards, not the cards themselves — so it
// froze for no visible reason. And once stopped there was nothing to do with
// it: no way to push it along, no way to go back for the one you missed.
//
// So the position is driven here instead. One number, x, moved every frame by
// a velocity that is eased rather than switched: the row slows to a stop
// under the cursor and picks itself back up when you leave, and a drag or a
// trackpad swipe hands it your velocity and lets it coast back to its own.
//
// The track holds the cards twice and wraps at half its width, so the loop is
// seamless in both directions, including when you have flung it backwards.
export default function CardMarquee({
  cards,
  seconds = 90,
}: {
  cards: Card[];
  seconds?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const view = viewRef.current;
    if (!track || !view) return;

    // Someone who has asked their machine to stop moving things has asked for
    // a reason. The CSS turns the row into something they can scroll, and
    // none of the below runs.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    view.classList.add("is-live");

    let half = track.scrollWidth / 2;
    const measure = () => { half = track.scrollWidth / 2; };
    const ro = new ResizeObserver(measure);
    ro.observe(track);

    // Drift, in pixels per second. Derived from the duration set in the hub,
    // which is the time to travel one full length of the row.
    const drift = () => half / Math.max(8, seconds);

    let x = 0;
    let v = drift();
    let overCard = false;
    let dragging = false;
    let moved = 0;
    let lastFrame = performance.now();
    let lastX = 0;
    let lastT = 0;
    let flick = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      if (!dragging) {
        // Ease toward the velocity we want rather than snapping to it. The
        // time constant is what makes stopping read as braking; snapping
        // reads as a bug.
        const target = overCard ? 0 : drift();
        v += (target - v) * (1 - Math.exp(-dt / 0.3));
        x += v * dt;
      }

      if (half > 0) x = ((x % half) + half) % half;
      track.style.transform = `translate3d(${-x}px, 0, 0)`;
      raf = requestAnimationFrame(frame);
    };
    let raf = requestAnimationFrame(frame);

    // ── stop only over a card ──
    const onMove = (e: PointerEvent) => {
      if (!dragging) overCard = !!(e.target as Element)?.closest?.(".card");
      if (!dragging) return;

      const dx = e.clientX - lastX;
      x -= dx;
      moved += Math.abs(dx);
      const now = performance.now();
      flick = -dx / Math.max(0.008, (now - lastT) / 1000);
      lastX = e.clientX;
      lastT = now;
    };
    const onLeave = () => { if (!dragging) overCard = false; };

    // ── drag, on a trackpad or a finger ──
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragging = true;
      moved = 0;
      flick = 0;
      lastX = e.clientX;
      lastT = performance.now();
      view.setPointerCapture(e.pointerId);
      view.classList.add("is-dragging");
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      view.releasePointerCapture?.(e.pointerId);
      view.classList.remove("is-dragging");
      // Hand it the speed of the flick. The frame loop eases this back to
      // the drift on its own, so it coasts rather than stopping dead.
      v = Math.max(-5000, Math.min(5000, flick));
    };

    // A drag that ends on a card must not also open it.
    const onClick = (e: MouseEvent) => {
      if (moved > 6) { e.preventDefault(); e.stopPropagation(); }
    };

    // ── a two-finger swipe on the trackpad ──
    const onWheel = (e: WheelEvent) => {
      // Only take the gesture when it is clearly horizontal, or the page
      // cannot be scrolled past the row.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      x += e.deltaX;
      v = e.deltaX / 0.016;
    };

    view.addEventListener("pointermove", onMove);
    view.addEventListener("pointerleave", onLeave);
    view.addEventListener("pointerdown", onDown);
    view.addEventListener("pointerup", onUp);
    view.addEventListener("pointercancel", onUp);
    view.addEventListener("click", onClick, true);
    view.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      view.removeEventListener("pointermove", onMove);
      view.removeEventListener("pointerleave", onLeave);
      view.removeEventListener("pointerdown", onDown);
      view.removeEventListener("pointerup", onUp);
      view.removeEventListener("pointercancel", onUp);
      view.removeEventListener("click", onClick, true);
      view.removeEventListener("wheel", onWheel);
    };
  }, [seconds, cards.length]);

  if (!cards.length) return null;
  const row = [...cards, ...cards];

  return (
    <section
      className="marquee"
      ref={viewRef}
      id="cards"
      aria-label="What we have been up to"
    >
      <div className="marquee-track" ref={trackRef}>
        {row.map((c, i) => {
          // The second copy is scenery. A screen reader that read it would
          // announce every event twice, and a keyboard would need two passes
          // to get through the row.
          const ghost = i >= cards.length;
          const art = mediaUrl(c.artwork_path);
          return (
            <Link
              key={`${c.id}-${i}`}
              href={`/events/${c.slug}`}
              className="card"
              aria-hidden={ghost || undefined}
              tabIndex={ghost ? -1 : undefined}
              draggable={false}
            >
              {art && (
                <img
                  src={art}
                  alt={ghost ? "" : `${c.title} at EuroKids JMD Enclave preschool, Undri, Pune`}
                  loading={i < 4 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
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
