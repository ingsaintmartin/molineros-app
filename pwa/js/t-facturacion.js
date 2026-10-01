/* ============================================================
   MolineroApp v2 - Pantalla Facturación
   (presupuestos, facturas y recibos)
   Vistas: lista | detalle | form
   ============================================================ */

Pantallas.facturacion = {
  titulo: 'Facturación',

  async render(params) {
    _usarTabDoc('facturacion');
    const vista = params.vista || 'lista';
    if (vista === 'detalle') return await facDetalleHTML(params.id);
    if (vista === 'form')    return await facFormHTML(params);
    return await facListaHTML(params.tipo || 'factura');
  },

  async bind(params) {
    _usarTabDoc('facturacion');
    const vista = params.vista || 'lista';
    if (vista === 'lista')   facListaBind(params.tipo || 'factura');
    if (vista === 'detalle') facDetalleBind(params.id);
    if (vista === 'form')    facFormBind(params);
  }
};

/* La pantalla de documentos puede vivirse desde la pestaña 'facturacion'
   o desde la pestaña dedicada 'presupuestos'. _tabDoc indica a qué
   pestaña volver al navegar (listas, detalle tras guardar, etc.).
   "Pasar a factura" siempre lleva a la pestaña facturación. */
let _tabDoc = 'facturacion';
function _usarTabDoc(t) { _tabDoc = t || 'facturacion'; }

/* ---------- Utilidades ---------- */
const TIPOS_DOC = {
  presupuesto: 'Presupuesto', factura: 'Factura', recibo: 'Recibo'
};
function nombreTipoDoc(t) { return TIPOS_DOC[t] || 'Documento'; }

function fmtCant(n) {
  const v = parseFloat(n) || 0;
  return Math.round(v) === v ? String(v) : String(Math.round(v * 100) / 100);
}

/* ---------- LISTA ---------- */
async function facListaHTML(tipo, ocultarChips) {
  const [facturas, clientes] = await Promise.all([getFacturas(), getClientes()]);
  const nombreCli = {};
  for (const c of clientes) nombreCli[c.id] = c.nombre;
  let h = '';
  if (!ocultarChips) {
    const chips = [
      { v: 'presupuesto', t: 'Presupuestos' },
      { v: 'factura', t: 'Facturas' },
      { v: 'recibo', t: 'Recibos' }
    ];
    h += '<div class="chips">' +
      chips.map(c => '<button class="fchip' + (tipo === c.v ? ' activo' : '') +
        '" data-tipo="' + c.v + '">' + c.t + '</button>').join('') + '</div>';
  }
  h += '<div id="facRows">';
  const lista = facturas.filter(f => (f.tipo || 'factura') === tipo);
  if (!lista.length) {
    h += '<div class="vacio"><span class="emoji">🧾</span>No hay ' + esc(nombreTipoDoc(tipo).toLowerCase()) + 's todavía.</div>';
  }
  for (const f of lista) {
    const letra = (f.tipo === 'factura' && f.letra) ? ' ' + f.letra : '';
    h += '<button class="fila" data-ver-fac="' + esc(f.id) + '">' +
      '<div class="avatar">🧾</div><div class="cuerpo">' +
      '<div class="titulo">Nº ' + esc((f.numero || '—')) + letra + '</div>' +
      '<div class="bajada">' + esc(nombreCli[f.clienteId] || 'Sin cliente') +
      (f.fecha ? ' · ' + esc(fechaLegible(f.fecha)) : '') + '</div></div>' +
      '<div class="lateral"><div><b>' + esc(formatoPeso(f.total)) + '</b></div>' +
      chipEstado(f.estado) + '</div></button>';
  }
  h += '</div><button class="fab" id="facNuevo" aria-label="Nuevo documento">＋</button>';
  return h;
}

