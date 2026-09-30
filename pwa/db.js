/* ============================================================
   MolineroApp - Capa de datos (Turso + IndexedDB local)
   ------------------------------------------------------------
   Estrategia híbrida con cola de sincronización (outbox):
     - IndexedDB (Dexie): fuente de verdad local → funciona SIN internet
     - Turso: nube → sincroniza entre PC y celular
     - Cola "pendientes": cada escritura (alta, edición, borrado)
       se registra como una operación. Si hay conexión se sube en
       el momento; si no, queda encolada y se sube EN ORDEN cuando
       vuelve internet, ANTES de descargar nada de la nube.
       Así nunca se pierde lo cargado sin señal.
   ============================================================ */

// ---- Base local (Dexie / IndexedDB) ----
const dbLocal = new Dexie('MolineroAppDB');
dbLocal.version(2).stores({
  clientes:     'id, nombre, createdAt',
  molinos:      'id, clienteId, createdAt',
  reparaciones: 'id, molinoId, fecha, createdAt',
  pendientes:   '++seq, createdAt'   // cola de operaciones sin sincronizar
});
// Nota: la v1 no tenía "pendientes"; Dexie migra la base sola.

// ---- Nube Turso (opcional: la app anda igual sin ella) ----
// Sin SDK: hablamos con Turso por su API HTTP con fetch directo.
const TURSO_SIN_CONFIGURAR = 'TU-BASE';
const tursoConfigOk =
  typeof TURSO_URL !== 'undefined' &&
  typeof TURSO_AUTH_TOKEN !== 'undefined' &&
  String(TURSO_URL).indexOf(TURSO_SIN_CONFIGURAR) === -1 &&
  String(TURSO_AUTH_TOKEN).indexOf('TU-TOKEN') === -1;
// Aceptamos la URL en formato libsql:// (como la muestra Turso) o https://
function tursoEndpoint() {
  return String(TURSO_URL).replace(/^libsql:\/\//i, 'https://');
}

// Una consulta a Turso. Lanza si la base responde error.
async function tursoQuery(sql, params) {
  const res = await fetch(tursoEndpoint(), {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + TURSO_AUTH_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ statements: [{ q: sql, params: params || [] }] })
  });
  if (!res.ok) throw new Error('Turso HTTP ' + res.status);
  const data = await res.json();
  const primero = data && data[0];
  if (!primero || primero.error) {
    throw new Error(primero && primero.error ? primero.error : 'Respuesta inválida de Turso');
  }
  return primero.results; // { columns: [...], rows: [[...], ...] }
}

// Convierte una fila [v1, v2...] en objeto {col1: v1, col2: v2...}
function filaAObjeto(columnas) {
  return function (fila) {
    const o = {};
    for (let i = 0; i < columnas.length; i++) o[columnas[i]] = fila[i];
    return o;
  };
}

function isOnline() { return navigator.onLine; }
// Hay nube utilizable solo si está configurada y hay red
function nubeLista() { return tursoConfigOk && navigator.onLine; }

