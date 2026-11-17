/* EuroKids JMD Enclave — service worker.
   The app shell (the three HTML pages, the stylesheet, the brand assets) is
   served from cache and refreshed in the background, so the app opens
   instantly from the home screen. Data always goes to the network: fee
   balances and receipts must never be stale, and Supabase calls carry auth
   headers that must not be replayed from a cache. */

// One number — and it has to be the SAME number hub.html asks for.
//
// It was not. This said 93 while hub.html asked for `hub.css?v=84` and
// `enquiries.js?v=84`, and had asked for 84 for nine deploys running. The
// stamp is the cache key, so nine redesigns went out to a URL nobody's
// browser ever requested, while every browser kept asking for the v=84 URL
// it already had. Bumping this number did nothing, because this number was
// not in the URL being fetched. Three screens of new CSS and a rewritten
// table shipped correctly to the server and were invisible on the screen.
//
// So: when hub.css or enquiries.js changes, bump V here AND the three ?v=
// stamps in public/hub.html, together. They are one number.
const V = 123;
const VERSION = `ek-v${V}`;
// Bare paths, not stamped ones. A stamped entry here can disagree with what
// the page asks for — which is exactly what went wrong — and the stamped URL
// gets cached on first use anyway.
const SHELL = [
  '/', '/hub.html', '/staff', '/portal.html', '/teacher', '/teacher.html',
  '/brand/portal.css', '/brand/hub.css', '/brand/enquiries.js', '/brand/email-signature.png',
  '/brand/icons/icon-192.png', '/brand/icons/icon-512.png',
  '/manifest.webmanifest',
];
// The two files that change on nearly every deploy. Cache-first on these is
// how a stale screen survives a reload, and 25 KB gzipped behind a login is
// not worth that risk: they go to the network first and fall back to cache
// only when the network is gone.
const VOLATILE = ['/brand/hub.css', '/brand/enquiries.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isShell = (url) =>
  url.origin === self.location.origin &&
  (SHELL.includes(url.pathname) || url.pathname.startsWith('/brand/') || url.pathname.startsWith('/_next/static/'));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never touch data: Supabase, our own API, CDN scripts. Network only.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (isShell(url)) {
    // The HTML documents, and the stylesheet and script that change with
    // them, go to the network first. Everything else — icons, fonts, the
    // hashed /_next/static bundles, whose names change when they change —
    // is cache-first, because for those the URL really is the version.
    const isDoc = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '/staff' || url.pathname === '/teacher'
      || VOLATILE.includes(url.pathname);
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const cached = await c.match(req);
        if (!isDoc && cached) {
          // refresh quietly for next time; the screen does not wait
          fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); }).catch(() => {});
          return cached;
        }
        const fresh = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
        // How long to wait for the real thing before falling back to the
        // copy we already have.
        //
        // This was 1200ms for everything, and that is the reason "I pushed it
        // and I still cannot see it" kept happening. On a slow connection the
        // timer wins, the cached HTML is served, and the screen is a deploy
        // behind — then the fetch finishes and quietly updates the cache, so
        // the SECOND reload is correct and the first is not. The change was
        // live the whole time.
        //
        // A document is the thing that carries the new code, so it gets long
        // enough that a normal connection always wins; the stylesheet and the
        // script keep the short fuse, because they are small and a stale one
        // is visible rather than silent. Either way the fallback still works
        // when the network is genuinely gone — the race only ever ends early
        // on a timeout, never on a failure.
        const wait = isDoc && !VOLATILE.includes(url.pathname) ? 6000 : 1200;
        const res = await Promise.race([fresh, new Promise((r) => setTimeout(() => r(null), wait))]);
        return res || cached || (await fresh) || new Response('Offline', { status: 503 });
      })
    );
    return;
  }
});

// Push notifications (for the reminder digest, once subscribed).
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title || 'EuroKids Hub', {
    body: data.body || '',
    icon: '/brand/icons/icon-192.png',
    badge: '/brand/icons/icon-192.png',
    data: { url: data.url || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});