function facListaBind(tipo) {
  document.querySelectorAll('[data-tipo]').forEach(b => {
    b.onclick = () => go(_tabDoc, { vista: 'lista', tipo: b.dataset.tipo }, true);
  });
  document.querySelectorAll('[data-ver-fac]').forEach(b => {
    b.onclick = () => go(_tabDoc, { vista: 'detalle', id: b.dataset.verFac });
  });
  const nuevo = document.getElementById('facNuevo');
  if (nuevo) nuevo.onclick = () => go(_tabDoc, { vista: 'form', tipo: tipo });
}

/* ---------- DETALLE ---------- */
async function facDetalleHTML(id) {
  const f = await getFactura(id);
  if (!f) return '<div class="vacio"><span class="emoji">🧾</span>Documento no encontrado.</div>';
  const items = await getItemsDeFactura(id);
  const cli = f.clienteId ? await getCliente(f.clienteId) : null;
  const tipoDoc = nombreTipoDoc(f.tipo) + ((f.tipo === 'factura' && f.letra) ? ' ' + f.letra : '');
  const tot = (f.neto !== null && f.neto !== undefined)
    ? { total: f.total, neto: f.neto, iva: f.ivaMonto || 0 }
    : totalesConIVA(items, 21, f.ivaIncluido !== false);

  let h = '<div class="card"><div class="sec-titulo"><h3>🧾 ' + esc(tipoDoc) + ' Nº ' + esc(f.numero || '—') + '</h3></div>' +
    '<div class="dato"><span class="k">Estado</span><span class="v">' + chipEstado(f.estado) + '</span></div>' +
    '<div class="dato"><span class="k">Cliente</span><span class="v">' +
    (cli && Pantallas.clientes
      ? '<button style="background:none;border:0;padding:0;color:var(--v700);font:inherit;font-weight:700;cursor:pointer;text-decoration:underline" data-ir-cliente="' + esc(cli.id) + '">' + esc(cli.nombre) + '</button>'
      : esc(cli ? cli.nombre : 'Sin cliente')) + '</span></div>' +
    (cli && cli.condicionFiscal ? '<div class="dato"><span class="k">Cond. fiscal</span><span class="v">' + esc(nombreCondicionFiscal(cli.condicionFiscal)) + '</span></div>' : '') +
    '<div class="dato"><span class="k">Fecha</span><span class="v">' + esc(fechaLegible(f.fecha) || '—') + '</span></div>' +
    '<div class="dato"><span class="k">Precios</span><span class="v">' +
    (f.ivaIncluido === false ? 'Más IVA (se suma arriba)' : 'Con IVA incluido') + '</span></div>' +
    (f.observaciones ? '<div class="dato"><span class="k">Observaciones</span><span class="v">' + esc(f.observaciones) + '</span></div>' : '') +
    '</div>';

  h += '<div class="card"><div class="sec-titulo"><h3>Ítems</h3></div>';
  if (!items.length) {
    h += '<div class="vacio">Sin ítems.</div>';
  } else {
    h += '<table class="eco"><tbody>';
    for (const it of items) {
      const cant = parseFloat(it.cantidad) || 0;
      const pu = parseFloat(it.precioUnit) || 0;
      const ivaTxt = (it.iva !== null && it.iva !== undefined && it.iva !== '') ? nombreAlicuota(it.iva) : '—';
      h += '<tr><td>' + esc(fmtCant(cant)) + ' × ' + esc(it.descripcion || 'Ítem') +
        '<br><span class="hint">IVA ' + esc(ivaTxt) + '</span></td>' +
        '<td class="num">' + esc(formatoPeso(pu)) + '</td>' +
        '<td class="num"><b>' + esc(formatoPeso(cant * pu)) + '</b></td></tr>';
    }
    h += '<tr><td colspan="2">Neto</td><td class="num">' + esc(formatoPeso(tot.neto)) + '</td></tr>' +
      '<tr><td colspan="2">IVA</td><td class="num">' + esc(formatoPeso(tot.iva)) + '</td></tr>' +
      '<tr class="total"><td colspan="2">Total</td><td class="num">' + esc(formatoPeso(tot.total)) + '</td></tr>' +
      '</tbody></table>';
  }
  h += '</div>';

  // Órdenes de trabajo vinculadas (solo presupuestos): se crean al aceptar,
  // y se pueden agregar más, modificar o quitar libremente.
  if (f.tipo === 'presupuesto') {
    const trabajos = await getTrabajosDePresupuesto(id);
    h += '<div class="card"><div class="sec-titulo"><h3>🔧 Órdenes de trabajo</h3></div>';
    if (!trabajos.length) {
      h += '<div class="vacio">Sin órdenes todavía. Al aceptar el presupuesto se crea una sola.</div>';
    } else {
      for (const t of trabajos) {
        h += '<div class="dato"><span class="k">' + esc(fechaLegible(t.fecha) || '—') + '</span><span class="v">' +
          '<button style="background:none;border:0;padding:0;color:var(--v700);font:inherit;font-weight:700;cursor:pointer;text-decoration:underline" data-ir-trabajo="' + esc(t.id) + '">' +
          esc(t.descripcion || 'Orden de trabajo') + '</button> · ' + esc(ESTADOS_TRABAJO[t.estado] || t.estado || '') + '</span></div>';
      }
    }
    h += '<button class="btn" data-nuevo-trabajo>＋ Nueva orden de trabajo</button></div>';
  }

  h += '<button class="btn btn-ambar" data-cambiar-estado>🔄 Cambiar estado</button>' +
    '<button class="btn btn-verde" data-compartir-pdf>📤 Enviar PDF (WhatsApp / Email)</button>' +
    '<button class="btn" data-descargar-pdf>📥 Descargar PDF (para imprimir)</button>' +
    '<button class="btn" data-editar-fac>✏️ Editar</button>';
  if (f.tipo === 'presupuesto') {
    h += '<button class="btn" data-pasar-factura>📄 Pasar a factura</button>';
  }
  h += '<button class="btn btn-ghost" data-eliminar-fac>🗑️ Eliminar</button>';
  return h;
}

