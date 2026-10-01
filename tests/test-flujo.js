'use strict';
require('fake-indexeddb/auto');
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const Dexie = require('../pwa/vendor/dexie.min.js');
const sandbox = { Dexie, console, setTimeout, clearTimeout, Date, Math, JSON, Object, Array,
  String, Number, Boolean, Promise, RegExp, Error, isNaN, parseInt, parseFloat, Set,
  URL, fetch: global.fetch, Pantallas: {} };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ['db.js', 'js/eco.js', 'js/t-facturacion.js', 'js/t-clientes.js']) {
  vm.runInContext(fs.readFileSync('pwa/' + file, 'utf8'), sandbox, { filename: file });
}
const api = vm.runInContext('({ dbLocal, crearCliente, guardarEmpresa, crearFactura, guardarDocumentoConItems, crearTrabajoDesdePresupuesto, getItemsDeTrabajo, actualizarTrabajo, guardarItemsTrabajo, guardarTrabajoConItems, reservasDeStock, crearRepuesto, getRepuesto, eliminarTrabajo, getTrabajo, desglosarTrabajoParaFactura, adaptarPreciosDocumento, registrarCobro, saldoDocumento, calcularPorCobrar, cuentaDeCliente, trabajosFacturados, getFactura, getItemsDeFactura, facturaToRow, rowToFactura, trabajoToRow, rowToTrabajo, trabajoItemToRow, rowToTrabajoItem, totalesTrabajo, armarRespaldo, importarRespaldo, eliminarFactura })', sandbox);

