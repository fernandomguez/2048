// ============================================================
//  2048 — service worker
//
//  Script CLÁSICO (sin import/export): los service workers no
//  admiten módulos ES de forma fiable en todos los navegadores.
//
//  Versión de caché A MANO: la clave es "2048-v1" y solo se cambia
//  incrementándola. La URL del fichero DEBE seguir siendo ./sw.js
//  siempre (renombrarlo rompería las actualizaciones del SW); al
//  modificar cualquier fichero precacheado, sube la versión para
//  que el navegador lo instale de nuevo.
//
//  Estrategias (decisión D5):
//   · network-first para navegación, HTML, JS y CSS: en desarrollo
//     nunca se ve el código propio viejo y en producción la app no
//     queda congelada en una versión (sin build no hay hash que
//     invalide). Si la red falla, se sirve la caché y, en último
//     término, ./index.html.
//   · cache-first para iconos, manifest e imágenes (casi inmutables).
//   · Solo se guardan respuestas con res.ok: ni errores 4xx/5xx ni
//     respuestas opacas cross-origin. Google Fonts queda FUERA por
//     el guard de misma origin (decisión D4: offline se acepta el
//     fallback system-ui, cero respuestas opacas).
//   · activate con keep-list: se borra cualquier caché que no sea la
//     actual, y clients.claim() toma el control de la primera carga
//     (que nace sin controlar). NO se salta la versión vigente ni se
//     recarga la página al actualizar: una recarga dentro de la
//     ventana de fin de partida perdería la pantalla de fin
//     (decisión 11); el SW nuevo espera a que se cierren todas las
//     pestañas.
//
//  Para desactivarlo mientras se programa (DevTools):
//    Application → Service Workers → "Unregister", o marcar
//    "Bypass for network".
// ============================================================

const CACHE = "2048-v1";

// Rutas RELATIVAS siempre (una ruta absoluta "/x" rompería el
// despliegue en subcarpeta). Instalación ATÓMICA: es equivalente a
// caches.addAll(PRECACHE) sobre la caché abierta — si falta un
// fichero (404), la instalación entera falla, por eso la lista solo
// apunta a ficheros que existen en el repo.
const PRECACHE = [
  "./",
  "./index.html",
  "./css/style.css",
  "./app/game.js",
  "./js/game-core.js",
  "./app/game-fx.js",
  "./js/game-share.js",
  "./manifest.json",
  "./icons/2048.svg",
  "./icons/2048-maskable.svg",
  "./icons/apple-touch-icon-180.png",
  "./icons/og-image-1200x630.png",
];

// --- INSTALACIÓN: precache completo (atómico) ---
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  // Sin saltos de versión: esta instalación no reemplaza a la vigente
  // hasta que todas las pestañas se cierren (decisión 11).
});

// --- FETCH ---
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Solo GET del mismo origen (Google Fonts y las APIs externas no
  // tocan este worker).
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  const destino = request.destination;
  const esDocumental =
    request.mode === "navigate" ||
    destino === "document" ||
    destino === "script" ||
    destino === "stylesheet";

  if (esDocumental) {
    // network-first: la red manda; la caché es el respaldo sin conexión.
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copia));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then(
              (cacheada) =>
                cacheada ||
                caches.match("./index.html").then((indice) => indice || Response.error())
            )
        )
    );
    return;
  }

  // cache-first: iconos, manifest e imágenes.
  event.respondWith(
    caches.match(request).then((cacheada) => {
      if (cacheada) return cacheada;
      return fetch(request).then((res) => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copia));
        }
        return res;
      });
    })
  );
});

// --- ACTIVACIÓN: keep-list de la versión vigente ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});
