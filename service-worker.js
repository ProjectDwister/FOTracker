// Minimal service worker — exists mainly to satisfy Chrome's install
// criteria and cache the static page shell (HTML/CSS/JS).
// It deliberately does NOT cache anything from script.google.com,
// so live P&L numbers always come from the network, never a stale cache.

const CACHE_NAME = 'fo-tracker-shell-v1';
const LIVE_DATA_HOST = 'script.google.com';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Live P&L data: always go straight to network, never cache.
  if (url.hostname.includes(LIVE_DATA_HOST) || event.request.method !== 'GET') {
    return;
  }

  // Same-origin static assets: cache-first, refresh cache in background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
