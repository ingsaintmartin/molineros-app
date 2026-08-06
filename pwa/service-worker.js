/* ============================================================
   MolineroApp - Service Worker
   ------------------------------------------------------------
   Hace que la app funcione 100% offline:
   1. Al instalarse, guarda en caché todos los archivos de la app.
   2. Cuando hay señal, actualiza en segundo plano la página.
   3. Cuando no hay señal, sirve lo que tiene en caché.
   ============================================================ */

const CACHE = 'molineroapp-v2';

// Lista de archivos que se guardan al instalar
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './supabase-config.js',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Al instalar: guardar todos los archivos. No esperar a cerrar la app.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ARCHIVOS))
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

  // Las llamadas a Supabase y CDNs externas van siempre a la red
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('jsdelivr.net') ||
      url.hostname.includes('supabase.io')) return;

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

  // Google Maps (botón "ver en el mapa") puede estar online; no lo cacheamos.
});