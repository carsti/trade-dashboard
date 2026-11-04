// Service Worker des MT5 Bot Dashboards: macht es als App installierbar und zeigt ohne Verbindung
// zum Trading-PC den zuletzt geladenen Stand. Immer zuerst das Netz (die Daten kommen live vom PC),
// der Cache ist nur der Notfall.
const CACHE = "mt5dash-v7";
const SHELL = ["/", "/static/style.css", "/static/app.js", "/static/icon.svg", "/static/icon-192.png",
               "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname === "/api/export.csv" || url.pathname === "/ping") return;
  // Seitenaufrufe (auch /#/bots …) teilen sich einen Cache-Eintrag
  const key = req.mode === "navigate" ? "/" : url.pathname + url.search;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then((c) => c.put(key, copy)));
      }
      return res;
    } catch (err) {
      const hit = await caches.match(key);
      if (!hit) throw err;
      // Kennzeichnen, damit die Oberfläche "offline, letzter Stand" anzeigen kann
      const headers = new Headers(hit.headers);
      headers.set("X-Offline", "1");
      return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers });
    }
  })());
});
