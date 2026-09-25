// Budgts service worker — minimal: installable + a graceful offline page.
// No offline data (all data is server-side, RLS-scoped).
const CACHE = "budgts-shell-v5";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Only cache real hits: a 404/5xx (e.g. a chunk requested mid-deploy)
  // cached here would be served until the next CACHE bump.
  const fetchAndCache = () =>
    fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    });

  // Content-hashed build assets: cache-first. Their URL changes whenever
  // their bytes do, so a cached copy can never be stale.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.match(request).then((hit) => hit || fetchAndCache()));
    return;
  }

  // Un-hashed icons/brand art (/brand/*.png, /icon-*.png): stale-while-
  // revalidate. Served instantly from cache, refreshed in the background, so
  // replacing a file at the same path (a rebrand) shows up on the next visit
  // instead of never.
  if (/\.(?:svg|png|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const refresh = fetchAndCache();
        if (!hit) return refresh;
        event.waitUntil(refresh.catch(() => undefined));
        return hit;
      }),
    );
    return;
  }

  // Page navigations: network-first, fall back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
