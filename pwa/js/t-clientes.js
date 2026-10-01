/* ============================================================
   MolineroApp v2 - Pantallas de Clientes e Instalaciones
   - lista: buscador + clientes con instalaciones y deuda
   - detalle: datos, instalaciones, historial y cuenta corriente
   - clienteForm: alta / edición de cliente
   - instalacion: ficha técnica, mapa, historial de trabajos y repuestos
   - instalacionForm: alta / edición con mapa picker y GPS de foto
   ============================================================ */

const CARACTERISTICAS_POR_TIPO = {
  molino:   [['tamanoCilindro', 'Tamaño cilindro'], ['diametroSuccion', 'Ø succión'],
             ['diametroImpulsion', 'Ø impulsión'], ['profundidadPozo', 'Profundidad pozo (m)'],
             ['alturaTorre', 'Altura torre (m)']],
  tanque:   [['capacidad', 'Capacidad (litros)'], ['diametro', 'Diámetro'], ['material', 'Material']],
  bebedero: [['capacidad', 'Capacidad (litros)'], ['material', 'Material']],
  bomba:    [['potencia', 'Potencia'], ['tipoBomba', 'Tipo']],
  caneria:  [['diametro', 'Diámetro'], ['largo', 'Largo (m)'], ['material', 'Material']],
  otro:     [['detalle', 'Detalle']]
};

const ETIQUETAS_CAR = (function () {
  const m = {};
  Object.keys(CARACTERISTICAS_POR_TIPO).forEach(t => {
    CARACTERISTICAS_POR_TIPO[t].forEach(p => { m[p[0]] = p[1]; });
  });
  m.tipoAnterior = 'Tipo anterior';
  return m;
})();

function facturaEsPendiente(f) {
  return (f.tipo === 'factura' || f.tipo === 'recibo') &&
         (f.estado === 'pendiente' || f.estado === 'vencida');
}

// Cuenta corriente de un cliente: facturas pendientes + trabajos
// terminados sin facturar (excluye los ya incluidos en una factura).
async function cuentaDeCliente(clienteId) {
  const [facturas, conTot, fis] = await Promise.all([
    getFacturasDeCliente(clienteId),
    trabajosConTotales(),
    dbLocal.factura_items.toArray()
  ]);
  const facturadoTrab = {};
  for (const it of fis) if (it.trabajoId) facturadoTrab[it.trabajoId] = true;
  const facPend = facturas.filter(facturaEsPendiente);
  const trabSinFac = conTot.filter(x =>
    x.t.clienteId === clienteId && x.t.estado === 'terminado' &&
    !facturadoTrab[x.t.id] && x.tot.ingresos > 0);
  const total = facPend.reduce((s, f) => s + (parseFloat(f.total) || 0), 0) +
                trabSinFac.reduce((s, x) => s + x.tot.ingresos, 0);
  return { facPend, trabSinFac, total };
}

// ---- Datos para la lista de clientes ----
async function datosListaClientes() {
  const [clientes, facturas, conTot, instalaciones, fis] = await Promise.all([
    getClientes(), getFacturas(), trabajosConTotales(),
    getInstalaciones(), dbLocal.factura_items.toArray()
  ]);
  const facturadoTrab = {};
  for (const it of fis) if (it.trabajoId) facturadoTrab[it.trabajoId] = true;
  return clientes.map(c => {
    const nIns = instalaciones.filter(i => i.clienteId === c.id).length;
    let debe = 0;
    for (const f of facturas) {
      if (f.clienteId === c.id && facturaEsPendiente(f)) debe += parseFloat(f.total) || 0;
    }
    for (const x of conTot) {
      if (x.t.clienteId === c.id && x.t.estado === 'terminado' &&
          !facturadoTrab[x.t.id] && x.tot.ingresos > 0) debe += x.tot.ingresos;
    }
    return { c, nIns, debe };
  });
}

function filasClientesHTML(filas) {
  if (!filas.length) {
    return '<div class="vacio"><span class="emoji">👥</span>No hay clientes cargados todavía.</div>';
  }
  return filas.map(({ c, nIns, debe }) => {
    const bajada = [c.campo, c.localidad].filter(Boolean).join(' · ') || '—';
    const q = normalizarTexto(c.nombre + ' ' + (c.campo || '') + ' ' + (c.localidad || ''));
    return '<button class="fila" data-ver-cliente="' + esc(c.id) + '" data-q="' + esc(q) + '">' +
      '<div class="avatar">' + esc(iniciales(c.nombre)) + '</div>' +
      '<div class="cuerpo"><div class="titulo">' + esc(c.nombre) + '</div>' +
      '<div class="bajada">' + esc(bajada) + '</div></div>' +
      '<div class="lateral"><div class="monto">' + nIns + '</div>' +
      '<div class="bajada">' + (nIns === 1 ? 'instalación' : 'instalaciones') + '</div>' +
      (debe > 0 ? '<div style="margin-top:6px"><span class="chip pendiente">Debe ' + esc(formatoPeso(debe)) + '</span></div>' : '') +
      '</div></button>';
  }).join('');
}

