/* Service worker minimo e deliberatamente prudente.
 *
 * Quello che NON fa: mettere in cache le pagine dell'app. Sono pagine che
 * dipendono da chi ha fatto accesso — un tabellone salvato in cache
 * ricomparirebbe al collega che usa lo stesso telefono, e mostrerebbe turni
 * vecchi facendoli sembrare quelli veri. Meglio una schermata onesta di
 * "nessuna connessione".
 *
 * Quello che fa: tiene in cache i file statici (che sono immutabili e hanno
 * l'impronta nel nome) e rende l'app installabile.
 */
const VERSIONE = "turni-v2";
const OFFLINE = "/offline.html";

const PRECARICATI = [OFFLINE, "/icone/icona-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSIONE).then((cache) => cache.addAll(PRECARICATI)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chiavi) =>
        Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigazione: sempre dalla rete. Se la rete non c'e', la pagina di cortesia.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE)),
    );
    return;
  }

  // Statici con impronta nel nome: una volta presi non cambiano piu'.
  const statico =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icone/") ||
    url.pathname.endsWith(".svg");

  if (!statico) return;

  event.respondWith(
    caches.match(request).then(
      (colpo) =>
        colpo ??
        fetch(request).then((risposta) => {
          if (risposta.ok) {
            const copia = risposta.clone();
            caches.open(VERSIONE).then((cache) => cache.put(request, copia));
          }
          return risposta;
        }),
    ),
  );
});
