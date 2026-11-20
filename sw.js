self.addEventListener('install', (e) => {
  self.skipWaiting(); // Immediately install new service worker
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      self.clients.claim();
    })
  );
});

// Empty fetch handler to let network requests go through directly
self.addEventListener('fetch', (e) => {
  // Do nothing, let browser handle fetch normally
});
