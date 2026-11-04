var CACHE = "bethany-worship-v35";
var FILES = [
  "./",
  "index.html",
  "worship.js",
  "js/config.js",
  "js/auth.js",
  "js/app.js",
  "js/more.js",
  "assets/img/sanctuary.webp",
  "assets/img/worship-stage.webp",
  "assets/img/fellowship-group.webp",
  "assets/img/church-exterior.webp",
  "assets/img/texture-rings.svg",
  "assets/img/illus-nursery.svg",
  "assets/img/illus-kitchen.svg",
  "assets/img/illus-empty.svg",
  "songs.json",
  "manifest.webmanifest",
  "robots.txt",
  "songs/amazing-grace.cho",
  "songs/angels-we-have-heard-on-high.cho",
  "songs/come-thou-fount.cho",
  "songs/georuk-georuk-georuk.cho",
  "songs/holy-holy-holy.cho",
  "songs/i-surrender-all.cho",
  "songs/na-gateun-joein.cho",
  "songs/nae-jureul-gakkai.cho",
  "songs/o-for-a-thousand-tongues.cho",
  "assets/logo-bethany-light.svg",
  "assets/logo-bethany-ink.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/hero.jpg"
];

function shellRequest(request) {
  var url = new URL(request.url);
  return request.mode === "navigate" || /\.(?:html|js|css)$/i.test(url.pathname);
}

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
  var fresh = shellRequest(event.request) ? { cache: "reload" } : {};
  event.respondWith(fetch(event.request, fresh).then(function (response) {
    if (response && response.ok) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
    }
    return response;
  }).catch(function () {
    return caches.match(event.request, { ignoreSearch: true }).then(function (cached) { return cached || caches.match("./"); });
  }));
});