/* ============ VISTA: lista ============ */
async function renderListaClientes() {
  const filas = await datosListaClientes();
  return '<input class="buscador" id="cli-buscar" type="search" placeholder="Buscar por nombre, campo o localidad…" />' +
    '<button class="btn btn-primary" id="cli-nuevo">＋ Nuevo cliente</button>' +
    '<div id="cli-lista">' + filasClientesHTML(filas) + '</div>' +
    '<div class="vacio" id="cli-sinresult" hidden><span class="emoji">🔍</span>No se encontró ningún cliente con esa búsqueda.</div>';
}

function bindListaClientes() {
  document.getElementById('cli-nuevo').onclick = () => go('clientes', { vista: 'clienteForm' });
  document.querySelectorAll('[data-ver-cliente]').forEach(b => {
    b.onclick = () => go('clientes', { vista: 'detalle', id: b.dataset.verCliente });
  });
  const input = document.getElementById('cli-buscar');
  input.oninput = () => {
    const q = normalizarTexto(input.value);
    let visibles = 0;
    document.querySelectorAll('#cli-lista .fila').forEach(f => {
      const ok = !q || f.dataset.q.indexOf(q) !== -1;
      f.style.display = ok ? '' : 'none';
      if (ok) visibles++;
    });
    document.getElementById('cli-sinresult').hidden = visibles !== 0;
  };
}

/* ============ VISTA: detalle de cliente ============ */
function filaInstalacionHTML(i) {
  return '<button class="fila" data-ver-instalacion="' + esc(i.id) + '">' +
    '<div class="avatar">' + esc(iconoTipo(i.tipo)) + '</div>' +
    '<div class="cuerpo"><div class="titulo">' + esc(i.nombre || 'Sin nombre') + '</div>' +
    '<div class="bajada">' + esc(nombreTipo(i.tipo)) + '</div></div>' +
    '<div class="lateral">' + chipInstalacion(i.estado) + '</div></button>';
}

function filaTrabajoHTML(t) {
  return '<button class="fila" data-ver-trabajo="' + esc(t.id) + '">' +
    '<div class="cuerpo"><div class="titulo">' + esc(t.descripcion || 'Trabajo') + '</div>' +
    '<div class="bajada">' + esc(fechaLegible(t.fecha)) + '</div></div>' +
    '<div class="lateral">' + chipEstado(t.estado) + '</div></button>';
}