function facDetalleBind(id) {
  const irCli = document.querySelector('[data-ir-cliente]');
  if (irCli) irCli.onclick = () => go('clientes', { vista: 'detalle', id: irCli.dataset.irCliente });

  const ce = document.querySelector('[data-cambiar-estado]');
  if (ce) ce.onclick = async () => {
    const f = await getFactura(id);
    if (!f) return;
    // Presupuestos: Pendiente / Aceptado / Rechazado.
    // Facturas y recibos: Pendiente / Cobrada / Anulada.
    const opciones = f.tipo === 'presupuesto'
      ? ['pendiente', 'aceptado', 'rechazado']
      : ['pendiente', 'pagada', 'anulada'];
    abrirModal('<h2>Cambiar estado</h2>' +
      '<p class="modal-sub">' + esc(nombreTipoDoc(f.tipo)) + ' Nº ' + esc(f.numero) + ' — estado actual: ' + esc(ESTADOS_FACTURA[f.estado] || f.estado) + '</p>' +
      opciones.map(e =>
        '<button class="btn" data-estado="' + e + '">' + esc(ESTADOS_FACTURA[e] || e) + '</button>').join('') +
      '<button class="btn btn-ghost" onclick="cerrarModal()">Cancelar</button>');
    document.querySelectorAll('[data-estado]').forEach(b => {
      b.onclick = async () => {
        f.estado = b.dataset.estado;
        await actualizarFactura(f);
        cerrarModal();
        // Presupuesto aceptado → nace la orden de trabajo (una sola vez)
        if (f.tipo === 'presupuesto' && f.estado === 'aceptado') {
          const t = await crearTrabajoDesdePresupuesto(id);
          snack(t ? 'Aceptado. Orden de trabajo creada en la pestaña Trabajos.' : 'Estado: Aceptado.');
        } else {
          snack('Estado: ' + (ESTADOS_FACTURA[f.estado] || f.estado) + '.');
        }
        go(_tabDoc, { vista: 'detalle', id: id }, true);
      };
    });
  };

  document.querySelectorAll('[data-ir-trabajo]').forEach(b => {
    b.onclick = () => go('trabajos', { vista: 'detalle', id: b.dataset.irTrabajo });
  });
  const nt = document.querySelector('[data-nuevo-trabajo]');
  if (nt) nt.onclick = () => go('trabajos', { vista: 'form', presupuestoId: id });

  const ed = document.querySelector('[data-editar-fac]');
  if (ed) ed.onclick = () => go(_tabDoc, { vista: 'form', id: id });

  const cp = document.querySelector('[data-compartir-pdf]');
  if (cp) cp.onclick = () => compartirDocumentoPDF(id);

  const dp = document.querySelector('[data-descargar-pdf]');
  if (dp) dp.onclick = () => descargarDocumentoPDF(id);

  const pf = document.querySelector('[data-pasar-factura]');
  if (pf) pf.onclick = async () => {
    const f = await getFactura(id);
    if (!f) return;
    const items = await getItemsDeFactura(id);
    const empresa = await getEmpresa();
    const tot = totalesConIVA(items, 21, f.ivaIncluido !== false);
    const nueva = await crearFactura({
      clienteId: f.clienteId, tipo: 'factura',
      letra: letraSugerida(empresa.condicionFiscal),
      fecha: hoyISO(), ivaIncluido: f.ivaIncluido !== false,
      estado: 'pendiente', subtotal: tot.total, neto: tot.neto,
      ivaMonto: tot.iva, total: tot.total,
      observaciones: f.observaciones || ''
    }, items.map(it => ({
      trabajoId: it.trabajoId, descripcion: it.descripcion,
      cantidad: it.cantidad, precioUnit: it.precioUnit, iva: it.iva
    })));
    snack('Factura ' + (nueva.letra || '') + ' Nº ' + nueva.numero + ' creada.');
    go('facturacion', { vista: 'detalle', id: nueva.id });
  };

  const del = document.querySelector('[data-eliminar-fac]');
  if (del) del.onclick = async () => {
    const f = await getFactura(id);
    if (!f) return;
    const ok = await confirmar('Eliminar ' + nombreTipoDoc(f.tipo).toLowerCase(),
      '¿Eliminar el ' + nombreTipoDoc(f.tipo).toLowerCase() + ' Nº ' + f.numero + '? Se borran también sus ítems.',
      'Eliminar');
    if (!ok) return;
    await eliminarFactura(id);
    snack('Documento eliminado.');
    go(_tabDoc, { vista: 'lista', tipo: f.tipo || 'factura' }, true);
  };
}

