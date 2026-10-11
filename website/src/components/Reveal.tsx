"use client";

import { useEffect } from "react";

// One observer for the whole site.
//
// The alternative — a wrapper component around every animated element —
// turns each one into a client component and scatters the timing across
// twenty files. Here a page only marks what should arrive (data-reveal, and
// optionally --i for its place in a stagger) and this decides when.
//
// It adds `motion` to <html> itself. The CSS only hides things inside
// html.motion, so if this never runs — JavaScript off, a script error, an
// old browser — every element is simply visible. Content that depends on JS
// to become visible is content that sometimes isn't.
export default function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!els.length) return;

    // Somebody who has asked their machine to stop moving things has asked
    // for a reason. Mark everything arrived and do nothing else.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.classList.add("motion");
    if (still || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }

    // Anything already on screen at load should not fade in — a hero that
    // animates on first paint reads as a page still loading.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target); // once only; this is an entrance, not a state
        }
      },
      // Fire a little before the element reaches the fold, so it has
      // finished arriving by the time it is properly in view.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.01 }
    );

    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92) el.classList.add("is-in");
      else io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return null;
}
