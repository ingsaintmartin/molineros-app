/* Tests de la capa de datos v2 (db.js): mapeos, migración, DDL y economía.
   Se corren con: node tests/test-datos.js
   No necesitan navegador: se stubbean Dexie/navigator.
   NOTA: sin 'use strict' para que el eval() de db.js declare sus
   funciones en este ámbito. */
const assert = require('assert');

// ---- Stubs de entorno navegador ----
global.Dexie = class {
  constructor() {}
  version() { return { stores: () => ({ upgrade: () => {} }) }; }
};
// Node 24 ya trae `navigator` global; db.js solo lo lee dentro de funciones.
if (typeof global.navigator === 'undefined') global.navigator = { onLine: false };

// ---- Cargar db.js en este contexto ----
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pwa', 'db.js'), 'utf8');
// Las funciones de db.js son declaraciones globales; las evaluamos aquí.
// (const/let no salen del eval: se re-exportan por globalThis.)
eval(src + '\n;globalThis.__db = { COLUMNAS, TABLAS_SYNC, TURSO_DDL };');
const { COLUMNAS, TABLAS_SYNC, TURSO_DDL } = globalThis.__db;

let pasados = 0;
function test(nombre, fn) {
  try { fn(); pasados++; }
  catch (e) { console.error('FALLÓ:', nombre, '\n ', e.message); process.exitCode = 1; }
}

// ---------- 1. Round-trip de mapeos ----------
test('cliente round-trip', () => {
  const c = { id: 'cli_1', nombre: 'Estancia San José', campo: 'San José', localidad: 'Azul',
              telefono: '123', cuit: '20-1', email: 'a@b.c', observaciones: 'x', createdAt: 1 };
  const v = rowToCliente(clienteToRow(c));
  assert.strictEqual(v.nombre, c.nombre);
  assert.strictEqual(v.cuit, c.cuit);
  assert.strictEqual(v.email, c.email);
});

test('instalacion round-trip (JSON caracteristicas/fotos, lat/lng)', () => {
  const i = { id: 'ins_1', clienteId: 'cli_1', tipo: 'molino', nombre: 'Molino Norte',
              marca: 'Surgent', modelo: 'X', caracteristicas: { tamanoCilindro: '3"', profundidadPozo: '45m' },
              estado: 'Fuera de servicio', observaciones: '', lat: -36.123456, lng: -61.654321,
              fotos: ['data:image/jpeg;base64,AAA'], createdAt: 1, updatedAt: 2 };
  const row = instalacionToRow(i);
  assert.strictEqual(typeof row.caracteristicas, 'string'); // JSON en Turso
  assert.strictEqual(typeof row.fotos, 'string');
  const v = rowToInstalacion(row);
  assert.deepStrictEqual(v.caracteristicas, i.caracteristicas);
  assert.deepStrictEqual(v.fotos, i.fotos);
  assert.strictEqual(v.lat, i.lat);
  assert.strictEqual(v.lng, i.lng);
});

test('trabajo round-trip (tareas JSON, economía)', () => {
  const t = { id: 'tra_1', instalacionId: 'ins_1', clienteId: 'cli_1', fecha: '2026-09-30',
              descripcion: 'Cambio de cueros', tareas: [{ texto: 'Desarmar', hecha: true }],
              piezasTexto: 'cueros', horas: 3, tarifaHora: 15000, km: 80, costoKm: 450,
              montoManual: null, estado: 'terminado', observaciones: '', fotos: [],
              createdAt: 1, updatedAt: 2 };
  const v = rowToTrabajo(trabajoToRow(t));
  assert.deepStrictEqual(v.tareas, t.tareas);
  assert.strictEqual(v.horas, 3);
  assert.strictEqual(v.tarifaHora, 15000);
});

test('trabajo_items / repuestos / facturas / factura_items / gastos / vehiculos round-trip', () => {
  const it = rowToTrabajoItem(trabajoItemToRow(
    { id: 'tit_1', trabajoId: 'tra_1', repuestoId: 'rep_1', descripcion: 'Cueros',
      cantidad: 2, costoUnit: 8000, precioUnit: 12000, createdAt: 1 }));
  assert.strictEqual(it.cantidad, 2); assert.strictEqual(it.precioUnit, 12000);

  const rp = rowToRepuesto(repuestoToRow(
    { id: 'rep_1', nombre: 'Cuero 3"', categoria: 'Cueros y gomas', stock: 10,
      stockMin: 4, costo: 8000, precio: 12000, createdAt: 1, updatedAt: 2 }));
  assert.strictEqual(rp.stock, 10); assert.strictEqual(rp.stockMin, 4);

  const f = rowToFactura(facturaToRow(
    { id: 'fac_1', clienteId: 'cli_1', numero: '00000001', tipo: 'factura',
      fecha: '2026-09-30', estado: 'pendiente', subtotal: 100, total: 121,
      observaciones: '', createdAt: 1, updatedAt: 2 }));
  assert.strictEqual(f.numero, '00000001'); assert.strictEqual(f.total, 121);

  const fi = rowToFacturaItem(facturaItemToRow(
    { id: 'fit_1', facturaId: 'fac_1', trabajoId: 'tra_1', descripcion: 'Mano de obra',
      cantidad: 1, precioUnit: 45000, createdAt: 1 }));
  assert.strictEqual(fi.trabajoId, 'tra_1');

  const g = rowToGasto(gastoToRow(
    { id: 'gas_1', fecha: '2026-09-30', categoria: 'combustible', descripcion: 'Nafta',
      monto: 25000, trabajoId: null, vehiculoId: 'veh_1', createdAt: 1 }));
  assert.strictEqual(g.monto, 25000); assert.strictEqual(g.vehiculoId, 'veh_1');

  const v = rowToVehiculo(vehiculoToRow(
    { id: 'veh_1', nombre: 'Camioneta', patente: 'ABC123', kmActual: 120000,
      costoKm: 450, observaciones: '', createdAt: 1 }));
  assert.strictEqual(v.kmActual, 120000); assert.strictEqual(v.costoKm, 450);
});

