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
    if (vista === 'form')    await facFormBind(params);
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
  if (nuevo) nuevo.onclick = () => {
    if (tipo === 'recibo') { snack('Registrá el cobro desde su factura: se genera un recibo automáticamente.'); return; }
    go(_tabDoc, { vista: 'form', tipo });
  };
}

/* ---------- DETALLE ---------- */
async function facDetalleHTML(id) {
  const f = await getFactura(id);
  if (!f) return '<div class="vacio"><span class="emoji">🧾</span>Documento no encontrado.</div>';
  const items = await getItemsDeFactura(id);
  const cli = f.clienteId ? await getCliente(f.clienteId) : null;
  const tipoDoc = nombreTipoDoc(f.tipo) + ((f.tipo === 'factura' && f.letra) ? ' ' + f.letra : '');
  const sinIVA = f.condicionEmisor ? f.condicionEmisor !== 'responsable_inscripto' : f.letra === 'C';
  const flujo = f.flujo || {};
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
    (sinIVA ? 'Importes finales, sin IVA discriminado' : (f.ivaIncluido === false ? 'Más IVA (se suma arriba)' : 'Con IVA incluido')) + '</span></div>' +
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
        (sinIVA ? '' : '<br><span class="hint">IVA ' + esc(ivaTxt) + '</span>') + '</td>' +
        '<td class="num">' + esc(formatoPeso(pu)) + '</td>' +
        '<td class="num"><b>' + esc(formatoPeso(cant * pu)) + '</b></td></tr>';
    }
    h += '<tr><td colspan="2">Neto</td><td class="num">' + esc(formatoPeso(tot.neto)) + '</td></tr>' +
      (sinIVA ? '' : '<tr><td colspan="2">IVA</td><td class="num">' + esc(formatoPeso(tot.iva)) + '</td></tr>') +
      '<tr class="total"><td colspan="2">Total</td><td class="num">' + esc(formatoPeso(tot.total)) + '</td></tr>' +
      '</tbody></table>';
  }
  h += '</div>';

  if (f.tipo === 'presupuesto' && (flujo.validez || flujo.condiciones || flujo.aceptadoPor)) {
    h += '<div class="card"><div class="sec-titulo">Condiciones del presupuesto</div>' +
      (flujo.validez ? '<div class="dato"><span class="k">Válido hasta</span><span class="v">' + esc(fechaLegible(flujo.validez)) + '</span></div>' : '') +
      (flujo.condiciones ? '<p class="pre">' + esc(flujo.condiciones) + '</p>' : '') +
      (flujo.aceptadoPor ? '<p class="hint">Aceptado por ' + esc(flujo.aceptadoPor) + ' · ' + esc(fechaLegible(flujo.fechaAceptacion)) + '</p>' : '') + '</div>';
  }

  // Órdenes de trabajo vinculadas (solo presupuestos): se crean al aceptar,
  // y se pueden agregar más, modificar o quitar libremente.
  if (f.tipo === 'presupuesto') {
    const trabajos = await getTrabajosDePresupuesto(id);
    h += '<div class="card"><div class="sec-titulo"><h3>🔧 Órdenes de trabajo</h3></div>';
    if (!trabajos.length) {
      if (f.estado === 'aceptado') {
        h += '<p class="hint">Este presupuesto está aceptado pero todavía no tiene orden de trabajo.</p>' +
          '<button class="btn btn-primary" data-crear-orden>🔧 Crear orden de trabajo</button>';
      } else {
        h += '<div class="vacio">Sin órdenes todavía. Al aceptar el presupuesto se crea una sola.</div>';
      }
    } else {
      for (const t of trabajos) {
        h += '<div class="dato"><span class="k">' + esc(fechaLegible(t.fecha) || '—') + '</span><span class="v">' +
          '<button style="background:none;border:0;padding:0;color:var(--v700);font:inherit;font-weight:700;cursor:pointer;text-decoration:underline" data-ir-trabajo="' + esc(t.id) + '">' +
          esc(t.descripcion || 'Orden de trabajo') + '</button> · ' + esc(ESTADOS_TRABAJO[t.estado] || t.estado || '') + '</span></div>';
      }
    }
    h += '<button class="btn" data-nuevo-trabajo>＋ Nueva orden de trabajo</button></div>';
  }

  if (f.tipo === 'factura') {
    h += '<div class="card"><div class="sec-titulo">Cobranza</div>' +
      '<p class="hint">Liquidación interna. La factura fiscal se emite en el sistema autorizado de ARCA.</p>' +
      '<div class="dato"><span class="k">Saldo pendiente</span><span class="v">' + esc(formatoPeso(saldoDocumento(f))) + '</span></div>' +
      (f.cobros || []).map(c => '<div class="dato"><span class="k">' + esc(fechaLegible(c.fecha) + ' · ' + c.medio + (c.referencia ? ' · ' + c.referencia : '')) + '</span><span class="v">' + esc(formatoPeso(c.monto)) + '</span></div>').join('') +
      (saldoDocumento(f) > 0 ? '<button class="btn btn-primary" data-registrar-cobro>Registrar cobro</button>' : '') + '</div>';
    h += '<div class="card"><div class="sec-titulo">Factura fiscal externa</div>' +
      (flujo.fiscal ? '<p>Comprobante ' + esc(String(flujo.fiscal.puntoVenta).padStart(5, '0') + '-' + String(flujo.fiscal.numero).padStart(8, '0')) +
        ' · CAE ' + esc(flujo.fiscal.cae) + '</p><p class="hint">Referencia registrada manualmente; no se verificó contra ARCA desde esta app.</p>' :
        '<p class="hint">Después de emitir en ARCA o con tu sistema de facturación, registrá la referencia acá.</p><button class="btn" data-vincular-fiscal>Registrar factura emitida</button>') + '</div>';
  }
  h += (f.tipo === 'presupuesto' && f.estado === 'aceptado' ? '' : '<button class="btn btn-ambar" data-cambiar-estado>🔄 Cambiar estado</button>') +
    '<button class="btn btn-verde" data-compartir-pdf>📤 Enviar PDF (WhatsApp / Email)</button>' +
    '<button class="btn" data-descargar-pdf>📥 Descargar PDF (para imprimir)</button>' +
    ((f.tipo === 'presupuesto' && f.estado === 'aceptado') || (f.cobros || []).length || flujo.fiscal || flujo.facturaOrigen ? '' : '<button class="btn" data-editar-fac>✏️ Editar</button>');
  if (f.tipo === 'presupuesto' && f.estado === 'aceptado') {
    h += '<button class="btn" data-pasar-factura>🔧 Continuar con el trabajo</button>';
  }
  h += '<button class="btn btn-ghost" data-eliminar-fac>🗑️ Eliminar</button>';
  return h;
}