async function renderClienteDetalle(id) {
  const c = await getCliente(id);
  if (!c) {
    return '<div class="vacio"><span class="emoji">👥</span>No se encontró el cliente.</div>';
  }
  const [inss, trabajos, cuenta, ests] = await Promise.all([
    getInstalacionesDeCliente(id),
    getTrabajosDeCliente(id),
    cuentaDeCliente(id),
    getEstablecimientosDeCliente(id)
  ]);
  inss.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  ests.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

  let h = '<div class="card"><h2>' + esc(c.nombre) + '</h2>';
  h += '<div class="dato"><span class="k">Campo</span><span class="v">' + esc(c.campo || '—') + '</span></div>';
  h += '<div class="dato"><span class="k">Localidad</span><span class="v">' + esc(c.localidad || '—') + '</span></div>';
  if (c.telefono) {
    const tel = String(c.telefono).replace(/[^+\d]/g, '');
    h += '<div class="dato"><span class="k">Teléfono</span><span class="v"><a href="tel:' + esc(tel) + '">' + esc(c.telefono) + '</a></span></div>';
  }
  if (c.cuit) h += '<div class="dato"><span class="k">CUIT / DNI</span><span class="v">' + esc(c.cuit) + '</span></div>';
  if (c.condicionFiscal) h += '<div class="dato"><span class="k">Cond. fiscal</span><span class="v">' + esc(nombreCondicionFiscal(c.condicionFiscal)) + '</span></div>';
  if (c.email) h += '<div class="dato"><span class="k">Email</span><span class="v">' + esc(c.email) + '</span></div>';
  if (c.observaciones) h += '<div class="dato"><span class="k">Observaciones</span><span class="v pre">' + esc(c.observaciones) + '</span></div>';
  h += '</div>';

  // Establecimientos (cada uno con su contacto) y sus instalaciones
  h += '<div class="seccion-titulo"><h3>Establecimientos (' + ests.length + ')</h3></div>';
  for (const e of ests) {
    const inssEst = inss.filter(i => i.establecimientoId === e.id);
    h += '<div class="card"><div class="sec-titulo">🏡 ' + esc(e.nombre) + '</div>';
    if (e.contacto) h += '<div class="dato"><span class="k">Contacto</span><span class="v">' + esc(e.contacto) + '</span></div>';
    if (e.telefono) {
      const tel = String(e.telefono).replace(/[^+\d]/g, '');
      h += '<div class="dato"><span class="k">Teléfono</span><span class="v"><a href="tel:' + esc(tel) + '">' + esc(e.telefono) + '</a></span></div>';
    }
    if (e.localidad) h += '<div class="dato"><span class="k">Localidad</span><span class="v">' + esc(e.localidad) + '</span></div>';
    h += '<div class="btn-row"><button class="btn btn-secondary chico" data-editar-est="' + esc(e.id) + '">✏️ Editar</button></div>';
    h += '</div>';
    if (inssEst.length) h += inssEst.map(filaInstalacionHTML).join('');
  }
  const sinEst = inss.filter(i => !i.establecimientoId);
  if (sinEst.length) {
    h += '<div class="seccion-titulo"><h3>Sin establecimiento (' + sinEst.length + ')</h3></div>';
    h += sinEst.map(filaInstalacionHTML).join('');
  }
  if (!inss.length) {
    h += '<div class="vacio"><span class="emoji">🌀</span>Todavía no hay instalaciones cargadas.</div>';
  }
  h += '<div class="btn-row"><button class="btn btn-secondary" id="cli-nuevo-est">＋ Nuevo establecimiento</button>' +
       '<button class="btn btn-secondary" id="cli-nueva-ins">＋ Nueva instalación</button></div>';

  // Historial de trabajos
  h += '<div class="seccion-titulo"><h3>Historial de trabajos</h3></div>';
  const ultimos = trabajos.slice(0, 5);
  if (!ultimos.length) {
    h += '<div class="vacio"><span class="emoji">🔧</span>Sin trabajos registrados.</div>';
  } else {
    h += ultimos.map(filaTrabajoHTML).join('');
  }

  // Cuenta corriente
  h += '<div class="card"><div class="sec-titulo">💰 Cuenta corriente</div>';
  if (!cuenta.facPend.length && !cuenta.trabSinFac.length) {
    h += '<div class="sub">Al día: no hay saldos pendientes.</div>';
  } else {
    for (const f of cuenta.facPend) {
      const tipo = f.tipo === 'recibo' ? 'Recibo' : 'Factura';
      h += '<div class="dato"><span class="k">' + esc(tipo) + ' Nº ' + esc(f.numero) + '</span>' +
        '<span class="v">' + esc(formatoPeso(f.total)) + '</span></div>';
    }
    for (const x of cuenta.trabSinFac) {
      h += '<div class="dato"><span class="k">Trabajo ' + esc(fechaLegible(x.t.fecha)) + '</span>' +
        '<span class="v">' + esc(formatoPeso(x.tot.ingresos)) + '</span></div>';
    }
    h += '<div class="dato"><span class="k">Total por cobrar</span>' +
      '<span class="v">' + esc(formatoPeso(cuenta.total)) + '</span></div>';
  }
  h += '</div>';

  h += '<button class="btn btn-primary" id="cli-nuevo-trabajo">＋ Nuevo trabajo</button>';
  h += '<div class="btn-row"><button class="btn btn-secondary" id="cli-editar">✏️ Editar cliente</button>' +
    '<button class="btn btn-outline-danger" id="cli-eliminar">🗑️ Eliminar</button></div>';
  return h;
}

function bindClienteDetalle(id) {
  document.querySelectorAll('[data-ver-instalacion]').forEach(b => {
    b.onclick = () => go('clientes', { vista: 'instalacion', id: b.dataset.verInstalacion });
  });
  document.querySelectorAll('[data-ver-trabajo]').forEach(b => {
    b.onclick = () => go('trabajos', { vista: 'detalle', id: b.dataset.verTrabajo });
  });
  document.getElementById('cli-nuevo-est').onclick = () =>
    go('clientes', { vista: 'establecimientoForm', clienteId: id });
  document.getElementById('cli-nueva-ins').onclick = () =>
    go('clientes', { vista: 'instalacionForm', clienteId: id });
  document.querySelectorAll('[data-editar-est]').forEach(b => {
    b.onclick = () => go('clientes', { vista: 'establecimientoForm', id: b.dataset.editarEst });
  });
  document.getElementById('cli-nuevo-trabajo').onclick = () =>
    go('trabajos', { vista: 'form', clienteId: id });
  document.getElementById('cli-editar').onclick = () =>
    go('clientes', { vista: 'clienteForm', id: id });
  document.getElementById('cli-eliminar').onclick = async () => {
    const ok = await confirmar('Eliminar cliente',
      'Se borran el cliente y todas sus instalaciones, trabajos, facturas y gastos. Esta acción no se puede deshacer.',
      'Sí, eliminar');
    if (!ok) return;
    await eliminarCliente(id);
    snack('Cliente eliminado.');
    go('clientes', { vista: 'lista' }, true);
  };
}

