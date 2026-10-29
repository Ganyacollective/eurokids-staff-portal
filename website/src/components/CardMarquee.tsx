"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { mediaUrl, type Card } from "@/lib/site";
import CardPlayer, { hasVideo } from "./CardPlayer";

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
  // Which film is playing over the page, if any.
  const [playing, setPlaying] = useState<number | null>(null);
  const withVideo = cards.filter(hasVideo);
  const nextVideo = () => {
    if (playing === null) return;
    const here = withVideo.findIndex((c) => c.id === cards[playing].id);
    const next = withVideo[(here + 1) % withVideo.length];
    setPlaying(cards.findIndex((c) => c.id === next.id));
  };

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

    // ── press, drag, or neither ──
    //
    // The pointer is captured late, and that is the whole point.
    //
    // Capturing it on pointerdown — which is what this did — retargets every
    // later pointer event at this section. The browser then works out the
    // click from a pointerdown and a pointerup that both landed on the
    // section rather than on the card, so the click was delivered to the
    // section: the <Link> never saw it, its onClick never ran, and the href
    // was never followed either. No card on the row could be opened at all,
    // by mouse or by thumb. Nothing on screen looked broken, which is worse
    // than if it had.
    //
    // So the press is left alone until it has actually travelled. Under the
    // threshold it is a click and reaches the card untouched; past it, the
    // row takes the pointer and becomes a drag.
    const DRAG = 6;            // px of travel before a press becomes a drag
    let down = false;
    let startX = 0;

    const onMove = (e: PointerEvent) => {
      if (!down) { overCard = !!(e.target as Element)?.closest?.(".card"); return; }

      // Distance from where the finger went down, not path length: a hand
      // that wobbles left and right while pressing has still not dragged.
      moved = Math.abs(e.clientX - startX);

      if (!dragging) {
        if (moved <= DRAG) return;
        dragging = true;
        view.setPointerCapture(e.pointerId);
        view.classList.add("is-dragging");
        lastX = e.clientX;                 // measure the throw from here
        lastT = performance.now();
        return;
      }

      const dx = e.clientX - lastX;
      x -= dx;
      const now = performance.now();
      flick = -dx / Math.max(0.008, (now - lastT) / 1000);
      lastX = e.clientX;
      lastT = now;
    };
    const onLeave = () => { if (!down && !dragging) overCard = false; };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      down = true;
      dragging = false;
      moved = 0;
      flick = 0;
      startX = e.clientX;
      lastX = e.clientX;
      lastT = performance.now();
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      if (!dragging) return;               // a plain click: nothing to undo
      dragging = false;
      try { view.releasePointerCapture?.(e.pointerId); } catch { /* already gone */ }
      view.classList.remove("is-dragging");
      // Hand it the speed of the flick. The frame loop eases this back to
      // the drift on its own, so it coasts rather than stopping dead.
      v = Math.max(-5000, Math.min(5000, flick));
    };

    // A drag that ends on a card must not also open it.
    const onClick = (e: MouseEvent) => {
      if (moved > DRAG) { e.preventDefault(); e.stopPropagation(); }
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
              // A card with a film plays it here. A card without one still
              // goes to its page, where the photographs are — and the href
              // stays on both, so the link is real, crawlable, and works on
              // a middle click or "open in new tab".
              onClick={(e) => {
                // Not `ghost ||` — the second copy of the row is scenery to a
                // screen reader, but to a mouse it is an ordinary card sitting
                // in front of somebody. Half the row is the duplicate, so
                // excluding it meant a film opened in place on one copy of a
                // card and silently navigated away on the other, depending
                // only on how far the row happened to have drifted. The index
                // is already folded back with % cards.length.
                if (!hasVideo(c)) return;
                // A drag that ends on a card never reaches here: the marquee
                // already swallows that click in the capture phase.
                e.preventDefault();
                setPlaying(i % cards.length);
              }}
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
                {hasVideo(c) ? <>WATCH<br />NOW</> : <>SEE<br />PHOTOS</>}
              </span>
            </Link>
          );
        })}
      </div>

      {playing !== null && (
        <CardPlayer
          cards={cards}
          index={playing}
          onClose={() => setPlaying(null)}
          onNext={nextVideo}
        />
      )}
    </section>
  );
}
