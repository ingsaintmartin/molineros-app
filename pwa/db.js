/* ============================================================
   MolineroApp v2 - Capa de datos (Turso + IndexedDB local)
   ------------------------------------------------------------
   Estrategia híbrida con cola de sincronización (outbox):
     - IndexedDB (Dexie): fuente de verdad local → funciona SIN internet
     - Turso: nube → sincroniza entre PC y celular
     - Cola "pendientes": cada escritura se registra como operación.
       Si hay conexión se sube en el momento; si no, queda encolada
       y se sube EN ORDEN cuando vuelve internet, ANTES de descargar.
   Esquema v3:
     clientes, instalaciones, trabajos, trabajo_items, repuestos,
     facturas, factura_items, gastos, vehiculos (+ pendientes)
   La v2 (clientes, molinos, reparaciones) se migra sola al abrir.
   ============================================================ */

// ---- Base local (Dexie / IndexedDB) ----
const dbLocal = new Dexie('MolineroAppDB');

// Convierte un molino v2 en instalación v3 (usado en la migración)
function molinoAInstalacion(m) {
  const car = {};
  if (m.tamanoCilindro)   car.tamanoCilindro = m.tamanoCilindro;
  if (m.diametroSuccion)  car.diametroSuccion = m.diametroSuccion;
  if (m.diametroImpulsion)car.diametroImpulsion = m.diametroImpulsion;
  if (m.profundidadPozo)  car.profundidadPozo = m.profundidadPozo;
  if (m.tipoInstalacion)  car.tipoAnterior = m.tipoInstalacion;
  return {
    id: m.id,
    clienteId: m.clienteId || null,
    tipo: 'molino',
    nombre: m.nombre || '',
    marca: m.marca || '',
    modelo: m.modelo || '',
    caracteristicas: car,
    estado: m.estado || 'Operativo',
    observaciones: m.observaciones || '',
    lat: m.lat ?? null,
    lng: m.lng ?? null,
    fotos: Array.isArray(m.fotos) ? m.fotos : [],
    createdAt: m.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

// Convierte una reparación v2 en trabajo v3 (usado en la migración)
function reparacionATrabajo(r, clienteId) {
  const tareas = [];
  if (r.trabajo) tareas.push(r.trabajo);
  const monto = parseFloat(r.costo);
  return {
    id: r.id,
    instalacionId: r.molinoId || null,
    clienteId: clienteId || null,
    fecha: r.fecha || hoyISO(),
    descripcion: r.problema || r.trabajo || '',
    tareas: tareas,
    piezasTexto: r.piezas || '',
    horas: null,
    tarifaHora: null,
    km: null,
    costoKm: null,
    montoManual: isNaN(monto) ? null : monto,
    estado: 'terminado',
    observaciones: r.observaciones || '',
    fotos: Array.isArray(r.fotos) ? r.fotos : [],
    createdAt: r.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

dbLocal.version(4).stores({
  clientes:      'id, nombre, createdAt',
  establecimientos: 'id, clienteId, nombre',
  instalaciones: 'id, clienteId, establecimientoId, tipo, createdAt',
  trabajos:      'id, instalacionId, clienteId, fecha, estado, createdAt',
  trabajo_items: 'id, trabajoId, createdAt',
  repuestos:     'id, nombre, categoria',
  facturas:      'id, clienteId, numero, estado, createdAt',
  factura_items: 'id, facturaId',
  gastos:        'id, fecha, categoria, trabajoId',
  vehiculos:     'id, nombre',
  pendientes:    '++seq, createdAt'   // cola de operaciones sin sincronizar
}).upgrade(async tx => {
  // Migración v2 → v3: molinos → instalaciones, reparaciones → trabajos.
  // Además se encolan los upserts para que la nube reciba las filas nuevas,
  // y se traducen las operaciones pendientes viejas (molinos/reparaciones).
  try {
    const ahora = Date.now();
    const tInst = tx.table('instalaciones');
    const tTrab = tx.table('trabajos');
    const tPend = tx.table('pendientes');
    const cliDeInstalacion = {};

    let molinos = [];
    try { molinos = await tx.table('molinos').toArray(); } catch (e) { /* v1 sin molinos */ }
    for (const m of molinos) {
      const inst = molinoAInstalacion(m);
      cliDeInstalacion[inst.id] = inst.clienteId;
      await tInst.add(inst);
      await tPend.add({ tipo: 'upsert', tabla: 'instalaciones', row: instalacionToRow(inst), createdAt: ahora });
    }

    let reps = [];
    try { reps = await tx.table('reparaciones').toArray(); } catch (e) { /* v1 sin reparaciones */ }
    for (const r of reps) {
      const t = reparacionATrabajo(r, cliDeInstalacion[r.molinoId]);
      await tTrab.add(t);
      await tPend.add({ tipo: 'upsert', tabla: 'trabajos', row: trabajoToRow(t), createdAt: ahora });
    }

    // Operaciones pendientes viejas: los upsert ya quedaron cubiertos por la
    // migración (la tabla local tiene lo último); los deletes se traducen.
    const opsViejas = await tPend.where('tabla').anyOf('molinos', 'reparaciones').toArray();
    for (const op of opsViejas) {
      if (op.tipo === 'delete') {
        await tPend.add({
          tipo: 'delete',
          tabla: op.tabla === 'molinos' ? 'instalaciones' : 'trabajos',
          id: op.id, createdAt: ahora
        });
      }
      await tPend.delete(op.seq);
    }
  } catch (e) {
    console.warn('Migración v2→v3 incompleta:', e);
  }
});
// Nota: Dexie elimina las tablas 'molinos' y 'reparaciones' que ya no figuran.

dbLocal.version(4).stores({
  clientes:         'id, nombre, createdAt',
  establecimientos: 'id, clienteId, nombre',
  instalaciones:    'id, clienteId, establecimientoId, tipo, createdAt',
  trabajos:         'id, instalacionId, clienteId, fecha, estado, createdAt',
  trabajo_items:    'id, trabajoId, createdAt',
  repuestos:        'id, nombre, categoria',
  facturas:         'id, clienteId, numero, estado, createdAt',
  factura_items:    'id, facturaId',
  gastos:           'id, fecha, categoria, trabajoId',
  vehiculos:        'id, nombre',
  pendientes:       '++seq, createdAt'
}).upgrade(async tx => {
  // Migración v3 → v4: las instalaciones existentes quedan sin
  // establecimiento (establecimientoId vacío) y se agrupan en
  // "Sin establecimiento" hasta que se les asigne uno.
});

// ---- Nube Turso (opcional: la app anda igual sin ella) ----
const TURSO_SIN_CONFIGURAR = 'TU-BASE';
const tursoConfigOk =
  typeof TURSO_URL !== 'undefined' &&
  typeof TURSO_AUTH_TOKEN !== 'undefined' &&
  String(TURSO_URL).indexOf(TURSO_SIN_CONFIGURAR) === -1 &&
  String(TURSO_AUTH_TOKEN).indexOf('TU-TOKEN') === -1;
function tursoEndpoint() {
  return String(TURSO_URL).replace(/^libsql:\/\//i, 'https://');
}

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
  return primero.results;
}

function filaAObjeto(columnas) {
  return function (fila) {
    const o = {};
    for (let i = 0; i < columnas.length; i++) o[columnas[i]] = fila[i];
    return o;
  };
}

function isOnline() { return navigator.onLine; }
function nubeLista() { return tursoConfigOk && navigator.onLine; }

// ------------------------------------------------------------------
// Mapeo: objetos JS (camelCase) ↔ filas de Turso (snake_case)
// ------------------------------------------------------------------
function jsonToDb(v) { return JSON.stringify(v === undefined || v === null ? (Array.isArray(v) ? [] : v) : v); }
function jsonFromDb(valor, defecto) {
  if (valor === undefined || valor === null || valor === '') return defecto;
  if (typeof valor === 'object') return valor;
  try { const v = JSON.parse(valor); return v === null || v === undefined ? defecto : v; }
  catch (e) { return defecto; }
}
function numOVacio(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function clienteToRow(c) {
  return {
    id: c.id, nombre: c.nombre || '', campo: c.campo || null,
    localidad: c.localidad || null, telefono: c.telefono || null,
    cuit: c.cuit || null, email: c.email || null,
    observaciones: c.observaciones || null, created_at: c.createdAt || Date.now()
  };
}
function rowToCliente(r) {
  return {
    id: r.id, nombre: r.nombre || '', campo: r.campo || '',
    localidad: r.localidad || '', telefono: r.telefono || '',
    cuit: r.cuit || '', email: r.email || '',
    observaciones: r.observaciones || '', createdAt: r.created_at
  };
}

function instalacionToRow(i) {
  return {
    id: i.id, cliente_id: i.clienteId || null,
    establecimiento_id: i.establecimientoId || null,
    tipo: i.tipo || 'molino',
    nombre: i.nombre || '', marca: i.marca || null, modelo: i.modelo || null,
    caracteristicas: JSON.stringify(i.caracteristicas || {}),
    estado: i.estado || null, observaciones: i.observaciones || null,
    lat: numOVacio(i.lat), lng: numOVacio(i.lng),
    fotos: JSON.stringify(i.fotos || []),
    created_at: i.createdAt || Date.now(), updated_at: i.updatedAt || Date.now()
  };
}
function rowToInstalacion(r) {
  return {
    id: r.id, clienteId: r.cliente_id || null,
    establecimientoId: r.establecimiento_id || null,
    tipo: r.tipo || 'molino',
    nombre: r.nombre || '', marca: r.marca || '', modelo: r.modelo || '',
    caracteristicas: jsonFromDb(r.caracteristicas, {}),
    estado: r.estado || 'Operativo', observaciones: r.observaciones || '',
    lat: r.lat ?? null, lng: r.lng ?? null,
    fotos: jsonFromDb(r.fotos, []),
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function establecimientoToRow(e) {
  return {
    id: e.id, cliente_id: e.clienteId || null, nombre: e.nombre || '',
    contacto: e.contacto || null, telefono: e.telefono || null,
    localidad: e.localidad || null, observaciones: e.observaciones || null,
    created_at: e.createdAt || Date.now()
  };
}
function rowToEstablecimiento(r) {
  return {
    id: r.id, clienteId: r.cliente_id || null, nombre: r.nombre || '',
    contacto: r.contacto || '', telefono: r.telefono || '',
    localidad: r.localidad || '', observaciones: r.observaciones || '',
    createdAt: r.created_at
  };
}

function trabajoToRow(t) {
  return {
    id: t.id, instalacion_id: t.instalacionId || null, cliente_id: t.clienteId || null,
    fecha: t.fecha || null, descripcion: t.descripcion || null,
    tareas: JSON.stringify(t.tareas || []),
    piezas_texto: t.piezasTexto || null,
    horas: numOVacio(t.horas), tarifa_hora: numOVacio(t.tarifaHora),
    km: numOVacio(t.km), costo_km: numOVacio(t.costoKm),
    monto_manual: numOVacio(t.montoManual),
    estado: t.estado || 'a_hacer', observaciones: t.observaciones || null,
    fotos: JSON.stringify(t.fotos || []),
    created_at: t.createdAt || Date.now(), updated_at: t.updatedAt || Date.now()
  };
}
function rowToTrabajo(r) {
  return {
    id: r.id, instalacionId: r.instalacion_id || null, clienteId: r.cliente_id || null,
    fecha: r.fecha || '', descripcion: r.descripcion || '',
    tareas: jsonFromDb(r.tareas, []),
    piezasTexto: r.piezas_texto || '',
    horas: r.horas ?? null, tarifaHora: r.tarifa_hora ?? null,
    km: r.km ?? null, costoKm: r.costo_km ?? null,
    montoManual: r.monto_manual ?? null,
    estado: r.estado || 'a_hacer', observaciones: r.observaciones || '',
    fotos: jsonFromDb(r.fotos, []),
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function trabajoItemToRow(it) {
  return {
    id: it.id, trabajo_id: it.trabajoId, repuesto_id: it.repuestoId || null,
    descripcion: it.descripcion || '', cantidad: numOVacio(it.cantidad) ?? 1,
    costo_unit: numOVacio(it.costoUnit), precio_unit: numOVacio(it.precioUnit),
    created_at: it.createdAt || Date.now()
  };
}
function rowToTrabajoItem(r) {
  return {
    id: r.id, trabajoId: r.trabajo_id, repuestoId: r.repuesto_id || null,
    descripcion: r.descripcion || '', cantidad: r.cantidad ?? 1,
    costoUnit: r.costo_unit ?? null, precioUnit: r.precio_unit ?? null,
    createdAt: r.created_at
  };
}

function repuestoToRow(p) {
  return {
    id: p.id, nombre: p.nombre || '', categoria: p.categoria || null,
    stock: numOVacio(p.stock) ?? 0, stock_min: numOVacio(p.stockMin) ?? 0,
    costo: numOVacio(p.costo), precio: numOVacio(p.precio),
    created_at: p.createdAt || Date.now(), updated_at: p.updatedAt || Date.now()
  };
}
function rowToRepuesto(r) {
  return {
    id: r.id, nombre: r.nombre || '', categoria: r.categoria || '',
    stock: r.stock ?? 0, stockMin: r.stock_min ?? 0,
    costo: r.costo ?? null, precio: r.precio ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function facturaToRow(f) {
  return {
    id: f.id, cliente_id: f.clienteId || null, numero: f.numero || '',
    tipo: f.tipo || 'factura', fecha: f.fecha || null, estado: f.estado || 'pendiente',
    subtotal: numOVacio(f.subtotal) ?? 0, total: numOVacio(f.total) ?? 0,
    observaciones: f.observaciones || null,
    created_at: f.createdAt || Date.now(), updated_at: f.updatedAt || Date.now()
  };
}
function rowToFactura(r) {
  return {
    id: r.id, clienteId: r.cliente_id || null, numero: r.numero || '',
    tipo: r.tipo || 'factura', fecha: r.fecha || '', estado: r.estado || 'pendiente',
    subtotal: r.subtotal ?? 0, total: r.total ?? 0,
    observaciones: r.observaciones || '',
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function facturaItemToRow(it) {
  return {
    id: it.id, factura_id: it.facturaId, trabajo_id: it.trabajoId || null,
    descripcion: it.descripcion || '', cantidad: numOVacio(it.cantidad) ?? 1,
    precio_unit: numOVacio(it.precioUnit) ?? 0,
    created_at: it.createdAt || Date.now()
  };
}
function rowToFacturaItem(r) {
  return {
    id: r.id, facturaId: r.factura_id, trabajoId: r.trabajo_id || null,
    descripcion: r.descripcion || '', cantidad: r.cantidad ?? 1,
    precioUnit: r.precio_unit ?? 0, createdAt: r.created_at
  };
}

function gastoToRow(g) {
  return {
    id: g.id, fecha: g.fecha || null, categoria: g.categoria || 'varios',
    descripcion: g.descripcion || '', monto: numOVacio(g.monto) ?? 0,
    trabajo_id: g.trabajoId || null, vehiculo_id: g.vehiculoId || null,
    created_at: g.createdAt || Date.now()
  };
}
function rowToGasto(r) {
  return {
    id: r.id, fecha: r.fecha || '', categoria: r.categoria || 'varios',
    descripcion: r.descripcion || '', monto: r.monto ?? 0,
    trabajoId: r.trabajo_id || null, vehiculoId: r.vehiculo_id || null,
    createdAt: r.created_at
  };
}

function vehiculoToRow(v) {
  return {
    id: v.id, nombre: v.nombre || '', patente: v.patente || null,
    km_actual: numOVacio(v.kmActual) ?? 0, costo_km: numOVacio(v.costoKm) ?? 0,
    observaciones: v.observaciones || null,
    created_at: v.createdAt || Date.now()
  };
}
function rowToVehiculo(r) {
  return {
    id: r.id, nombre: r.nombre || '', patente: r.patente || '',
    kmActual: r.km_actual ?? 0, costoKm: r.costo_km ?? 0,
    observaciones: r.observaciones || '', createdAt: r.created_at
  };
}

// ------------------------------------------------------------------
// Cola de sincronización (outbox)
// ------------------------------------------------------------------
async function registrarOperacion(op) {
  await dbLocal.pendientes.add(Object.assign({ createdAt: Date.now() }, op));
  if (nubeLista()) await subirPendientes();
}

const COLUMNAS = {
  clientes:      ['id', 'nombre', 'campo', 'localidad', 'telefono', 'cuit', 'email', 'observaciones', 'created_at'],
  establecimientos: ['id', 'cliente_id', 'nombre', 'contacto', 'telefono', 'localidad', 'observaciones', 'created_at'],
  instalaciones: ['id', 'cliente_id', 'establecimiento_id', 'tipo', 'nombre', 'marca', 'modelo', 'caracteristicas',
                  'estado', 'observaciones', 'lat', 'lng', 'fotos', 'created_at', 'updated_at'],
  trabajos:      ['id', 'instalacion_id', 'cliente_id', 'fecha', 'descripcion', 'tareas', 'piezas_texto',
                  'horas', 'tarifa_hora', 'km', 'costo_km', 'monto_manual',
                  'estado', 'observaciones', 'fotos', 'created_at', 'updated_at'],
  trabajo_items: ['id', 'trabajo_id', 'repuesto_id', 'descripcion', 'cantidad', 'costo_unit', 'precio_unit', 'created_at'],
  repuestos:     ['id', 'nombre', 'categoria', 'stock', 'stock_min', 'costo', 'precio', 'created_at', 'updated_at'],
  facturas:      ['id', 'cliente_id', 'numero', 'tipo', 'fecha', 'estado', 'subtotal', 'total',
                  'observaciones', 'created_at', 'updated_at'],
  factura_items: ['id', 'factura_id', 'trabajo_id', 'descripcion', 'cantidad', 'precio_unit', 'created_at'],
  gastos:        ['id', 'fecha', 'categoria', 'descripcion', 'monto', 'trabajo_id', 'vehiculo_id', 'created_at'],
  vehiculos:     ['id', 'nombre', 'patente', 'km_actual', 'costo_km', 'observaciones', 'created_at']
};
const TABLAS_SYNC = Object.keys(COLUMNAS);

// ------------------------------------------------------------------
// Esquema en la nube: la app crea las tablas si no existen.
// Es idempotente (CREATE TABLE IF NOT EXISTS) y se ejecuta sola
// al iniciar cuando hay nube configurada. Así ningún despliegue
// queda con tablas faltantes.
// ------------------------------------------------------------------
const TURSO_DDL = [
  `CREATE TABLE IF NOT EXISTS clientes (
     id TEXT PRIMARY KEY, nombre TEXT, campo TEXT, localidad TEXT,
     telefono TEXT, cuit TEXT, email TEXT, observaciones TEXT, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS instalaciones (
     id TEXT PRIMARY KEY, cliente_id TEXT, establecimiento_id TEXT, tipo TEXT, nombre TEXT,
     marca TEXT, modelo TEXT, caracteristicas TEXT, estado TEXT,
     observaciones TEXT, lat REAL, lng REAL, fotos TEXT,
     created_at INTEGER, updated_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS establecimientos (
     id TEXT PRIMARY KEY, cliente_id TEXT, nombre TEXT, contacto TEXT,
     telefono TEXT, localidad TEXT, observaciones TEXT, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS trabajos (
     id TEXT PRIMARY KEY, instalacion_id TEXT, cliente_id TEXT, fecha TEXT,
     descripcion TEXT, tareas TEXT, piezas_texto TEXT, horas REAL,
     tarifa_hora REAL, km REAL, costo_km REAL, monto_manual REAL,
     estado TEXT, observaciones TEXT, fotos TEXT,
     created_at INTEGER, updated_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS trabajo_items (
     id TEXT PRIMARY KEY, trabajo_id TEXT, repuesto_id TEXT,
     descripcion TEXT, cantidad REAL, costo_unit REAL, precio_unit REAL,
     created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS repuestos (
     id TEXT PRIMARY KEY, nombre TEXT, categoria TEXT, stock REAL,
     stock_min REAL, costo REAL, precio REAL,
     created_at INTEGER, updated_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS facturas (
     id TEXT PRIMARY KEY, cliente_id TEXT, numero TEXT, tipo TEXT,
     fecha TEXT, estado TEXT, subtotal REAL, total REAL,
     observaciones TEXT, created_at INTEGER, updated_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS factura_items (
     id TEXT PRIMARY KEY, factura_id TEXT, trabajo_id TEXT,
     descripcion TEXT, cantidad REAL, precio_unit REAL, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS gastos (
     id TEXT PRIMARY KEY, fecha TEXT, categoria TEXT, descripcion TEXT,
     monto REAL, trabajo_id TEXT, vehiculo_id TEXT, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS vehiculos (
     id TEXT PRIMARY KEY, nombre TEXT, patente TEXT, km_actual REAL,
     costo_km REAL, observaciones TEXT, created_at INTEGER)`,
  // Columnas nuevas en tablas que ya existían (se ignoran si ya están)
  `ALTER TABLE clientes ADD COLUMN cuit TEXT`,
  `ALTER TABLE clientes ADD COLUMN email TEXT`,
  `ALTER TABLE instalaciones ADD COLUMN establecimiento_id TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_ins_cliente ON instalaciones(cliente_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ins_est ON instalaciones(establecimiento_id)`,
  `CREATE INDEX IF NOT EXISTS idx_est_cli ON establecimientos(cliente_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tra_ins ON trabajos(instalacion_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tra_cli ON trabajos(cliente_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tit_tra ON trabajo_items(trabajo_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rep_cat ON repuestos(categoria)`,
  `CREATE INDEX IF NOT EXISTS idx_fac_cli ON facturas(cliente_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fit_fac ON factura_items(factura_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gas_fecha ON gastos(fecha)`
];

async function asegurarEsquemaNube() {
  if (!nubeLista()) return false;
  try {
    for (const sql of TURSO_DDL) {
      try {
        await tursoQuery(sql);
      } catch (e) {
        // "duplicate column name" al agregar una columna que ya existe: se ignora
        if (!/duplicate column/i.test(String(e && e.message))) throw e;
      }
    }
    return true;
  } catch (e) {
    console.warn('No se pudo asegurar el esquema en Turso:', e);
    return false;
  }
}

async function subirOperacion(op) {
  const cols = COLUMNAS[op.tabla];
  if (!cols) {
    // Operación de una tabla vieja (p.ej. 'molinos'): se descarta sin frenar la cola.
    console.warn('Se omite operación de tabla desconocida:', op.tabla);
    return;
  }
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
// ------------------------------------------------------------------
async function descargarDesdeNube() {
  try {
    const resultados = await Promise.all(
      TABLAS_SYNC.map(t => tursoQuery('SELECT * FROM ' + t))
    );
    const porTabla = {};
    TABLAS_SYNC.forEach((t, i) => {
      porTabla[t] = resultados[i].rows.map(filaAObjeto(resultados[i].columns));
    });

    const tablasLocales = TABLAS_SYNC.map(t => dbLocal[t]);
    await dbLocal.transaction('rw', ...tablasLocales, async () => {
      for (const t of TABLAS_SYNC) await dbLocal[t].clear();
      const conversores = {
        clientes: rowToCliente, establecimientos: rowToEstablecimiento,
        instalaciones: rowToInstalacion,
        trabajos: rowToTrabajo, trabajo_items: rowToTrabajoItem,
        repuestos: rowToRepuesto, facturas: rowToFactura,
        factura_items: rowToFacturaItem, gastos: rowToGasto,
        vehiculos: rowToVehiculo
      };
      for (const t of TABLAS_SYNC) {
        const filas = porTabla[t];
        if (filas.length) await dbLocal[t].bulkAdd(filas.map(conversores[t]));
      }
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
  if (!subidasOk) return false;
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
  try { return '$ ' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 }); }
  catch (e) { return '$ ' + n; }
}

function nombreMes(iso) {
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio',
                 'agosto','septiembre','octubre','noviembre','diciembre'];
  const p = String(iso || '').slice(0, 7).split('-');
  if (p.length !== 2) return '';
  return meses[parseInt(p[1], 10) - 1] + ' ' + p[0];
}

// ------------------------------------------------------------------
// Cálculos económicos (funciones puras, las usa la interfaz)
// ------------------------------------------------------------------
// Ingresos = mano de obra + repuestos (precio) + monto manual
// Costos   = repuestos (costo) + viaje (km × costo/km)
// Margen   = ingresos − costos
function totalesTrabajo(t, items) {
  items = items || [];
  let matCosto = 0, matPrecio = 0;
  for (const it of items) {
    const c = it.cantidad || 0;
    matCosto  += c * (parseFloat(it.costoUnit)  || 0);
    matPrecio += c * (parseFloat(it.precioUnit) || 0);
  }
  const manoObra = (parseFloat(t.horas) || 0) * (parseFloat(t.tarifaHora) || 0);
  const viaje    = (parseFloat(t.km) || 0) * (parseFloat(t.costoKm) || 0);
  const manual   = parseFloat(t.montoManual) || 0;
  const ingresos = manoObra + matPrecio + manual;
  const costos   = matCosto + viaje;
  return {
    materialesCosto: matCosto, materialesPrecio: matPrecio,
    manoObra: manoObra, viaje: viaje, manual: manual,
    ingresos: ingresos, costos: costos, margen: ingresos - costos,
    margenPct: ingresos > 0 ? (ingresos - costos) / ingresos * 100 : 0
  };
}

// ------------------------------------------------------------------
// CLIENTES
// ------------------------------------------------------------------
async function crearCliente(datos) {
  const c = Object.assign({}, datos, { id: genId('cli'), createdAt: Date.now() });
  await dbLocal.clientes.add(c);
  await registrarOperacion({ tipo: 'upsert', tabla: 'clientes', row: clienteToRow(c) });
  return c;
}

async function actualizarCliente(datos) {
  await dbLocal.clientes.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'clientes', row: clienteToRow(datos) });
  return datos;
}

async function eliminarCliente(clienteId) {
  const ahora = Date.now();
  const ops = [];
  await dbLocal.transaction('rw',
    dbLocal.clientes, dbLocal.establecimientos, dbLocal.instalaciones, dbLocal.trabajos, dbLocal.trabajo_items,
    dbLocal.facturas, dbLocal.factura_items, dbLocal.gastos, async () => {
      const insts = await dbLocal.instalaciones.where('clienteId').equals(clienteId).toArray();
      const idsInst = insts.map(i => i.id);
      let idsTrab = [];
      if (idsInst.length) {
        const trs = await dbLocal.trabajos.where('instalacionId').anyOf(idsInst).toArray();
        idsTrab = trs.map(t => t.id);
      }
      const trsCli = await dbLocal.trabajos.where('clienteId').equals(clienteId).toArray();
      for (const t of trsCli) if (idsTrab.indexOf(t.id) === -1) idsTrab.push(t.id);

      if (idsTrab.length) {
        const items = await dbLocal.trabajo_items.where('trabajoId').anyOf(idsTrab).toArray();
        for (const it of items) ops.push({ tipo: 'delete', tabla: 'trabajo_items', id: it.id, createdAt: ahora });
        await dbLocal.trabajo_items.where('trabajoId').anyOf(idsTrab).delete();

        const gastos = await dbLocal.gastos.where('trabajoId').anyOf(idsTrab).toArray();
        for (const g of gastos) ops.push({ tipo: 'delete', tabla: 'gastos', id: g.id, createdAt: ahora });
        await dbLocal.gastos.where('trabajoId').anyOf(idsTrab).delete();

        // Los ítems de factura conservan la historia: se desvinculan del trabajo
        const fi = await dbLocal.factura_items.where('trabajoId').anyOf(idsTrab).toArray();
        for (const f of fi) {
          const copia = Object.assign({}, f, { trabajoId: null });
          await dbLocal.factura_items.put(copia);
          ops.push({ tipo: 'upsert', tabla: 'factura_items', row: facturaItemToRow(copia), createdAt: ahora });
        }
        for (const id of idsTrab) ops.push({ tipo: 'delete', tabla: 'trabajos', id: id, createdAt: ahora });
        await dbLocal.trabajos.where('id').anyOf(idsTrab).delete();
      }

      const facts = await dbLocal.facturas.where('clienteId').equals(clienteId).toArray();
      for (const f of facts) {
        const fis = await dbLocal.factura_items.where('facturaId').equals(f.id).toArray();
        for (const x of fis) ops.push({ tipo: 'delete', tabla: 'factura_items', id: x.id, createdAt: ahora });
        await dbLocal.factura_items.where('facturaId').equals(f.id).delete();
        ops.push({ tipo: 'delete', tabla: 'facturas', id: f.id, createdAt: ahora });
      }
      await dbLocal.facturas.where('clienteId').equals(clienteId).delete();

      for (const id of idsInst) ops.push({ tipo: 'delete', tabla: 'instalaciones', id: id, createdAt: ahora });
      await dbLocal.instalaciones.where('clienteId').equals(clienteId).delete();

      const ests = await dbLocal.establecimientos.where('clienteId').equals(clienteId).toArray();
      for (const e of ests) ops.push({ tipo: 'delete', tabla: 'establecimientos', id: e.id, createdAt: ahora });
      await dbLocal.establecimientos.where('clienteId').equals(clienteId).delete();

      await dbLocal.clientes.delete(clienteId);
    });
  ops.push({ tipo: 'delete', tabla: 'clientes', id: clienteId, createdAt: ahora });
  await dbLocal.pendientes.bulkAdd(ops);
  if (nubeLista()) await subirPendientes();
}

async function getClientes() {
  return dbLocal.clientes.orderBy('nombre').toArray();
}
async function getCliente(id) { return dbLocal.clientes.get(id); }

// ------------------------------------------------------------------
// ESTABLECIMIENTOS (cada cliente/CUIT puede tener varios; cada uno con
// su propio contacto, distinto del contacto general del cliente)
// ------------------------------------------------------------------
async function crearEstablecimiento(datos) {
  const e = Object.assign({}, datos, { id: genId('est'), createdAt: Date.now() });
  await dbLocal.establecimientos.add(e);
  await registrarOperacion({ tipo: 'upsert', tabla: 'establecimientos', row: establecimientoToRow(e) });
  return e;
}

async function actualizarEstablecimiento(datos) {
  await dbLocal.establecimientos.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'establecimientos', row: establecimientoToRow(datos) });
  return datos;
}

async function eliminarEstablecimiento(estId) {
  const ahora = Date.now();
  const ops = [];
  await dbLocal.transaction('rw', dbLocal.establecimientos, dbLocal.instalaciones, async () => {
    // Las instalaciones no se borran: quedan en el cliente, sin establecimiento.
    const inss = await dbLocal.instalaciones.where('establecimientoId').equals(estId).toArray();
    for (const i of inss) {
      const copia = Object.assign({}, i, { establecimientoId: null, updatedAt: ahora });
      await dbLocal.instalaciones.put(copia);
      ops.push({ tipo: 'upsert', tabla: 'instalaciones', row: instalacionToRow(copia), createdAt: ahora });
    }
    await dbLocal.establecimientos.delete(estId);
  });
  ops.push({ tipo: 'delete', tabla: 'establecimientos', id: estId, createdAt: ahora });
  await dbLocal.pendientes.bulkAdd(ops);
  if (nubeLista()) await subirPendientes();
}

async function getEstablecimientosDeCliente(clienteId) {
  return dbLocal.establecimientos.where('clienteId').equals(clienteId).toArray();
}
async function getEstablecimiento(id) { return dbLocal.establecimientos.get(id); }

// ------------------------------------------------------------------
// INSTALACIONES (molinos, tanques, bebederos, bombas...)
// ------------------------------------------------------------------
async function crearInstalacion(datos) {
  const i = Object.assign({}, datos, { id: genId('ins'), createdAt: Date.now(), updatedAt: Date.now() });
  await dbLocal.instalaciones.add(i);
  await registrarOperacion({ tipo: 'upsert', tabla: 'instalaciones', row: instalacionToRow(i) });
  return i;
}

async function actualizarInstalacion(datos) {
  datos.updatedAt = Date.now();
  await dbLocal.instalaciones.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'instalaciones', row: instalacionToRow(datos) });
  return datos;
}

async function eliminarInstalacion(instId) {
  const ahora = Date.now();
  const ops = [];
  await dbLocal.transaction('rw',
    dbLocal.instalaciones, dbLocal.trabajos, dbLocal.trabajo_items, dbLocal.gastos, dbLocal.factura_items,
    async () => {
      const trs = await dbLocal.trabajos.where('instalacionId').equals(instId).toArray();
      const idsTrab = trs.map(t => t.id);
      if (idsTrab.length) {
        const items = await dbLocal.trabajo_items.where('trabajoId').anyOf(idsTrab).toArray();
        for (const it of items) ops.push({ tipo: 'delete', tabla: 'trabajo_items', id: it.id, createdAt: ahora });
        await dbLocal.trabajo_items.where('trabajoId').anyOf(idsTrab).delete();
        const gastos = await dbLocal.gastos.where('trabajoId').anyOf(idsTrab).toArray();
        for (const g of gastos) ops.push({ tipo: 'delete', tabla: 'gastos', id: g.id, createdAt: ahora });
        await dbLocal.gastos.where('trabajoId').anyOf(idsTrab).delete();
        const fi = await dbLocal.factura_items.where('trabajoId').anyOf(idsTrab).toArray();
        for (const f of fi) {
          const copia = Object.assign({}, f, { trabajoId: null });
          await dbLocal.factura_items.put(copia);
          ops.push({ tipo: 'upsert', tabla: 'factura_items', row: facturaItemToRow(copia), createdAt: ahora });
        }
        for (const id of idsTrab) ops.push({ tipo: 'delete', tabla: 'trabajos', id: id, createdAt: ahora });
        await dbLocal.trabajos.where('id').anyOf(idsTrab).delete();
      }
      await dbLocal.instalaciones.delete(instId);
    });
  ops.push({ tipo: 'delete', tabla: 'instalaciones', id: instId, createdAt: ahora });
  await dbLocal.pendientes.bulkAdd(ops);
  if (nubeLista()) await subirPendientes();
}

async function getInstalacionesDeCliente(clienteId) {
  return dbLocal.instalaciones.where('clienteId').equals(clienteId).toArray();
}
async function getInstalacion(id) { return dbLocal.instalaciones.get(id); }
async function getInstalaciones() { return dbLocal.instalaciones.toArray(); }

// ------------------------------------------------------------------
// TRABAJOS
// ------------------------------------------------------------------
async function crearTrabajo(datos) {
  const t = Object.assign({}, datos, { id: genId('tra'), createdAt: Date.now(), updatedAt: Date.now() });
  if (!t.estado) t.estado = 'a_hacer';
  await dbLocal.trabajos.add(t);
  await registrarOperacion({ tipo: 'upsert', tabla: 'trabajos', row: trabajoToRow(t) });
  return t;
}

async function actualizarTrabajo(datos) {
  datos.updatedAt = Date.now();
  await dbLocal.trabajos.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'trabajos', row: trabajoToRow(datos) });
  return datos;
}

async function eliminarTrabajo(trabajoId) {
  const ahora = Date.now();
  const ops = [];
  await dbLocal.transaction('rw',
    dbLocal.trabajos, dbLocal.trabajo_items, dbLocal.gastos, dbLocal.factura_items,
    async () => {
      // Al borrar un trabajo, el stock usado vuelve al inventario
      const items = await dbLocal.trabajo_items.where('trabajoId').equals(trabajoId).toArray();
      for (const it of items) {
        ops.push({ tipo: 'delete', tabla: 'trabajo_items', id: it.id, createdAt: ahora });
        if (it.repuestoId) {
          const rep = await dbLocal.repuestos.get(it.repuestoId);
          if (rep) {
            rep.stock = (parseFloat(rep.stock) || 0) + (parseFloat(it.cantidad) || 0);
            rep.updatedAt = ahora;
            await dbLocal.repuestos.put(rep);
            ops.push({ tipo: 'upsert', tabla: 'repuestos', row: repuestoToRow(rep), createdAt: ahora });
          }
        }
      }
      await dbLocal.trabajo_items.where('trabajoId').equals(trabajoId).delete();

      const gastos = await dbLocal.gastos.where('trabajoId').equals(trabajoId).toArray();
      for (const g of gastos) ops.push({ tipo: 'delete', tabla: 'gastos', id: g.id, createdAt: ahora });
      await dbLocal.gastos.where('trabajoId').equals(trabajoId).delete();

      const fi = await dbLocal.factura_items.where('trabajoId').equals(trabajoId).toArray();
      for (const f of fi) {
        const copia = Object.assign({}, f, { trabajoId: null });
        await dbLocal.factura_items.put(copia);
        ops.push({ tipo: 'upsert', tabla: 'factura_items', row: facturaItemToRow(copia), createdAt: ahora });
      }
      await dbLocal.trabajos.delete(trabajoId);
    });
  ops.push({ tipo: 'delete', tabla: 'trabajos', id: trabajoId, createdAt: ahora });
  await dbLocal.pendientes.bulkAdd(ops);
  if (nubeLista()) await subirPendientes();
}

// Guarda la lista completa de repuestos de un trabajo.
// Descuenta del stock lo nuevo y devuelve lo que se quitó.
async function guardarItemsTrabajo(trabajoId, items) {
  const ahora = Date.now();
  const ops = [];
  await dbLocal.transaction('rw', dbLocal.trabajo_items, dbLocal.repuestos, async () => {
    const anteriores = await dbLocal.trabajo_items.where('trabajoId').equals(trabajoId).toArray();
    // Devolver stock de los ítems anteriores
    for (const it of anteriores) {
      if (it.repuestoId) {
        const rep = await dbLocal.repuestos.get(it.repuestoId);
        if (rep) {
          rep.stock = (parseFloat(rep.stock) || 0) + (parseFloat(it.cantidad) || 0);
          rep.updatedAt = ahora;
          await dbLocal.repuestos.put(rep);
          ops.push({ tipo: 'upsert', tabla: 'repuestos', row: repuestoToRow(rep), createdAt: ahora });
        }
      }
      ops.push({ tipo: 'delete', tabla: 'trabajo_items', id: it.id, createdAt: ahora });
    }
    await dbLocal.trabajo_items.where('trabajoId').equals(trabajoId).delete();
    // Agregar los nuevos y descontar stock
    for (const it of items || []) {
      const cant = parseFloat(it.cantidad) || 0;
      if (cant <= 0 && !(it.descripcion)) continue;
      const nuevo = {
        id: genId('tit'), trabajoId: trabajoId,
        repuestoId: it.repuestoId || null,
        descripcion: it.descripcion || '',
        cantidad: cant, costoUnit: numOVacio(it.costoUnit),
        precioUnit: numOVacio(it.precioUnit), createdAt: ahora
      };
      await dbLocal.trabajo_items.add(nuevo);
      ops.push({ tipo: 'upsert', tabla: 'trabajo_items', row: trabajoItemToRow(nuevo), createdAt: ahora });
      if (nuevo.repuestoId) {
        const rep = await dbLocal.repuestos.get(nuevo.repuestoId);
        if (rep) {
          rep.stock = (parseFloat(rep.stock) || 0) - cant;
          rep.updatedAt = ahora;
          await dbLocal.repuestos.put(rep);
          ops.push({ tipo: 'upsert', tabla: 'repuestos', row: repuestoToRow(rep), createdAt: ahora });
        }
      }
    }
  });
  if (ops.length) await dbLocal.pendientes.bulkAdd(ops);
  if (nubeLista()) await subirPendientes();
}

async function getTrabajo(id) { return dbLocal.trabajos.get(id); }
async function getTrabajos() {
  const lista = await dbLocal.trabajos.toArray();
  lista.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || (b.createdAt - a.createdAt));
  return lista;
}
async function getTrabajosDeInstalacion(instId) {
  const lista = await dbLocal.trabajos.where('instalacionId').equals(instId).toArray();
  lista.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || (b.createdAt - a.createdAt));
  return lista;
}
async function getTrabajosDeCliente(clienteId) {
  const lista = await dbLocal.trabajos.where('clienteId').equals(clienteId).toArray();
  lista.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || (b.createdAt - a.createdAt));
  return lista;
}
async function getItemsDeTrabajo(trabajoId) {
  return dbLocal.trabajo_items.where('trabajoId').equals(trabajoId).toArray();
}

// ------------------------------------------------------------------
// REPUESTOS (stock)
// ------------------------------------------------------------------
async function crearRepuesto(datos) {
  const p = Object.assign({}, datos, { id: genId('rep'), createdAt: Date.now(), updatedAt: Date.now() });
  await dbLocal.repuestos.add(p);
  await registrarOperacion({ tipo: 'upsert', tabla: 'repuestos', row: repuestoToRow(p) });
  return p;
}
async function actualizarRepuesto(datos) {
  datos.updatedAt = Date.now();
  await dbLocal.repuestos.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'repuestos', row: repuestoToRow(datos) });
  return datos;
}
async function eliminarRepuesto(id) {
  // Los ítems de trabajos que lo usaban quedan con la descripción histórica
  const items = await dbLocal.trabajo_items.where('repuestoId').equals(id).toArray();
  const ahora = Date.now();
  const ops = [];
  for (const it of items) {
    const copia = Object.assign({}, it, { repuestoId: null });
    await dbLocal.trabajo_items.put(copia);
    ops.push({ tipo: 'upsert', tabla: 'trabajo_items', row: trabajoItemToRow(copia), createdAt: ahora });
  }
  await dbLocal.repuestos.delete(id);
  ops.push({ tipo: 'delete', tabla: 'repuestos', id: id, createdAt: ahora });
  await dbLocal.pendientes.bulkAdd(ops);
  if (nubeLista()) await subirPendientes();
}
async function getRepuestos() {
  return dbLocal.repuestos.orderBy('nombre').toArray();
}
async function getRepuesto(id) { return dbLocal.repuestos.get(id); }

// ------------------------------------------------------------------
// FACTURACIÓN (presupuestos, facturas, recibos)
// ------------------------------------------------------------------
async function proximoNumero(tipo) {
  const lista = await dbLocal.facturas.where('tipo').equals(tipo).toArray();
  let max = 0;
  for (const f of lista) {
    const n = parseInt(String(f.numero).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return String(max + 1).padStart(8, '0');
}

async function crearFactura(datos, items) {
  const ahora = Date.now();
  const f = Object.assign({}, datos, {
    id: genId('fac'), numero: datos.numero || await proximoNumero(datos.tipo || 'factura'),
    createdAt: ahora, updatedAt: ahora
  });
  const ops = [{ tipo: 'upsert', tabla: 'facturas', row: facturaToRow(f), createdAt: ahora }];
  await dbLocal.transaction('rw', dbLocal.facturas, dbLocal.factura_items, async () => {
    await dbLocal.facturas.add(f);
    for (const it of items || []) {
      const nuevo = {
        id: genId('fit'), facturaId: f.id, trabajoId: it.trabajoId || null,
        descripcion: it.descripcion || '', cantidad: parseFloat(it.cantidad) || 1,
        precioUnit: numOVacio(it.precioUnit) ?? 0, createdAt: ahora
      };
      await dbLocal.factura_items.add(nuevo);
      ops.push({ tipo: 'upsert', tabla: 'factura_items', row: facturaItemToRow(nuevo), createdAt: ahora });
    }
  });
  await dbLocal.pendientes.bulkAdd(ops);
  if (nubeLista()) await subirPendientes();
  return f;
}

async function actualizarFactura(datos) {
  datos.updatedAt = Date.now();
  await dbLocal.facturas.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'facturas', row: facturaToRow(datos) });
  return datos;
}

async function eliminarFactura(id) {
  const ahora = Date.now();
  const ops = [];
  await dbLocal.transaction('rw', dbLocal.facturas, dbLocal.factura_items, async () => {
    const fis = await dbLocal.factura_items.where('facturaId').equals(id).toArray();
    for (const x of fis) ops.push({ tipo: 'delete', tabla: 'factura_items', id: x.id, createdAt: ahora });
    await dbLocal.factura_items.where('facturaId').equals(id).delete();
    await dbLocal.facturas.delete(id);
  });
  ops.push({ tipo: 'delete', tabla: 'facturas', id: id, createdAt: ahora });
  await dbLocal.pendientes.bulkAdd(ops);
  if (nubeLista()) await subirPendientes();
}

async function getFacturas() {
  const lista = await dbLocal.facturas.toArray();
  lista.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || (b.createdAt - a.createdAt));
  return lista;
}
async function getFactura(id) { return dbLocal.facturas.get(id); }
async function getItemsDeFactura(facturaId) {
  return dbLocal.factura_items.where('facturaId').equals(facturaId).toArray();
}
async function getFacturasDeCliente(clienteId) {
  const lista = await dbLocal.facturas.where('clienteId').equals(clienteId).toArray();
  lista.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || (b.createdAt - a.createdAt));
  return lista;
}

