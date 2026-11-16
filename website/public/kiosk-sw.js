/* The reception tablet's service worker.
 *
 * It exists for two reasons, and neither is speed.
 *
 * 1. Android will only install a page as a real app — a WebAPK, opening with
 *    no address bar and its own icon in the launcher — if the site has a
 *    service worker with a fetch handler. Without one, "Add to Home screen"
 *    makes a bookmark that opens inside Chrome, chrome and all, and a parent
 *    at the desk can see the URL and wander off it.
 *
 * 2. The reception wifi drops. The form posts to the hub and that genuinely
 *    needs the network, but the page itself should not go blank while
 *    somebody is standing in front of it.
 *
 * Scoped to /kiosk by the registration, so the public site is untouched: the
 * marketing pages keep being served straight from the network, which is what
 * a site that changes with every deploy wants.
 */
const V = 'ek-kiosk-v2';   // bumped: manifest name and orientation changed

// The shell only. Not the card artwork — that is tens of megabytes of
// posters and the tablet does not need them to take an enquiry.
const SHELL = ['/kiosk'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Anything that is not the tablet's own page goes straight to the network.
  // The enquiry POST, the kiosk key, the hub's API, Supabase: a cached reply
  // to any of those is worse than no reply.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (!url.pathname.startsWith('/kiosk')) return;

  // Network first, so a deploy reaches the tablet on its next launch rather
  // than whenever somebody thinks to clear it. The cache is the fallback for
  // a dropped connection, not the default.
  e.respondWith(
    caches.open(V).then(async (c) => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) c.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await c.match(req)) || (await c.match('/kiosk')) || new Response('Offline', { status: 503 });
      }
    }),
  );
});
