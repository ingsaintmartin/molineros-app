/* Orden de trabajo desde presupuesto aceptado + modo IVA por documento.
   - Presupuesto aceptado → crearTrabajoDesdePresupuesto (idempotente).
   - La orden es un trabajo normal: se puede modificar, agregar más y quitar.
   - facturas.ivaIncluido: mappers, default true, totales con/sin IVA.
   Carga el pwa/db.js REAL con el esquema Dexie REAL (fake-indexeddb).
   node test-orden-trabajo.js */
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

const sandbox = {
  Dexie, console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array,
  String, Number, Boolean, Promise, RegExp, Error, isNaN, parseInt, parseFloat,
  URL, fetch: global.fetch,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(repo, 'pwa/db.js'), 'utf8') +
  '\n;globalThis.__x = { dbLocal, crearFactura, getFactura, getItemsDeFactura,' +
  ' crearTrabajo, actualizarTrabajo, eliminarTrabajo, getTrabajo,' +
  ' crearTrabajoDesdePresupuesto, getTrabajosDePresupuesto,' +
  ' guardarItemsFactura, eliminarPresupuesto, desvincularTrabajosDePresupuesto,' +
  ' totalesConIVA, facturaToRow, rowToFactura, trabajoToRow, rowToTrabajo,' +
  ' facturaItemToRow, COLUMNAS, TURSO_DDL };',
  sandbox, { filename: 'db.js' });

const { dbLocal, crearFactura, getFactura, getItemsDeFactura,
  crearTrabajo, actualizarTrabajo, eliminarTrabajo, getTrabajo,
  crearTrabajoDesdePresupuesto, getTrabajosDePresupuesto,
  guardarItemsFactura, eliminarPresupuesto, desvincularTrabajosDePresupuesto,
  totalesConIVA, facturaToRow, rowToFactura, trabajoToRow, rowToTrabajo,
  facturaItemToRow, COLUMNAS, TURSO_DDL } = sandbox.__x;

let ok = 0, fail = 0;
function check(nombre, cond) {
  if (cond) { ok++; console.log('  ok: ' + nombre); }
  else { fail++; console.log('  FALLO: ' + nombre); }
}