/* ============ VISTA: formulario de cliente ============ */
async function renderClienteForm(id) {
  const c = id ? await getCliente(id) : null;
  const titulo = c ? 'Editar cliente' : 'Nuevo cliente';
  let h = '<div class="card"><div class="sec-titulo">' + esc(titulo) + '</div><div class="form">';
  h += campo('text', 'clif-nombre', 'Nombre', c ? c.nombre : '', { req: true });
  h += campo('text', 'clif-campo', 'Campo / establecimiento', c ? c.campo : '', {});
  h += campo('text', 'clif-localidad', 'Localidad', c ? c.localidad : '', {});
  h += campo('tel', 'clif-tel', 'Teléfono', c ? c.telefono : '', {});
  h += campo('text', 'clif-cuit', 'CUIT / DNI', c ? c.cuit : '', {});
  h += campoSelect('clif-cond', 'Condición fiscal', Object.keys(CONDICIONES_FISCALES).map(k => ({ value: k, texto: CONDICIONES_FISCALES[k] })), c ? c.condicionFiscal : '');
  h += campo('email', 'clif-email', 'Email', c ? c.email : '', {});
  h += campoTexto('clif-obs', 'Observaciones', c ? c.observaciones : '', {});
  h += '</div></div>';
  h += '<button class="btn btn-primary" id="clif-guardar">💾 Guardar</button>';
  if (c) h += '<button class="btn btn-outline-danger" id="clif-eliminar">🗑️ Eliminar cliente</button>';
  return h;
}

function bindClienteForm(id) {
  document.getElementById('clif-guardar').onclick = async () => {
    const nombre = val('clif-nombre');
    if (!nombre) { snack('Poné el nombre del cliente.'); return; }
    const datos = {
      nombre: nombre,
      campo: val('clif-campo'), localidad: val('clif-localidad'),
      telefono: val('clif-tel'), cuit: val('clif-cuit'),
      condicionFiscal: val('clif-cond') || null,
      email: val('clif-email'), observaciones: val('clif-obs')
    };
    let nuevoId = id;
    if (id) {
      datos.id = id;
      const anterior = await getCliente(id);
      datos.createdAt = anterior ? anterior.createdAt : Date.now();
      await actualizarCliente(datos);
    } else {
      const creado = await crearCliente(datos);
      nuevoId = creado.id;
    }
    snack('Cliente guardado.');
    go('clientes', { vista: 'detalle', id: nuevoId });
  };
  const btnDel = document.getElementById('clif-eliminar');
  if (btnDel) {
    btnDel.onclick = async () => {
      const ok = await confirmar('Eliminar cliente',
        'Se borran el cliente y todas sus instalaciones, trabajos, facturas y gastos. Esta acción no se puede deshacer.',
        'Sí, eliminar');
      if (!ok) return;
      await eliminarCliente(id);
      snack('Cliente eliminado.');
      go('clientes', { vista: 'lista' }, true);
    };
  }
}

