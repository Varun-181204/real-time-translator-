/**
 * OmniTranslate Service Worker
 * Version: omnitranslate-v2
 * Provides secure offline caching for static app shell and graceful offline fallback.
 */

const CACHE_NAME = 'omnitranslate-v3';
const STATIC_ASSETS = [
  '/manifest.json',
  '/static/manifest.json',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/icons/icon.svg',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Service worker pre-caching partial notice:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache POST, PUT, DELETE, or non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle API calls dynamically - NEVER cache private or authenticated user data in service worker
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        if (url.pathname === '/api/translate') {
          return new Response(
            JSON.stringify({
              success: false,
              error: "You're offline. Reconnect to the internet to use Gemini translation."
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
        if (url.pathname === '/api/health') {
          return new Response(
            JSON.stringify({
              status: "offline",
              service: "Gemini 3.8 Flash",
              gemini_connected: false,
              offline: true
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
        return new Response(
          JSON.stringify({ error: "Offline network request failed", offline: true }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Navigation requests (HTML pages like '/') - ALWAYS network first so auth state is never stale
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-while-revalidate for safe static shell assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
