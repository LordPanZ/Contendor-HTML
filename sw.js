/* Contenedor HTML — service worker: la app funciona sin conexión.
   Solo guarda en caché los archivos de la propia aplicación; los documentos
   viven en la base de datos del navegador, no aquí. */

const CACHE = 'contenedor-html-v1';

const SHELL = [
  './',
  'index.html',
  'viewer.html',
  'manifest.webmanifest',
  'assets/css/app.css',
  'assets/js/util.js',
  'assets/js/store.js',
  'assets/js/zip.js',
  'assets/js/catalog.js',
  'assets/js/importer.js',
  'assets/js/share.js',
  'assets/js/auth.js',
  'assets/js/ui.js',
  'assets/js/app.js',
  'assets/js/viewer.js',
  'assets/icons/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Red primero para no servir versiones viejas, con la caché como reserva.
  event.respondWith(
    fetch(request)
      .then(function (response) {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('index.html')))
  );
});
