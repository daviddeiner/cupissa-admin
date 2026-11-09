const CACHE_NAME = 'cupissa-admin-v23-creditos-15min';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/admin-web.css?v=20261106-4',
  './assets/css/admin-modules.css',
  './assets/css/admin-enhancements.css?v=20261106-4',
  './assets/js/00-config.js',
  './assets/js/admin-dialogs.js',
  './assets/js/admin-rentals.js',
  './assets/js/admin-core.js?v=20261109-creditos-15min-admin-v1',
  './assets/js/admin-web.js?v=20261108-notes-profile-v2',
  './assets/js/admin-enhancements.js?v=20261107-library-remove-v1',
  './assets/js/admin-navigation.js?v=20261108-back-home-v1',
  './assets/js/admin-products.js',
  './logo.png',
  './favicon.png',
  './admin-icon-192.png',
  './admin-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  const isAppCode = /\.(?:js|css|webmanifest)$/.test(url.pathname);
  if (request.mode === 'navigate' || isAppCode) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
