/* ============================================================
   MolineroApp v2 - Pantalla Facturación
   (presupuestos, facturas y recibos)
   Vistas: lista | detalle | form
   ============================================================ */

Pantallas.facturacion = {
  titulo: 'Facturación',

  async render(params) {
    const vista = params.vista || 'lista';
    if (vista === 'detalle') return await facDetalleHTML(params.id);
    if (vista === 'form')    return await facFormHTML(params);
    return await facListaHTML(params.tipo || 'factura');
  },

  async bind(params) {
    const vista = params.vista || 'lista';
    if (vista === 'lista')   facListaBind(params.tipo || 'factura');
    if (vista === 'detalle') facDetalleBind(params.id);
    if (vista === 'form')    facFormBind(params);
  }
};

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
async function facListaHTML(tipo) {
  const [facturas, clientes] = await Promise.all([getFacturas(), getClientes()]);
  const nombreCli = {};
  for (const c of clientes) nombreCli[c.id] = c.nombre;
  const chips = [
    { v: 'presupuesto', t: 'Presupuestos' },
    { v: 'factura', t: 'Facturas' },
    { v: 'recibo', t: 'Recibos' }
  ];
  let h = '<div class="chips">' +
    chips.map(c => '<button class="fchip' + (tipo === c.v ? ' activo' : '') +
      '" data-tipo="' + c.v + '">' + c.t + '</button>').join('') + '</div><div id="facRows">';
  const lista = facturas.filter(f => (f.tipo || 'factura') === tipo);
  if (!lista.length) {
    h += '<div class="vacio"><span class="emoji">🧾</span>No hay ' + esc(nombreTipoDoc(tipo).toLowerCase()) + 's todavía.</div>';
  }
  for (const f of lista) {
    h += '<button class="fila" data-ver-fac="' + esc(f.id) + '">' +
      '<div class="avatar">🧾</div><div class="cuerpo">' +
      '<div class="titulo">Nº ' + esc(f.numero || '—') + '</div>' +
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
    b.onclick = () => go('facturacion', { vista: 'lista', tipo: b.dataset.tipo }, true);
  });
  document.querySelectorAll('[data-ver-fac]').forEach(b => {
    b.onclick = () => go('facturacion', { vista: 'detalle', id: b.dataset.verFac });
  });
  const nuevo = document.getElementById('facNuevo');
  if (nuevo) nuevo.onclick = () => go('facturacion', { vista: 'form', tipo: tipo });
}

/* ---------- DETALLE ---------- */
async function facDetalleHTML(id) {
  const f = await getFactura(id);
  if (!f) return '<div class="vacio"><span class="emoji">🧾</span>Documento no encontrado.</div>';
  const items = await getItemsDeFactura(id);
  const cli = f.clienteId ? await getCliente(f.clienteId) : null;
  const tipoDoc = nombreTipoDoc(f.tipo);

  let h = '<div class="card"><div class="sec-titulo"><h3>🧾 ' + esc(tipoDoc) + ' Nº ' + esc(f.numero || '—') + '</h3></div>' +
    '<div class="dato"><span class="k">Estado</span><span class="v">' + chipEstado(f.estado) + '</span></div>' +
    '<div class="dato"><span class="k">Cliente</span><span class="v">' +
    (cli && Pantallas.clientes
      ? '<button style="background:none;border:0;padding:0;color:var(--v700);font:inherit;font-weight:700;cursor:pointer;text-decoration:underline" data-ir-cliente="' + esc(cli.id) + '">' + esc(cli.nombre) + '</button>'
      : esc(cli ? cli.nombre : 'Sin cliente')) + '</span></div>' +
    '<div class="dato"><span class="k">Fecha</span><span class="v">' + esc(fechaLegible(f.fecha) || '—') + '</span></div>' +
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
      h += '<tr><td>' + esc(fmtCant(cant)) + ' × ' + esc(it.descripcion || 'Ítem') + '</td>' +
        '<td class="num">' + esc(formatoPeso(pu)) + '</td>' +
        '<td class="num"><b>' + esc(formatoPeso(cant * pu)) + '</b></td></tr>';
    }
    h += '<tr class="total"><td colspan="2">Total</td><td class="num">' + esc(formatoPeso(f.total)) + '</td></tr>' +
      '</tbody></table>';
  }
  h += '</div>';

  h += '<button class="btn btn-ambar" data-cambiar-estado>🔄 Cambiar estado</button>' +
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
    abrirModal('<h2>Cambiar estado</h2>' +
      '<p class="modal-sub">' + esc(nombreTipoDoc(f.tipo)) + ' Nº ' + esc(f.numero) + ' — estado actual: ' + esc(f.estado) + '</p>' +
      ['pendiente', 'pagada', 'anulada'].map(e =>
        '<button class="btn" data-estado="' + e + '">' + esc(ESTADOS_FACTURA[e] || e) + '</button>').join('') +
      '<button class="btn btn-ghost" onclick="cerrarModal()">Cancelar</button>');
    document.querySelectorAll('[data-estado]').forEach(b => {
      b.onclick = async () => {
        f.estado = b.dataset.estado;
        await actualizarFactura(f);
        cerrarModal();
        snack('Estado: ' + (ESTADOS_FACTURA[f.estado] || f.estado) + '.');
        go('facturacion', { vista: 'detalle', id: id }, true);
      };
    });
  };

  const ed = document.querySelector('[data-editar-fac]');
  if (ed) ed.onclick = () => go('facturacion', { vista: 'form', id: id });

  const pf = document.querySelector('[data-pasar-factura]');
  if (pf) pf.onclick = async () => {
    const f = await getFactura(id);
    if (!f) return;
    const items = await getItemsDeFactura(id);
    const total = items.reduce((s, it) => s + (parseFloat(it.cantidad) || 0) * (parseFloat(it.precioUnit) || 0), 0);
    const nueva = await crearFactura({
      clienteId: f.clienteId, tipo: 'factura', fecha: hoyISO(),
      estado: 'pendiente', subtotal: total, total: total,
      observaciones: f.observaciones || ''
    }, items.map(it => ({
      trabajoId: it.trabajoId, descripcion: it.descripcion,
      cantidad: it.cantidad, precioUnit: it.precioUnit
    })));
    snack('Factura Nº ' + nueva.numero + ' creada.');
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
    go('facturacion', { vista: 'lista', tipo: f.tipo || 'factura' }, true);
  };
}

