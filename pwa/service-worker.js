/* ============================================================
   MolineroApp - Service Worker
   ------------------------------------------------------------
   Hace que la app funcione 100% offline:
   1. Al instalarse, guarda en caché todos los archivos de la app.
   2. Cuando hay señal, actualiza en segundo plano la página.
   3. Cuando no hay señal, sirve lo que tiene en caché.
   ============================================================ */

const CACHE = 'molineroapp-v17';

// Lista de archivos que se guardan al instalar.
// IMPORTANTE: Dexie y Leaflet van en vendor/ local (no CDN) para que la app
// arranque sin internet. Si un archivo falla, no se rompe toda
// la instalación (ver el .catch de abajo).
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './vendor/dexie.min.js',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './turso-config.js',
  './js/core.js',
  './js/eco.js',
  './js/seed.js',
  './js/exif-gps.js',
  './js/mapa.js',
  './js/t-inicio.js',
  './js/t-trabajos.js',
  './js/t-clientes.js',
  './js/t-mapa.js',
  './js/t-stock.js',
  './js/pdf.js',
  './js/t-facturacion.js',
  './js/t-presupuestos.js',
  './js/t-gastos.js',
  './js/t-reportes.js',
  './js/t-mas.js',
  './js/t-empresa.js',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Al instalar: guardar todos los archivos. No esperar a cerrar la app.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(
        ARCHIVOS.map((url) => cache.add(url).catch(() => console.warn('[SW] No se pudo cachear:', url)))
      ))
      .then(() => self.skipWaiting())
  );
});

// Al activar: limpiar versiones viejas de la caché y tomar el control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo manejamos pedidos GET normales
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Las llamadas a la nube (Turso) van siempre a la red
  if (url.hostname.includes('turso.io')) return;

  // Para los archivos propios (misma app): primero caché, y si no hay,
  // los pedimos a la red y los guardamos.
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      // Navegación: intentamos la red, y si falla usamos la copia guardada.
      event.respondWith(
        fetch(req)
          .then((resp) => {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copia));
            return resp;
          })
          .catch(() =>
            caches.match('./index.html').then((r) => r || caches.match('./offline.html'))
          )
      );
      return;
    }

    event.respondWith(
      caches.match(req).then((resp) => {
        if (resp) return resp;
        return fetch(req).then((respNueva) => {
          if (respNueva && respNueva.status === 200 && respNueva.type === 'basic') {
            const copia = respNueva.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return respNueva;
        });
      }).catch(() => caches.match('./offline.html'))
    );
    return;
  }

  // Los tiles de OpenStreetMap van siempre a la red; no se cachean.
});