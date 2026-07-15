// Minimal PWA service worker: precache the app shell, network-first for
// navigations, stale-while-revalidate for other assets, never cache Google
// APIs (spec §9). Bump CACHE to purge every client's old cache on activate.
const CACHE = "socialplanner-v1";
const SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (e) => {
  // Precache the shell, but do NOT skipWaiting here: a new build should sit in
  // "waiting" so the app can show a "Refresh to update" prompt and let the user
  // choose when to jump to it (see main.tsx + UpdatePrompt).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

// The app asks us to activate the new version when the user taps Refresh.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("google.com")) {
    return; // never cache API/auth traffic
  }
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/index.html").then((r) => r || fetch(e.request)))
    );
    return;
  }
  // Stale-while-revalidate: serve the cached copy instantly (offline-first),
  // but always kick off a network fetch to refresh the cache in the
  // background, so the NEXT load gets fresh assets. Cache-first-forever (the
  // old behavior) could pin a client to a stale build indefinitely.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      });
      return cached || network;
    })
  );
});
