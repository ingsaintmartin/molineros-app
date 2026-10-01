/* ============================================================
   MolineroApp v2 - Pantalla de Trabajos
   Vistas: lista, detalle, form.
   ============================================================ */

// Normaliza una tarea: puede ser string (viejo) u objeto {texto, hecha}
function normTarea(x) {
  if (typeof x === 'object' && x !== null) {
    return { texto: String(x.texto || ''), hecha: !!x.hecha };
  }
  return { texto: String(x || ''), hecha: false };
}

Pantallas.trabajos = {
  titulo: 'Trabajos',

  async render(params) {
    params = params || {};
    const vista = params.vista || 'lista';
    if (vista === 'detalle') return this.renderDetalle(params.id);
    if (vista === 'form') return this.renderForm(params);
    return this.renderLista();
  },

  async bind(params) {
    params = params || {};
    const vista = params.vista || 'lista';
    if (vista === 'detalle') return this.bindDetalle(params.id);
    if (vista === 'form') return this.bindForm(params);
    return this.bindLista();
  },

  /* ---------------- LISTA ---------------- */
  async renderLista() {
    const h = '<input class="buscador" id="traBuscar" type="search" placeholder="🔍 Buscar por trabajo, cliente o instalación…" />' +
      '<div class="chips" id="traChips">' +
      [['','Todos'],['a_hacer','A hacer'],['en_curso','En curso'],['pausado','Pausado'],['terminado','Terminado'],
       ['facturado','Facturado'],['cobrado','Cobrado'],['por_cobrar','Por cobrar']]
        .map((c, i) => '<button type="button" class="fchip' + (i === 0 ? ' activo' : '') + '"' +
          ' data-filtro="' + c[0] + '">' + esc(c[1]) + '</button>').join('') +
      '</div>' +
      '<div id="traFilas"></div>' +
      '<button class="fab" id="fabTra" aria-label="Nuevo trabajo">＋</button>';
    return h;
  },

  async bindLista() {
    const [conTot, clientes, instalaciones] = await Promise.all([
      trabajosConTotales(), getClientes(), getInstalaciones()
    ]);
    const nombreCli = {};
    for (const c of clientes) nombreCli[c.id] = c.nombre;
    const nombreIns = {};
    for (const i of instalaciones) nombreIns[i.id] = i.nombre;

    let filtro = '';
    let busqueda = '';

    const pintar = () => {
      const cont = document.getElementById('traFilas');
      if (!cont) return;
      const q = normalizarTexto(busqueda);
      const filas = conTot.filter(x => {
        const t = x.t;
        if (filtro === 'por_cobrar') {
          if (!x.facturado || x.saldo <= 0) return false;
        } else if (filtro === 'facturado') {
          if (!x.facturado) return false;
        } else if (filtro === 'cobrado') {
          if (!x.cobrado) return false;
        } else if (filtro && t.estado !== filtro) {
          return false;
        }
        if (q) {
          const hay = normalizarTexto(
            (t.descripcion || '') + ' ' + (nombreCli[t.clienteId] || '') + ' ' +
            (nombreIns[t.instalacionId] || '')
          );
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
      if (!filas.length) {
        cont.innerHTML = '<div class="vacio"><span class="emoji">🔧</span>' +
          'No hay trabajos con ese filtro.</div>';
        return;
      }
      cont.innerHTML = filas.map(x => {
        const t = x.t;
        const bajada = [fechaLegible(t.fecha), nombreCli[t.clienteId], nombreIns[t.instalacionId]]
          .filter(Boolean).join(' · ');
        return '<button class="fila" data-ver-trabajo="' + esc(t.id) + '">' +
          '<div class="avatar">🔧</div><div class="cuerpo">' +
          '<div class="titulo">' + esc(t.descripcion || 'Trabajo') + '</div>' +
          '<div class="bajada">' + esc(bajada) + '</div></div>' +
          '<div class="lateral">' + chipEstado(t.estado) + (x.facturado ? chipEstado(x.cobrado ? 'cobrado' : 'facturado') : '') +
          (x.tot.ingresos > 0
            ? '<div class="valor chico" style="margin-top:4px">' + esc(formatoPeso(x.tot.ingresos)) + '</div>'
            : '') +
          '</div></button>';
      }).join('');
      cont.querySelectorAll('[data-ver-trabajo]').forEach(b => {
        b.onclick = () => go('trabajos', { vista: 'detalle', id: b.dataset.verTrabajo });
      });
    };

    const buscar = document.getElementById('traBuscar');
    if (buscar) buscar.oninput = () => { busqueda = buscar.value; pintar(); };
    document.querySelectorAll('#traChips .fchip').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('#traChips .fchip').forEach(x => x.classList.remove('activo'));
        b.classList.add('activo');
        filtro = b.dataset.filtro;
        pintar();
      };
    });
    const fab = document.getElementById('fabTra');
    if (fab) fab.onclick = () => go('trabajos', { vista: 'form' });
    pintar();
  },

  /* ---------------- DETALLE ---------------- */
  async renderDetalle(id) {
    const t = await getTrabajo(id);
    if (!t) {
      return '<div class="vacio"><span class="emoji">🔧</span>El trabajo no existe.</div>' +
        '<button class="btn btn-ghost" onclick="go(\'trabajos\', {vista:\'lista\'}, true)">Volver a la lista</button>';
    }
    const [items, cliente, instalacion, gastos, presupuesto, vehiculo] = await Promise.all([
      getItemsDeTrabajo(id),
      t.clienteId ? getCliente(t.clienteId) : null,
      t.instalacionId ? getInstalacion(t.instalacionId) : null,
      getGastosDeTrabajo(id),
      t.presupuestoId ? getFactura(t.presupuestoId) : null,
      t.vehiculoId ? getVehiculo(t.vehiculoId) : null
    ]);
    const tot = totalesTrabajo(t, items, vehiculo, gastos);
    const tareas = (t.tareas || []).map(normTarea);
    const fotos = (t.fotos || []).map(fotoSegura).filter(Boolean);

    let h = '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
      '<h2 style="margin:0">' + esc(t.descripcion || 'Trabajo') + '</h2>' +
      chipEstado(t.estado) + '</div>' +
      '<div style="margin-top:10px">' +
      '<div class="dato"><span class="k">Fecha</span><span class="v">' + esc(fechaLegible(t.fecha)) + '</span></div>' +
      '<div class="dato"><span class="k">Cliente</span><span class="v">' +
      (cliente
        ? '<button type="button" class="btn btn-ghost" style="padding:4px 10px" data-go-cliente="' + esc(cliente.id) + '">' + esc(cliente.nombre) + '</button>'
        : '—') + '</span></div>' +
      '<div class="dato"><span class="k">Instalación</span><span class="v">' +
      (instalacion
        ? '<button type="button" class="btn btn-ghost" style="padding:4px 10px" data-go-instalacion="' + esc(instalacion.id) + '">' + esc(instalacion.nombre || 'Instalación') + '</button>'
        : '—') + '</span></div>' +
      (presupuesto
        ? '<div class="dato"><span class="k">Presupuesto</span><span class="v">' +
          '<button type="button" class="btn btn-ghost" style="padding:4px 10px" data-go-presupuesto="' + esc(presupuesto.id) + '">📄 Nº ' + esc(presupuesto.numero || '') + '</button></span></div>'
        : '') +
      '</div></div>';

    // Tareas (checklist)
    h += '<div class="card"><div class="sec-titulo">📋 Tareas</div>';
    if (!tareas.length) {
      h += '<div class="hint">Sin tareas cargadas.</div>';
    } else {
      h += tareas.map((ta, i) =>
        '<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px dashed var(--linea);cursor:pointer">' +
        '<input type="checkbox" data-tarea-i="' + i + '"' + (ta.hecha ? ' checked' : '') +
        ' style="width:22px;height:22px;margin-top:1px;flex:0 0 auto" />' +
        '<span style="' + (ta.hecha ? 'text-decoration:line-through;color:var(--muted)' : '') + '">' +
        esc(ta.texto || 'Tarea') + '</span></label>'
      ).join('');
    }
    h += '</div>';

    // Materiales
    h += '<div class="card"><div class="sec-titulo">🔩 Conceptos del trabajo</div>';
    if (!items.length) {
      h += '<div class="hint">Sin conceptos cargados.</div>';
    } else {
      h += items.map(it => {
        const cant = parseFloat(it.cantidad) || 0;
        const pu = parseFloat(it.precioUnit) || 0;
        return '<div class="dato"><span class="k">' + esc(cant) + ' × ' + esc(it.descripcion || 'Material') +
          ' — ' + esc(TIPOS_CONCEPTO[it.tipoConcepto || 'material']) + ' · ' + esc(formatoPeso(pu)) + ' c/u</span>' +
          '<span class="v">' + esc(formatoPeso(cant * pu)) + '</span></div>';
      }).join('');
    }
    h += '</div>';

    // Mano de obra / viaje / monto manual
    if ((parseFloat(t.horas) || 0) > 0 || (parseFloat(t.montoManual) || 0) > 0 || (parseFloat(t.km) || 0) > 0 || (parseFloat(t.litrosKm) || 0) > 0) {
      h += '<div class="card"><div class="sec-titulo">🧾 Conceptos</div>';
      if ((parseFloat(t.horas) || 0) > 0) {
        h += '<div class="dato"><span class="k">Mano de obra (' + esc(t.horas) + ' h × ' +
          esc(formatoPeso(t.tarifaHora)) + ')</span><span class="v">' + esc(formatoPeso(tot.manoObra)) + '</span></div>';
      }
      if ((parseFloat(t.litrosKm) || 0) > 0 && (parseFloat(t.precioLitro) || 0) > 0) {
        h += '<div class="dato"><span class="k">Viaje (' + esc(t.km || 0) + ' km × ' + esc(t.litrosKm) + ' l/km × ' +
          esc(formatoPeso(t.precioLitro)) + ')</span><span class="v">' + esc(formatoPeso(tot.viaje)) + '</span></div>';
      } else if ((parseFloat(t.km) || 0) > 0) {
        h += '<div class="dato"><span class="k">Viaje (' + esc(t.km) + ' km × ' +
          esc(formatoPeso(t.costoKm)) + ')</span><span class="v">' + esc(formatoPeso(tot.viaje)) + '</span></div>';
      }
      if ((parseFloat(t.montoManual) || 0) > 0) {
        h += '<div class="dato"><span class="k">Monto manual' + (t.presupuestoId ? ' (según presupuesto)' : '') + '</span><span class="v">' +
          esc(formatoPeso(tot.manual)) + '</span></div>';
      }
      h += '</div>';
    }

    // Totales
    const neg = tot.margen < 0;
    h += '<div class="card"><div class="sec-titulo">💰 Totales</div>' +
      '<table class="eco">' +
      (tot.preciosPorConcepto.material > 0 ? '<tr><td>Repuestos / materiales (precio)</td><td class="num">' + esc(formatoPeso(tot.preciosPorConcepto.material)) + '</td></tr>' : '') +
      '<tr><td>Servicios / mano de obra (precio)</td><td class="num">' + esc(formatoPeso(tot.preciosPorConcepto.servicio + tot.manoObra)) + '</td></tr>' +
      (tot.preciosPorConcepto.traslado + tot.viaje > 0 ? '<tr><td>Traslado (precio)</td><td class="num">' + esc(formatoPeso(tot.preciosPorConcepto.traslado + tot.viaje)) + '</td></tr>' : '') +
      (tot.preciosPorConcepto.viatico > 0 ? '<tr><td>Viáticos / otros cargos (precio)</td><td class="num">' + esc(formatoPeso(tot.preciosPorConcepto.viatico)) + '</td></tr>' : '') +
      (tot.manual > 0
        ? '<tr><td>Monto manual</td><td class="num">' + esc(formatoPeso(tot.manual)) + '</td></tr>' : '') +
      '<tr class="total"><td>Ingresos totales</td><td class="num">' + esc(formatoPeso(tot.ingresos)) + '</td></tr>' +
      '<tr><td>Costos (conceptos + vehículo + gastos directos)</td><td class="num">' + esc(formatoPeso(tot.costos)) + '</td></tr>' +
      '<tr class="margen' + (neg ? ' negativo' : '') + '"><td>Margen (' +
      esc((neg ? '−' : '') + Math.abs(tot.margenPct).toFixed(0) + ' %') + ')</td>' +
      '<td class="num">' + esc(formatoPeso(tot.margen)) + '</td></tr>' +
      '</table>' + (items.some(it => it.costoUnit == null) ? '<p class="hint">Margen estimado: hay conceptos sin costo interno cargado.</p>' : '') + '</div>';

    // Observaciones
    if (t.observaciones) {
      h += '<div class="card"><div class="sec-titulo">📝 Observaciones</div>' +
        '<p style="margin:0">' + esc(t.observaciones) + '</p></div>';
    }

    // Fotos
    if (fotos.length) {
      h += '<div class="card"><div class="sec-titulo">📷 Fotos</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
        fotos.map((f, i) =>
          '<button type="button" class="thumb" data-foto-i="' + i + '"' +
          ' style="padding:0;border:none;background:none;cursor:pointer">' +
          '<img src="' + f + '" alt="Foto ' + (i + 1) + '" /></button>'
        ).join('') +
        '</div></div>';
    }

    // Gastos asignados
    if (gastos.length) {
      h += '<div class="card"><div class="sec-titulo">🧾 Gastos asignados</div>' +
        gastos.map(g =>
          '<div class="dato"><span class="k">' + esc(fechaLegible(g.fecha)) + ' · ' +
          esc(g.descripcion || g.categoria || 'Gasto') + '</span>' +
          '<span class="v">' + esc(formatoPeso(g.monto)) + '</span></div>'
        ).join('') + '</div>';
    }

    // Acciones
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 20px">' +
      '<button class="btn btn-secondary" id="traEditar">✏️ Editar</button>' +
      '<button class="btn btn-ghost" id="traEstado">🔄 Cambiar estado</button>' +
      '<button class="btn btn-ghost" id="traAgregarGasto">＋ Gasto de este trabajo</button>' +
      '<button class="btn btn-ambar" id="traFacturar">🧾 Revisar liquidación</button>' +
      '<button class="btn btn-danger" id="traEliminar" style="margin-left:auto">🗑️ Eliminar</button>' +
      '</div>';

    return h;
  },

  async bindDetalle(id) {
    const t = await getTrabajo(id);
    if (!t) return;
    const fotos = (t.fotos || []).map(fotoSegura).filter(Boolean);

    document.querySelectorAll('[data-tarea-i]').forEach(chk => {
      chk.onchange = async () => {
        const i = +chk.dataset.tareaI;
        const lista = (t.tareas || []).map(normTarea);
        if (lista[i]) lista[i].hecha = chk.checked;
        t.tareas = lista;
        await actualizarTrabajo(t);
        go('trabajos', { vista: 'detalle', id: id }, true);
      };
    });

    document.querySelectorAll('[data-go-cliente]').forEach(b => {
      b.onclick = () => go('clientes', { vista: 'detalle', id: b.dataset.goCliente });
    });
    document.querySelectorAll('[data-go-instalacion]').forEach(b => {
      b.onclick = () => go('clientes', { vista: 'instalacion', id: b.dataset.goInstalacion });
    });
    document.querySelectorAll('[data-go-presupuesto]').forEach(b => {
      b.onclick = () => go('presupuestos', { vista: 'detalle', id: b.dataset.goPresupuesto });
    });

    document.querySelectorAll('[data-foto-i]').forEach(b => {
      b.onclick = () => abrirFoto(fotos[+b.dataset.fotoI]);
    });

    const editar = document.getElementById('traEditar');
    const agregarGasto = document.getElementById('traAgregarGasto');
    if (agregarGasto) agregarGasto.onclick = () => go('gastos', { vista: 'form', trabajoId: id });
    if (editar) editar.onclick = () => go('trabajos', { vista: 'form', id: id });

    const estado = document.getElementById('traEstado');
    if (estado) {
      estado.onclick = () => {
        abrirModal(
          '<h2>Cambiar estado</h2>' +
          '<p class="modal-sub">¿En qué estado queda el trabajo?</p>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' +
          ['a_hacer', 'en_curso', 'pausado', 'terminado', 'cancelado'].map(k =>
            '<button class="btn ' + (k === t.estado ? 'btn-primary' : 'btn-ghost') + '"' +
            ' data-est="' + k + '">' + esc(ESTADOS_TRABAJO[k]) + '</button>'
          ).join('') +
          '<button class="btn btn-ghost" id="estCancelar">Cancelar</button>' +
          '</div>'
        );
        document.querySelectorAll('[data-est]').forEach(b => {
          b.onclick = async () => {
            t.estado = b.dataset.est;
            try { await guardarTrabajoConItems(t, await getItemsDeTrabajo(id)); }
            catch (e) { snack(e.message); return; }
            cerrarModal();
            go('trabajos', { vista: 'detalle', id: id }, true);
          };
        });
        const cancelar = document.getElementById('estCancelar');
        if (cancelar) cancelar.onclick = cerrarModal;
      };
    }

    const facturar = document.getElementById('traFacturar');
    if (facturar) facturar.onclick = async () => {
      const facturas = await getFacturas();
      const items = await dbLocal.factura_items.toArray();
      const ocupados = trabajosFacturados(facturas, items);
      if (ocupados.has(id)) {
        const ids = new Set(items.filter(it => it.trabajoId === id).map(it => it.facturaId));
        const f = facturas.find(f => ids.has(f.id) && f.tipo === 'factura' && f.estado !== 'anulada');
        go('facturacion', { vista: 'detalle', id: f.id }); return;
      }
      if (!['terminado', 'facturado', 'cobrado'].includes(t.estado)) { snack('Terminá el trabajo antes de liquidarlo.'); return; }
      go('facturacion', { vista: 'form', trabajoId: id });
    };

    const eliminar = document.getElementById('traEliminar');
    if (eliminar) {
      eliminar.onclick = async () => {
        const ok = await confirmar(
          'Eliminar trabajo',
          'Se borra el trabajo y sus materiales y gastos. Esta acción no se puede deshacer.',
          'Eliminar'
        );
        if (!ok) return;
        await eliminarTrabajo(id);
        snack('Trabajo eliminado.');
        go('trabajos', { vista: 'lista' }, true);
      };
    }
  },

  /* ---------------- FORM ---------------- */
  async renderForm(params) {
    params = params || {};
    const t = params.id ? await getTrabajo(params.id) : null;
    const items = params.id ? await getItemsDeTrabajo(params.id) : [];
    const [clientes, repuestos, vehiculos, empresa] = await Promise.all([
      getClientes(), getRepuestos(), getVehiculos(), getEmpresa()
    ]);
    // Orden vinculada a un presupuesto: precarga el cliente y guarda el vínculo
    const presId = t ? (t.presupuestoId || '') : (params.presupuestoId || '');
    const pres = (!t && presId) ? await getFactura(presId) : null;

    const clienteSel = t ? t.clienteId : (params.clienteId || (pres && pres.clienteId) || '');
    const insSel = t ? (t.instalacionId || '') : (params.instalacionId || '');
    const tareas = t ? (t.tareas || []).map(normTarea) : [];
    const fotos = t ? (t.fotos || []) : [];

    let h = '<form class="form" id="formTra" autocomplete="off">' +
      '<input type="hidden" id="traPresupuestoId" value="' + esc(presId) + '" />' +
      (pres ? '<p class="hint">🔧 Orden de trabajo del presupuesto Nº ' + esc(pres.numero || '') + ' — se puede modificar libremente.</p>' : '') +
      campoSelect('traCliente', 'Cliente', clientes.map(c => ({ value: c.id, texto: c.nombre })), clienteSel, { req: true }) +
      '<div id="traInsWrap"></div>' +
      '<div class="field-row">' +
      campo('date', 'traFecha', 'Fecha', t ? (t.fecha || hoyISO()) : hoyISO()) +
      campoSelect('traEstado', 'Estado',
        ['a_hacer', 'en_curso', 'pausado', 'terminado', 'cancelado'].map(k => ({ value: k, texto: ESTADOS_TRABAJO[k] })),
        t ? (['facturado', 'cobrado'].includes(t.estado) ? 'terminado' : t.estado) : 'a_hacer') +
      '</div>' +
      campo('text', 'traDescripcion', 'Descripción', t ? t.descripcion : '',
        { req: true, placeholder: 'Ej.: Cambio de aletas y cueros del molino' }) +

      '<div class="seccion-titulo"><h3>📋 Tareas</h3></div>' +
      '<div id="tareasBox"></div>' +
      '<button type="button" class="btn btn-ghost" id="addTarea">＋ Agregar tarea</button>' +

      '<div class="seccion-titulo"><h3>🧾 Servicios, repuestos y otros conceptos</h3></div>' +
      '<div id="matsBox"></div>' +
      '<button type="button" class="btn btn-ghost" id="addMat">＋ Agregar concepto</button>' +

      '<div class="seccion-titulo"><h3>🧾 Mano de obra y viaje</h3></div>' +
      '<p class="hint">Si ya detallaste un servicio o un traslado en los conceptos, no se cobra otra vez por estas horas o kilómetros. Cargá cualquier adicional como un concepto nuevo.</p>' +
      '<div class="field-row">' +
      campo('text', 'traHoras', 'Horas', t && t.horas !== null && t.horas !== undefined ? t.horas : '',
        { inputmode: 'decimal', placeholder: '0' }) +
      campo('text', 'traTarifa', 'Tarifa por hora', t && t.tarifaHora !== null && t.tarifaHora !== undefined ? t.tarifaHora : getCfg('tarifaHora', ''),
        { inputmode: 'decimal', placeholder: '$' }) +
      '</div>' +
      campo('text', 'traKm', 'Kilómetros totales (ida y vuelta)', t && t.km !== null && t.km !== undefined ? t.km : '',
        { inputmode: 'decimal', placeholder: '0' }) +
      campoSelect('traVehiculo', 'Vehículo', [{ value: '', texto: 'Sin vehículo' }].concat(
        vehiculos.map(v => ({ value: v.id, texto: v.nombre + (v.patente ? ' · ' + v.patente : '') }))
      ), t ? (t.vehiculoId || '') : '') +
      '<div class="field-row">' +
      campo('text', 'traLitrosKm', 'Litros de gasoil por km', t && t.litrosKm !== null && t.litrosKm !== undefined ? t.litrosKm : '',
        { inputmode: 'decimal', placeholder: '1' }) +
      campo('text', 'traPrecioLitro', '$ por litro', t && t.precioLitro !== null && t.precioLitro !== undefined ? t.precioLitro : getCfg('precioLitro', '2500'),
        { inputmode: 'decimal', placeholder: '$' }) +
      '</div>' +
      '<p class="hint">Viáticos = km × litros por km × $ por litro. Ej: 60 km × 1 l/km × $2.500.</p>' +

      campo('text', 'traManual', 'Importe adicional / global', t && t.montoManual !== null && t.montoManual !== undefined ? t.montoManual : '',
        { inputmode: 'decimal', placeholder: '$', hint: 'Se suma a los conceptos detallados. Para un precio global, dejá los demás precios vacíos.' }) +
      '<div' + ((t && t.condicionEmisor || empresa.condicionFiscal) !== 'responsable_inscripto' ? ' hidden' : '') + '>' +
      campoSelect('traIvaModo', 'Precios del trabajo', [{ value: '1', texto: 'Importes finales' }, { value: '0', texto: 'Precios netos, más IVA' }], t && t.ivaIncluido === false ? '0' : '1') + '</div>' +
      campoTexto('traObs', 'Observaciones', t ? t.observaciones : '') +

      '<div class="seccion-titulo"><h3>📷 Fotos</h3></div>' +
      photoPickerHTML('traForm', fotos, false) +

      '<button type="submit" class="btn btn-primary">Guardar</button>' +
      '<button type="button" class="btn btn-ghost" id="traCancelar">Cancelar</button>' +
      '</form>';
    return h;
  },

  async bindForm(params) {
    params = params || {};
    const t = params.id ? await getTrabajo(params.id) : null;
    const items = params.id ? await getItemsDeTrabajo(params.id) : [];
    const [repuestos, vehiculos] = await Promise.all([getRepuestos(), getVehiculos()]);
    const repPorId = {};
    for (const r of repuestos) repPorId[r.id] = r;
    const vehPorId = {};
    for (const v of vehiculos) vehPorId[v.id] = v;

    const cancelar = document.getElementById('traCancelar');
    if (cancelar) cancelar.onclick = () => goBack();

    /* ---- Instalaciones según cliente ---- */
    const selCli = document.getElementById('traCliente');
    const insWrap = document.getElementById('traInsWrap');
    const pintarInstalaciones = async (clienteId, elegido) => {
      const inss = clienteId
        ? await getInstalacionesDeCliente(clienteId)
        : await getInstalaciones();
      const opts = [{ value: '', texto: 'Sin instalación específica' }]
        .concat(inss.map(i => ({ value: i.id, texto: i.nombre || 'Instalación' })));
      insWrap.innerHTML = campoSelect('traInstalacion', 'Instalación', opts, elegido || '');
    };
    const clienteInicial = t ? t.clienteId : (params.clienteId || val('traCliente'));
    const insInicial = t ? (t.instalacionId || '') : (params.instalacionId || '');
    await pintarInstalaciones(clienteInicial, insInicial);
    if (selCli) selCli.onchange = () => pintarInstalaciones(selCli.value, '');

    /* ---- Vehículo → autocompleta litros de gasoil por km ---- */
    const selVeh = document.getElementById('traVehiculo');
    const inpLitrosKm = document.getElementById('traLitrosKm');
    if (selVeh && inpLitrosKm) {
      selVeh.onchange = () => {
        const v = vehPorId[selVeh.value];
        if (v && (parseFloat(v.litrosKm) || 0) > 0) inpLitrosKm.value = v.litrosKm;
      };
    }

    /* ---- Tareas dinámicas ---- */
    const tareasBox = document.getElementById('tareasBox');
    const tareaRow = (texto, hecha) =>
      '<div class="item-dinamico"><div style="display:flex;gap:8px;align-items:center">' +
      '<input type="text" data-tarea value="' + esc(texto) + '" data-hecha="' + (hecha ? '1' : '0') + '"' +
      ' placeholder="Ej.: Cambiar aletas" style="flex:1" />' +
      '<button type="button" class="mini-btn" data-tarea-quitar aria-label="Quitar tarea">✕</button>' +
      '</div></div>';
    const bindTareas = () => {
      tareasBox.querySelectorAll('[data-tarea-quitar]').forEach(b => {
        b.onclick = () => { b.closest('.item-dinamico').remove(); };
      });
    };
    const cargarTareas = (tareas) => {
      tareasBox.innerHTML = tareas.map(ta => tareaRow(ta.texto, ta.hecha)).join('');
      bindTareas();
    };
    cargarTareas(t ? (t.tareas || []).map(normTarea) : []);
    document.getElementById('addTarea').onclick = () => {
      tareasBox.insertAdjacentHTML('beforeend', tareaRow('', false));
      bindTareas();
    };

    /* ---- Materiales dinámicos ---- */
    const matsBox = document.getElementById('matsBox');
    const opcionesRepuestos = () =>
      repuestos.map(r =>
        '<option value="' + esc(r.id) + '">' + esc(r.nombre) +
        (r.precio ? ' · ' + esc(formatoPeso(r.precio)) : '') + '</option>'
      ).join('');
    const matRow = (m) => {
      m = m || {};
      const tipoConcepto = m.tipoConcepto || (m.descripcion || m.repuestoId ? 'material' : 'servicio');
      const esLibre = !m.repuestoId;
      return '<div class="item-dinamico" data-mat data-stock-aplicado="' + (m.repuestoId && m.stockAplicado !== false ? '1' : '0') + '" data-concepto="' + esc(m.tipoConcepto || 'material') + '" data-iva="' + esc(m.iva == null ? 21 : m.iva) + '">' +
        '<div class="field"><label>Tipo de concepto</label><select data-mat-tipo>' +
        Object.keys(TIPOS_CONCEPTO).map(k => '<option value="' + k + '"' + (k === tipoConcepto ? ' selected' : '') + '>' + TIPOS_CONCEPTO[k] + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Repuesto</label><select data-mat-rep>' +
        '<option value="">Sin repuesto de stock</option>' + opcionesRepuestos() + '</select></div>' +
        '<div class="field" data-mat-desc-wrap' + (esLibre ? '' : ' hidden') + '>' +
        '<label>Descripción</label><input type="text" data-mat-desc value="' + esc(m.descripcion || '') + '"' +
        ' placeholder="Ej.: Cuero de cilindro" /></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<div class="field"><label>Cantidad</label><input type="text" inputmode="decimal" data-mat-cant' +
        ' value="' + esc(m.cantidad !== undefined && m.cantidad !== null ? m.cantidad : '1') + '" /></div>' +
        '<div class="field"><label>Precio unit.</label><input type="text" inputmode="decimal" data-mat-precio' +
        ' value="' + esc(m.precioUnit !== undefined && m.precioUnit !== null ? m.precioUnit : '') + '"' +
        ' placeholder="$" /></div></div>' +
        '<div class="field" data-mat-costo-wrap' + (esLibre ? '' : ' hidden') + '>' +
        '<label>Costo unit.</label><input type="text" inputmode="decimal" data-mat-costo' +
        ' value="' + esc(m.costoUnit !== undefined && m.costoUnit !== null ? m.costoUnit : '') + '"' +
        ' placeholder="$" /></div>' +
        '<button type="button" class="mini-btn" data-mat-quitar>✕ Quitar</button>' +
        '</div>';
    };
    const bindMatRow = (fila) => {
      const sel = fila.querySelector('[data-mat-rep]');
      const descWrap = fila.querySelector('[data-mat-desc-wrap]');
      const costoWrap = fila.querySelector('[data-mat-costo-wrap]');
      const inpDesc = fila.querySelector('[data-mat-desc]');
      const inpPrecio = fila.querySelector('[data-mat-precio]');
      const inpCosto = fila.querySelector('[data-mat-costo]');
      sel.onchange = () => {
        const r = repPorId[sel.value];
        if (r) {
          fila.querySelector('[data-mat-tipo]').value = 'material';
          if (inpDesc) inpDesc.value = r.nombre;
          if (inpPrecio) inpPrecio.value = r.precio !== null && r.precio !== undefined ? r.precio : '';
          if (inpCosto) inpCosto.value = r.costo !== null && r.costo !== undefined ? r.costo : '';
          descWrap.hidden = true;
          costoWrap.hidden = true;
        } else {
          descWrap.hidden = false;
          costoWrap.hidden = false;
        }
      };
      fila.querySelector('[data-mat-quitar]').onclick = () => fila.remove();
    };
    const agregarMat = (m) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = matRow(m);
      const fila = tmp.firstElementChild;
      if (m && m.repuestoId) fila.querySelector('[data-mat-rep]').value = m.repuestoId;
      matsBox.appendChild(fila);
      bindMatRow(fila);
    };
    items.forEach(agregarMat);
    document.getElementById('addMat').onclick = () => agregarMat(null);

    /* ---- Fotos ---- */
    bindPhotoPicker('traForm', false);

    /* ---- Guardar ---- */
    document.getElementById('formTra').addEventListener('submit', async (e) => {
      e.preventDefault();
      const clienteId = val('traCliente');
      const descripcion = val('traDescripcion');
      if (!clienteId) { snack('Elegí un cliente.'); return; }
      if (!descripcion) { snack('Escribí una descripción.'); return; }

      const tareas = Array.from(tareasBox.querySelectorAll('[data-tarea]'))
        .map(inp => ({ texto: inp.value.trim(), hecha: inp.dataset.hecha === '1' }))
        .filter(x => x.texto);

      const mats = [];
      matsBox.querySelectorAll('[data-mat]').forEach(fila => {
        const repId = fila.querySelector('[data-mat-rep]').value || null;
        const rep = repId ? repPorId[repId] : null;
        const descInput = fila.querySelector('[data-mat-desc]');
        const descripcionIt = rep ? rep.nombre : (descInput ? descInput.value.trim() : '');
        const cantidad = parseFloat(String(fila.querySelector('[data-mat-cant]').value).replace(',', '.')) || 0;
        if (cantidad <= 0 && !descripcionIt) return;
        const costoStr = fila.querySelector('[data-mat-costo]').value.replace(',', '.').trim();
        const precioStr = fila.querySelector('[data-mat-precio]').value.replace(',', '.').trim();
        mats.push({
          tipoConcepto: fila.querySelector('[data-mat-tipo]').value,
          stockAplicado: fila.dataset.stockAplicado === '1',
          iva: Number(fila.dataset.iva),
          repuestoId: repId,
          descripcion: descripcionIt,
          cantidad: cantidad,
          costoUnit: costoStr === '' ? null : parseFloat(costoStr),
          precioUnit: precioStr === '' ? null : parseFloat(precioStr)
        });
      });

      const datos = t ? Object.assign({}, t) : {};
      datos.clienteId = clienteId;
      datos.instalacionId = val('traInstalacion') || null;
      datos.fecha = val('traFecha') || hoyISO();
      datos.estado = val('traEstado') || 'a_hacer';
      datos.descripcion = descripcion;
      datos.tareas = tareas;
      datos.horas = valNum('traHoras');
      datos.tarifaHora = valNum('traTarifa');
      datos.km = valNum('traKm');
      datos.litrosKm = valNum('traLitrosKm');
      datos.precioLitro = valNum('traPrecioLitro');
      datos.vehiculoId = val('traVehiculo') || null;
      const veh = vehPorId[datos.vehiculoId];
      datos.costoRealKm = t && t.vehiculoId === datos.vehiculoId && t.costoRealKm != null
        ? t.costoRealKm : (veh ? Number(veh.costoKm) || 0 : null);
      datos.ivaIncluido = val('traIvaModo') !== '0';
      datos.condicionEmisor = (t && t.condicionEmisor) || (await getEmpresa()).condicionFiscal;
      if (datos.condicionEmisor !== 'responsable_inscripto') datos.ivaIncluido = true;
      datos.costoKm = (t && t.costoKm) || null;
      datos.montoManual = valNum('traManual');
      datos.observaciones = val('traObs');
      datos.fotos = getFotos('traForm');
      datos.presupuestoId = val('traPresupuestoId') || (t && t.presupuestoId) || null;

      const guardar = e.target.querySelector('[type="submit"]');
      if (guardar.disabled) return;
      guardar.disabled = true;
      let id;
      try { id = (await guardarTrabajoConItems(datos, mats)).id; }
      catch (err) { snack(err.message); return; }
      finally { guardar.disabled = false; }
      snack('Trabajo guardado.');
      go('trabajos', { vista: 'detalle', id: id });
    });
  }
};
