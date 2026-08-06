/* ============================================================
   MolineroApp - Capa de datos (Supabase + IndexedDB local)
   ------------------------------------------------------------
   Estrategia híbrida:
     - IndexedDB (Dexie): caché local → funciona SIN internet
     - Supabase: nube → sincroniza entre PC y celular
   
   Al arrancar con internet: descarga todo desde Supabase.
   Al guardar: escribe primero en local, luego sube a Supabase.
   Sin señal: trabaja 100% en local, igual que antes.
   ============================================================ */

// ---- Base local (Dexie / IndexedDB) ----
const dbLocal = new Dexie('MolineroAppDB');
dbLocal.version(1).stores({
  clientes:     'id, nombre, createdAt',
  molinos:      'id, clienteId, createdAt',
  reparaciones: 'id, molinoId, fecha, createdAt'
});

// ---- Cliente Supabase ----
const { createClient } = supabase;
const dbCloud = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function isOnline() { return navigator.onLine; }

// ------------------------------------------------------------------
// Mapeo: objetos JS ↔ filas de Supabase (snake_case)
// ------------------------------------------------------------------
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
    fotos: m.fotos || [],
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
    fotos: r.fotos || [],
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
    fotos: r.fotos || [],
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
    fotos: r.fotos || [],
    createdAt: r.created_at
  };
}

// ------------------------------------------------------------------
// Sincronización inicial: nube → local
// Llamada al arranque si hay internet.
// ------------------------------------------------------------------
async function sincronizarDesdeNube() {
  if (!isOnline()) return false;
  try {
    const [{ data: cls, error: e1 },
           { data: mols, error: e2 },
           { data: reps, error: e3 }] = await Promise.all([
      dbCloud.from('clientes').select('*'),
      dbCloud.from('molinos').select('*'),
      dbCloud.from('reparaciones').select('*')
    ]);
    if (e1 || e2 || e3) throw (e1 || e2 || e3);

    await dbLocal.transaction('rw', dbLocal.clientes, dbLocal.molinos, dbLocal.reparaciones, async () => {
      await dbLocal.clientes.clear();
      await dbLocal.molinos.clear();
      await dbLocal.reparaciones.clear();
      if (cls  && cls.length)  await dbLocal.clientes.bulkAdd(cls.map(rowToCliente));
      if (mols && mols.length) await dbLocal.molinos.bulkAdd(mols.map(rowToMolino));
      if (reps && reps.length) await dbLocal.reparaciones.bulkAdd(reps.map(rowToReparacion));
    });
    return true;
  } catch (e) {
    console.warn('No se pudo sincronizar desde Supabase:', e);
    return false;
  }
}

// ------------------------------------------------------------------
// Utilidades generales
// ------------------------------------------------------------------
function genId(prefix) {
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
  try { return '$ ' + n.toLocaleString('es-AR'); }
  catch (e) { return '$ ' + n; }
}

// ------------------------------------------------------------------
// CLIENTES
// ------------------------------------------------------------------
async function crearCliente(datos) {
  const cliente = Object.assign({}, datos, { id: genId('cli'), createdAt: Date.now() });
  await dbLocal.clientes.add(cliente);
  if (isOnline()) {
    const { error } = await dbCloud.from('clientes').insert(clienteToRow(cliente));
    if (error) console.warn('Error al subir cliente:', error);
  }
  return cliente;
}

async function actualizarCliente(datos) {
  await dbLocal.clientes.put(datos);
  if (isOnline()) {
    const { error } = await dbCloud.from('clientes').upsert(clienteToRow(datos));
    if (error) console.warn('Error al actualizar cliente:', error);
  }
  return datos;
}

async function eliminarCliente(clienteId) {
  await dbLocal.transaction('rw', dbLocal.clientes, dbLocal.molinos, dbLocal.reparaciones, async () => {
    const molinos = await dbLocal.molinos.where('clienteId').equals(clienteId).toArray();
    const ids = molinos.map(m => m.id);
    await dbLocal.reparaciones.where('molinoId').anyOf(ids).delete();
    await dbLocal.molinos.where('clienteId').equals(clienteId).delete();
    await dbLocal.clientes.delete(clienteId);
  });
  if (isOnline()) {
    // La eliminación en cascada en Supabase se encarga de molinos y reparaciones
    const { error } = await dbCloud.from('clientes').delete().eq('id', clienteId);
    if (error) console.warn('Error al eliminar cliente en la nube:', error);
  }
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
  if (isOnline()) {
    const { error } = await dbCloud.from('molinos').insert(molinoToRow(molino));
    if (error) console.warn('Error al subir molino:', error);
  }
  return molino;
}

async function actualizarMolino(datos) {
  await dbLocal.molinos.put(datos);
  if (isOnline()) {
    const { error } = await dbCloud.from('molinos').upsert(molinoToRow(datos));
    if (error) console.warn('Error al actualizar molino:', error);
  }
  return datos;
}

async function eliminarMolino(molinoId) {
  await dbLocal.transaction('rw', dbLocal.molinos, dbLocal.reparaciones, async () => {
    await dbLocal.reparaciones.where('molinoId').equals(molinoId).delete();
    await dbLocal.molinos.delete(molinoId);
  });
  if (isOnline()) {
    const { error } = await dbCloud.from('molinos').delete().eq('id', molinoId);
    if (error) console.warn('Error al eliminar molino en la nube:', error);
  }
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
  if (isOnline()) {
    const { error } = await dbCloud.from('reparaciones').insert(reparacionToRow(rep));
    if (error) console.warn('Error al subir reparación:', error);
  }
  return rep;
}

async function actualizarReparacion(datos) {
  await dbLocal.reparaciones.put(datos);
  if (isOnline()) {
    const { error } = await dbCloud.from('reparaciones').upsert(reparacionToRow(datos));
    if (error) console.warn('Error al actualizar reparación:', error);
  }
  return datos;
}

async function eliminarReparacion(repId) {
  await dbLocal.reparaciones.delete(repId);
  if (isOnline()) {
    const { error } = await dbCloud.from('reparaciones').delete().eq('id', repId);
    if (error) console.warn('Error al eliminar reparación en la nube:', error);
  }
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

  // 1. Restaurar en local
  await dbLocal.transaction('rw', dbLocal.clientes, dbLocal.molinos, dbLocal.reparaciones, async () => {
    await Promise.all([dbLocal.clientes.clear(), dbLocal.molinos.clear(), dbLocal.reparaciones.clear()]);
    if (clientes.length)     await dbLocal.clientes.bulkAdd(clientes);
    if (molinos.length)      await dbLocal.molinos.bulkAdd(molinos);
    if (reparaciones.length) await dbLocal.reparaciones.bulkAdd(reparaciones);
  });

  // 2. Subir a la nube si hay internet
  if (isOnline()) {
    try {
      await dbCloud.from('reparaciones').delete().neq('id', '___none___');
      await dbCloud.from('molinos').delete().neq('id', '___none___');
      await dbCloud.from('clientes').delete().neq('id', '___none___');
      if (clientes.length)     await dbCloud.from('clientes').insert(clientes.map(clienteToRow));
      if (molinos.length)      await dbCloud.from('molinos').insert(molinos.map(molinoToRow));
      if (reparaciones.length) await dbCloud.from('reparaciones').insert(reparaciones.map(reparacionToRow));
    } catch (e) {
      console.warn('No se pudo sincronizar el respaldo a la nube:', e);
    }
  }

  return { clientes: clientes.length, molinos: molinos.length, reparaciones: reparaciones.length };
}
