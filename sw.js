/* =========================================================
   ARSLAN • FACTURAS — KIWI EDITION
   Service Worker (PWA Offline Cache)
   ========================================================= */

const SW_VERSION = "af-kiwi-v1";
const CACHE_STATIC = `static-${SW_VERSION}`;
const CACHE_RUNTIME = `runtime-${SW_VERSION}`;

// Archivos locales a precache (ajusta si cambias nombres)
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

// Util: responde con cache primero y luego red
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  const res = await fetch(req);
  cache.put(req, res.clone());
  return res;
}

// Util: red primero y fallback cache (bueno para APIs/CDN)
async function networkFirst(req) {
  const cache = await caches.open(CACHE_RUNTIME);
  try {
    const res = await fetch(req);
    // cachea incluso opaque (CDN) para offline
    cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    // fallback: si es navegación, intenta index
    if (req.mode === "navigate") {
      const staticCache = await caches.open(CACHE_STATIC);
      const index = await staticCache.match("./index.html");
      if (index) return index;
    }
    throw new Error("offline");
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC);
    await cache.addAll(PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (![CACHE_STATIC, CACHE_RUNTIME].includes(k)) return caches.delete(k);
      })
    );
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Navegación: index.html como fallback
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // Solo GET
  if (req.method !== "GET") return;

  // Archivos locales -> cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // CDNs/externos -> network-first con cache runtime (offline friendly)
  event.respondWith(networkFirst(req));
});