(async () => {
  const a = api;
  await a.dbLocal.open();
  await a.guardarEmpresa({ condicionFiscal: 'responsable_inscripto', nombre: 'Molinero prueba' });
  const cliente = await a.crearCliente({ nombre: 'Productor', condicionFiscal: 'monotributista' });
  const presupuesto = await a.crearFactura({ tipo: 'presupuesto', clienteId: cliente.id,
    instalacionId: 'molino_norte', estado: 'aceptado', ivaIncluido: false }, [
    { descripcion: 'Cambio de cueros', cantidad: 1, precioUnit: 10000, iva: 21, tipoConcepto: 'servicio' },
    { descripcion: 'Cuero', cantidad: 2, precioUnit: 2000, iva: 10.5, tipoConcepto: 'material' }
  ]);
  assert.equal(presupuesto.total, 16520);
  const t = await a.crearTrabajoDesdePresupuesto(presupuesto.id);
  assert.equal(t.instalacionId, 'molino_norte');
  assert.equal(t.ivaIncluido, false);
  assert.equal(t.montoManual, null);
  let desglose = await a.desglosarTrabajoParaFactura(t.id);
  assert.equal(desglose.items.length, 2, 'el presupuesto no se vuelve a sumar');
  const materiales = await a.getItemsDeTrabajo(t.id);
  const cuero = materiales.find(it => it.descripcion === 'Cuero');
  cuero.cantidad = 3;
  cuero.costoUnit = 500;
  await a.guardarItemsTrabajo(t.id, materiales);
  t.estado = 'terminado'; t.vehiculoId = 'camioneta'; t.costoRealKm = 250;
  await a.actualizarTrabajo(t);
  desglose = await a.desglosarTrabajoParaFactura(t.id);
  assert.equal(desglose.items.find(it => it.descripcion === 'Cuero').cantidad, 3, 'factura la cantidad ejecutada');
  const vuelta = a.rowToTrabajo(a.trabajoToRow(t));
  assert.equal(vuelta.vehiculoId, 'camioneta');
  assert.equal(vuelta.costoRealKm, 250);
  assert.equal(a.rowToTrabajoItem(a.trabajoItemToRow(materiales.find(it => it.descripcion === 'Cambio de cueros'))).tipoConcepto, 'servicio');
  const factura = await a.crearFactura({ tipo: 'factura', clienteId: cliente.id,
    ivaIncluido: false, estado: 'pendiente' }, desglose.items);
  assert.equal(factura.letra, 'A', 'RI a monotributista');
  assert.equal(factura.total, 18730);
  assert.equal((await a.calcularPorCobrar()).total, 18730, 'no cuenta otra vez el trabajo');
  assert.equal((await a.calcularPorCobrar()).pendienteFacturar, 0);
  assert.equal((await a.cuentaDeCliente(cliente.id)).total, 18730);
  const otroCliente = await a.crearCliente({ nombre: 'Otro cliente', condicionFiscal: 'responsable_inscripto' });
  await assert.rejects(() => a.guardarDocumentoConItems(Object.assign({}, factura, { clienteId: otroCliente.id }), desglose.items), /no pertenece/);
  assert.equal((await a.getFactura(factura.id)).clienteId, cliente.id);
  await assert.rejects(() => a.crearFactura({ tipo: 'factura', clienteId: cliente.id }, desglose.items), /otra factura/);
  const parcial = await a.registrarCobro(factura.id, { fecha: '2026-10-01', monto: 10000, medio: 'transferencia', referencia: 'op1' });
  assert.equal(parcial.estado, 'parcial');
  assert.equal(a.saldoDocumento(parcial), 8730);
  assert.equal((await a.calcularPorCobrar()).total, 8730);
  assert.equal((await a.cuentaDeCliente(cliente.id)).total, 8730);
  const recibos = (await a.dbLocal.facturas.toArray()).filter(f => f.tipo === 'recibo');
  assert.equal(recibos.length, 1, 'cada cobro genera su recibo');
  assert.equal(recibos[0].flujo.facturaOrigen, factura.id);
  assert.equal(recibos[0].total, 10000);
  await assert.rejects(() => a.registrarCobro(factura.id, { fecha: '2026-10-01', monto: 9000 }), /no superar/);
  await assert.rejects(() => a.registrarCobro(factura.id, { fecha: '2026-10-01', monto: -1 }), /mayor/);
  assert.equal(a.rowToFactura(a.facturaToRow(parcial)).cobros[0].referencia, 'op1');
  const pagada = await a.registrarCobro(factura.id, { fecha: '2026-10-02', monto: 8730 });
  assert.equal(pagada.estado, 'pagada');
  assert.equal((await a.calcularPorCobrar()).total, 0);
  await assert.rejects(() => a.eliminarFactura(factura.id), /cobros/);
  const respaldo = await a.armarRespaldo();
  await a.importarRespaldo(respaldo);
  assert.equal((await a.getFactura(factura.id)).cobros.length, 2, 'los cobros sobreviven al respaldo');
  await a.guardarEmpresa({ condicionFiscal: 'monotributista' });
  const c = await a.crearFactura({ tipo: 'factura', clienteId: cliente.id, ivaIncluido: false }, [
    { descripcion: 'Servicio', cantidad: 1, precioUnit: 10000, iva: 21 }
  ]);
  assert.equal(c.letra, 'C'); assert.equal(c.total, 10000); assert.equal(c.ivaMonto, 0);
  assert.equal((await a.getItemsDeFactura(c.id))[0].iva, 0);
  const simultaneos = await Promise.all([1, 2].map(n => a.crearFactura({ tipo: 'factura', clienteId: cliente.id },
    [{ descripcion: 'Servicio ' + n, cantidad: 1, precioUnit: 100 }])));
  assert.notEqual(simultaneos[0].numero, simultaneos[1].numero, 'numera concurrentemente sin duplicados');
  const adaptados = a.adaptarPreciosDocumento([{ precioUnit: 100, iva: 21 }], false, true);
  assert.equal(adaptados[0].precioUnit, 121, 'conserva el importe al unir trabajos con distinto modo de precios');
  assert.equal(a.trabajosFacturados([{ id: 'p', tipo: 'presupuesto' }, { id: 'a', tipo: 'factura', estado: 'anulada' }],
    [{ facturaId: 'p', trabajoId: 't' }, { facturaId: 'a', trabajoId: 't' }]).size, 0);
  assert.equal(a.totalesTrabajo({ km: 10, costoRealKm: 250 }, [], { costoKm: 900 }).viajeCosto, 2500, 'conserva el costo histórico');
  const economia = a.totalesTrabajo({ condicionEmisor: 'responsable_inscripto', ivaIncluido: true },
    [{ cantidad: 1, precioUnit: 121, costoUnit: 50, iva: 21 }], null,
    [{ monto: 10, imputacion: 'adicional' }, { monto: 20, imputacion: 'incluido_materiales' }, { monto: 30, imputacion: 'incluido_vehiculo' }]);
  assert.equal(economia.ingresos, 100, 'el IVA de venta no infla el margen');
  assert.equal(economia.totalVenta, 121);
  assert.equal(economia.costos, 60, 'el costo ya incluido no se duplica');
  assert.equal(economia.margen, 40);
  const acordado = a.totalesTrabajo({ horas: 3, tarifaHora: 5000, km: 20, costoKm: 100 }, [
    { cantidad: 1, precioUnit: 10000, tipoConcepto: 'servicio' },
    { cantidad: 1, precioUnit: 2000, tipoConcepto: 'traslado' }
  ]);
  assert.equal(acordado.ingresos, 12000, 'no suma horas ni viaje sobre los mismos conceptos acordados');
  const repuesto = await a.crearRepuesto({ nombre: 'Cuero stock', stock: 5, costo: 500, precio: 2000 });
  const ordenStock = await a.guardarTrabajoConItems({ clienteId: cliente.id, descripcion: 'Preparar visita', estado: 'a_hacer' },
    [{ repuestoId: repuesto.id, descripcion: 'Cuero stock', cantidad: 2, precioUnit: 2000, costoUnit: 500 }]);
  assert.equal((await a.getRepuesto(repuesto.id)).stock, 5, 'planificar reserva sin consumir');
  assert.equal((await a.reservasDeStock())[repuesto.id], 2);
  ordenStock.estado = 'en_curso';
  await a.guardarTrabajoConItems(ordenStock, await a.getItemsDeTrabajo(ordenStock.id));
  assert.equal((await a.getRepuesto(repuesto.id)).stock, 3, 'al comenzar consume una sola vez');
  await a.guardarTrabajoConItems(ordenStock, await a.getItemsDeTrabajo(ordenStock.id));
  assert.equal((await a.getRepuesto(repuesto.id)).stock, 3, 'editar no vuelve a descontar');
  const excesivo = await a.getItemsDeTrabajo(ordenStock.id); excesivo[0].cantidad = 6;
  await assert.rejects(() => a.guardarTrabajoConItems(Object.assign({}, ordenStock, { descripcion: 'No debe persistir' }), excesivo), /Stock insuficiente/);
  assert.equal((await a.getTrabajo(ordenStock.id)).descripcion, 'Preparar visita', 'revierte el trabajo si falla el stock');
  assert.equal((await a.getRepuesto(repuesto.id)).stock, 3);
  await a.eliminarTrabajo(ordenStock.id);
  assert.equal((await a.getRepuesto(repuesto.id)).stock, 5, 'devuelve stock consumido al quitar la orden');
  await a.dbLocal.close();
  console.log('OK: flujo completo, pagos parciales, respaldo, IVA, gastos sin duplicación y reserva/consumo de stock con rollback.');
})().catch(e => { console.error(e); process.exitCode = 1; });
