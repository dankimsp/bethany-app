var CACHE = "bethany-worship-v1";
var FILES = [
  "./",
  "index.html",
  "worship.js",
  "songs.json",
  "manifest.webmanifest",
  "robots.txt",
  "songs/amazing-grace.cho",
  "songs/come-thou-fount.cho",
  "songs/holy-holy-holy.cho",
  "assets/logo-bethany-light.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/hero.jpg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(function (response) {
    var copy = response.clone();
    caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
    return response;
  }).catch(function () {
    return caches.match(event.request).then(function (cached) { return cached || caches.match("./"); });
  }));
});