// ------------------------------------------------------------------
// Mapeo: objetos JS ↔ filas de Turso (snake_case)
// ------------------------------------------------------------------
// Las fotos viajan como JSON (TEXT en Turso); en local son arrays.
function fotosToDb(fotos) { return JSON.stringify(fotos || []); }
function fotosFromDb(valor) {
  if (Array.isArray(valor)) return valor;
  if (!valor) return [];
  try {
    const v = JSON.parse(valor);
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
function clienteToRow(c) {
  return {
    id: c.id,
    nombre: c.nombre || '',
    campo: c.campo || null,
    localidad: c.localidad || null,
    telefono: c.telefono || null,
    observaciones: c.observaciones || null,
    created_at: c.createdAt || Date.now()
  };
}
function rowToCliente(r) {
  return {
    id: r.id,
    nombre: r.nombre || '',
    campo: r.campo || '',
    localidad: r.localidad || '',
    telefono: r.telefono || '',
    observaciones: r.observaciones || '',
    createdAt: r.created_at
  };
}

function molinoToRow(m) {
  return {
    id: m.id,
    cliente_id: m.clienteId,
    nombre: m.nombre || '',
    tipo_instalacion: m.tipoInstalacion || null,
    marca: m.marca || null,
    modelo: m.modelo || null,
    tamano_cilindro: m.tamanoCilindro || null,
    diametro_succion: m.diametroSuccion || null,
    diametro_impulsion: m.diametroImpulsion || null,
    profundidad_pozo: m.profundidadPozo || null,
    estado: m.estado || null,
    observaciones: m.observaciones || null,
    lat: m.lat || null,
    lng: m.lng || null,
    fotos: fotosToDb(m.fotos),
    created_at: m.createdAt || Date.now()
  };
}
function rowToMolino(r) {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    nombre: r.nombre || '',
    tipoInstalacion: r.tipo_instalacion || '',
    marca: r.marca || '',
    modelo: r.modelo || '',
    tamanoCilindro: r.tamano_cilindro || '',
    diametroSuccion: r.diametro_succion || '',
    diametroImpulsion: r.diametro_impulsion || '',
    profundidadPozo: r.profundidad_pozo || '',
    estado: r.estado || 'Operativo',
    observaciones: r.observaciones || '',
    lat: r.lat || null,
    lng: r.lng || null,
    fotos: fotosFromDb(r.fotos),
    createdAt: r.created_at
  };
}

function reparacionToRow(r) {
  return {
    id: r.id,
    molino_id: r.molinoId,
    fecha: r.fecha || null,
    problema: r.problema || null,
    trabajo: r.trabajo || null,
    piezas: r.piezas || null,
    costo: r.costo || null,
    observaciones: r.observaciones || null,
    fotos: fotosToDb(r.fotos),
    created_at: r.createdAt || Date.now()
  };
}
function rowToReparacion(r) {
  return {
    id: r.id,
    molinoId: r.molino_id,
    fecha: r.fecha || '',
    problema: r.problema || '',
    trabajo: r.trabajo || '',
    piezas: r.piezas || '',
    costo: r.costo || '',
    observaciones: r.observaciones || '',
    fotos: fotosFromDb(r.fotos),
    createdAt: r.created_at
  };
}

// ------------------------------------------------------------------
// Cola de sincronización (outbox)
// ------------------------------------------------------------------

// Registra una operación y trata de subirla ya; si no hay conexión
// (o falla), queda encolada para el próximo sincronizar().
async function registrarOperacion(op) {
  await dbLocal.pendientes.add(Object.assign({ createdAt: Date.now() }, op));
  if (nubeLista()) await subirPendientes();
}

// Columnas de cada tabla en Turso (mismo orden que los mapeos de arriba)
const COLUMNAS = {
  clientes:     ['id', 'nombre', 'campo', 'localidad', 'telefono', 'observaciones', 'created_at'],
  molinos:      ['id', 'cliente_id', 'nombre', 'tipo_instalacion', 'marca', 'modelo',
                 'tamano_cilindro', 'diametro_succion', 'diametro_impulsion', 'profundidad_pozo',
                 'estado', 'observaciones', 'lat', 'lng', 'fotos', 'created_at'],
  reparaciones: ['id', 'molino_id', 'fecha', 'problema', 'trabajo', 'piezas',
                 'costo', 'observaciones', 'fotos', 'created_at']
};

// Sube UNA operación a Turso. Lanza si falla.
async function subirOperacion(op) {
  const cols = COLUMNAS[op.tabla];
  if (!cols) throw new Error('Tabla desconocida: ' + op.tabla);
  if (op.tipo === 'upsert') {
    const valores = cols.map(c => (op.row[c] === undefined ? null : op.row[c]));
    const ph = cols.map(() => '?').join(', ');
    const actualiza = cols.filter(c => c !== 'id').map(c => c + ' = excluded.' + c).join(', ');
    await tursoQuery(
      'INSERT INTO ' + op.tabla + ' (' + cols.join(', ') + ') VALUES (' + ph + ')' +
      ' ON CONFLICT(id) DO UPDATE SET ' + actualiza,
      valores
    );
  } else if (op.tipo === 'delete') {
    await tursoQuery('DELETE FROM ' + op.tabla + ' WHERE id = ?', [op.id]);
  } else if (op.tipo === 'clear') {
    await tursoQuery('DELETE FROM ' + op.tabla, []);
  } else {
    throw new Error('Operación desconocida: ' + op.tipo);
  }
}

// Sube la cola en orden. Si una falla, frena y el resto
// queda encolado para reintentar después (se mantiene el orden).
async function subirPendientes() {
  if (!nubeLista()) return false;
  const ops = await dbLocal.pendientes.orderBy('seq').toArray();
  for (const op of ops) {
    try {
      await subirOperacion(op);
    } catch (e) {
      console.warn('No se pudo sincronizar con la nube, se reintentará:', e);
      return false;
    }
    await dbLocal.pendientes.delete(op.seq);
  }
  return true;
}

async function contarPendientes() {
  try { return await dbLocal.pendientes.count(); }
  catch (e) { return 0; }
}

// ------------------------------------------------------------------
// Sincronización: primero SUBE lo pendiente, después descarga.
// Nunca se pisa lo local mientras quede algo sin subir.
// ------------------------------------------------------------------
async function descargarDesdeNube() {
  try {
    const [rc, rm, rr] = await Promise.all([
      tursoQuery('SELECT * FROM clientes'),
      tursoQuery('SELECT * FROM molinos'),
      tursoQuery('SELECT * FROM reparaciones')
    ]);
    const cls  = rc.rows.map(filaAObjeto(rc.columns));
    const mols = rm.rows.map(filaAObjeto(rm.columns));
    const reps = rr.rows.map(filaAObjeto(rr.columns));

    await dbLocal.transaction('rw', dbLocal.clientes, dbLocal.molinos, dbLocal.reparaciones, async () => {
      await dbLocal.clientes.clear();
      await dbLocal.molinos.clear();
      await dbLocal.reparaciones.clear();
      if (cls.length)  await dbLocal.clientes.bulkAdd(cls.map(rowToCliente));
      if (mols.length) await dbLocal.molinos.bulkAdd(mols.map(rowToMolino));
      if (reps.length) await dbLocal.reparaciones.bulkAdd(reps.map(rowToReparacion));
    });
    return true;
  } catch (e) {
    console.warn('No se pudo sincronizar desde Turso:', e);
    return false;
  }
}

async function sincronizar() {
  if (!nubeLista()) return false;
  const subidasOk = await subirPendientes();
  if (!subidasOk) return false; // quedó algo sin subir: no tocamos lo local
  return await descargarDesdeNube();
}

// ------------------------------------------------------------------
// Utilidades generales
// ------------------------------------------------------------------
function genId(prefix) {
  const unico = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  return prefix + '_' + unico;
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
  try { return '$ ' + n.toLocaleString('es-AR'); }
  catch (e) { return '$ ' + n; }
}

// ------------------------------------------------------------------
// CLIENTES
// ------------------------------------------------------------------
async function crearCliente(datos) {
  const cliente = Object.assign({}, datos, { id: genId('cli'), createdAt: Date.now() });
  await dbLocal.clientes.add(cliente);
  await registrarOperacion({ tipo: 'upsert', tabla: 'clientes', row: clienteToRow(cliente) });
  return cliente;
}

async function actualizarCliente(datos) {
  await dbLocal.clientes.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'clientes', row: clienteToRow(datos) });
  return datos;
}