/* ============ VISTA: detalle de instalación ============ */
async function renderInstalacion(id) {
  const i = await getInstalacion(id);
  if (!i) {
    return '<div class="vacio"><span class="emoji">🌀</span>No se encontró la instalación.</div>';
  }
  const [cliente, trabajos, mapaItems] = await Promise.all([
    i.clienteId ? getCliente(i.clienteId) : null,
    getTrabajosDeInstalacion(id),
    itemsPorTrabajo()
  ]);
  const establecimiento = i.establecimientoId ? await getEstablecimiento(i.establecimientoId) : null;

  // Cabecera
  let h = '<div class="card"><div style="display:flex;gap:14px;align-items:center">' +
    '<div style="font-size:2.8rem;flex:0 0 auto">' + esc(iconoTipo(i.tipo)) + '</div>' +
    '<div style="flex:1;min-width:0"><h2>' + esc(i.nombre || 'Sin nombre') + '</h2>' +
    '<div style="margin-top:6px">' + chipInstalacion(i.estado) + '</div></div></div>';
  if (cliente) {
    h += '<div style="margin-top:12px"><button class="btn btn-secondary chico" data-ver-cliente="' + esc(cliente.id) + '">' +
      '👤 ' + esc(cliente.nombre) + '</button>';
    if (establecimiento) {
      h += ' <span class="chip">🏡 ' + esc(establecimiento.nombre) + '</span>';
    }
    h += '</div>';
  }
  h += '</div>';

  // Primera foto
  const fotos = (i.fotos || []).map(fotoSegura).filter(Boolean);
  if (fotos.length) {
    h += '<img class="photo-view" id="insFoto" src="' + fotos[0] + '" data-src="' + fotos[0] +
      '" alt="Foto de ' + esc(i.nombre || 'la instalación') + '" />';
  }

  // Datos técnicos
  h += '<div class="card"><div class="sec-titulo">🔩 Datos técnicos</div>';
  const car = i.caracteristicas || {};
  const claves = Object.keys(car).filter(k => car[k] !== '' && car[k] !== null && car[k] !== undefined);
  if (i.marca) h += '<div class="dato"><span class="k">Marca</span><span class="v">' + esc(i.marca) + '</span></div>';
  if (i.modelo) h += '<div class="dato"><span class="k">Modelo</span><span class="v">' + esc(i.modelo) + '</span></div>';
  for (const k of claves) {
    h += '<div class="dato"><span class="k">' + esc(ETIQUETAS_CAR[k] || k) + '</span>' +
      '<span class="v">' + esc(car[k]) + '</span></div>';
  }
  if (!i.marca && !i.modelo && !claves.length) h += '<div class="sub">—</div>';
  if (i.observaciones) {
    h += '<div class="dato"><span class="k">Observaciones</span><span class="v pre">' + esc(i.observaciones) + '</span></div>';
  }
  h += '</div>';

  // Ubicación
  h += '<div class="card"><div class="sec-titulo">📍 Ubicación</div>';
  if (i.lat !== null && i.lat !== undefined && i.lng !== null && i.lng !== undefined &&
      isFinite(i.lat) && isFinite(i.lng)) {
    h += '<div class="mapa-box" data-mapa data-lat="' + i.lat + '" data-lng="' + i.lng +
      '" data-titulo="' + esc(i.nombre || '') + '"></div>' +
      '<div class="ubic-row"><a class="btn btn-secondary" href="' + mapsUrl(i.lat, i.lng) +
      '" target="_blank" rel="noopener">🗺️ Cómo llegar</a></div>';
  } else {
    h += '<div class="sub">Sin ubicación cargada.</div>';
  }
  h += '</div>';

  // Historial de trabajos y repuestos
  h += '<div class="seccion-titulo"><h3>Historial de trabajos y repuestos</h3></div>';
  if (!trabajos.length) {
    h += '<div class="vacio"><span class="emoji">🔧</span>Sin trabajos registrados en esta instalación.</div>';
  } else {
    for (const t of trabajos) {
      h += filaTrabajoHTML(t);
      const items = mapaItems[t.id] || [];
      if (items.length) {
        h += '<div style="padding:8px 14px 12px;color:var(--muted);font-size:.92rem">' +
          items.map(it => {
            const cant = it.cantidad;
            const cs = cant == Math.round(cant) ? String(Math.round(cant)) : String(cant);
            return '• ' + esc(cs) + ' × ' + esc(it.descripcion || 'Repuesto');
          }).join('<br>') + '</div>';
      }
    }
  }

  h += '<button class="btn btn-primary" id="ins-nuevo-trabajo">＋ Nuevo trabajo aquí</button>';
  h += '<div class="btn-row"><button class="btn btn-secondary" id="ins-editar">✏️ Editar</button>' +
    '<button class="btn btn-outline-danger" id="ins-eliminar">🗑️ Eliminar</button></div>';
  return h;
}

