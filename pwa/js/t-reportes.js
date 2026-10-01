/* ============================================================
   MolineroApp v2 - Tab: Reportes (márgenes por mes)
   ============================================================ */

Pantallas.reportes = {
  titulo: 'Reportes',

  async render(params) {
    params = params || {};
    const mes = params.mes || mesActual();

    const res = await resumenMes(mes);

    const netoClase = res.margenNeto < 0 ? 'negativo' : 'positivo';
    const brutoClase = res.margenBruto < 0 ? 'negativo' : 'positivo';

    let h = '<div class="card">' +
      '<div class="field"><label for="repMes">Mes</label>' +
      '<input type="month" id="repMes" value="' + esc(mes) + '" /></div></div>';

    h += '<div class="stats">' +
      '<div class="stat"><div class="etiqueta">Facturado</div>' +
      '<div class="valor chico">' + esc(formatoPeso(res.ingresos)) + '</div></div>' +
      '<div class="stat"><div class="etiqueta">Margen bruto</div>' +
      '<div class="valor chico ' + brutoClase + '">' + esc(formatoPeso(res.margenBruto)) + '</div></div>' +
      '<div class="stat"><div class="etiqueta">Gastos</div>' +
      '<div class="valor chico negativo">' + esc(formatoPeso(res.gastos)) + '</div></div>' +
      '<div class="stat"><div class="etiqueta">Margen neto</div>' +
      '<div class="valor chico ' + netoClase + '">' + esc(formatoPeso(res.margenNeto)) + '</div></div></div>';

    h += '<div class="card"><div class="etiqueta">Detalle · ' + esc(nombreMes(mes)) + '</div>' +
      '<div class="dato"><span class="k">Costos de trabajos</span><span class="v">' +
      esc(formatoPeso(res.costos)) + '</span></div>' +
      '<div class="dato"><span class="k">Trabajos</span><span class="v">' +
      res.nTrabajos + '</span></div></div>';

    // Últimos 6 meses
    const meses = [mes];
    for (let i = 1; i < 6; i++) meses.push(mesAnterior(meses[i - 1]));
    const resumenes = await Promise.all(meses.map(m => resumenMes(m)));
    const maxAbs = Math.max.apply(null, resumenes.map(r => Math.abs(r.margenNeto)).concat([0]));

    h += '<div class="card"><div class="sec-titulo">📈 Últimos 6 meses</div>';
    for (let i = 0; i < meses.length; i++) {
      const neto = resumenes[i].margenNeto;
      const ancho = maxAbs > 0 ? Math.round(Math.abs(neto) / maxAbs * 100) : 0;
      const clase = neto < 0 ? 'rojo' : '';
      h += '<div class="barra-row">' +
        '<div class="eti">' + esc(nombreMes(meses[i]).slice(0, 3)) + '</div>' +
        '<div class="barra-track"><div class="barra-fill ' + clase + '" style="width:' + ancho + '%"></div></div>' +
        '<div class="num">' + esc(formatoPeso(neto)) + '</div></div>';
    }
    h += '</div>';

    // Top clientes del mes
    const [conTot, clientes] = await Promise.all([trabajosConTotales(), getClientes()]);
    const nombreCli = {};
    for (const c of clientes) nombreCli[c.id] = c.nombre;
    const porCli = {};
    for (const x of conTot) {
      if (!enMes(x.t.fecha, mes)) continue;
      if (x.t.estado === 'a_hacer') continue;
      const k = x.t.clienteId || 'sin';
      if (!porCli[k]) porCli[k] = { ing: 0, mar: 0 };
      porCli[k].ing += x.tot.ingresos;
      porCli[k].mar += x.tot.margen;
    }
    const top = Object.keys(porCli)
      .map(k => ({ nombre: k === 'sin' ? 'Sin cliente' : (nombreCli[k] || 'Cliente'), ing: porCli[k].ing, mar: porCli[k].mar }))
      .sort((a, b) => b.ing - a.ing)
      .slice(0, 5);

    h += '<div class="card"><div class="sec-titulo">🏆 Top clientes del mes</div>';
    if (!top.length) {
      h += '<div class="vacio"><span class="emoji">📊</span>Sin trabajos en este mes.</div>';
    } else {
      for (const c of top) {
        const marClase = c.mar < 0 ? 'negativo' : 'positivo';
        h += '<div class="fila">' +
          '<div class="cuerpo">' +
          '<div class="titulo">' + esc(c.nombre) + '</div>' +
          '<div class="bajada">Margen <span class="' + marClase + '">' + esc(formatoPeso(c.mar)) + '</span></div></div>' +
          '<div class="lateral"><div class="monto">' + esc(formatoPeso(c.ing)) + '</div></div></div>';
      }
    }
    h += '</div>';

    return h;
  },

  async bind(params) {
    params = params || {};
    const mes = params.mes || mesActual();
    const inputMes = document.getElementById('repMes');
    if (inputMes) {
      inputMes.onchange = () => go('reportes', { mes: inputMes.value || mes });
    }
  }
};
