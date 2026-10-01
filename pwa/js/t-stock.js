/* ============================================================
   MolineroApp v2 - Pantalla Stock (repuestos)
   Vistas: lista | detalle | form
   ============================================================ */

Pantallas.stock = {
  titulo: 'Stock',

  async render(params) {
    const vista = params.vista || 'lista';
    if (vista === 'detalle') return await stockDetalleHTML(params.id);
    if (vista === 'form')    return await stockFormHTML(params.id);
    return await stockListaHTML();
  },

  async bind(params) {
    const vista = params.vista || 'lista';
    if (vista === 'lista')   stockListaBind();
    if (vista === 'detalle') stockDetalleBind(params.id);
    if (vista === 'form')    stockFormBind(params.id);
  }
};

/* ---------- Utilidades ---------- */
function fmtCant(n) {
  const v = parseFloat(n) || 0;
  return Math.round(v) === v ? String(v) : String(Math.round(v * 100) / 100);
}
function pctStock(stock, min) {
  const techo = Math.max(1, Math.max(stock, min * 2));
  return Math.min(100, Math.round(stock / techo * 100));
}

/* ---------- LISTA ---------- */
async function stockListaHTML() {
  const reps = await getRepuestos();
  const catsConStock = [];
  for (const c of CATEGORIAS_REPUESTO) {
    if (reps.some(r => r.categoria === c)) catsConStock.push(c);
  }
  let h = '<input class="buscador" id="stockQ" type="search" placeholder="🔍 Buscar repuesto…" />' +
    '<div class="chips" id="stockChips">' +
    '<button class="fchip activo" data-cat="">Todas</button>' +
    catsConStock.map(c => '<button class="fchip" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join('') +
    '</div><div id="stockRows">';
  if (!reps.length) {
    h += '<div class="vacio"><span class="emoji">🔩</span>No hay repuestos cargados.<br>Usá el botón ＋ para agregar el primero.</div>';
  }
  for (const r of reps) {
    const stock = parseFloat(r.stock) || 0;
    const min = parseFloat(r.stockMin) || 0;
    const bajo = stock <= min;
    const clase = bajo ? 'bajo' : (stock <= min * 1.5 ? 'medio' : '');
    h += '<button class="fila" data-ver-rep="' + esc(r.id) + '"' +
      ' data-cat="' + esc(r.categoria || '') + '"' +
      ' data-nombre="' + esc(normalizarTexto(r.nombre)) + '">' +
      '<div class="avatar">🔩</div><div class="cuerpo">' +
      '<div class="titulo">' + esc(r.nombre) + '</div>' +
      '<div class="bajada">' + esc(r.categoria || 'Sin categoría') + '</div>' +
      '<div class="stock-track"><div class="stock-fill ' + clase + '" style="width:' + pctStock(stock, min) + '%"></div></div>' +
      '</div><div class="lateral">' +
      '<div>Stock: <b>' + esc(fmtCant(stock)) + '</b></div>' +
      '<div class="bajada">mín ' + esc(fmtCant(min)) + '</div>' +
      (bajo ? '<span class="chip fuera">BAJO</span>' : '') +
      '</div></button>';
  }
  h += '</div><button class="fab" id="stockNuevo" aria-label="Nuevo repuesto">＋</button>';
  return h;
}

function stockListaBind() {
  const q = document.getElementById('stockQ');
  const chips = document.getElementById('stockChips');
  let cat = '';
  function filtrar() {
    const texto = normalizarTexto(q ? q.value : '');
    document.querySelectorAll('[data-ver-rep]').forEach(f => {
      const okCat = !cat || f.dataset.cat === cat;
      const okTxt = !texto || (f.dataset.nombre || '').indexOf(texto) !== -1;
      f.style.display = (okCat && okTxt) ? '' : 'none';
    });
  }
  if (q) q.oninput = filtrar;
  if (chips) chips.querySelectorAll('.fchip').forEach(b => {
    b.onclick = () => {
      chips.querySelectorAll('.fchip').forEach(x => x.classList.remove('activo'));
      b.classList.add('activo');
      cat = b.dataset.cat || '';
      filtrar();
    };
  });
  document.querySelectorAll('[data-ver-rep]').forEach(b => {
    b.onclick = () => go('stock', { vista: 'detalle', id: b.dataset.verRep });
  });
  const nuevo = document.getElementById('stockNuevo');
  if (nuevo) nuevo.onclick = () => go('stock', { vista: 'form' });
}

/* ---------- DETALLE ---------- */
async function stockDetalleHTML(id) {
  const r = await getRepuesto(id);
  if (!r) return '<div class="vacio"><span class="emoji">🔩</span>Repuesto no encontrado.</div>';
  const stock = parseFloat(r.stock) || 0;
  const min = parseFloat(r.stockMin) || 0;
  const costo = parseFloat(r.costo);
  const precio = parseFloat(r.precio);
  let margen = '';
  if (!isNaN(precio) && precio > 0 && !isNaN(costo)) {
    margen = Math.round((precio - costo) / precio * 100) + ' %';
  }
  let h = '<div class="card"><div class="sec-titulo"><h3>🔩 ' + esc(r.nombre) + '</h3></div>' +
    '<div class="dato"><span class="k">Categoría</span><span class="v">' + esc(r.categoria || '—') + '</span></div>' +
    '<div class="dato"><span class="k">Stock actual</span><span class="v"><b>' + esc(fmtCant(stock)) + '</b>' +
    (stock <= min ? ' <span class="chip fuera">BAJO</span>' : '') + '</span></div>' +
    '<div class="dato"><span class="k">Stock mínimo</span><span class="v">' + esc(fmtCant(min)) + '</span></div>' +
    '<div class="dato"><span class="k">Costo</span><span class="v">' + esc(isNaN(costo) ? '—' : formatoPeso(costo)) + '</span></div>' +
    '<div class="dato"><span class="k">Precio de venta</span><span class="v">' + esc(isNaN(precio) ? '—' : formatoPeso(precio)) + '</span></div>' +
    '<div class="dato"><span class="k">Margen</span><span class="v">' + esc(margen || '—') + '</span></div></div>';
  h += '<button class="btn btn-ambar" data-ajustar-stock>📦 Ajustar stock</button>' +
    '<button class="btn" data-editar-rep>✏️ Editar</button>' +
    '<button class="btn btn-ghost" data-eliminar-rep>🗑️ Eliminar</button>';
  return h;
}

function stockDetalleBind(id) {
  const aj = document.querySelector('[data-ajustar-stock]');
  if (aj) aj.onclick = () => {
    abrirModal('<h2>Ajustar stock</h2>' +
      '<p class="modal-sub">Escribí la cantidad con signo. Ejemplos: <b>+5</b> si compraste, <b>-2</b> si usaste o se rompió.</p>' +
      campo('text', 'ajCant', 'Cantidad', '', { placeholder: '+5 o -2', inputmode: 'decimal', req: true }) +
      campoTexto('ajMotivo', 'Motivo (opcional)', '', { placeholder: 'Ej: compra en lo de Gómez' }) +
      '<button class="btn btn-ambar" id="ajOk">Guardar ajuste</button>' +
      '<button class="btn btn-ghost" onclick="cerrarModal()">Cancelar</button>');
    document.getElementById('ajOk').onclick = async () => {
      const delta = valNum('ajCant');
      if (delta === null) { snack('Escribí una cantidad válida, ej +5 o -2.'); return; }
      const r = await getRepuesto(id);
      if (!r) { cerrarModal(); return; }
      const antes = parseFloat(r.stock) || 0;
      const nuevo = Math.round((antes + delta) * 100) / 100;
      r.stock = nuevo;
      await actualizarRepuesto(r);
      cerrarModal();
      const motivo = val('ajMotivo');
      snack('Stock: ' + fmtCant(antes) + ' → ' + fmtCant(nuevo) + (motivo ? ' (' + motivo + ')' : ''));
      go('stock', { vista: 'detalle', id: id }, true);
    };
  };
  const ed = document.querySelector('[data-editar-rep]');
  if (ed) ed.onclick = () => go('stock', { vista: 'form', id: id });
  const del = document.querySelector('[data-eliminar-rep]');
  if (del) del.onclick = async () => {
    const r = await getRepuesto(id);
    const ok = await confirmar('Eliminar repuesto',
      '¿Eliminar "' + (r ? r.nombre : '') + '"? Se desvincula de los trabajos anteriores, pero el historial se conserva.',
      'Eliminar');
    if (!ok) return;
    await eliminarRepuesto(id);
    snack('Repuesto eliminado.');
    go('stock', { vista: 'lista' }, true);
  };
}

/* ---------- FORM ---------- */
async function stockFormHTML(id) {
  const r = id ? await getRepuesto(id) : null;
  const cats = CATEGORIAS_REPUESTO.map(c => ({ value: c, texto: c }));
  return '<div class="card">' +
    campo('text', 'repNombre', 'Nombre', r ? r.nombre : '', { req: true, placeholder: 'Ej: Cueros de 4"' }) +
    campoSelect('repCat', 'Categoría', cats, r ? r.categoria : '') +
    campo('number', 'repStock', 'Stock actual', r ? r.stock : 0, { inputmode: 'decimal' }) +
    campo('number', 'repMin', 'Stock mínimo', r ? r.stockMin : 0, { inputmode: 'decimal', hint: 'Te avisa cuando el stock llegue a este número.' }) +
    campo('number', 'repCosto', 'Costo ($)', r && r.costo !== null ? r.costo : '', { inputmode: 'decimal' }) +
    campo('number', 'repPrecio', 'Precio de venta ($)', r && r.precio !== null ? r.precio : '', { inputmode: 'decimal' }) +
    '</div>' +
    '<button class="btn btn-ambar" id="repGuardar">💾 Guardar</button>' +
    '<button class="btn btn-ghost" onclick="goBack()">Cancelar</button>';
}

function stockFormBind(id) {
  const g = document.getElementById('repGuardar');
  if (!g) return;
  g.onclick = async () => {
    const nombre = val('repNombre');
    if (!nombre) { snack('Poné un nombre para el repuesto.'); return; }
    const datos = {
      nombre: nombre,
      categoria: val('repCat') || '',
      stock: valNum('repStock') ?? 0,
      stockMin: valNum('repMin') ?? 0,
      costo: valNum('repCosto'),
      precio: valNum('repPrecio')
    };
    let rep;
    if (id) {
      const actual = await getRepuesto(id);
      rep = await actualizarRepuesto(Object.assign({}, actual, datos));
    } else {
      rep = await crearRepuesto(datos);
    }
    snack('Repuesto guardado.');
    go('stock', { vista: 'detalle', id: rep.id }, true);
  };
}
