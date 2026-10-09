/* Only public app-shell resources enter this cache. Account data belongs in
 * the per-user IndexedDB store, never in the shared service-worker cache. */
const CACHE_PREFIX = "apprenticeship-shell-";
const CACHE = `${CACHE_PREFIX}v2`;
const SHELL = ["/", "/season", "/sign-in", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // The first visit can load its scripts before a worker controls the page.
    // Precache every hashed script/style referenced by the public HTML shells.
    const assets = new Set();
    for (const path of ["/", "/season", "/sign-in"]) {
      const response = await cache.match(path);
      const html = await response.text();
      for (const match of html.matchAll(/(?:src|href)="([^" ]+)"/g)) {
        const url = new URL(match[1].replace(/&amp;/g, "&"), self.location.origin);
        if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) assets.add(url.pathname);
      }
    }
    await cache.addAll([...assets]);
  })());
  // Keep the current worker until its tabs close, so an update cannot interrupt drafts.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("authorization")) return;
  // Never cache auth callbacks (including their code), API calls, or RSC payloads.
  if (url.searchParams.has("code") || url.pathname.startsWith("/api/") || request.headers.has("rsc") || url.searchParams.has("_rsc")) return;
  const shellPath = ["/", "/season", "/sign-in"].includes(url.pathname);
  if (request.mode === "navigate" && shellPath) {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await caches.match(url.pathname, { cacheName: CACHE });
      return cached || Response.error();
    }));
    return;
  }
  const isStatic = url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname) && !shellPath;
  if (!isStatic || url.search) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  })());
});