(async () => {
  await dbLocal.open();

  console.log('— totalesConIVA con/sin IVA incluido —');
  const items = [
    { cantidad: 2, precioUnit: 1000, iva: 21 },
    { cantidad: 1, precioUnit: 1000, iva: 10.5 }
  ];
  const tCon = totalesConIVA(items, 21, true);
  check('con IVA: total 3000', tCon.total === 3000);
  check('con IVA: neto 2557.87', tCon.neto === 2557.87);
  check('con IVA: iva 442.13', tCon.iva === 442.13);
  const tSin = totalesConIVA(items, 21, false);
  check('más IVA: neto 3000', tSin.neto === 3000);
  check('más IVA: iva 525', tSin.iva === 525);
  check('más IVA: total 3525', tSin.total === 3525);
  const tDef = totalesConIVA([{ cantidad: 1, precioUnit: 121, iva: 21 }], 21);
  check('default sigue siendo con IVA incluido', tDef.neto === 100 && tDef.iva === 21);

  console.log('— mappers factura ivaIncluido —');
  const rowF = facturaToRow({ id: 'x', ivaIncluido: false });
  check('facturaToRow mapea iva_incluido=0', rowF.iva_incluido === 0);
  check('facturaToRow default iva_incluido=1', facturaToRow({ id: 'x' }).iva_incluido === 1);
  check('rowToFactura lee false', rowToFactura({ id: 'x', iva_incluido: 0 }).ivaIncluido === false);
  check('rowToFactura default true (fila vieja)', rowToFactura({ id: 'x' }).ivaIncluido === true);
  check('COLUMNAS.facturas tiene iva_incluido', COLUMNAS.facturas.includes('iva_incluido'));
  check('TURSO_DDL ALTER facturas iva_incluido', TURSO_DDL.some(s => /ALTER TABLE facturas ADD COLUMN iva_incluido/.test(s)));

  console.log('— mappers trabajo presupuesto_id —');
  const rowT = trabajoToRow({ id: 't1', presupuestoId: 'p1' });
  check('trabajoToRow mapea presupuesto_id', rowT.presupuesto_id === 'p1');
  check('rowToTrabajo lee presupuestoId', rowToTrabajo({ id: 't1', presupuesto_id: 'p1' }).presupuestoId === 'p1');
  check('rowToTrabajo default null', rowToTrabajo({ id: 't1' }).presupuestoId === null);
  check('COLUMNAS.trabajos tiene presupuesto_id', COLUMNAS.trabajos.includes('presupuesto_id'));
  check('TURSO_DDL ALTER trabajos presupuesto_id', TURSO_DDL.some(s => /ALTER TABLE trabajos ADD COLUMN presupuesto_id/.test(s)));

  console.log('— presupuesto aceptado → orden de trabajo —');
  const itemsP = [{ descripcion: 'Cambiar cueros', cantidad: 1, precioUnit: 35000, iva: 21, trabajoId: null }];
  const totP = totalesConIVA(itemsP, 21, false);
  const pres = await crearFactura({
    tipo: 'presupuesto', clienteId: 'cli1', fecha: '2026-10-01', estado: 'pendiente',
    ivaIncluido: false, subtotal: totP.total, neto: totP.neto, ivaMonto: totP.iva,
    total: totP.total, observaciones: ''
  }, itemsP);
  const presLeido = await getFactura(pres.id);
  check('presupuesto guarda ivaIncluido=false', presLeido.ivaIncluido === false);
  check('totales más IVA (neto 35000/iva 7350/total 42350)',
    presLeido.neto === 35000 && presLeido.ivaMonto === 7350 && presLeido.total === 42350);

  const ord1 = await crearTrabajoDesdePresupuesto(pres.id);
  check('se crea la orden de trabajo', !!ord1 && !!ord1.id);
  check('orden vinculada al presupuesto', ord1.presupuestoId === pres.id);
  check('orden hereda cliente', ord1.clienteId === 'cli1');
  check('orden hereda tareas de los ítems',
    Array.isArray(ord1.tareas) && ord1.tareas.length === 1 && /Cambiar cueros/.test(ord1.tareas[0]));
  check('orden nace a_hacer', ord1.estado === 'a_hacer');

  const ord2 = await crearTrabajoDesdePresupuesto(pres.id);
  check('idempotente: no duplica', ord2.id === ord1.id);
  const vinc = await getTrabajosDePresupuesto(pres.id);
  check('getTrabajosDePresupuesto trae 1', vinc.length === 1);

  console.log('— flexibilidad: modificar, agregar, quitar —');
  ord1.descripcion = 'Orden modificada';
  ord1.tareas = ['Tarea agregada'];
  await actualizarTrabajo(ord1);
  const ordMod = await getTrabajo(ord1.id);
  check('se puede modificar la orden', ordMod.descripcion === 'Orden modificada' && ordMod.tareas[0] === 'Tarea agregada');
  check('sigue vinculada tras modificar', ordMod.presupuestoId === pres.id);

  const extra = await crearTrabajo({
    clienteId: 'cli1', fecha: '2026-10-02', descripcion: 'Visita extra',
    estado: 'a_hacer', presupuestoId: pres.id
  });
  const vinc2 = await getTrabajosDePresupuesto(pres.id);
  check('se puede agregar otra orden vinculada', vinc2.length === 2 && vinc2.some(t => t.id === extra.id));

  await eliminarTrabajo(extra.id);
  const vinc3 = await getTrabajosDePresupuesto(pres.id);
  check('se puede quitar una orden', vinc3.length === 1 && vinc3[0].id === ord1.id);
  check('getTrabajosDePresupuesto vacío para otro id', (await getTrabajosDePresupuesto('nope')).length === 0);

  console.log('— editar ítems del documento —');
  await guardarItemsFactura(pres.id, [
    { descripcion: 'Cambiar cueros', cantidad: 1, precioUnit: 35000, iva: 21, trabajoId: null },
    { descripcion: 'Viaje', cantidad: 1, precioUnit: 15000, iva: 21, trabajoId: 'traX' }
  ]);
  const itemsEdit = await getItemsDeFactura(pres.id);
  check('ítems reemplazados (2)', itemsEdit.length === 2);
  check('trabajoId se conserva', itemsEdit.some(x => x.trabajoId === 'traX'));
  check('facturaItemToRow mapea trabajo_id',
    facturaItemToRow(itemsEdit.find(x => x.trabajoId === 'traX')).trabajo_id === 'traX');
  const totEdit = totalesConIVA(itemsEdit, 21, false);
  check('totales recalculados más IVA (neto 50000/iva 10500/total 60500)',
    totEdit.neto === 50000 && totEdit.iva === 10500 && totEdit.total === 60500);

  console.log('— eliminar presupuesto desvincula órdenes —');
  const nDesv = await desvincularTrabajosDePresupuesto(pres.id);
  check('desvincula 1 orden', nDesv === 1);
  const ordHuerf = await getTrabajo(ord1.id);
  check('la orden se conserva', !!ordHuerf);
  check('la orden queda independiente', ordHuerf.presupuestoId === null);
  await eliminarPresupuesto(pres.id);
  check('presupuesto eliminado', (await getFactura(pres.id)) === undefined);
  check('ítems del presupuesto borrados', (await getItemsDeFactura(pres.id)).length === 0);
  check('la orden sigue existiendo tras eliminar', !!(await getTrabajo(ord1.id)));

  await dbLocal.close();
  console.log('\n' + ok + ' ok, ' + fail + ' fallos.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
