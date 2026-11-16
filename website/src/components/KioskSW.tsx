"use client";

import { useEffect } from "react";

// Registers the tablet's service worker, and only the tablet's.
//
// Android installs a page as a real app — its own icon, no address bar, its
// own entry in the launcher — only when the site has a service worker with a
// fetch handler. Without one, "Add to Home screen" makes a bookmark that
// opens inside Chrome with the URL on show, which a parent at the desk can
// read and tap out of.
//
// Scoped to /kiosk deliberately. The script sits at the root so it COULD
// control the whole site, and it must not: the public pages change with every
// deploy and should keep coming straight from the network. A marketing site
// quietly served from a cache is how a price or a date goes stale on a screen
// nobody is looking at.
export default function KioskSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/kiosk-sw.js", { scope: "/kiosk" })
      .catch(() => {
        // Not fatal. The form still works and still takes the photograph;
        // the tablet just installs as a bookmark rather than as an app.
      });
  }, []);
  return null;
}