/* ---------- FORM ---------- */
let _fdescSeq = 0;
function facIvaOptionsHTML(sel) {
  return ALICUOTAS_IVA.map(a => '<option value="' + a + '"' +
    (String(sel) === String(a) ? ' selected' : '') + '>' +
    (a ? 'IVA ' + String(a).replace('.', ',') + '%' : 'Exento') + '</option>').join('');
}

function facItemRowHTML(it) {
  it = it || {};
  const ivaSel = (it.iva !== null && it.iva !== undefined && it.iva !== '') ? it.iva : 21;
  return '<div class="item-dinamico"><div class="grid">' +
    '<div class="con-micro"><input type="text" data-f-desc placeholder="Descripción" value="' + esc(it.descripcion || '') + '" />' +
    microBtnHTML('fdesc_nuevo') + '</div>' +
    '<input type="number" data-f-cant placeholder="Cant." value="' + esc(it.cantidad !== undefined ? it.cantidad : 1) + '" inputmode="decimal" />' +
    '<button type="button" class="mini-btn" data-f-quitar aria-label="Quitar ítem">✕</button>' +
    '</div><div style="margin-top:8px;display:flex;gap:8px">' +
    '<input type="number" data-f-precio placeholder="Precio unitario ($)" value="' + esc(it.precioUnit !== undefined ? it.precioUnit : '') + '" inputmode="decimal" style="flex:1" />' +
    '<select data-f-iva style="width:118px">' + facIvaOptionsHTML(ivaSel) + '</select>' +
    '</div></div>';
}