// ---------- 2. Coherencia COLUMNAS ↔ mapeos ↔ DDL ----------
test('COLUMNAS cubre todas las tablas de sync y coincide con los mapeos', () => {
  const pares = [
    ['clientes', clienteToRow({ id: 'x', createdAt: 1 })],
    ['instalaciones', instalacionToRow({ id: 'x', createdAt: 1, updatedAt: 1 })],
    ['trabajos', trabajoToRow({ id: 'x', createdAt: 1, updatedAt: 1 })],
    ['trabajo_items', trabajoItemToRow({ id: 'x', trabajoId: 'y', createdAt: 1 })],
    ['repuestos', repuestoToRow({ id: 'x', createdAt: 1, updatedAt: 1 })],
    ['facturas', facturaToRow({ id: 'x', createdAt: 1, updatedAt: 1 })],
    ['factura_items', facturaItemToRow({ id: 'x', facturaId: 'y', createdAt: 1 })],
    ['gastos', gastoToRow({ id: 'x', createdAt: 1 })],
    ['vehiculos', vehiculoToRow({ id: 'x', createdAt: 1 })]
  ];
  for (const [tabla, row] of pares) {
    assert.ok(COLUMNAS[tabla], 'falta COLUMNAS.' + tabla);
    for (const k of Object.keys(row)) {
      assert.ok(COLUMNAS[tabla].includes(k),
        tabla + ': la columna ' + k + ' del mapeo no está en COLUMNAS');
    }
  }
  assert.strictEqual(TABLAS_SYNC.length, 9);
});

test('TURSO_DDL crea las 9 tablas (IF NOT EXISTS)', () => {
  for (const t of TABLAS_SYNC) {
    const hay = TURSO_DDL.some(s =>
      new RegExp('CREATE TABLE IF NOT EXISTS ' + t + '\\b').test(s));
    assert.ok(hay, 'DDL sin CREATE TABLE para ' + t);
  }
});

// ---------- 3. Migración v2 → v3 ----------
test('molinoAInstalacion conserva datos técnicos y GPS', () => {
  const m = { id: 'mol_1', clienteId: 'cli_1', nombre: 'Molino Norte', marca: 'Surgent',
              modelo: '', tamanoCilindro: '3"', diametroSuccion: '2"', diametroImpulsion: '',
              profundidadPozo: '45m', estado: 'Operativo', observaciones: '',
              lat: -36.1, lng: -61.2, fotos: [], createdAt: 5 };
  const i = molinoAInstalacion(m);
  assert.strictEqual(i.tipo, 'molino');
  assert.strictEqual(i.caracteristicas.tamanoCilindro, '3"');
  assert.strictEqual(i.caracteristicas.profundidadPozo, '45m');
  assert.strictEqual(i.lat, -36.1);
});

test('reparacionATrabajo mapea problema/trabajo/costo', () => {
  const r = { id: 'rep_9', molinoId: 'mol_1', fecha: '2026-01-05', problema: 'No sube agua',
              trabajo: 'Cambio de cueros', piezas: 'cueros x2', costo: '45000',
              observaciones: '', fotos: [], createdAt: 7 };
  const t = reparacionATrabajo(r, 'cli_1');
  assert.strictEqual(t.instalacionId, 'mol_1');
  assert.strictEqual(t.clienteId, 'cli_1');
  assert.strictEqual(t.descripcion, 'No sube agua');
  assert.deepStrictEqual(t.tareas, ['Cambio de cueros']);
  assert.strictEqual(t.montoManual, 45000);
  assert.strictEqual(t.estado, 'terminado');
});

// ---------- 4. Economía ----------
test('totalesTrabajo: ingresos, costos y margen', () => {
  const t = { horas: 3, tarifaHora: 15000, km: 80, costoKm: 450, montoManual: null };
  const items = [
    { cantidad: 2, costoUnit: 8000, precioUnit: 12000 },
    { cantidad: 1, costoUnit: 5000, precioUnit: 9000 }
  ];
  const r = totalesTrabajo(t, items);
  assert.strictEqual(r.manoObra, 45000);
  assert.strictEqual(r.viaje, 36000);
  assert.strictEqual(r.materialesPrecio, 33000);
  assert.strictEqual(r.materialesCosto, 21000);
  assert.strictEqual(r.ingresos, 78000);
  assert.strictEqual(r.costos, 57000);
  assert.strictEqual(r.margen, 21000);
  assert.ok(Math.abs(r.margenPct - 26.92) < 0.01);
});

test('totalesTrabajo con monto manual y sin datos', () => {
  const r = totalesTrabajo({ montoManual: 50000 }, []);
  assert.strictEqual(r.ingresos, 50000);
  assert.strictEqual(r.margen, 50000);
  const vacio = totalesTrabajo({}, null);
  assert.strictEqual(vacio.ingresos, 0);
  assert.strictEqual(vacio.margen, 0);
  assert.strictEqual(vacio.margenPct, 0);
});

console.log('OK: ' + pasados + ' tests de datos v2 pasaron.');