async function eliminarCliente(clienteId) {
  let idsMolinos = [], idsReps = [];
  await dbLocal.transaction('rw', dbLocal.clientes, dbLocal.molinos, dbLocal.reparaciones, async () => {
    const molinos = await dbLocal.molinos.where('clienteId').equals(clienteId).toArray();
    idsMolinos = molinos.map(m => m.id);
    if (idsMolinos.length) {
      const reps = await dbLocal.reparaciones.where('molinoId').anyOf(idsMolinos).toArray();
      idsReps = reps.map(r => r.id);
      await dbLocal.reparaciones.where('molinoId').anyOf(idsMolinos).delete();
    }
    await dbLocal.molinos.where('clienteId').equals(clienteId).delete();
    await dbLocal.clientes.delete(clienteId);
  });
  // Encolamos los borrados en orden de dependencia (no dependemos de
  // que la base tenga ON DELETE CASCADE configurado)
  for (const id of idsReps) {
    await dbLocal.pendientes.add({ tipo: 'delete', tabla: 'reparaciones', id: id, createdAt: Date.now() });
  }
  for (const id of idsMolinos) {
    await dbLocal.pendientes.add({ tipo: 'delete', tabla: 'molinos', id: id, createdAt: Date.now() });
  }
  await dbLocal.pendientes.add({ tipo: 'delete', tabla: 'clientes', id: clienteId, createdAt: Date.now() });
  if (nubeLista()) await subirPendientes();
}

async function getClientes() {
  return dbLocal.clientes.orderBy('nombre').toArray();
}

async function getCliente(id) {
  return dbLocal.clientes.get(id);
}

// ------------------------------------------------------------------
// MOLINOS
// ------------------------------------------------------------------
async function crearMolino(datos) {
  const molino = Object.assign({}, datos, { id: genId('mol'), createdAt: Date.now() });
  await dbLocal.molinos.add(molino);
  await registrarOperacion({ tipo: 'upsert', tabla: 'molinos', row: molinoToRow(molino) });
  return molino;
}

async function actualizarMolino(datos) {
  await dbLocal.molinos.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'molinos', row: molinoToRow(datos) });
  return datos;
}