async function facFormHTML(params) {
  const f = params.id ? await getFactura(params.id) : null;
  const clientes = await getClientes();
  const empresa = await getEmpresa();
  const tipo = (f && f.tipo) || params.tipo || 'factura';
  const tipoOpts = ['presupuesto', 'factura', 'recibo'].map(t => ({ value: t, texto: nombreTipoDoc(t) }));
  const cliOpts = [{ value: '', texto: '— Elegir cliente —' }]
    .concat(clientes.map(c => ({ value: c.id, texto: c.nombre })));
  const letraActual = (f && f.letra) || params.letra || letraSugerida(empresa.condicionFiscal);
  const letraOpts = ['A', 'B', 'C'].map(l => ({ value: l, texto: 'Factura ' + l }));

  // Ítems iniciales: edición no los toca; params.trabajoId precarga uno
  let itemsInicial = [];
  if (!f && params.trabajoId) {
    const conTot = await trabajosConTotales();
    const hallado = conTot.find(x => x.t.id === params.trabajoId);
    if (hallado) {
      itemsInicial.push({ trabajoId: hallado.t.id, descripcion: hallado.t.descripcion || 'Trabajo', cantidad: 1, precioUnit: Math.round(hallado.tot.ingresos * 100) / 100 });
    }
  }

  let h = '<div class="card">' +
    campoSelect('facTipo', 'Tipo', tipoOpts, tipo) +
    '<div id="facLetraWrap" style="' + (tipo === 'factura' ? '' : 'display:none') + '">' +
    campoSelect('facLetra', 'Letra', letraOpts, letraActual) + '</div>' +
    campoSelect('facCliente', 'Cliente', cliOpts, (f && f.clienteId) || params.clienteId || '', { req: true }) +
    campo('date', 'facFecha', 'Fecha', (f && f.fecha) || hoyISO()) +
    campoSelect('facIvaModo', 'Precios', [{ value: '1', texto: 'Con IVA incluido' }, { value: '0', texto: 'Más IVA (se suma arriba)' }], (f && f.ivaIncluido === false) ? '0' : '1') +
    '</div>';

  h += '<div class="seccion-titulo"><h3>Ítems</h3></div><div id="facItems">';
  if (f) {
    h += '<p class="hint">Para cambiar ítems, eliminá y creá de nuevo el documento.</p>';
  } else {
    h += itemsInicial.map(facItemRowHTML).join('') || facItemRowHTML();
  }
  h += '</div>';
  if (!f) {
    h += '<p class="hint">Elegí si los precios ya traen el IVA adentro o si se suma arriba; el neto se discrimina solo.</p>' +
      '<button class="btn" id="facAddItem">＋ Agregar ítem</button>' +
      '<button class="btn" id="facDesdeTrabajo">🔧 ＋ Desde trabajo</button>';
  }

  h += '<div class="card"><div class="field"><label for="facObs">Observaciones</label>' +
    '<div class="con-micro"><textarea id="facObs" placeholder="Dictá o escribí…">' +
    esc(f ? f.observaciones : '') + '</textarea>' + microBtnHTML('facObs') + '</div></div></div>' +
    '<div class="card">' +
    '<div class="dato"><span class="k">Neto</span><span class="v" id="facNeto">' + esc(formatoPeso(0)) + '</span></div>' +
    '<div class="dato"><span class="k">IVA</span><span class="v" id="facIva">' + esc(formatoPeso(0)) + '</span></div>' +
    '<div class="dato"><span class="k"><b>Total</b></span>' +
    '<span class="v"><b id="facTotal">' + esc(formatoPeso(f ? f.total : 0)) + '</b></span></div></div>' +
    '<button class="btn btn-ambar" id="facGuardar">💾 Guardar</button>' +
    '<button class="btn btn-ghost" onclick="goBack()">Cancelar</button>';
  return h;
}

