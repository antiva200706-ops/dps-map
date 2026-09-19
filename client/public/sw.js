const CACHE_NAME = 'dps-map-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first — сначала пробуем сеть, если нет — кэш
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});