// ------------------------------------------------------------------
// GASTOS
// ------------------------------------------------------------------
async function crearGasto(datos) {
  const g = Object.assign({}, datos, { id: genId('gas'), createdAt: Date.now() });
  await dbLocal.gastos.add(g);
  await registrarOperacion({ tipo: 'upsert', tabla: 'gastos', row: gastoToRow(g) });
  return g;
}
async function actualizarGasto(datos) {
  await dbLocal.gastos.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'gastos', row: gastoToRow(datos) });
  return datos;
}
async function eliminarGasto(id) {
  await dbLocal.gastos.delete(id);
  await registrarOperacion({ tipo: 'delete', tabla: 'gastos', id: id });
}
async function getGastos() {
  const lista = await dbLocal.gastos.toArray();
  lista.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || (b.createdAt - a.createdAt));
  return lista;
}
async function getGastosDeTrabajo(trabajoId) {
  return dbLocal.gastos.where('trabajoId').equals(trabajoId).toArray();
}

// ------------------------------------------------------------------
// VEHÍCULOS
// ------------------------------------------------------------------
async function crearVehiculo(datos) {
  const v = Object.assign({}, datos, { id: genId('veh'), createdAt: Date.now() });
  await dbLocal.vehiculos.add(v);
  await registrarOperacion({ tipo: 'upsert', tabla: 'vehiculos', row: vehiculoToRow(v) });
  return v;
}
async function actualizarVehiculo(datos) {
  await dbLocal.vehiculos.put(datos);
  await registrarOperacion({ tipo: 'upsert', tabla: 'vehiculos', row: vehiculoToRow(datos) });
  return datos;
}
async function eliminarVehiculo(id) {
  const gastos = await dbLocal.gastos.where('vehiculoId').equals(id).toArray();
  const ahora = Date.now();
  const ops = [];
  for (const g of gastos) {
    const copia = Object.assign({}, g, { vehiculoId: null });
    await dbLocal.gastos.put(copia);
    ops.push({ tipo: 'upsert', tabla: 'gastos', row: gastoToRow(copia), createdAt: ahora });
  }
  await dbLocal.vehiculos.delete(id);
  ops.push({ tipo: 'delete', tabla: 'vehiculos', id: id, createdAt: ahora });
  await dbLocal.pendientes.bulkAdd(ops);
  if (nubeLista()) await subirPendientes();
}
async function getVehiculos() { return dbLocal.vehiculos.orderBy('nombre').toArray(); }
async function getVehiculo(id) { return dbLocal.vehiculos.get(id); }