function facLeerItems() {
  const items = [];
  document.querySelectorAll('#facItems .item-dinamico').forEach(row => {
    const descripcion = (row.querySelector('[data-f-desc]') || {}).value || '';
    const cantidad = parseFloat(((row.querySelector('[data-f-cant]') || {}).value || '').replace(',', '.')) || 0;
    const precioUnit = parseFloat(((row.querySelector('[data-f-precio]') || {}).value || '').replace(',', '.')) || 0;
    const ivaSel = row.querySelector('[data-f-iva]');
    const iva = ivaSel ? parseFloat(ivaSel.value) : 21;
    const trabajoId = row.dataset.trabajoId || null;
    items.push({ descripcion: descripcion.trim(), cantidad, precioUnit, iva, trabajoId });
  });
  return items;
}

function facModoIVA() {
  const sel = document.getElementById('facIvaModo');
  return !sel || sel.value !== '0';
}

function facRecalcularTotal() {
  const tot = totalesConIVA(facLeerItems(), 21, facModoIVA());
  const elT = document.getElementById('facTotal');
  const elN = document.getElementById('facNeto');
  const elI = document.getElementById('facIva');
  if (elT) elT.textContent = formatoPeso(tot.total);
  if (elN) elN.textContent = formatoPeso(tot.neto);
  if (elI) elI.textContent = formatoPeso(tot.iva);
  return tot;
}

function facAgregarFila(it) {
  const cont = document.getElementById('facItems');
  if (!cont) return;
  const div = document.createElement('div');
  div.innerHTML = facItemRowHTML(it);
  const row = div.firstChild;
  if (it && it.trabajoId) row.dataset.trabajoId = it.trabajoId;
  cont.appendChild(row);
  facBindFila(row);
  facRecalcularTotal();
}

function facBindFila(row) {
  const desc = row.querySelector('[data-f-desc]');
  if (desc && !desc.id) desc.id = 'fdesc' + (++_fdescSeq);
  const mic = row.querySelector('[data-dictado-para]');
  if (mic && desc) mic.dataset.dictadoPara = desc.id;
  bindDictadoEn(row);
  row.querySelectorAll('input, select').forEach(inp => { inp.oninput = facRecalcularTotal; inp.onchange = facRecalcularTotal; });
  const q = row.querySelector('[data-f-quitar]');
  if (q) q.onclick = () => { row.remove(); facRecalcularTotal(); };
}

