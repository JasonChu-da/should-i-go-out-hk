/* global self, caches, fetch, Request, Response, URL */

// HARD RULE: Increment CACHE_VERSION whenever this file, /offline.html, or
// CORE_ASSETS changes. An installing worker must never write to an active
// worker's cache.
const CACHE_VERSION = "2026-07-30-2";
const CACHE_PREFIX = "go-out-";
const CORE_CACHE = `${CACHE_PREFIX}core-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-${CACHE_VERSION}`;
const RUNTIME_MAX_ENTRIES = 60;
const CORE_ICON_PATHS = new Set([
  "/icons/pwa-192-v1.png",
  "/icons/pwa-512-v1.png",
  "/icons/pwa-maskable-512-v1.png",
  "/icons/apple-touch-icon-v1.png",
]);
const CORE_ASSETS = ["/offline.html", ...CORE_ICON_PATHS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) =>
      cache.addAll(
        CORE_ASSETS.map(
          (path) =>
            new Request(new URL(path, self.location.origin), {
              cache: "no-store",
            }),
        ),
      ),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith(CACHE_PREFIX) &&
                name !== CORE_CACHE &&
                name !== RUNTIME_CACHE,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(request, { cache: "no-store" })).catch(async () => {
        const coreCache = await caches.open(CORE_CACHE);
        return (await coreCache.match("/offline.html")) ?? Response.error();
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(new Request(request, { cache: "no-store" })));
    return;
  }

  const isCoreIcon = url.search === "" && CORE_ICON_PATHS.has(url.pathname);
  const isNextStatic = url.pathname.startsWith("/_next/static/");

  if (!isCoreIcon && !isNextStatic) {
    return;
  }

  event.respondWith(
    cacheFirst(
      request,
      isCoreIcon ? CORE_CACHE : RUNTIME_CACHE,
      isNextStatic,
    ),
  );
});

async function cacheFirst(request, cacheName, trimRuntime) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const isHtml =
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml");

  if (response.ok && !isHtml) {
    try {
      await cache.put(request, response.clone());
      if (trimRuntime) {
        await trimCache(cache, RUNTIME_MAX_ENTRIES);
      }
    } catch {
      // A full or unavailable cache must not break a successful network load.
    }
  }

  return response;
}

async function trimCache(cache, maxEntries) {
  const requests = await cache.keys();
  await Promise.all(
    requests.slice(0, Math.max(0, requests.length - maxEntries)).map((request) =>
      cache.delete(request),
    ),
  );
}
