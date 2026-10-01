/* Tablero principal: resumen del día y del mes */
Pantallas.inicio = {
  titulo: 'MolineroApp',

  async render() {
    const mes = mesActual();
    const [res, porCobrar, conTot, repuestos] = await Promise.all([
      resumenMes(mes), calcularPorCobrar(), trabajosConTotales(), getRepuestos()
    ]);

    const pendientes = conTot
      .filter(x => x.t.estado === 'a_hacer')
      .sort((a, b) => String(a.t.fecha).localeCompare(String(b.t.fecha)))
      .slice(0, 5);
    const sinFacturar = conTot.filter(x => x.t.estado === 'terminado').length;
    const stockBajo = repuestos.filter(r => (parseFloat(r.stock) || 0) <= (parseFloat(r.stockMin) || 0)).length;

    const nombreCli = {};
    const clientes = await getClientes();
    for (const c of clientes) nombreCli[c.id] = c.nombre;
    const nombreIns = {};
    const inss = await getInstalaciones();
    for (const i of inss) nombreIns[i.id] = i.nombre;

    let h = '<div class="hero">' +
      '<div class="etiqueta">Margen neto · ' + esc(nombreMes(mes)) + '</div>' +
      '<div class="monto ' + (res.margenNeto < 0 ? 'negativo' : '') + '">' + esc(formatoPeso(res.margenNeto)) + '</div>' +
      '<div class="detalle">Bruto ' + esc(formatoPeso(res.margenBruto)) +
      ' · Gastos ' + esc(formatoPeso(res.gastos)) +
      ' · ' + res.nTrabajos + ' trabajo(s)</div></div>';

    h += '<div class="stats">' +
      '<div class="stat ambar"><div class="etiqueta">Por cobrar</div>' +
      '<div class="valor chico">' + esc(formatoPeso(porCobrar.total) || '$ 0') + '</div></div>' +
      '<div class="stat azul"><div class="etiqueta">Trabajos pendientes</div>' +
      '<div class="valor">' + pendientes.length + '</div></div></div>';

    h += '<button class="btn btn-ambar" data-go-trabajo-nuevo>🔧 ＋ Nuevo trabajo</button>';

    if (stockBajo > 0 || sinFacturar > 0) {
      h += '<div class="card"><div class="sec-titulo">⚠️ Atención</div>';
      if (sinFacturar > 0) {
        h += '<div class="dato"><span class="k">Sin facturar</span>' +
          '<span class="v">' + sinFacturar + ' trabajo(s) terminado(s)</span></div>';
      }
      if (stockBajo > 0) {
        h += '<div class="dato"><span class="k">Stock bajo</span>' +
          '<span class="v">' + stockBajo + ' repuesto(s) al mínimo</span></div>';
      }
      h += '</div>';
    }

    h += '<div class="seccion-titulo"><h3>Próximos trabajos</h3>' +
      '<button data-ir="trabajos">Ver todos ›</button></div>';
    if (!pendientes.length) {
      h += '<div class="vacio"><span class="emoji">🗓️</span>No hay trabajos pendientes.<br>¡A disfrutar el campo!</div>';
    } else {
      for (const { t } of pendientes) {
        h += '<button class="fila" data-ver-trabajo="' + esc(t.id) + '">' +
          '<div class="avatar">🔧</div><div class="cuerpo">' +
          '<div class="titulo">' + esc(t.descripcion || 'Trabajo') + '</div>' +
          '<div class="bajada">' + esc(fechaLegible(t.fecha)) +
          (nombreCli[t.clienteId] ? ' · ' + esc(nombreCli[t.clienteId]) : '') +
          (nombreIns[t.instalacionId] ? ' · ' + esc(nombreIns[t.instalacionId]) : '') + '</div></div>' +
          '<div class="lateral">' + chipEstado(t.estado) + '</div></button>';
      }
    }
    return h;
  },

  async bind() {
    document.querySelectorAll('[data-ir]').forEach(b => {
      b.onclick = () => go(b.dataset.ir, {}, true);
    });
    document.querySelectorAll('[data-ver-trabajo]').forEach(b => {
      b.onclick = () => go('trabajos', { vista: 'detalle', id: b.dataset.verTrabajo });
    });
    const nuevo = document.querySelector('[data-go-trabajo-nuevo]');
    if (nuevo) nuevo.onclick = () => go('trabajos', { vista: 'form' });
  }
};