function bindInstalacion(id) {
  document.querySelectorAll('[data-ver-cliente]').forEach(b => {
    b.onclick = () => go('clientes', { vista: 'detalle', id: b.dataset.verCliente });
  });
  document.querySelectorAll('[data-ver-trabajo]').forEach(b => {
    b.onclick = () => go('trabajos', { vista: 'detalle', id: b.dataset.verTrabajo });
  });
  const img = document.getElementById('insFoto');
  if (img && img.dataset.src) img.onclick = () => abrirFoto(img.dataset.src);
  document.getElementById('ins-nuevo-trabajo').onclick = async () => {
    const i = await getInstalacion(id);
    go('trabajos', { vista: 'form', clienteId: i ? i.clienteId : null, instalacionId: id });
  };
  document.getElementById('ins-editar').onclick = () =>
    go('clientes', { vista: 'instalacionForm', id: id });
  document.getElementById('ins-eliminar').onclick = async () => {
    const i = await getInstalacion(id);
    const ok = await confirmar('Eliminar instalación',
      'Se borran la instalación y sus trabajos asociados. Esta acción no se puede deshacer.',
      'Sí, eliminar');
    if (!ok) return;
    const clienteId = i ? i.clienteId : null;
    await eliminarInstalacion(id);
    snack('Instalación eliminada.');
    if (clienteId) go('clientes', { vista: 'detalle', id: clienteId }, true);
    else go('clientes', { vista: 'lista' }, true);
  };
}

/* ============ VISTA: formulario de instalación ============ */
function carHTML(tipo, valores) {
  valores = valores || {};
  const lista = CARACTERISTICAS_POR_TIPO[tipo] || CARACTERISTICAS_POR_TIPO.otro;
  return lista.map(p => campo('text', 'car_' + p[0], p[1], valores[p[0]] || '')).join('');
}

function leerCar() {
  const o = {};
  document.querySelectorAll('#insForm-car input').forEach(el => {
    const v = el.value.trim();
    if (v) o[el.id.replace(/^car_/, '')] = v;
  });
  return o;
}

function setUbicacionForm(lat, lng) {
  document.getElementById('insForm-lat').value = lat;
  document.getElementById('insForm-lng').value = lng;
  document.getElementById('insForm-coords').textContent = lat + ', ' + lng;
  const m = document.getElementById('insForm-mapa');
  if (m) { m.setAttribute('data-lat', lat); m.setAttribute('data-lng', lng); }
  if (typeof Mapa !== 'undefined' && Mapa.hidratar) Mapa.hidratar();
}

async function renderInstalacionForm(id, clienteIdParam) {
  const i = id ? await getInstalacion(id) : null;
  const clientes = await getClientes();
  const tipo = (i && i.tipo) || 'molino';
  const clienteSel = (i && i.clienteId) || clienteIdParam || '';
  const estado = (i && i.estado) || 'Operativo';
  const ests = clienteSel ? await getEstablecimientosDeCliente(clienteSel) : [];
  const estSel = (i && i.establecimientoId) || '';

  let h = '<div class="card"><div class="sec-titulo">' + (i ? 'Editar instalación' : 'Nueva instalación') + '</div>';
  h += '<div class="form">';
  h += campoSelect('insForm-tipo', 'Tipo de instalación',
    Object.keys(TIPOS_INSTALACION).map(k => ({ value: k, texto: TIPOS_INSTALACION[k] })),
    tipo, { req: true });
  h += campoSelect('insForm-cliente', 'Cliente',
    [{ value: '', texto: 'Elegir…' }].concat(clientes.map(c => ({ value: c.id, texto: c.nombre }))),
    clienteSel, { req: true });
  h += campoSelect('insForm-establecimiento', 'Establecimiento',
    [{ value: '', texto: 'Sin establecimiento' }].concat(ests.map(e => ({ value: e.id, texto: e.nombre }))),
    estSel, { hint: 'Opcional: a qué campo pertenece' });
  h += campo('text', 'insForm-nombre', 'Nombre', i ? i.nombre : '', { req: true, hint: 'Ej: Molino Norte #4' });
  h += campo('text', 'insForm-marca', 'Marca', i ? i.marca : '', {});
  h += campo('text', 'insForm-modelo', 'Modelo', i ? i.modelo : '', {});
  h += campoSelect('insForm-estado', 'Estado',
    Object.keys(ESTADOS_INSTALACION).map(k => ({ value: k, texto: k })),
    estado, {});
  h += '<div id="insForm-car">' + carHTML(tipo, i ? i.caracteristicas : {}) + '</div>';
  h += '</div></div>';

  // Ubicación
  const lat = i && i.lat !== null && i.lat !== undefined ? i.lat : '';
  const lng = i && i.lng !== null && i.lng !== undefined ? i.lng : '';
  h += '<div class="card"><div class="sec-titulo">📍 Ubicación</div>';
  h += '<input type="hidden" id="insForm-lat" value="' + esc(lat) + '" />';
  h += '<input type="hidden" id="insForm-lng" value="' + esc(lng) + '" />';
  h += '<div class="dato"><span class="k">Coordenadas</span><span class="v" id="insForm-coords">' +
    esc(lat !== '' && lng !== '' ? lat + ', ' + lng : 'Sin ubicación') + '</span></div>';
  h += '<div class="mapa-box" id="insForm-mapa" data-mapa data-mapa-picker="insForm"' +
    (lat !== '' && lng !== '' ? ' data-lat="' + esc(lat) + '" data-lng="' + esc(lng) + '"' : '') +
    ' data-titulo="' + esc(i && i.nombre ? i.nombre : 'Instalación') + '"></div>';
  h += '<div class="ubic-row">' +
    '<button class="btn btn-secondary chico" id="insForm-gps">📍 Mi ubicación</button>' +
    '<button class="btn btn-secondary chico" id="insForm-tocar">🗺️ Elegir en el mapa</button>' +
    '<button class="btn btn-secondary chico" id="insForm-foto">📷 De la foto</button></div>';
  h += '</div>';

  // Fotos
  h += '<div class="card"><div class="sec-titulo">📷 Fotos</div>' +
    photoPickerHTML('insForm', i ? i.fotos : [], true) + '</div>';

  h += '<button class="btn btn-primary" id="insForm-guardar">💾 Guardar</button>';
  if (i) h += '<button class="btn btn-outline-danger" id="insForm-eliminar">🗑️ Eliminar instalación</button>';
  return h;
}

