/* ============================================================
   MolineroApp - Capa de datos (IndexedDB con Dexie)
   ------------------------------------------------------------
   Guarda TODOS los datos en el dispositivo del usuario. No usa
   internet: funciona 100% offline. Las fotos se guardan en
   base64 dentro de la base local.
   ============================================================ */

// Creamos la base de datos con tres tablas:
//  - clientes      : lista de clientes (cada uno es un productor/campo)
//  - molinos       : los molinos / aguadas / bebederos de cada cliente
//  - reparaciones  : el historial de reparaciones de cada molino
const db = new Dexie('MolineroAppDB');

db.version(1).stores({
  clientes:     'id, nombre, createdAt',
  molinos:      'id, clienteId, createdAt',
  reparaciones: 'id, molinoId, fecha, createdAt'
});

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
function genId(prefix) {
  // ID simple, suficiente para uso personal en un solo dispositivo
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function hoyISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + dia;
}

function fechaLegible(iso) {
  if (!iso) return '';
  const partes = String(iso).slice(0, 10).split('-');
  if (partes.length !== 3) return iso;
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function formatoPeso(num) {
  if (num === null || num === undefined || num === '') return '';
  const n = parseFloat(num);
  if (isNaN(n)) return String(num);
  try {
    return '$ ' + n.toLocaleString('es-AR');
  } catch (e) {
    return '$ ' + n;
  }
}

// ------------------------------------------------------------------
// CLIENTES
// ------------------------------------------------------------------
async function crearCliente(datos) {
  const cliente = Object.assign({}, datos, {
    id: genId('cli'),
    createdAt: Date.now()
  });
  await db.clientes.add(cliente);
  return cliente;
}

async function actualizarCliente(datos) {
  await db.clientes.put(datos);
  return datos;
}

async function eliminarCliente(clienteId) {
  // Borra también todos sus molinos y las reparaciones de esos molinos
  await db.transaction('rw', db.clientes, db.molinos, db.reparaciones, async () => {
    const molinos = await db.molinos.where('clienteId').equals(clienteId).toArray();
    const ids = molinos.map(m => m.id);
    await db.reparaciones.where('molinoId').anyOf(ids).delete();
    await db.molinos.where('clienteId').equals(clienteId).delete();
    await db.clientes.delete(clienteId);
  });
}

async function getClientes() {
  return db.clientes.orderBy('nombre').toArray();
}

async function getCliente(id) {
  return db.clientes.get(id);
}

// ------------------------------------------------------------------
// MOLINOS
// ------------------------------------------------------------------
async function crearMolino(datos) {
  const molino = Object.assign({}, datos, {
    id: genId('mol'),
    createdAt: Date.now()
  });
  await db.molinos.add(molino);
  return molino;
}

async function actualizarMolino(datos) {
  await db.molinos.put(datos);
  return datos;
}

async function eliminarMolino(molinoId) {
  await db.transaction('rw', db.molinos, db.reparaciones, async () => {
    await db.reparaciones.where('molinoId').equals(molinoId).delete();
    await db.molinos.delete(molinoId);
  });
}

async function getMolinosDeCliente(clienteId) {
  return db.molinos.where('clienteId').equals(clienteId).toArray();
}

async function getMolino(id) {
  return db.molinos.get(id);
}
// ------------------------------------------------------------------
// REPARACIONES
// ------------------------------------------------------------------
async function crearReparacion(datos) {
  const rep = Object.assign({}, datos, {
    id: genId('rep'),
    createdAt: Date.now()
  });
  await db.reparaciones.add(rep);
  return rep;
}

async function actualizarReparacion(datos) {
  await db.reparaciones.put(datos);
  return datos;
}

async function eliminarReparacion(repId) {
  await db.reparaciones.delete(repId);
}

async function getReparacionesDeMolino(molinoId) {
  // Ordenadas de más reciente a más antigua por fecha
  const lista = await db.reparaciones.where('molinoId').equals(molinoId).toArray();
  lista.sort((a, b) => (String(b.fecha) > String(a.fecha) ? 1 : String(b.fecha) < String(a.fecha) ? -1 : b.createdAt - a.createdAt));
  return lista;
}

async function getReparacion(id) {
  return db.reparaciones.get(id);
}

// ------------------------------------------------------------------
// RESPALDO (exportar / restaurar)
// ------------------------------------------------------------------

// Arma un objeto JSON con TODOS los datos de la app
async function armarRespaldo() {
  const [clientes, molinos, reparaciones] = await Promise.all([
    db.clientes.toArray(),
    db.molinos.toArray(),
    db.reparaciones.toArray()
  ]);
  return {
    app: 'MolineroApp',
    version: 1,
    exportado: new Date().toISOString(),
    clientes: clientes,
    molinos: molinos,
    reparaciones: reparaciones
  };
}

// Descarga el respaldo como archivo JSON
async function exportarRespaldo() {
  const data = await armarRespaldo();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = 'molineroapp_respaldo_' + fecha + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return data;
}

// Restaura un respaldo. Si la base ya tiene datos, primero la vacía.
async function importarRespaldo(objeto) {
  // Validación mínima
  if (!objeto || typeof objeto !== 'object' || !Array.isArray(objeto.clientes)) {
    throw new Error('El archivo no parece ser un respaldo válido de MolineroApp.');
  }
  const clientes = objeto.clientes || [];
  const molinos = objeto.molinos || [];
  const reparaciones = objeto.reparaciones || [];

  await db.transaction('rw', db.clientes, db.molinos, db.reparaciones, async () => {
    await Promise.all([db.clientes.clear(), db.molinos.clear(), db.reparaciones.clear()]);
    if (clientes.length) await db.clientes.bulkAdd(clientes);
    if (molinos.length) await db.molinos.bulkAdd(molinos);
    if (reparaciones.length) await db.reparaciones.bulkAdd(reparaciones);
  });

  return { clientes: clientes.length, molinos: molinos.length, reparaciones: reparaciones.length };
}
