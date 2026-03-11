const CACHE_NAME = "velle-baazi-v2";
const APP_SHELL = [
  "/",
  "/index.html",
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

const networkFirst = async (request, fallbackPath) => {
  try {
    const networkResponse = await fetch(request);
    if (
      networkResponse &&
      networkResponse.status === 200 &&
      networkResponse.type === "basic"
    ) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    if (fallbackPath) {
      const fallback = await caches.match(fallbackPath);
      if (fallback) return fallback;
    }
    throw new Error("Network unavailable");
  }
};

const cacheFirst = async (request) => {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  const networkResponse = await fetch(request);
  if (
    networkResponse &&
    networkResponse.status === 200 &&
    networkResponse.type === "basic"
  ) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
};

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
    event.respondWith(networkFirst(event.request, "/index.html"));
    return;
  }

  if (requestUrl.pathname.startsWith("/assets/")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