function bindInstalacionForm(id) {
  bindPhotoPicker('insForm', true);

  document.getElementById('insForm-tipo').onchange = e => {
    const vals = leerCar();
    document.getElementById('insForm-car').innerHTML = carHTML(e.target.value, vals);
  };

  document.getElementById('insForm-cliente').onchange = async e => {
    const ests = e.target.value ? await getEstablecimientosDeCliente(e.target.value) : [];
    document.getElementById('insForm-establecimiento').innerHTML =
      '<option value="">Sin establecimiento</option>' +
      ests.map(x => '<option value="' + esc(x.id) + '">' + esc(x.nombre) + '</option>').join('');
  };

  document.getElementById('insForm-gps').onclick = async () => {
    snack('Buscando ubicación…');
    const gps = await obtenerGPS();
    if (gps) { setUbicacionForm(gps.lat, gps.lng); snack('Ubicación actualizada.'); }
    else snack('No se pudo obtener la ubicación.');
  };
  document.getElementById('insForm-tocar').onclick = () => snack('Tocá el punto en el mapa.');
  document.getElementById('insForm-foto').onclick = () => snack('Agregá una foto con ubicación y se toma sola.');

  window.onMapaPick_insForm = ({ lat, lng }) => {
    setUbicacionForm(lat, lng);
    snack('Ubicación marcada en el mapa.');
  };
  window.onExifGPS_insForm = gps => {
    if (gps && gps.lat !== undefined) {
      setUbicacionForm(gps.lat, gps.lng);
      snack('Ubicación tomada de la foto 📷');
    }
  };

  document.getElementById('insForm-guardar').onclick = async () => {
    const nombre = val('insForm-nombre');
    if (!nombre) { snack('Poné el nombre de la instalación.'); return; }
    const clienteId = val('insForm-cliente');
    if (!clienteId) { snack('Elegí el cliente.'); return; }
    const datos = {
      tipo: val('insForm-tipo'),
      clienteId: clienteId,
      establecimientoId: val('insForm-establecimiento') || null,
      nombre: nombre,
      marca: val('insForm-marca'),
      modelo: val('insForm-modelo'),
      caracteristicas: leerCar(),
      estado: val('insForm-estado'),
      lat: valNum('insForm-lat'),
      lng: valNum('insForm-lng'),
      fotos: getFotos('insForm')
    };
    let nuevoId = id;
    if (id) {
      const anterior = await getInstalacion(id);
      datos.id = id;
      datos.createdAt = anterior ? anterior.createdAt : Date.now();
      datos.observaciones = anterior ? anterior.observaciones : '';
      await actualizarInstalacion(datos);
    } else {
      const creado = await crearInstalacion(datos);
      nuevoId = creado.id;
    }
    snack('Instalación guardada.');
    go('clientes', { vista: 'instalacion', id: nuevoId });
  };

  const btnDel = document.getElementById('insForm-eliminar');
  if (btnDel) {
    btnDel.onclick = async () => {
      const ok = await confirmar('Eliminar instalación',
        'Se borran la instalación y sus trabajos asociados. Esta acción no se puede deshacer.',
        'Sí, eliminar');
      if (!ok) return;
      const i = await getInstalacion(id);
      const clienteId = i ? i.clienteId : null;
      await eliminarInstalacion(id);
      snack('Instalación eliminada.');
      if (clienteId) go('clientes', { vista: 'detalle', id: clienteId }, true);
      else go('clientes', { vista: 'lista' }, true);
    };
  }
}