function facFormBind(params) {
  bindDictadoEn(document.getElementById('view'));
  const tipoSel = document.getElementById('facTipo');
  const letraWrap = document.getElementById('facLetraWrap');
  if (tipoSel && letraWrap) {
    tipoSel.onchange = () => { letraWrap.style.display = tipoSel.value === 'factura' ? '' : 'none'; };
  }
  const modoSel = document.getElementById('facIvaModo');
  if (modoSel) modoSel.onchange = facRecalcularTotal;
  const cont = document.getElementById('facItems');
  if (cont) {
    cont.querySelectorAll('.item-dinamico').forEach(facBindFila);
    cont.addEventListener('input', facRecalcularTotal);
    facRecalcularTotal();
  }
  const add = document.getElementById('facAddItem');
  if (add) add.onclick = () => facAgregarFila();

  const desde = document.getElementById('facDesdeTrabajo');
  if (desde) desde.onclick = async () => {
    const clienteId = val('facCliente');
    if (!clienteId) { snack('Elegí primero el cliente.'); return; }
    const conTot = await trabajosConTotales();
    const lista = conTot.filter(x =>
      x.t.clienteId === clienteId && (x.t.estado === 'terminado' || x.t.estado === 'facturado'));
    if (!lista.length) { snack('No hay trabajos terminados de este cliente.'); return; }
    const [clientes] = [await getCliente(clienteId)];
    abrirModal('<h2>Elegir trabajo</h2>' +
      '<p class="modal-sub">' + esc(clientes ? clientes.nombre : '') + '</p>' +
      lista.map(x => '<button class="fila" data-elegir-trabajo="' + esc(x.t.id) + '">' +
        '<div class="avatar">🔧</div><div class="cuerpo">' +
        '<div class="titulo">' + esc(x.t.descripcion || 'Trabajo') + '</div>' +
        '<div class="bajada">' + esc(fechaLegible(x.t.fecha)) + '</div></div>' +
        '<div class="lateral"><b>' + esc(formatoPeso(x.tot.ingresos)) + '</b></div></button>').join('') +
      '<button class="btn btn-ghost" onclick="cerrarModal()">Cancelar</button>');
    document.querySelectorAll('[data-elegir-trabajo]').forEach(b => {
      b.onclick = () => {
        const x = lista.find(y => y.t.id === b.dataset.elegirTrabajo);
        cerrarModal();
        if (x) {
          facAgregarFila({
            trabajoId: x.t.id,
            descripcion: x.t.descripcion || 'Trabajo',
            cantidad: 1,
            precioUnit: Math.round(x.tot.ingresos * 100) / 100
          });
          snack('Ítem agregado desde el trabajo.');
        }
      };
    });
  };

  const g = document.getElementById('facGuardar');
  if (!g) return;
  g.onclick = async () => {
    const clienteId = val('facCliente');
    if (!clienteId) { snack('Elegí el cliente.'); return; }
    const datos = {
      tipo: val('facTipo') || 'factura',
      letra: (val('facTipo') || 'factura') === 'factura' ? (val('facLetra') || 'B') : null,
      clienteId: clienteId,
      fecha: val('facFecha') || hoyISO(),
      observaciones: val('facObs'),
      ivaIncluido: facModoIVA()
    };
    if (params.id) {
      const f = await getFactura(params.id);
      if (!f) return;
      f.tipo = datos.tipo; f.clienteId = datos.clienteId;
      f.letra = datos.letra;
      f.fecha = datos.fecha; f.observaciones = datos.observaciones;
      f.ivaIncluido = datos.ivaIncluido;
      // Al editar se recalculan neto/IVA/total con el modo elegido
      const itemsGuardados = await getItemsDeFactura(f.id);
      const totEdit = totalesConIVA(itemsGuardados, 21, f.ivaIncluido);
      f.subtotal = totEdit.total; f.neto = totEdit.neto;
      f.ivaMonto = totEdit.iva; f.total = totEdit.total;
      await actualizarFactura(f);
      snack('Documento guardado.');
      go(_tabDoc, { vista: 'detalle', id: f.id }, true);
      return;
    }
    const items = facLeerItems().filter(it => it.descripcion && it.precioUnit > 0 && it.cantidad > 0);
    if (!items.length) { snack('Agregá al menos un ítem con descripción y precio.'); return; }
    const tot = totalesConIVA(items, 21, datos.ivaIncluido);
    datos.estado = 'pendiente';
    datos.subtotal = tot.total;
    datos.neto = tot.neto;
    datos.ivaMonto = tot.iva;
    datos.total = tot.total;
    const f = await crearFactura(datos, items);
    snack(nombreTipoDoc(f.tipo) + (f.letra ? ' ' + f.letra : '') + ' Nº ' + f.numero + ' creado.');
    go(_tabDoc, { vista: 'detalle', id: f.id });
  };
}
