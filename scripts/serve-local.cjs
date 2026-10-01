const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../pwa');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };
http.createServer((req, res) => {
  let relative;
  try { relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  const target = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  // Nunca cargar credenciales reales de sincronización en las pruebas locales.
  if (relative === '/turso-config.js') { res.writeHead(200, { 'Content-Type': types['.js'], 'Cache-Control': 'no-store' }).end('// Nube deshabilitada en desarrollo local.'); return; }
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404).end('No encontrado'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  });
}).listen(4173, '127.0.0.1', () => console.log('MolineroApp local: http://127.0.0.1:4173 (sin sincronización de nube)'));
