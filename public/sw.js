// The production build replaces these markers with its complete asset list.
const BUILD_ID = "__YOMIKURA_BUILD_ID__";
const PRECACHE_ASSETS = /*__YOMIKURA_PRECACHE__*/[];
const CACHE_NAME = `yomikura-shell-${BUILD_ID}`;
const INDEX_URL = "/index.html";

self.addEventListener("install", (event) => {
  // A worker waits until its entire generation is available. Existing tabs keep
  // their previous worker until they close; no reading session is force-reloaded.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS.map((url) => new Request(url, { cache: "reload" })))));
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE_NAME && (name.startsWith("yomikura-shell-") || /^yomikura-v\d+$/.test(name))) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.includes("@vite") || url.pathname === "/sw.js") return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      // Keep index and lazy chunks in the same generation, including a never
      // visited deep link opened with both the app server and backend offline.
      const cached = await (await caches.open(CACHE_NAME)).match(INDEX_URL);
      return cached || fetch(request);
    })());
    return;
  }
  if (!PRECACHE_ASSETS.includes(url.pathname)) return;
  event.respondWith((async () => (await (await caches.open(CACHE_NAME)).match(url.pathname)) || fetch(request))());
});
