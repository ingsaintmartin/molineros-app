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
  const [trabajos, mapaItems] = await Promise.all([getTrabajos(), itemsPorTrabajo()]);
  return trabajos.map(t => {
    const items = mapaItems[t.id] || [];
    return { t: t, items: items, tot: totalesTrabajo(t, items) };
  });
}

// Resumen económico de un mes: margen bruto (trabajos) y neto (menos gastos)
async function resumenMes(yyyyMM) {
  const [conTot, gastos] = await Promise.all([trabajosConTotales(), getGastos()]);
  let ingresos = 0, costos = 0, nTrabajos = 0;
  for (const { t, tot } of conTot) {
    if (!enMes(t.fecha, yyyyMM)) continue;
    if (t.estado === 'a_hacer') continue;
    ingresos += tot.ingresos; costos += tot.costos; nTrabajos++;
  }
  let gastosMes = 0;
  for (const g of gastos) {
    if (enMes(g.fecha, yyyyMM)) gastosMes += parseFloat(g.monto) || 0;
  }
  const margenBruto = ingresos - costos;
  return {
    ingresos, costos, gastos: gastosMes, nTrabajos,
    margenBruto, margenNeto: margenBruto - gastosMes
  };
}

// Plata por cobrar: facturas pendientes + trabajos terminados sin facturar
async function calcularPorCobrar() {
  const [facturas, conTot] = await Promise.all([getFacturas(), trabajosConTotales()]);
  let total = 0;
  const detalle = [];
  for (const f of facturas) {
    if ((f.tipo === 'factura' || f.tipo === 'recibo') &&
        (f.estado === 'pendiente' || f.estado === 'vencida')) {
      total += parseFloat(f.total) || 0;
      detalle.push({ tipo: 'factura', id: f.id, texto: (f.tipo === 'recibo' ? 'Recibo' : 'Factura') + ' Nº ' + f.numero, monto: parseFloat(f.total) || 0 });
    }
  }
  for (const { t, tot } of conTot) {
    if (t.estado === 'terminado' && tot.ingresos > 0) {
      total += tot.ingresos;
      detalle.push({ tipo: 'trabajo', id: t.id, texto: 'Trabajo ' + fechaLegible(t.fecha), monto: tot.ingresos });
    }
  }
  return { total, detalle };
}
