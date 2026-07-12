// v13 — stop caching _next/static/ entirely. Chunks have content-hash names
// + immutable Cache-Control from nginx, so browser HTTP cache handles them
// perfectly. SW-caching was layering a second cache on top that occasionally
// served stale entries after deploy, producing ChunkLoadErrors that bubbled
// up as the Next.js "Oops!" screen.
const CACHE_NAME = "kino-v21-force-free";
const IMG_CACHE = "kino-images-v2";
const MAX_IMG_CACHE = 200;

self.addEventListener("install", (event) => {
  // No precache — precache can fail on flaky networks and block the SW
  // from ever activating. Static assets get cached on first request instead.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Drop EVERY cache that isn't the current pair. This evicts kino-v2,
      // kino-v5-mobile-redesign, and anything else from older SW versions.
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== IMG_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
      // Broadcast to every open tab — they'll reload to pick up the new bundle.
      // This eliminates the "Oops!" / ChunkLoadError window after a deploy.
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) {
        try { c.postMessage({ type: "SW_RELOAD", version: CACHE_NAME }); } catch {}
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const req = event.request;
  const url = new URL(req.url);

  // HTML documents — go straight to network, no caching. This guarantees
  // users always get a fresh HTML that references current chunk hashes.
  // Detect by destination ("document") OR by Accept header (covers navigation).
  if (
    req.mode === "navigate" ||
    req.destination === "document" ||
    (req.headers.get("accept") || "").includes("text/html")
  ) {
    return; // Let the browser handle it normally — no SW interception.
  }

  // Images (TMDB + next/image) — cache-first, trim LRU
  if (
    url.hostname === "image.tmdb.org" ||
    url.pathname.startsWith("/_next/image")
  ) {
    event.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((response) => {
            if (response.ok) {
              cache.put(req, response.clone());
              cache.keys().then((keys) => {
                if (keys.length > MAX_IMG_CACHE) {
                  keys.slice(0, keys.length - MAX_IMG_CACHE).forEach((k) => cache.delete(k));
                }
              });
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // _next/static/ — DO NOT intercept. Browser HTTP cache (with the
  // `Cache-Control: immutable, max-age=31536000` we set in nginx) handles
  // them perfectly; layering SW caching on top caused stale-chunk bugs
  // after deploys.

  // Everything else (API, fonts, etc.) — just go to network, no SW caching.
});
