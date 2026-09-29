const VERSION = "v1";
const CACHE = "compta-" + VERSION;
const COQUILLE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Bibliothèque Firebase : cache d'abord (versionnée dans l'adresse)
  if (url.hostname === "www.gstatic.com") {
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((rep) => {
        const copie = rep.clone();
        caches.open(CACHE).then((c) => c.put(req, copie));
        return rep;
      }))
    );
    return;
  }

  // Les échanges de données (Firestore, authentification) ne passent pas par le cache
  if (url.origin !== self.location.origin) return;

  // Pages : réseau d'abord, sinon version en cache
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("./index.html")));
    return;
  }

  // Fichiers de l'application : cache immédiat puis mise à jour en arrière-plan
  e.respondWith(
    caches.match(req).then((cache) => {
      const reseau = fetch(req).then((rep) => {
        const copie = rep.clone();
        caches.open(CACHE).then((c) => c.put(req, copie));
        return rep;
      }).catch(() => cache);
      return cache || reseau;
    })
  );
});
