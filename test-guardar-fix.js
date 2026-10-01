/* Regresión: crear presupuestos/facturas/recibos y eliminar repuestos/vehículos.
   Causa raíz: dbLocal.<tabla>.where('<prop>') con prop NO indexada tira
   SchemaError en Dexie → proximoNumero() fallaba siempre y ningún documento
   se podía crear. Fix: usar .filter() en memoria.
   Carga el pwa/db.js REAL con el esquema Dexie REAL (fake-indexeddb).
   Para correrlo: npm install fake-indexeddb (o que esté en /tmp/node_modules). */
'use strict';
let _fakeOk = false;
for (const base of [__dirname + '/node_modules', '/tmp/node_modules']) {
  try { require(base + '/fake-indexeddb/auto'); _fakeOk = true; break; } catch (e) {}
}
if (!_fakeOk) throw new Error('Falta fake-indexeddb: corré "npm install fake-indexeddb".');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = __dirname;
const Dexie = require(path.join(repo, 'pwa/vendor/dexie.min.js'));

// Sin credenciales Turso → nubeLista() = false, todo queda local
const sandbox = {
  Dexie, console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array,
  String, Number, Boolean, Promise, RegExp, Error, isNaN, parseInt, parseFloat,
  URL, fetch: global.fetch,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(repo, 'pwa/db.js'), 'utf8') +
  '\n;globalThis.__x = { dbLocal, proximoNumero, crearFactura, eliminarRepuesto, eliminarVehiculo, crearRepuesto, crearVehiculo, crearGasto };',
  sandbox, { filename: 'db.js' });

const { dbLocal, proximoNumero, crearFactura, eliminarRepuesto, eliminarVehiculo,
        crearRepuesto, crearVehiculo, crearGasto } = sandbox.__x;

let ok = 0, fail = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log('  ok: ' + nombre); }
  else { fail++; console.log('  FALLO: ' + nombre); }
}

(async () => {
  await dbLocal.open();
  console.log('— crearFactura tipo presupuesto —');
  const f1 = await crearFactura(
    { tipo: 'presupuesto', clienteId: 'c1', fecha: '2026-10-01', estado: 'pendiente', subtotal: 1000, total: 1000, observaciones: '' },
    [{ descripcion: 'Reparación molino', cantidad: 1, precioUnit: 1000, trabajoId: null }]);
  check('presupuesto creado con id', !!f1.id);
  check('número 00000001', f1.numero === '00000001');
  const n2 = await proximoNumero('presupuesto');
  check('proximoNumero presupuesto → 00000002', n2 === '00000002');
  const nF = await proximoNumero('factura');
  check('proximoNumero factura → 00000001 (serie independiente)', nF === '00000001');

  console.log('— crearFactura tipo factura y recibo —');
  const f2 = await crearFactura(
    { tipo: 'factura', clienteId: 'c1', fecha: '2026-10-01', estado: 'pendiente', subtotal: 500, total: 500, observaciones: '' },
    [{ descripcion: 'Cilindro', cantidad: 2, precioUnit: 250, trabajoId: null }]);
  check('factura creada Nº ' + f2.numero, f2.numero === '00000001' && f2.tipo === 'factura');
  const items = await dbLocal.factura_items.where('facturaId').equals(f2.id).toArray();
  check('ítems guardados (2)', items.length === 1 && items[0].cantidad === 2);
  const f3 = await crearFactura(
    { tipo: 'recibo', clienteId: 'c1', fecha: '2026-10-01', estado: 'pendiente', subtotal: 300, total: 300, observaciones: '' },
    [{ descripcion: 'Seña', cantidad: 1, precioUnit: 300, trabajoId: null }]);
  check('recibo creado', f3.tipo === 'recibo' && f3.numero === '00000001');

  console.log('— eliminarRepuesto (usaba where repuestoId) —');
  const rep = await crearRepuesto({ nombre: 'Aleta test', categoria: 'Repuestos', stock: 5, precio: 100 });
  await eliminarRepuesto(rep.id);
  check('repuesto eliminado', (await dbLocal.repuestos.get(rep.id)) === undefined);

  console.log('— eliminarVehiculo (usaba where vehiculoId) —');
  const veh = await crearVehiculo({ nombre: 'Camioneta test' });
  await crearGasto({ descripcion: 'Nafta', monto: 10000, fecha: '2026-10-01', categoria: 'Combustible', vehiculoId: veh.id });
  await eliminarVehiculo(veh.id);
  check('vehículo eliminado', (await dbLocal.vehiculos.get(veh.id)) === undefined);
  const gRest = await dbLocal.gastos.filter(g => g.vehiculoId === veh.id).toArray();
  check('ningún gasto quedó colgado al vehículo', gRest.length === 0);

  await dbLocal.close();
  console.log(`\n${ok} ok, ${fail} fallos`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
