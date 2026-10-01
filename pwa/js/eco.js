/* ============================================================
   MolineroApp v2 - Ayudas económicas compartidas
   (las usan Inicio, Reportes, Trabajos y Clientes)
   ============================================================ */

function mesActual() {
  return hoyISO().slice(0, 7); // '2026-09'
}
function enMes(fechaISO, yyyyMM) {
  return String(fechaISO || '').slice(0, 7) === yyyyMM;
}
function mesAnterior(yyyyMM) {
  const [a, m] = yyyyMM.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// { trabajoId: [items] } — una sola lectura para toda la app
async function itemsPorTrabajo() {
  const todos = await dbLocal.trabajo_items.toArray();
  const mapa = {};
  for (const it of todos) {
    (mapa[it.trabajoId] = mapa[it.trabajoId] || []).push(it);
  }
  return mapa;
}

// Trabajos con sus ítems y totales calculados
async function trabajosConTotales() {
  const [trabajos, mapaItems, vehiculos, gastos, facturas, facturaItems] = await Promise.all([
    getTrabajos(), itemsPorTrabajo(), getVehiculos(), getGastos(), getFacturas(), dbLocal.factura_items.toArray()
  ]);
  const vehMap = {};
  for (const v of vehiculos) vehMap[v.id] = v;
  return trabajos.map(t => {
    const items = mapaItems[t.id] || [];
    const veh = vehMap[t.vehiculoId] || null;
    const idsDocumentos = new Set(facturaItems.filter(it => it.trabajoId === t.id).map(it => it.facturaId));
    const documentos = facturas.filter(f => idsDocumentos.has(f.id) && f.tipo === 'factura' && f.estado !== 'anulada');
    const saldo = documentos.reduce((s, f) => s + saldoDocumento(f), 0);
    return { t, items, tot: totalesTrabajo(t, items, veh, gastos.filter(g => g.trabajoId === t.id)),
      documentos, facturado: documentos.length > 0, cobrado: documentos.length > 0 && saldo === 0, saldo };
  });
}

// Resumen económico de un mes: margen bruto (trabajos) y neto (menos gastos)
async function resumenMes(yyyyMM) {
  const [conTot, gastos] = await Promise.all([trabajosConTotales(), getGastos()]);
  let ingresos = 0, costos = 0, nTrabajos = 0;
  for (const { t, tot } of conTot) {
    if (!enMes(t.fecha, yyyyMM)) continue;
    if (!['terminado', 'facturado', 'cobrado'].includes(t.estado)) continue;
    ingresos += tot.ingresos; costos += tot.costos; nTrabajos++;
  }
  let gastosMes = 0;
  for (const g of gastos) {
    if (enMes(g.fecha, yyyyMM) && !g.trabajoId && (!g.imputacion || g.imputacion === 'adicional')) gastosMes += parseFloat(g.monto) || 0;
  }
  const margenBruto = ingresos - costos;
  return {
    ingresos, costos, gastos: gastosMes, nTrabajos,
    margenBruto, margenNeto: margenBruto - gastosMes
  };
}

// Plata por cobrar: facturas pendientes + trabajos terminados sin facturar
async function calcularPorCobrar() {
  const [facturas, conTot, items] = await Promise.all([getFacturas(), trabajosConTotales(), dbLocal.factura_items.toArray()]);
  const facturados = trabajosFacturados(facturas, items);
  let total = 0;
  let pendienteFacturar = 0;
  const detalle = [];
  for (const f of facturas) {
    if (f.tipo === 'factura' && saldoDocumento(f) > 0) {
      total += saldoDocumento(f);
      detalle.push({ tipo: 'factura', id: f.id, texto: 'Factura Nº ' + f.numero, monto: saldoDocumento(f) });
    }
  }
  for (const { t, tot } of conTot) {
    if (['terminado', 'facturado', 'cobrado'].includes(t.estado) && !facturados.has(t.id) && tot.ingresos > 0) {
      pendienteFacturar += tot.totalVenta;
      detalle.push({ tipo: 'trabajo', id: t.id, texto: 'Trabajo ' + fechaLegible(t.fecha), monto: tot.totalVenta });
    }
  }
  return { total, pendienteFacturar, detalle };
}
