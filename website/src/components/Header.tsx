"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Teachers is not a page here. It is the way a member of staff gets to the
// leave form and the rest of the staff portal, which lives on the admin
// domain — so it leaves the site entirely.
const LINKS = [
  { href: "/", label: "Home" },
  { href: "/summercamp", label: "Summercamp" },
  { href: "https://admin.eurokidsjmdenclave.org/staff", label: "Teachers", external: true },
  { href: "/annual-function", label: "Annual Function" },
  { href: "/pay", label: "Make A Payment" },
  { href: "/contact", label: "Contact Us" },
];

export default function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // The sheet must not survive a navigation, or you tap a link and arrive at
  // the new page with the menu still covering it.
  useEffect(() => setOpen(false), [path]);

  // Nor should it survive the window growing past the breakpoint that hides
  // its close button.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 900px)");
    const close = () => mq.matches && setOpen(false);
    mq.addEventListener("change", close);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => { mq.removeEventListener("change", close); window.removeEventListener("keydown", esc); };
  }, [open]);

  const item = (l: (typeof LINKS)[number]) =>
    l.external ? (
      <a key={l.href} href={l.href}>{l.label}</a>
    ) : (
      <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
        {l.label}
      </Link>
    );

  return (
    <>
      <header className="nav">
        <nav className="wrap nav-in" aria-label="Main">
          <Link href="/" className="brand">
            <span className="dot" aria-hidden />
            EuroKids JMD Enclave
          </Link>
          <div className="nav-links">{LINKS.map(item)}</div>
          <button
            className="nav-toggle"
            aria-expanded={open}
            aria-controls="nav-sheet"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden>
              {open ? (
                <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M3 3l16 10M19 3L3 13" />
                </g>
              ) : (
                <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M1 2h20M1 8h20M1 14h20" />
                </g>
              )}
            </svg>
          </button>
        </nav>
      </header>
      {open && (
        <div className="nav-sheet" id="nav-sheet">
          {LINKS.map(item)}
        </div>
      )}
    </>
  );
}