/* ---------- FORM ---------- */
function facItemRowHTML(it) {
  it = it || {};
  return '<div class="item-dinamico"><div class="grid">' +
    '<input type="text" data-f-desc placeholder="Descripción" value="' + esc(it.descripcion || '') + '" />' +
    '<input type="number" data-f-cant placeholder="Cant." value="' + esc(it.cantidad !== undefined ? it.cantidad : 1) + '" inputmode="decimal" />' +
    '<button type="button" class="mini-btn" data-f-quitar aria-label="Quitar ítem">✕</button>' +
    '</div><div style="margin-top:8px">' +
    '<input type="number" data-f-precio placeholder="Precio unitario ($)" value="' + esc(it.precioUnit !== undefined ? it.precioUnit : '') + '" inputmode="decimal" style="width:100%" />' +
    '</div></div>';
}

async function facFormHTML(params) {
  const f = params.id ? await getFactura(params.id) : null;
  const clientes = await getClientes();
  const tipo = (f && f.tipo) || params.tipo || 'factura';
  const tipoOpts = ['presupuesto', 'factura', 'recibo'].map(t => ({ value: t, texto: nombreTipoDoc(t) }));
  const cliOpts = [{ value: '', texto: '— Elegir cliente —' }]
    .concat(clientes.map(c => ({ value: c.id, texto: c.nombre })));

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
    campoSelect('facCliente', 'Cliente', cliOpts, (f && f.clienteId) || params.clienteId || '', { req: true }) +
    campo('date', 'facFecha', 'Fecha', (f && f.fecha) || hoyISO()) +
    '</div>';

  h += '<div class="seccion-titulo"><h3>Ítems</h3></div><div id="facItems">';
  if (f) {
    h += '<p class="hint">Para cambiar ítems, eliminá y creá de nuevo el documento.</p>';
  } else {
    h += itemsInicial.map(facItemRowHTML).join('') || facItemRowHTML();
  }
  h += '</div>';
  if (!f) {
    h += '<button class="btn" id="facAddItem">＋ Agregar ítem</button>' +
      '<button class="btn" id="facDesdeTrabajo">🔧 ＋ Desde trabajo</button>';
  }

  h += '<div class="card">' + campoTexto('facObs', 'Observaciones', f ? f.observaciones : '') + '</div>' +
    '<div class="card"><div class="dato"><span class="k"><b>Total</b></span>' +
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
    const trabajoId = row.dataset.trabajoId || null;
    items.push({ descripcion: descripcion.trim(), cantidad, precioUnit, trabajoId });
  });
  return items;
}

function facRecalcularTotal() {
  const total = facLeerItems().reduce((s, it) => s + it.cantidad * it.precioUnit, 0);
  const el = document.getElementById('facTotal');
  if (el) el.textContent = formatoPeso(Math.round(total * 100) / 100);
  return total;
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
  row.querySelectorAll('input').forEach(inp => { inp.oninput = facRecalcularTotal; });
  const q = row.querySelector('[data-f-quitar]');
  if (q) q.onclick = () => { row.remove(); facRecalcularTotal(); };
}

function facFormBind(params) {
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
      clienteId: clienteId,
      fecha: val('facFecha') || hoyISO(),
      observaciones: val('facObs')
    };
    if (params.id) {
      const f = await getFactura(params.id);
      if (!f) return;
      f.tipo = datos.tipo; f.clienteId = datos.clienteId;
      f.fecha = datos.fecha; f.observaciones = datos.observaciones;
      await actualizarFactura(f);
      snack('Documento guardado.');
      go('facturacion', { vista: 'detalle', id: f.id }, true);
      return;
    }
    const items = facLeerItems().filter(it => it.descripcion && it.precioUnit > 0 && it.cantidad > 0);
    if (!items.length) { snack('Agregá al menos un ítem con descripción y precio.'); return; }
    const total = Math.round(items.reduce((s, it) => s + it.cantidad * it.precioUnit, 0) * 100) / 100;
    datos.estado = 'pendiente';
    datos.subtotal = total;
    datos.total = total;
    const f = await crearFactura(datos, items);
    snack(nombreTipoDoc(f.tipo) + ' Nº ' + f.numero + ' creado.');
    go('facturacion', { vista: 'detalle', id: f.id });
  };
}