function facDetalleBind(id) {
  const fiscal = document.querySelector('[data-vincular-fiscal]');
  if (fiscal) fiscal.onclick = async () => {
    const empresa = await getEmpresa();
    abrirModal('<h2>Registrar factura emitida</h2><p class="hint">Copiá los datos del comprobante ya autorizado. Esta app registra la referencia; no solicita un CAE.</p>' +
      campo('number', 'fiscalPV', 'Punto de venta', empresa.puntoVenta || 1) +
      campo('number', 'fiscalNumero', 'Número fiscal', '') + campo('text', 'fiscalCAE', 'CAE (14 dígitos)', '', { inputmode: 'numeric' }) +
      campo('date', 'fiscalFecha', 'Fecha de emisión', hoyISO()) +
      '<button class="btn btn-primary" id="fiscalGuardar">Guardar referencia</button><button class="btn btn-ghost" onclick="cerrarModal()">Cancelar</button>');
    const guardar = document.getElementById('fiscalGuardar');
    guardar.onclick = async () => {
      const puntoVenta = Number(val('fiscalPV')), numero = Number(val('fiscalNumero')), cae = val('fiscalCAE').trim();
      if (!Number.isInteger(puntoVenta) || puntoVenta < 1 || puntoVenta > 99999 || !Number.isInteger(numero) || numero < 1 || numero > 99999999 || !/^\d{14}$/.test(cae) || !val('fiscalFecha')) {
        snack('Revisá punto de venta, número, CAE y fecha del comprobante.'); return;
      }
      if (guardar.disabled) return;
      guardar.disabled = true;
      try {
        const f = await getFactura(id);
        f.flujo = Object.assign({}, f.flujo, { fiscal: { puntoVenta, numero, cae, fecha: val('fiscalFecha') } });
        await actualizarFactura(f); cerrarModal(); snack('Referencia fiscal registrada.'); go(_tabDoc, { vista: 'detalle', id }, true);
      } catch (e) { snack(e.message); } finally { guardar.disabled = false; }
    };
  };
  const cobro = document.querySelector('[data-registrar-cobro]');
  if (cobro) cobro.onclick = async () => {
    const f = await getFactura(id);
    abrirModal('<h2>Registrar cobro</h2>' + campo('date', 'cobFecha', 'Fecha', hoyISO()) +
      campo('number', 'cobMonto', 'Importe recibido', saldoDocumento(f), { inputmode: 'decimal' }) +
      campoSelect('cobMedio', 'Medio de pago', [{ value: 'efectivo', texto: 'Efectivo' }, { value: 'transferencia', texto: 'Transferencia' }, { value: 'cheque', texto: 'Cheque' }], 'transferencia') +
      campo('text', 'cobRef', 'Referencia / comprobante', '') +
      '<button class="btn btn-primary" id="cobGuardar">Guardar cobro</button><button class="btn btn-ghost" onclick="cerrarModal()">Cancelar</button>');
    const guardar = document.getElementById('cobGuardar');
    guardar.onclick = async () => {
      if (guardar.disabled) return;
      guardar.disabled = true;
      try {
        await registrarCobro(id, { fecha: val('cobFecha'), monto: valNum('cobMonto'), medio: val('cobMedio'), referencia: val('cobRef') });
        cerrarModal(); snack('Cobro registrado.'); go(_tabDoc, { vista: 'detalle', id }, true);
      } catch (e) { snack(e.message); } finally { guardar.disabled = false; }
    };
  };
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
      : (f.tipo === 'factura' ? ['anulada'] : ['pendiente', 'pagada', 'anulada']);
    abrirModal('<h2>Cambiar estado</h2>' +
      '<p class="modal-sub">' + esc(nombreTipoDoc(f.tipo)) + ' Nº ' + esc(f.numero) + ' — estado actual: ' + esc(ESTADOS_FACTURA[f.estado] || f.estado) + '</p>' +
      (f.tipo === 'presupuesto' ? campo('text', 'presAceptadoPor', 'Aceptado por / referencia (opcional)', '') : '') +
      opciones.map(e =>
        '<button class="btn" data-estado="' + e + '">' + esc(ESTADOS_FACTURA[e] || e) + '</button>').join('') +
      '<button class="btn btn-ghost" onclick="cerrarModal()">Cancelar</button>');
    document.querySelectorAll('[data-estado]').forEach(b => {
      b.onclick = async () => {
        if ((f.cobros || []).length || (f.flujo && (f.flujo.fiscal || f.flujo.facturaOrigen))) { snack('El documento tiene cobros o una factura fiscal registrada y debe conservarse.'); return; }
        f.estado = b.dataset.estado;
        if (f.tipo === 'presupuesto' && f.estado === 'aceptado') {
          f.flujo = Object.assign({}, f.flujo, { aceptadoPor: val('presAceptadoPor') || 'Cliente', fechaAceptacion: hoyISO() });
        }
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
  const co = document.querySelector('[data-crear-orden]');
  if (co) co.onclick = async () => {
    const t = await crearTrabajoDesdePresupuesto(id);
    if (t) {
      snack('Orden de trabajo creada en la pestaña Trabajos.');
      go(_tabDoc, { vista: 'detalle', id: id }, true);
    } else {
      snack('No se pudo crear la orden.');
    }
  };

  const ed = document.querySelector('[data-editar-fac]');
  if (ed) ed.onclick = () => go(_tabDoc, { vista: 'form', id: id });

  const cp = document.querySelector('[data-compartir-pdf]');
  if (cp) cp.onclick = () => compartirDocumentoPDF(id);

  const dp = document.querySelector('[data-descargar-pdf]');
  if (dp) dp.onclick = () => descargarDocumentoPDF(id);

  const pf = document.querySelector('[data-pasar-factura]');
  if (pf) pf.onclick = async () => {
    const f = await getFactura(id);
    if (!f || f.estado !== 'aceptado') { snack('Aceptá el presupuesto antes de continuar.'); return; }
    const trabajos = await getTrabajosDePresupuesto(id);
    const t = trabajos[0] || await crearTrabajoDesdePresupuesto(id);
    if (!t) { snack('No se pudo recuperar el trabajo.'); return; }
    // La factura se revisa desde el trabajo, con la misma vinculación y controles.
    go('trabajos', { vista: 'detalle', id: t.id });
  };

  const del = document.querySelector('[data-eliminar-fac]');
  if (del) del.onclick = async () => {
    const f = await getFactura(id);
    if (!f) return;
    const esPres = f.tipo === 'presupuesto';
    const nOrd = esPres ? (await getTrabajosDePresupuesto(id)).length : 0;
    const ok = await confirmar('Eliminar ' + nombreTipoDoc(f.tipo).toLowerCase(),
      '¿Eliminar el ' + nombreTipoDoc(f.tipo).toLowerCase() + ' Nº ' + f.numero + '? Se borran también sus ítems.' +
      (nOrd ? ' Las ' + nOrd + ' órdenes de trabajo vinculadas se conservan como trabajos independientes.' : ''),
      'Eliminar');
    if (!ok) return;
    if (esPres && f.estado === 'aceptado') { snack('Conservá el presupuesto aceptado como acuerdo del trabajo.'); return; }
    try {
      if (esPres) await eliminarPresupuesto(id);
      else await eliminarFactura(id);
    } catch (e) { snack(e.message); return; }
    snack('Documento eliminado.');
    go(_tabDoc, { vista: 'lista', tipo: f.tipo || 'factura' }, true);
  };
}

/* ---------- FORM ---------- */
let _fdescSeq = 0;
let _facCondicionEmisor = 'monotributista';
const TIPOS_CONCEPTO = { material: 'Repuesto / material', servicio: 'Servicio / mano de obra', traslado: 'Traslado', viatico: 'Viático / otro cargo' };
function facIvaOptionsHTML(sel) {
  return ALICUOTAS_IVA.map(a => '<option value="' + a + '"' +
    (String(sel) === String(a) ? ' selected' : '') + '>' +
    (a ? 'IVA ' + String(a).replace('.', ',') + '%' : 'Exento') + '</option>').join('');
}

function facItemRowHTML(it) {
  it = it || {};
  const ivaSel = (it.iva !== null && it.iva !== undefined && it.iva !== '') ? it.iva : 21;
  return '<div class="item-dinamico"' + (it.trabajoId ? ' data-trabajo-id="' + esc(it.trabajoId) + '"' : '') + '><div class="grid">' +
    '<div class="con-micro"><input type="text" data-f-desc placeholder="Descripción" value="' + esc(it.descripcion || '') + '" />' +
    microBtnHTML('fdesc_nuevo') + '</div>' +
    '<input type="number" data-f-cant placeholder="Cant." value="' + esc(it.cantidad !== undefined ? it.cantidad : 1) + '" inputmode="decimal" />' +
    '<button type="button" class="mini-btn" data-f-quitar aria-label="Quitar ítem">✕</button>' +
    '</div><div style="margin-top:8px;display:flex;gap:8px">' +
    '<input type="number" data-f-precio placeholder="Precio unitario ($)" value="' + esc(it.precioUnit !== undefined ? it.precioUnit : '') + '" inputmode="decimal" style="flex:1" />' +
    '<select data-f-iva style="width:118px"' + (_facCondicionEmisor !== 'responsable_inscripto' ? ' hidden' : '') + '>' + facIvaOptionsHTML(ivaSel) + '</select>' +
    '</div><div class="field"><label>Concepto</label><select data-f-concepto>' +
    Object.keys(TIPOS_CONCEPTO).map(k => '<option value="' + k + '"' + (k === (it.tipoConcepto || 'material') ? ' selected' : '') + '>' + TIPOS_CONCEPTO[k] + '</option>').join('') + '</select>' +
    '</div></div>';
}

async function desglosarTrabajoParaFactura(trabajoId) {
  const t = await getTrabajo(trabajoId);
  if (!t) return { clienteId: null, items: [] };
  // El trabajo contiene el detalle final; nunca volver a sumar el presupuesto.
  const materiales = await getItemsDeTrabajo(trabajoId);
  const items = materiales.map(it => ({ trabajoId: t.id, descripcion: it.descripcion,
    cantidad: Number(it.cantidad) || 0, precioUnit: Number(it.precioUnit) || 0,
    iva: it.iva == null ? 21 : it.iva, tipoConcepto: it.tipoConcepto || 'material' }));
  const tot = totalesTrabajo(t, materiales, t.vehiculoId ? await getVehiculo(t.vehiculoId) : null);
  if (tot.manoObra > 0) items.push({ trabajoId: t.id, descripcion: 'Mano de obra (' + t.horas + ' h)',
    cantidad: 1, precioUnit: tot.manoObra, iva: 21, tipoConcepto: 'servicio' });
  if (tot.viaje > 0) items.push({ trabajoId: t.id, descripcion: 'Traslado (' + t.km + ' km totales)',
    cantidad: 1, precioUnit: tot.viaje, iva: 21, tipoConcepto: 'traslado' });
  if (tot.manual > 0) items.push({ trabajoId: t.id, descripcion: 'Importe adicional / global',
    cantidad: 1, precioUnit: tot.manual, iva: 21, tipoConcepto: 'servicio' });
  return { clienteId: t.clienteId, ivaIncluido: t.ivaIncluido !== false, items };
}

function adaptarPreciosDocumento(items, origenIncluido, destinoIncluido) {
  if (origenIncluido === destinoIncluido) return items;
  return items.map(it => {
    const factor = 1 + (Number(it.iva) || 0) / 100;
    const precio = origenIncluido ? Number(it.precioUnit) / factor : Number(it.precioUnit) * factor;
    return Object.assign({}, it, { precioUnit: Math.round(precio * 10000) / 10000 });
  });
}

async function facFormHTML(params) {
  const f = params.id ? await getFactura(params.id) : null;
  const clientes = await getClientes();
  const empresa = await getEmpresa();
  _facCondicionEmisor = (f && f.condicionEmisor) || ((f && f.letra === 'C') ? 'monotributista' : empresa.condicionFiscal) || 'monotributista';
  const tipo = (f && f.tipo) || params.tipo || 'factura';

  let trabajoCargado = null;
  let desgloseTrabajo = null;
  if (!f && params.trabajoId) {
    trabajoCargado = await getTrabajo(params.trabajoId);
    desgloseTrabajo = await desglosarTrabajoParaFactura(params.trabajoId);
  }

  const clienteIdSeleccionado = (f && f.clienteId) || params.clienteId || (desgloseTrabajo && desgloseTrabajo.clienteId) || '';
  const clienteObjeto = clienteIdSeleccionado ? await getCliente(clienteIdSeleccionado) : null;

  const tiposPermitidos = f ? [f.tipo] : (_tabDoc === 'presupuestos' ? ['presupuesto'] : ['factura']);
  const tipoOpts = tiposPermitidos.map(t => ({ value: t, texto: nombreTipoDoc(t) }));
  const cliOpts = [{ value: '', texto: '— Elegir cliente —' }]
    .concat(clientes.map(c => ({ value: c.id, texto: c.nombre })));

  const letraActual = determinarLetraFactura(_facCondicionEmisor, clienteObjeto ? clienteObjeto.condicionFiscal : null);
  const letraOpts = [{ value: letraActual, texto: 'Documento ' + letraActual + ' (según condición fiscal)' }];

  // Ítems iniciales
  let itemsInicial = [];
  if (!f && desgloseTrabajo && desgloseTrabajo.items.length) {
    itemsInicial = desgloseTrabajo.items;
    if (_facCondicionEmisor !== 'responsable_inscripto') itemsInicial = adaptarPreciosDocumento(itemsInicial, desgloseTrabajo.ivaIncluido, true);
  }
  const itemsEdit = f ? await getItemsDeFactura(f.id) : [];
  const ordenesVinculadas = (f && f.tipo === 'presupuesto') ? await getTrabajosDePresupuesto(f.id) : [];

  let h = (tipo === 'factura' ? '<div class="card"><b>Revisar liquidación</b><p class="hint">Comprobá los conceptos finales antes de guardar. Este documento interno no reemplaza la factura fiscal autorizada.</p></div>' : '') + '<div class="card">' +
    campoSelect('facTipo', 'Tipo', tipoOpts, tipo) +
    '<div id="facLetraWrap" style="' + (tipo === 'factura' ? '' : 'display:none') + '">' +
    campoSelect('facLetra', 'Letra', letraOpts, letraActual) + '</div>' +
    campoSelect('facCliente', 'Cliente', cliOpts, clienteIdSeleccionado, { req: true }) +
    campo('date', 'facFecha', 'Fecha', (f && f.fecha) || hoyISO()) +
    '<div id="facInstalacionWrap"></div>' +
    '<div' + (_facCondicionEmisor !== 'responsable_inscripto' ? ' hidden' : '') + '>' +
    campoSelect('facIvaModo', 'Precios', [{ value: '1', texto: 'Con IVA incluido' }, { value: '0', texto: 'Más IVA (se suma arriba)' }], ((f && f.ivaIncluido === false) || (!f && desgloseTrabajo && !desgloseTrabajo.ivaIncluido)) ? '0' : '1') + '</div>' +
    '</div>';

  h += '<div class="seccion-titulo"><h3>Ítems</h3></div><div id="facItems">';
  if (f) {
    if (f.tipo === 'presupuesto' && f.estado === 'aceptado' && ordenesVinculadas.length) {
      h += '<p class="hint">⚠️ Este presupuesto ya generó ' + ordenesVinculadas.length +
        ' orden' + (ordenesVinculadas.length > 1 ? 'es' : '') +
        ' de trabajo. Los cambios en ítems no modifican las órdenes existentes.</p>';
    }
    h += itemsEdit.map(facItemRowHTML).join('') || facItemRowHTML();
  } else {
    h += itemsInicial.map(facItemRowHTML).join('') || facItemRowHTML();
  }
  h += '</div>';
  if (tipo === 'presupuesto') {
    h += '<div class="card">' + campo('date', 'presValidez', 'Válido hasta', f && f.flujo && f.flujo.validez || '') +
      campoTexto('presCondiciones', 'Alcance, exclusiones y forma de pago', f && f.flujo && f.flujo.condiciones || '') +
      '<div class="field"><label for="presServicio">Servicio habitual</label><select id="presServicio">' +
      ['Cambio de cueros de cilindro', 'Extracción y reparación de cilindro', 'Reparación de varillaje', 'Mantenimiento de molino', 'Reparación de bebedero', 'Cambio de flotante', 'Instalación de cañería'].map(x => '<option>' + esc(x) + '</option>').join('') +
      '</select></div><button class="btn" id="presAgregarServicio">＋ Agregar servicio habitual</button></div>';
  }
  h += '<p class="hint">' + (_facCondicionEmisor === 'responsable_inscripto' ? 'Elegí precios finales o más IVA.' : 'Importes finales, sin IVA discriminado.') + '</p>' +
    '<button class="btn" id="facAddItem">＋ Agregar ítem</button>' +
    '<button class="btn" id="facDesdeTrabajo">🔧 ＋ Desde trabajo</button>';

  h += '<div class="card"><div class="field"><label for="facObs">Observaciones</label>' +
    '<div class="con-micro"><textarea id="facObs" placeholder="Dictá o escribí…">' +
    esc(f ? f.observaciones : '') + '</textarea>' + microBtnHTML('facObs') + '</div></div></div>' +
    '<div class="card">' +
    '<div class="dato"><span class="k">Neto</span><span class="v" id="facNeto">' + esc(formatoPeso(0)) + '</span></div>' +
    '<div class="dato"' + (_facCondicionEmisor !== 'responsable_inscripto' ? ' hidden' : '') + '><span class="k">IVA</span><span class="v" id="facIva">' + esc(formatoPeso(0)) + '</span></div>' +
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
    const iva = _facCondicionEmisor === 'responsable_inscripto' ? (ivaSel ? parseFloat(ivaSel.value) : 21) : 0;
    const tipoConcepto = row.querySelector('[data-f-concepto]').value;
    const trabajoId = row.dataset.trabajoId || null;
    items.push({ descripcion: descripcion.trim(), cantidad, precioUnit, iva, trabajoId, tipoConcepto });
  });
  return items;
}

function facModoIVA() {
  if (_facCondicionEmisor !== 'responsable_inscripto') return true;
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

async function facFormBind(params) {
  const servicio = document.getElementById('presAgregarServicio');
  if (servicio) servicio.onclick = () => facAgregarFila({ descripcion: val('presServicio'), cantidad: 1, tipoConcepto: 'servicio' });
  bindDictadoEn(document.getElementById('view'));
  const tipoSel = document.getElementById('facTipo');
  const letraWrap = document.getElementById('facLetraWrap');
  if (tipoSel && letraWrap) {
    tipoSel.onchange = () => { letraWrap.style.display = tipoSel.value === 'factura' ? '' : 'none'; };
  }

  const documentoActual = params.id ? await getFactura(params.id) : null;
  const pintarInstalaciones = async (clienteId, seleccion) => {
    const instalaciones = clienteId ? await getInstalacionesDeCliente(clienteId) : [];
    const wrap = document.getElementById('facInstalacionWrap');
    if (wrap) wrap.innerHTML = campoSelect('facInstalacion', 'Instalación / aguada',
      [{ value: '', texto: 'Sin instalación específica' }].concat(instalaciones.map(i => ({ value: i.id, texto: i.nombre }))), seleccion || '');
  };
  const trabajoOrigen = params.trabajoId ? await getTrabajo(params.trabajoId) : null;
  await pintarInstalaciones(val('facCliente'), (documentoActual && documentoActual.instalacionId) || (trabajoOrigen && trabajoOrigen.instalacionId) || params.instalacionId);
  // Cambio de cliente -> actualiza automáticamente la letra A, B o C.
  const cliSel = document.getElementById('facCliente');
  if (cliSel) {
    cliSel.onchange = async () => {
      const cliId = cliSel.value;
      const cli = cliId ? await getCliente(cliId) : null;
      await pintarInstalaciones(cliId, '');
      const letraRecomendada = determinarLetraFactura(_facCondicionEmisor, cli ? cli.condicionFiscal : null);
      const selLetra = document.getElementById('facLetra');
      if (selLetra) selLetra.innerHTML = '<option value="' + letraRecomendada + '">Documento ' + letraRecomendada + ' (según condición fiscal)</option>';
    };
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
    const ocupados = trabajosFacturados(await getFacturas(), await dbLocal.factura_items.toArray(), params.id);
    const enFormulario = new Set(facLeerItems().map(it => it.trabajoId));
    const lista = conTot.filter(x =>
      x.t.clienteId === clienteId && ['terminado', 'facturado', 'cobrado'].includes(x.t.estado) && !ocupados.has(x.t.id) && !enFormulario.has(x.t.id));
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
      b.onclick = async () => {
        const x = lista.find(y => y.t.id === b.dataset.elegirTrabajo);
        cerrarModal();
        if (x) {
          const desglose = await desglosarTrabajoParaFactura(x.t.id);
          if (desglose.items && desglose.items.length) {
            for (const it of adaptarPreciosDocumento(desglose.items, desglose.ivaIncluido, facModoIVA())) {
              facAgregarFila(it);
            }
          } else {
            facAgregarFila({
              trabajoId: x.t.id,
              descripcion: x.t.descripcion || 'Trabajo',
              cantidad: 1,
              precioUnit: Math.round(x.tot.ingresos * 100) / 100,
              iva: 21
            });
          }
          snack('Ítems del trabajo agregados a la factura.');
        }
      };
    });
  };

  const g = document.getElementById('facGuardar');
  if (!g) return;
  g.onclick = async () => {
    if (g.disabled) return;
    const clienteId = val('facCliente');
    if (!clienteId) { snack('Elegí el cliente.'); return; }
    const datos = {
      tipo: val('facTipo') || 'factura',
      letra: (val('facTipo') || 'factura') === 'factura' ? (val('facLetra') || 'B') : null,
      clienteId: clienteId,
      instalacionId: val('facInstalacion') || null,
      condicionEmisor: _facCondicionEmisor,
      flujo: { validez: val('presValidez'), condiciones: val('presCondiciones') },
      fecha: val('facFecha') || hoyISO(),
      observaciones: val('facObs'),
      ivaIncluido: facModoIVA()
    };
    if (params.id) {
      const f = await getFactura(params.id);
      if (!f) return;
      if ((f.cobros || []).length || (f.flujo && (f.flujo.fiscal || f.flujo.facturaOrigen))) { snack('La factura tiene cobros o una referencia fiscal: conservá sus importes.'); return; }
      if (f.tipo === 'presupuesto' && f.estado === 'aceptado') { snack('El presupuesto aceptado se conserva como acuerdo original.'); return; }
      f.tipo = datos.tipo; f.clienteId = datos.clienteId;
      f.instalacionId = datos.instalacionId; f.condicionEmisor = datos.condicionEmisor;
      f.flujo = Object.assign({}, f.flujo, datos.flujo);
      f.letra = datos.letra;
      f.fecha = datos.fecha; f.observaciones = datos.observaciones;
      f.ivaIncluido = datos.ivaIncluido;
      // Al editar, los ítems se reemplazan por los del formulario y se
      // recalculan neto/IVA/total con el modo elegido
      const itemsNuevos = facLeerItems().filter(it => it.descripcion && it.precioUnit > 0 && it.cantidad > 0);
      if (!itemsNuevos.length) { snack('Agregá al menos un concepto con cantidad y precio positivos.'); return; }
      g.disabled = true;
      try { await guardarDocumentoConItems(f, itemsNuevos); }
      catch (e) { snack(e.message); return; }
      finally { g.disabled = false; }
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
    g.disabled = true;
    let f;
    try { f = await crearFactura(datos, items); }
    catch (e) { snack(e.message); return; }
    finally { g.disabled = false; }
    snack(nombreTipoDoc(f.tipo) + (f.letra ? ' ' + f.letra : '') + ' Nº ' + f.numero + ' creado.');
    go(_tabDoc, { vista: 'detalle', id: f.id });
  };
}
