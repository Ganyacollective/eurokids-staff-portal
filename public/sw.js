/* EuroKids JMD Enclave — service worker.
   The app shell (the three HTML pages, the stylesheet, the brand assets) is
   served from cache and refreshed in the background, so the app opens
   instantly from the home screen. Data always goes to the network: fee
   balances and receipts must never be stale, and Supabase calls carry auth
   headers that must not be replayed from a cache. */

const VERSION = 'ek-v16';
const SHELL = [
  '/', '/hub.html', '/staff', '/portal.html', '/teacher', '/teacher.html',
  '/brand/portal.css', '/brand/hub.css?v=16', '/brand/enquiries.js?v=16', '/brand/email-signature.png',
  '/brand/icons/icon-192.png', '/brand/icons/icon-512.png',
  '/manifest.webmanifest',
];

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
    // Assets carry ?v= in their URL, so a new deploy is a new cache key and
    // cache-first is both instant and correct. Only the HTML documents go to
    // the network first — they are small, and they carry the version stamps.
    const isDoc = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '/staff' || url.pathname === '/teacher';
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const cached = await c.match(req);
        if (!isDoc && cached) {
          // refresh quietly for next time; the screen does not wait
          fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); }).catch(() => {});
          return cached;
        }
        const fresh = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
        const res = await Promise.race([fresh, new Promise((r) => setTimeout(() => r(null), 1200))]);
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
