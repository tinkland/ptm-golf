const CACHE_NAME = 'ptm-golf-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/favicon.svg',
  '/offline.html'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        // If some assets fail to cache, continue anyway
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Firebase/external API calls - always fetch fresh
  if (request.url.includes('firebaseapp.com') ||
      request.url.includes('googleapis.com') ||
      request.url.includes('vercel')) {
    event.respondWith(
      fetch(request).catch(() => {
        // Network failed - return offline response if available
        return caches.match('/offline.html');
      })
    );
    return;
  }

  // For app assets, use cache-first strategy
  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(request).then((response) => {
        // Don't cache if not successful
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        // Cache successful responses for assets
        if (request.destination === 'document' ||
            request.destination === 'script' ||
            request.destination === 'style') {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }

        return response;
      }).catch(() => {
        // Network failed - return cached version if available
        return caches.match(request);
      });
    })
  );
});