// ------------------------------------------------------------------
// RESPALDO (exportar / importar JSON — funciona offline)
// ------------------------------------------------------------------
async function armarRespaldo() {
  const [clientes, establecimientos, instalaciones, trabajos, trabajo_items, repuestos,
         facturas, factura_items, gastos, vehiculos] = await Promise.all([
    dbLocal.clientes.toArray(), dbLocal.establecimientos.toArray(),
    dbLocal.instalaciones.toArray(),
    dbLocal.trabajos.toArray(), dbLocal.trabajo_items.toArray(),
    dbLocal.repuestos.toArray(), dbLocal.facturas.toArray(),
    dbLocal.factura_items.toArray(), dbLocal.gastos.toArray(),
    dbLocal.vehiculos.toArray()
  ]);
  return {
    app: 'MolineroApp', version: 2, exportado: new Date().toISOString(),
    clientes, establecimientos, instalaciones, trabajos, trabajo_items, repuestos,
    facturas, factura_items, gastos, vehiculos
  };
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

// Acepta respaldos v1 (clientes, molinos, reparaciones) y v2.
async function importarRespaldo(objeto) {
  if (!objeto || typeof objeto !== 'object' || !Array.isArray(objeto.clientes)) {
    throw new Error('El archivo no parece ser un respaldo válido de MolineroApp.');
  }
  const ahora = Date.now();
  const clientes      = objeto.clientes      || [];
  const establecimientos = objeto.establecimientos || [];
  const instalaciones = (objeto.instalaciones || []).concat(
    (objeto.molinos || []).map(molinoAInstalacion)
  );
  const cliDeInst = {};
  for (const i of instalaciones) cliDeInst[i.id] = i.clienteId;
  const trabajos = (objeto.trabajos || []).concat(
    (objeto.reparaciones || []).map(r => reparacionATrabajo(r, cliDeInst[r.molinoId]))
  );
  const trabajo_items = objeto.trabajo_items || [];
  const repuestos     = objeto.repuestos     || [];
  const facturas      = objeto.facturas      || [];
  const factura_items = objeto.factura_items || [];
  const gastos        = objeto.gastos        || [];
  const vehiculos     = objeto.vehiculos     || [];

  const tablas = [dbLocal.clientes, dbLocal.establecimientos, dbLocal.instalaciones, dbLocal.trabajos,
                  dbLocal.trabajo_items, dbLocal.repuestos, dbLocal.facturas,
                  dbLocal.factura_items, dbLocal.gastos, dbLocal.vehiculos,
                  dbLocal.pendientes];
  await dbLocal.transaction('rw', ...tablas, async () => {
    for (const t of tablas.slice(0, 10)) await t.clear();
    await dbLocal.pendientes.clear();
    const cargas = [
      [dbLocal.clientes, clientes], [dbLocal.establecimientos, establecimientos],
      [dbLocal.instalaciones, instalaciones],
      [dbLocal.trabajos, trabajos], [dbLocal.trabajo_items, trabajo_items],
      [dbLocal.repuestos, repuestos], [dbLocal.facturas, facturas],
      [dbLocal.factura_items, factura_items], [dbLocal.gastos, gastos],
      [dbLocal.vehiculos, vehiculos]
    ];
    for (const [tabla, filas] of cargas) {
      if (filas.length) await tabla.bulkAdd(filas);
    }
    // La nube se reemplaza por completo, en orden de dependencias
    const ops = [];
    for (const t of ['factura_items', 'trabajo_items', 'gastos', 'facturas',
                     'trabajos', 'instalaciones', 'establecimientos', 'repuestos', 'vehiculos', 'clientes']) {
      ops.push({ tipo: 'clear', tabla: t, createdAt: ahora });
    }
    const conv = {
      clientes: clienteToRow, establecimientos: establecimientoToRow,
      instalaciones: instalacionToRow,
      trabajos: trabajoToRow, trabajo_items: trabajoItemToRow,
      repuestos: repuestoToRow, facturas: facturaToRow,
      factura_items: facturaItemToRow, gastos: gastoToRow,
      vehiculos: vehiculoToRow
    };
    const datos = {
      clientes, establecimientos, instalaciones, trabajos, trabajo_items, repuestos,
      facturas, factura_items, gastos, vehiculos
    };
    for (const t of ['clientes', 'establecimientos', 'vehiculos', 'repuestos', 'instalaciones',
                     'trabajos', 'trabajo_items', 'facturas', 'factura_items', 'gastos']) {
      for (const fila of datos[t]) {
        ops.push({ tipo: 'upsert', tabla: t, row: conv[t](fila), createdAt: ahora });
      }
    }
    await dbLocal.pendientes.bulkAdd(ops);
  });

  return {
    clientes: clientes.length, instalaciones: instalaciones.length,
    trabajos: trabajos.length, repuestos: repuestos.length,
    facturas: facturas.length, gastos: gastos.length
  };
}
