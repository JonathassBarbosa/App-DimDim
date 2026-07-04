const CACHE = 'no-verde-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Nunca cachear chamadas ao Apps Script (dados sempre precisam ser atuais)
  if (url.hostname.includes('script.google.com')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});