/* ============ VISTA: formulario de establecimiento ============ */
async function renderEstablecimientoForm(id, clienteIdParam) {
  const e = id ? await getEstablecimiento(id) : null;
  const clientes = await getClientes();
  const clienteSel = (e && e.clienteId) || clienteIdParam || '';

  let h = '<div class="card"><div class="sec-titulo">' + (e ? 'Editar establecimiento' : 'Nuevo establecimiento') + '</div>';
  h += '<div class="form">';
  h += campoSelect('estForm-cliente', 'Cliente',
    [{ value: '', texto: 'Elegir…' }].concat(clientes.map(c => ({ value: c.id, texto: c.nombre }))),
    clienteSel, { req: true });
  h += campo('text', 'estForm-nombre', 'Nombre del establecimiento', e ? e.nombre : '',
    { req: true, hint: 'Ej: Casco, Lote 3, Campo El Ombú' });
  h += campo('text', 'estForm-contacto', 'Contacto', e ? e.contacto : '',
    { hint: 'Persona de contacto en este establecimiento' });
  h += campo('tel', 'estForm-telefono', 'Teléfono del contacto', e ? e.telefono : '', {});
  h += campo('text', 'estForm-localidad', 'Localidad', e ? e.localidad : '', {});
  h += campo('text', 'estForm-observaciones', 'Observaciones', e ? e.observaciones : '', {});
  h += '</div></div>';

  h += '<button class="btn btn-primary" id="estForm-guardar">💾 Guardar</button>';
  if (e) h += '<button class="btn btn-outline-danger" id="estForm-eliminar">🗑️ Eliminar establecimiento</button>';
  return h;
}

function bindEstablecimientoForm(id) {
  document.getElementById('estForm-guardar').onclick = async () => {
    const nombre = val('estForm-nombre');
    if (!nombre) { snack('Poné el nombre del establecimiento.'); return; }
    const clienteId = val('estForm-cliente');
    if (!clienteId) { snack('Elegí el cliente.'); return; }
    const datos = {
      clienteId: clienteId,
      nombre: nombre,
      contacto: val('estForm-contacto'),
      telefono: val('estForm-telefono'),
      localidad: val('estForm-localidad'),
      observaciones: val('estForm-observaciones')
    };
    let volverA = clienteId;
    if (id) {
      const anterior = await getEstablecimiento(id);
      datos.id = id;
      datos.createdAt = anterior ? anterior.createdAt : Date.now();
      volverA = anterior ? anterior.clienteId : clienteId;
      await actualizarEstablecimiento(datos);
    } else {
      await crearEstablecimiento(datos);
    }
    snack('Establecimiento guardado.');
    go('clientes', { vista: 'detalle', id: volverA });
  };

  const btnDel = document.getElementById('estForm-eliminar');
  if (btnDel) {
    btnDel.onclick = async () => {
      const ok = await confirmar('Eliminar establecimiento',
        'Las instalaciones quedan en el cliente, sin establecimiento asignado. Esta acción no se puede deshacer.',
        'Sí, eliminar');
      if (!ok) return;
      const e = await getEstablecimiento(id);
      const clienteId = e ? e.clienteId : null;
      await eliminarEstablecimiento(id);
      snack('Establecimiento eliminado.');
      if (clienteId) go('clientes', { vista: 'detalle', id: clienteId }, true);
      else go('clientes', { vista: 'lista' }, true);
    };
  }
}

/* ============ Registro de la pestaña ============ */
Pantallas.clientes = {
  titulo: 'Clientes',

  async render(params) {
    const vista = (params && params.vista) || 'lista';
    if (vista === 'detalle') return renderClienteDetalle(params.id);
    if (vista === 'clienteForm') return renderClienteForm(params.id);
    if (vista === 'instalacion') return renderInstalacion(params.id);
    if (vista === 'instalacionForm') return renderInstalacionForm(params.id, params.clienteId);
    if (vista === 'establecimientoForm') return renderEstablecimientoForm(params.id, params.clienteId);
    return renderListaClientes();
  },

  async bind(params) {
    const vista = (params && params.vista) || 'lista';
    if (vista === 'detalle') return bindClienteDetalle(params.id);
    if (vista === 'clienteForm') return bindClienteForm(params.id);
    if (vista === 'instalacion') return bindInstalacion(params.id);
    if (vista === 'instalacionForm') return bindInstalacionForm(params.id);
    if (vista === 'establecimientoForm') return bindEstablecimientoForm(params.id);
    return bindListaClientes();
  }
};
