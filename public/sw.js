const CACHE_NAME = "velle-baazi-v4";
const OFFLINE_FALLBACK = "/offline.html";
const APP_SHELL = [
  OFFLINE_FALLBACK,
  "/manifest.webmanifest",
  "/favicon.ico",
  "/logo.png",
  "/pwa-192.png",
  "/pwa-512.png",
];

const isDevModulePath = (pathname) =>
  pathname.startsWith("/src/") ||
  pathname.startsWith("/node_modules/") ||
  pathname.startsWith("/@vite") ||
  pathname.startsWith("/@id/") ||
  pathname.startsWith("/@fs/");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => Promise.resolve()),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (requestUrl.pathname.startsWith("/api/") || isDevModulePath(requestUrl.pathname)) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(event.request);
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const offlinePage = await cache.match(OFFLINE_FALLBACK);
          return offlinePage || Response.error();
        }
      })(),
    );
    return;
  }

  if (requestUrl.pathname.startsWith("/assets/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);
        return cachedResponse || Response.error();
      }
    })(),
  );
});
