/* Genera pwa/turso-config.js desde variables de entorno.
   Se usa como buildCommand en Vercel para que las credenciales
   de Turso nunca queden en el repo. Variables:
     TURSO_DATABASE_URL  (libsql://... o https://...)
     TURSO_AUTH_TOKEN
   En local no hace falta: se usa pwa/turso-config.js a mano. */
const fs = require('fs');
const path = require('path');

const url = process.env.TURSO_DATABASE_URL || '';
const token = process.env.TURSO_AUTH_TOKEN || '';
const destino = path.join(__dirname, '..', 'pwa', 'turso-config.js');

if (!url || !token) {
  console.log('[gen-turso-config] Sin TURSO_DATABASE_URL/TURSO_AUTH_TOKEN: la app andará solo en local.');
  if (!fs.existsSync(destino)) {
    fs.writeFileSync(destino,
      "const TURSO_URL = 'https://TU-BASE.turso.io';\nconst TURSO_AUTH_TOKEN = 'TU-TOKEN';\n");
  }
  process.exit(0);
}

const contenido =
  '/* Generado en el deploy desde variables de entorno. No editar. */\n' +
  "const TURSO_URL = " + JSON.stringify(url) + ";\n" +
  "const TURSO_AUTH_TOKEN = " + JSON.stringify(token) + ";\n";
fs.writeFileSync(destino, contenido);
console.log('[gen-turso-config] pwa/turso-config.js generado.');
