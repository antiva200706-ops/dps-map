// Минимальный Service Worker — нужен, чтобы браузер считал сайт "устанавливаемым"
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Не кэшируем ничего — пропускаем запросы напрямую
self.addEventListener('fetch', (event) => {
  // Пусто — просто чтобы SW существовал
});