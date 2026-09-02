/* 2 Views service worker - offline-first app shell. */
var CACHE = '2views-v2.0.0';
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './robots.txt',
  './llms.txt',
  './sitemap.xml',
  './css/style.css',
  './js/config.js',
  './js/core/rng.js',
  './js/core/events.js',
  './js/core/storage.js',
  './js/core/audio.js',
  './js/cosmetics/cosmetics.js',
  './js/game/engine.js',
  './js/net/x-oauth.js',
  './js/net/leaderboard.js',
  './js/share/share.js',
  './js/ads/adslots.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.svg'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.allSettled(ASSETS.map(function (a) { return c.add(a); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) { return; }
  e.respondWith(
    caches.match(req).then(function (hit) {
      var fetching = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || fetching;
    })
  );
});