async function eliminarMolino(molinoId) {
  let idsReps = [];
  await dbLocal.transaction('rw', dbLocal.molinos, dbLocal.reparaciones, async () => {
    const reps = await dbLocal.reparaciones.where('molinoId').equals(molinoId).toArray();
    idsReps = reps.map(r => r.id);
    await dbLocal.reparaciones.where('molinoId').equals(molinoId).delete();
    await dbLocal.molinos.delete(molinoId);
  });
  for (const id of idsReps) {
    await dbLocal.pendientes.add({ tipo: 'delete', tabla: 'reparaciones', id: id, createdAt: Date.now() });
  }
  await dbLocal.pendientes.add({ tipo: 'delete', tabla: 'molinos', id: molinoId, createdAt: Date.now() });
  if (nubeLista()) await subirPendientes();
}

async function getMolinosDeCliente(clienteId) {
  return dbLocal.molinos.where('clienteId').equals(clienteId).toArray();
}

async function getMolino(id) {
  return dbLocal.molinos.get(id);
}

// ------------------------------------------------------------------
// REPARACIONES
// ------------------------------------------------------------------
async function crearReparacion(datos) {
  const rep = Object.assign({}, datos, { id: genId('rep'), createdAt: Date.now() });
  await dbLocal.reparaciones.add(rep);
  await registrarOperacion({ tipo: 'upsert', tabla: 'reparaciones', row: reparacionToRow(rep) });
  return rep;
}

async function actualizarReparacion(datos) {
  await dbLocal.reparaciones.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'reparaciones', row: reparacionToRow(datos) });
  return datos;
}

async function eliminarReparacion(repId) {
  await dbLocal.reparaciones.delete(repId);
  await registrarOperacion({ tipo: 'delete', tabla: 'reparaciones', id: repId });
}

async function getReparacionesDeMolino(molinoId) {
  const lista = await dbLocal.reparaciones.where('molinoId').equals(molinoId).toArray();
  lista.sort((a, b) => (
    String(b.fecha) > String(a.fecha) ? 1 :
    String(b.fecha) < String(a.fecha) ? -1 :
    b.createdAt - a.createdAt
  ));
  return lista;
}

async function getReparacion(id) {
  return dbLocal.reparaciones.get(id);
}

// ------------------------------------------------------------------
// RESPALDO (exportar / importar JSON — funciona offline)
// ------------------------------------------------------------------
async function armarRespaldo() {
  const [clientes, molinos, reparaciones] = await Promise.all([
    dbLocal.clientes.toArray(),
    dbLocal.molinos.toArray(),
    dbLocal.reparaciones.toArray()
  ]);
  return { app: 'MolineroApp', version: 1, exportado: new Date().toISOString(), clientes, molinos, reparaciones };
}

async function exportarRespaldo() {
  const data = await armarRespaldo();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = 'molineroapp_respaldo_' + fecha + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return data;
}

async function importarRespaldo(objeto) {
  if (!objeto || typeof objeto !== 'object' || !Array.isArray(objeto.clientes)) {
    throw new Error('El archivo no parece ser un respaldo válido de MolineroApp.');
  }
  const clientes     = objeto.clientes     || [];
  const molinos      = objeto.molinos      || [];
  const reparaciones = objeto.reparaciones || [];
  const ahora = Date.now();

  // Restaurar en local y encolar el reemplazo total en la nube.
  // La cola vieja se descarta: el respaldo es la nueva verdad.
  await dbLocal.transaction('rw', dbLocal.clientes, dbLocal.molinos, dbLocal.reparaciones, dbLocal.pendientes, async () => {
    await dbLocal.clientes.clear();
    await dbLocal.molinos.clear();
    await dbLocal.reparaciones.clear();
    await dbLocal.pendientes.clear();
    if (clientes.length)     await dbLocal.clientes.bulkAdd(clientes);
    if (molinos.length)      await dbLocal.molinos.bulkAdd(molinos);
    if (reparaciones.length) await dbLocal.reparaciones.bulkAdd(reparaciones);

    const ops = [
      { tipo: 'clear', tabla: 'reparaciones', createdAt: ahora },
      { tipo: 'clear', tabla: 'molinos', createdAt: ahora },
      { tipo: 'clear', tabla: 'clientes', createdAt: ahora }
    ];
    for (const c of clientes)     ops.push({ tipo: 'upsert', tabla: 'clientes', row: clienteToRow(c), createdAt: ahora });
    for (const m of molinos)      ops.push({ tipo: 'upsert', tabla: 'molinos', row: molinoToRow(m), createdAt: ahora });
    for (const r of reparaciones) ops.push({ tipo: 'upsert', tabla: 'reparaciones', row: reparacionToRow(r), createdAt: ahora });
    await dbLocal.pendientes.bulkAdd(ops);
  });

  return { clientes: clientes.length, molinos: molinos.length, reparaciones: reparaciones.length };
}
