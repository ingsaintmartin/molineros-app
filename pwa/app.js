/* ============================================================
   MolineroApp - Lógica de la app (vistas, navegación, formularios)
   ------------------------------------------------------------
   App de una sola página para uso en el campo:
     - Lista de clientes (con búsqueda)
     - Ficha de cliente con sus molinos
     - Ficha técnica del molino
     - Historial de reparaciones por molino
     - Exportar / restaurar respaldo
   Todo se guarda en el dispositivo (IndexedDB). Sin internet.
   ============================================================ */

/* ---------- Constantes del oficio ---------- */
const TIPOS_INSTALACION = ['Molino Australiano', 'Aguada', 'Bebedero', 'Otro'];
const ESTADOS = [
  { valor: 'Operativo',          clase: 'ok' },
  { valor: 'Con problemas',      clase: 'warn' },
  { valor: 'Fuera de servicio',  clase: 'error' }
];

/* ---------- Estado de la app ---------- */
const App = {
  view: 'clientes',
  params: {},
  history: [],        // para el botón "atrás"
  allClientes: [],    // lista completa desplegada (para buscar)
  allMolinos: [],     // molinos del cliente actual
  allReps: [],        // reparaciones del molino actual
  fotosTemp: [],      // fotos base64 del formulario en curso
  gpsTemp: null       // {lat, lng} del formulario en curso
};

/* ---------- Utilidades ---------- */
function esc(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Las fotos se guardan como data URLs de imagen. Solo aceptamos ese
// formato: cualquier otro string (p. ej. de un respaldo manipulado)
// se descarta en vez de inyectarse en el HTML.
function fotoSegura(f) {
  const s = String(f || '');
  return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(s) ? s : '';
}

const $view = document.getElementById('view');
const $title = document.getElementById('appTitle');
const $btnBack = document.getElementById('btnBack');
const $btnBackup = document.getElementById('btnBackup');
const $snackbar = document.getElementById('snackbar');

// Aviso corto en pantalla (snackbar)
let snackTimer = null;
function snack(msg) {
  $snackbar.textContent = msg;
  $snackbar.hidden = false;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { $snackbar.hidden = true; }, 3500);
}

/* ---------- Navegación ---------- */
function go(view, params) {
  App.history.push({ view: App.view, params: App.params });
  App.view = view;
  App.params = params || {};
  render();
  window.scrollTo(0, 0);
}

function goBack() {
  const prev = App.history.pop();
  if (prev) {
    App.view = prev.view;
    App.params = prev.params || {};
  } else {
    App.view = 'clientes';
    App.params = {};
  }
  render();
  window.scrollTo(0, 0);
}

function updateHeader() {
  const v = App.view;
  $btnBack.disabled = App.history.length === 0;
  let titulo = 'MolineroApp';
  if (v === 'cliente-form') titulo = App.params.clienteId ? 'Editar cliente' : 'Nuevo cliente';
  else if (v === 'ficha-cliente') titulo = 'Cliente';
  else if (v === 'molino-form') titulo = App.params.molinoId ? 'Editar molino' : 'Nuevo molino';
  else if (v === 'ficha-molino') titulo = 'Molino';
  else if (v === 'reparacion-form') titulo = App.params.reparacionId ? 'Editar reparación' : 'Nueva reparación';
  $title.textContent = titulo;
}

/* ---------- Estados visuales de badges ---------- */
function badgeEstado(estado) {
  const e = ESTADOS.find(x => x.valor === estado) || ESTADOS[0];
  return '<span class="badge badge-' + e.clase + '">' + esc(estado) + '</span>';
}

/* ---------- Selectores ---------- */
function selectTipo(valor) {
  return '<select class="select" id="fTipo">' +
    TIPOS_INSTALACION.map(t => '<option value="' + esc(t) + '"' + (t === valor ? ' selected' : '') + '>' + esc(t) + '</option>').join('') +
    '</select>';
}

function selectEstado(valor) {
  return '<select class="select" id="fEstado">' +
    ESTADOS.map(e => '<option value="' + esc(e.valor) + '"' + (e.valor === valor ? ' selected' : '') + '>' + esc(e.valor) + '</option>').join('') +
    '</select>';
}
/* ---------- Utilidades de fotos ---------- */
function buildPhotoPicker(fotos) {
  App.fotosTemp = (fotos || []).slice();
  return '<div class="photo-picker" id="photoPicker">' +
    '<input type="file" id="photoInput" accept="image/*" multiple />' +
    '<button type="button" class="add-photo-btn" id="addPhotoBtn" aria-label="Agregar foto">&#xFF0B;</button>' +
    '<div class="photo-thumbs" id="photoThumbs"></div>' +
    '</div>';
}

function refreshPhotoThumbs() {
  const cont = document.getElementById('photoThumbs');
  if (!cont) return;
  cont.innerHTML = App.fotosTemp.map((f, i) => {
    const src = fotoSegura(f);
    if (!src) return '';
    return '<div class="photo-thumb">' +
      '<img src="' + src + '" alt="Foto" />' +
      '<button type="button" class="remove" data-action="remove-photo" data-index="' + i + '" aria-label="Quitar foto">&#10005;</button>' +
      '</div>';
  }).join('');
}

function bindPhotoPicker() {
  const input = document.getElementById('photoInput');
  const addBtn = document.getElementById('addPhotoBtn');
  if (input && addBtn) {
    addBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', leerFotos);
  }
}

const MAX_FOTOS = 12;      // tope de fotos por ficha
const FOTO_MAX_PX = 1280;   // lado mayor máximo al guardar

// Reduce la foto a un tamaño razonable (las de la cámara son enormes)
// y la devuelve como JPEG liviano. Así la base no crece sin control.
function procesarFoto(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, FOTO_MAX_PX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * escala));
      const h = Math.max(1, Math.round(img.height * escala));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('foto')); };
    img.src = url;
  });
}

function leerFotos(e) {
  const input = e.target;
  const lugar = MAX_FOTOS - App.fotosTemp.length;
  const files = Array.from(input.files || []).slice(0, Math.max(0, lugar));
  input.value = '';
  if (!files.length) {
    if (App.fotosTemp.length >= MAX_FOTOS) snack('Máximo ' + MAX_FOTOS + ' fotos por ficha.');
    return;
  }
  snack('Procesando fotos…');
  Promise.all(files.map(procesarFoto)).then(
    urls => {
      App.fotosTemp.push(...urls.map(fotoSegura).filter(Boolean));
      refreshPhotoThumbs();
      snack('Fotos agregadas.');
    },
    () => snack('No se pudieron procesar algunas fotos.')
  );
}

/* ---------- GPS ---------- */
function bindGps() {
  const btn = document.getElementById('useGps');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!navigator.geolocation) { snack('Este equipo no permite usar la ubicación.'); return; }
    btn.disabled = true;
    btn.textContent = 'Buscando ubicación…';
    navigator.geolocation.getCurrentPosition(
      pos => {
        App.gpsTemp = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) };
        const out = document.getElementById('gpsOut');
        if (out) out.textContent = 'Ubicación guardada: ' + App.gpsTemp.lat + ', ' + App.gpsTemp.lng;
        btn.disabled = false;
        btn.innerHTML = '&#128205; Usar mi ubicación actual';
        snack('Ubicación capturada.');
      },
      err => {
        btn.disabled = false;
        btn.innerHTML = '&#128205; Usar mi ubicación actual';
        snack('No se pudo obtener la ubicación. Revisá el GPS.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}

/* ---------- Visualizador de fotos en pantalla completa ---------- */
function abrirFoto(src) {
  src = fotoSegura(src);
  if (!src) return;
  const gal = document.createElement('div');
    gal.id = 'fotoGallery';
  gal.className = 'modal';
  gal.style.padding = '0';
  gal.innerHTML = '<div style="position:relative;width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;">' +
    '<button style="position:absolute;top:12px;right:12px;width:52px;height:52px;border:none;border-radius:50%;background:#ba1a1a;color:#fff;font-size:26px;" id="fotoClose">&#10005;</button>' +
    '<img src="' + src + '" alt="Foto" style="max-width:100%;max-height:100%;object-fit:contain;" />' +
    '</div>';
  document.body.appendChild(gal);
  gal.querySelector('#fotoClose').addEventListener('click', () => gal.remove());
  gal.addEventListener('click', ev => { if (ev.target === gal) gal.remove(); });
}

/* ==================================================================
   RENDERIZADO DE VISTAS
   ================================================================== */

async function render() {
  const v = App.view;
  updateHeader();
  if (v === 'clientes') await renderClientes();
  else if (v === 'cliente-form') await renderClienteForm();
  else if (v === 'ficha-cliente') await renderFichaCliente();
  else if (v === 'molino-form') await renderMolinoForm();
  else if (v === 'ficha-molino') await renderFichaMolino();
  else if (v === 'reparacion-form') await renderReparacionForm();
}

function formGroup(tipo, id, label, valor, hint, requerido) {
  const req = requerido ? ' required' : '';
  const hintAttr = hint ? ' placeholder="' + esc(hint) + '"' : '';
  let campo;
  if (tipo === 'textarea') {
    campo = '<textarea class="textarea" id="' + id + '"' + hintAttr + req + '>' + esc(valor) + '</textarea>';
  } else {
    campo = '<input class="input" id="' + id + '" type="' + tipo + '" value="' + esc(valor) + '"' + hintAttr + req + ' />';
  }
  return '<div class="form-group"><label for="' + id + '">' + esc(label) + '</label>' + campo + '</div>';
}

/* ---------- Vista: lista de clientes ---------- */
function normalizarTexto(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function filtraClientes(q) {
  const nq = normalizarTexto(q);
  if (!nq) return App.allClientes.slice();
  return App.allClientes.filter(c =>
    normalizarTexto(c.nombre).includes(nq) ||
    normalizarTexto(c.campo).includes(nq) ||
    normalizarTexto(c.localidad).includes(nq));
}

function clienteCardsHTML(lista) {
  if (!lista.length) {
    return '<div class="empty-state"><span class="emoji">&#128269;</span>Todavía no hay clientes o no se encontró ninguno.</div>';
  }
  return lista.map(c => {
    const camp = c.campo ? '<div class="card-sub">&#127983; ' + esc(c.campo) + '</div>' : '';
    const loc = c.localidad ? '<div class="card-sub">&#128205; ' + esc(c.localidad) + '</div>' : '';
    const tel = c.telefono ? '<div class="card-sub">&#128222; ' + esc(c.telefono) + '</div>' : '';
    return '<div class="card" data-action="nav-ficha-cliente" data-id="' + esc(c.id) + '">' +
      '<div class="card-title">' + esc(c.nombre) + '</div>' + camp + loc + tel +
      '</div>';
  }).join('');
}

async function renderClientes() {
  App.allClientes = await getClientes();
  const lista = filtraClientes(App.params.q || '');
  $view.innerHTML =
    '<input class="search-box" id="clienteSearch" type="search" placeholder="&#128269; Buscar por nombre o campo" value="' + esc(App.params.q || '') + '" />' +
    '<button class="btn btn-primary btn-big" data-action="nav-cliente-form">&#10133; Nuevo cliente</button>' +
    '<div class="section-title" id="clienteCount">Clientes (' + lista.length + ')</div>' +
    '<div id="clienteList">' + clienteCardsHTML(lista) + '</div>';

  const s = document.getElementById('clienteSearch');
  s.addEventListener('input', () => {
    const ll = filtraClientes(s.value);
    document.getElementById('clienteCount').textContent = 'Clientes (' + ll.length + ')';
    document.getElementById('clienteList').innerHTML = clienteCardsHTML(ll);
  });
}

/* ---------- Vista: alta / edición de cliente ---------- */
async function renderClienteForm() {
  const id = App.params.clienteId;
  let c = { nombre: '', campo: '', localidad: '', telefono: '', observaciones: '' };
  if (id) c = (await getCliente(id)) || c;

  $view.innerHTML =
    '<div class="form-group"><label for="fNombre">Nombre y apellido *</label>' +
    '<input class="input" id="fNombre" type="text" value="' + esc(c.nombre) + '" placeholder="Ej.: Juan Pérez" required /></div>' +
    '<div class="form-group"><label for="fCampo">Campo / Establecimiento</label>' +
    '<input class="input" id="fCampo" type="text" value="' + esc(c.campo) + '" placeholder="Ej.: La Primavera" /></div>' +
    '<div class="form-group"><label for="fLocalidad">Localidad / Partido</label>' +
    '<input class="input" id="fLocalidad" type="text" value="' + esc(c.localidad) + '" placeholder="Ej.: 9 de Julio, Bs. As." /></div>' +
    '<div class="form-group"><label for="fTelefono">Teléfono</label>' +
    '<input class="input" id="fTelefono" type="tel" value="' + esc(c.telefono) + '" placeholder="Ej.: 2317-555555" /></div>' +
    '<div class="form-group"><label for="fObs">Observaciones</label>' +
    '<textarea class="textarea" id="fObs" placeholder="Notas, cómo llegar, datos útiles…">' + esc(c.observaciones) + '</textarea></div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-big" data-action="cancel-form">&#10005; Cancelar</button>' +
    '<button class="btn btn-primary btn-big" data-action="save-cliente">&#128190; Guardar cliente</button>' +
    '</div>' +
    (id ? '<button class="btn btn-danger btn-big" data-action="delete-cliente" data-id="' + esc(id) + '">&#128465;&#65039; Eliminar cliente</button>' : '');
}

/* ---------- Vista: ficha de cliente (con sus molinos) ---------- */
async function renderFichaCliente() {
  const c = await getCliente(App.params.clienteId);
  if (!c) { snack('No se encontró el cliente.'); goBack(); return; }
  App.allMolinos = await getMolinosDeCliente(c.id);

  let html = '<div class="card" style="cursor:default">';
  html += '<div class="card-title">' + esc(c.nombre) + '</div>';
  html += '<div class="contact-card">';
  if (c.campo) html += '<div class="contact-line">&#127983; <b>' + esc(c.campo) + '</b></div>';
  if (c.localidad) html += '<div class="contact-line">&#128205; ' + esc(c.localidad) + '</div>';
  if (c.telefono) html += '<div class="contact-line">&#128222; <b>' + esc(c.telefono) + '</b></div>';
  if (c.observaciones) html += '<div class="contact-line" style="margin-top:4px">' + esc(c.observaciones) + '</div>';
  html += '</div></div>';

  html += '<button class="btn btn-secondary btn-big" data-action="nav-cliente-form" data-id="' + esc(c.id) + '">&#9998;&#65039; Editar datos del cliente</button>';
  html += '<div class="section-title">Molinos y aguadas (' + App.allMolinos.length + ')</div>';

  if (App.allMolinos.length === 0) {
    html += '<div class="empty-state"><span class="emoji">&#9881;&#65039;</span>Todavía no cargaste molinos ni aguadas para este cliente.</div>';
  } else {
    html += App.allMolinos.map(m => {
      const tipo = m.tipoInstalacion || '';
      const marcaModelo = [m.marca, m.modelo].filter(Boolean).join(' ');
      const stripe = m.estado === 'Operativo' ? 'ok' : (m.estado === 'Con problemas' ? 'warn' : 'error');
      return '<div class="card" data-action="nav-ficha-molino" data-id="' + esc(m.id) + '">' +
        '<div class="stripe stripe-' + stripe + '"></div>' +
        '<div class="card-title">' + esc(m.nombre || 'Molino') + '</div>' +
        '<div class="card-sub">' + esc(tipo) + (marcaModelo ? ' &middot; ' + esc(marcaModelo) : '') + '</div>' +
        '<div class="card-row">' + badgeEstado(m.estado) + '</div>' +
        '</div>';
    }).join('');
  }

  html += '<button class="btn btn-primary btn-big" data-action="nav-molino-form" data-clienteid="' + esc(c.id) + '">&#10133; Agregar molino / aguada</button>';
  html += '<button class="btn btn-danger btn-big" data-action="delete-cliente" data-id="' + esc(c.id) + '">&#128465;&#65039; Eliminar cliente</button>';
  $view.innerHTML = html;
}

/* ---------- Vista: alta / edición de molino ---------- */
async function renderMolinoForm() {
  const clienteId = App.params.clienteId;
  const id = App.params.molinoId;
  let m = {
    nombre: '', tipoInstalacion: TIPOS_INSTALACION[0], marca: '', modelo: '',
    tamanoCilindro: '', diametroSuccion: '', diametroImpulsion: '',
    profundidadPozo: '', estado: ESTADOS[0].valor, observaciones: '',
    lat: null, lng: null, fotos: []
  };
  if (id) m = Object.assign(m, (await getMolino(id)) || {});
  if (m.lat && m.lng) App.gpsTemp = { lat: m.lat, lng: m.lng }; else App.gpsTemp = null;

  const gps = (m.lat && m.lng)
    ? '<div class="gps-readonly" id="gpsOut">Ubicación guardada: ' + m.lat + ', ' + m.lng + '</div>'
    : '';

  $view.innerHTML =
    '<div class="form-group"><label for="fNombre">Nombre / Referencia *</label>' +
    '<input class="input" id="fNombre" type="text" value="' + esc(m.nombre) + '" placeholder="Ej.: Molino M-01 o Aguada de los Ceibos" required /></div>' +
    '<div class="form-group"><label for="fTipo">Tipo de instalación</label>' + selectTipo(m.tipoInstalacion) + '</div>' +
    '<div class="form-group"><label for="fMarca">Marca</label>' +
    '<input class="input" id="fMarca" type="text" value="' + esc(m.marca) + '" placeholder="Ej.: Aermotor, Fiasa…" /></div>' +
    '<div class="form-group"><label for="fModelo">Modelo</label>' +
    '<input class="input" id="fModelo" type="text" value="' + esc(m.modelo) + '" placeholder="Ej.: 8 pies, 10 pies…" /></div>' +

    '<div class="form-group"><label for="fCilindro">Tamaño del cilindro</label>' +
    '<input class="input" id="fCilindro" type="text" value="' + esc(m.tamanoCilindro) + '" placeholder="Ej.: 4" x 12" o 12 cm" /></div>' +
    '<div class="form-group"><label for="fSuccion">Diámetro caño de succión</label>' +
    '<input class="input" id="fSuccion" type="text" value="' + esc(m.diametroSuccion) + '" placeholder="Ej.: 2" PVC" /></div>' +
    '<div class="form-group"><label for="fImpulsion">Diámetro caño de impulsión</label>' +
    '<input class="input" id="fImpulsion" type="text" value="' + esc(m.diametroImpulsion) + '" placeholder="Ej.: 1.5" galvanizado" /></div>' +
    '<div class="form-group"><label for="fProfundidad">Profundidad del pozo (metros)</label>' +
    '<input class="input" id="fProfundidad" type="text" inputmode="decimal" value="' + esc(m.profundidadPozo) + '" placeholder="Ej.: 32" /></div>' +
    '<div class="form-group"><label for="fEstado">Estado</label>' + selectEstado(m.estado) + '</div>' +
    '<div class="form-group"><label for="fObs">Observaciones</label>' +
    '<textarea class="textarea" id="fObs" placeholder="Datos técnicos, ubicación dentro del campo…">' + esc(m.observaciones) + '</textarea></div>' +

    '<div class="form-group"><label>Fotos del molino</label>' + buildPhotoPicker(m.fotos) + '</div>' +

    '<div class="form-group"><label>Ubicación (opcional)</label>' +
    '<button type="button" class="gps-btn" id="useGps">&#128205; Usar mi ubicación actual</button>' + gps + '</div>' +

    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-big" data-action="cancel-form">&#10005; Cancelar</button>' +
    '<button class="btn btn-primary btn-big" data-action="save-molino">&#128190; Guardar molino</button>' +
    '</div>' +
    (id ? '<button class="btn btn-danger btn-big" data-action="delete-molino" data-id="' + esc(id) + '">&#128465;&#65039; Eliminar molino</button>' : '');

  bindPhotoPicker();
  refreshPhotoThumbs();
  bindGps();
}

/* ---------- Vista: ficha de molino (técnica + historial) ---------- */
function molinoDato(label, valor, full) {
  if (valor === null || valor === undefined || valor === '') return '';
  return '<div class="detail-cell' + (full ? ' full' : '') + '">' +
    '<span class="label">' + esc(label) + '</span>' +
    '<span class="value">' + esc(valor) + '</span></div>';
}

async function renderFichaMolino() {
  const m = await getMolino(App.params.molinoId);
  if (!m) { snack('No se encontró el molino.'); goBack(); return; }
  const c = await getCliente(m.clienteId);
  App.allReps = await getReparacionesDeMolino(m.id);

  const stripe = m.estado === 'Operativo' ? 'ok' : (m.estado === 'Con problemas' ? 'warn' : 'error');
  const tipo = m.tipoInstalacion || 'Molino';

  let html = '<div class="card" style="cursor:default;padding-top:16px">' +
    '<div class="stripe stripe-' + stripe + '"></div>' +
    '<div class="card-title">' + esc(m.nombre || 'Molino') + '</div>' +
    '<div class="card-sub">' + esc(tipo) +
    (c ? ' &middot; ' + esc(c.nombre) : '') + '</div>' +
    '<div class="card-row" style="margin-top:4px">' + badgeEstado(m.estado) + '</div></div>';

  // Foto principal (si hay)
  const fotosMolino = (m.fotos || []).map(fotoSegura).filter(Boolean);
  if (fotosMolino.length) {
    html += '<div class="section-title">Fotos</div>' +
      '<div class="photo-gallery">' +
      fotosMolino.map(f => '<div class="photo-thumb" data-action="ver-foto" data-src="' + f + '"><img src="' + f + '" alt="Foto" /></div>').join('') +
      '</div>';
  }

  // Datos técnicos
  html += '<div class="section-title">Datos técnicos</div><div class="detail-grid">' +
    molinoDato('Tipo de instalación', tipo, false) +
    molinoDato('Marca', m.marca, false) +
    molinoDato('Modelo', m.modelo, false) +
    molinoDato('Tamaño del cilindro', m.tamanoCilindro, false) +
    molinoDato('Caño de succión', m.diametroSuccion, false) +
    molinoDato('Caño de impulsión', m.diametroImpulsion, false) +
    molinoDato('Profundidad del pozo', m.profundidadPozo ? m.profundidadPozo + ' m' : '', false) +
    molinoDato('Observaciones', m.observaciones, true) +
    '</div>';

  // Mapa
  if (m.lat && m.lng) {
    html += '<a class="btn btn-secondary btn-big" href="https://maps.google.com/?q=' + m.lat + ',' + m.lng + '" target="_blank" rel="noopener">&#128506; Ver ubicación en el mapa</a>';
  }

  // Acciones rápidas
  html += '<button class="btn btn-primary btn-big" data-action="nav-reparacion-form" data-molino="' + esc(m.id) + '">&#128295;&#65039; Nueva reparación</button>';
  html += '<button class="btn btn-secondary btn-big" data-action="nav-molino-form" data-molino="' + esc(m.id) + '" data-clienteid="' + esc(m.clienteId) + '">&#9998;&#65039; Editar molino</button>';

  // Historial de reparaciones
  html += '<div class="section-title">Historial de reparaciones (' + App.allReps.length + ')</div>';
  if (App.allReps.length === 0) {
    html += '<div class="empty-state"><span class="emoji">&#128295;&#65039;</span>Todavía no hay reparaciones anotadas para este molino.</div>';
  } else {
    html += '<div class="timeline">' + App.allReps.map(r => {
      const costo = r.costo ? formatoPeso(r.costo) : '';
      const problema = r.problema ? '<p class="tl-body" style="margin-top:6px"><strong>Problema:</strong> ' + esc(r.problema) + '</p>' : '';
      const trabajo = r.trabajo ? '<p class="tl-body"><strong>Trabajo realizado:</strong> ' + esc(r.trabajo) + '</p>' : '';
      const piezas = r.piezas ? '<p class="tl-body"><strong>Piezas utilizadas:</strong> ' + esc(r.piezas) + '</p>' : '';
      const obs = r.observaciones ? '<p class="tl-body"><strong>Observaciones:</strong> ' + esc(r.observaciones) + '</p>' : '';
      const fotosRep = (r.fotos || []).map(fotoSegura).filter(Boolean);
      const fotos = fotosRep.length
        ? '<div class="tl-photos">' + fotosRep.map(f => '<div class="photo-thumb" data-action="ver-foto" data-src="' + f + '"><img src="' + f + '" alt="Foto" /></div>').join('') + '</div>'
        : '';
      return '<div class="timeline-item">' +
        '<div class="tl-stripe"></div>' +
        '<div class="tl-head"><span class="tl-date">' + esc(fechaLegible(r.fecha)) + '</span>' +
        (costo ? '<span class="tl-cost">' + esc(costo) + '</span>' : '') + '</div>' +
        '<div class="tl-title">' + (r.problema ? esc(r.problema) : 'Reparación') + '</div>' +
        problema + trabajo + piezas + obs + fotos +
        '<div class="card-row" style="margin-top:8px">' +
        '<button class="btn-mini" data-action="nav-reparacion-form" data-molino="' + esc(m.id) + '" data-repid="' + esc(r.id) + '">&#9998;&#65039; Editar</button>' +
        '<button class="btn-mini danger" data-action="delete-reparacion" data-id="' + esc(r.id) + '">&#128465;&#65039; Borrar</button>' +
        '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  html += '<button class="btn btn-danger btn-big" data-action="delete-molino" data-id="' + esc(m.id) + '" data-clienteid="' + esc(m.clienteId) + '">&#128465;&#65039; Eliminar molino</button>';
  $view.innerHTML = html;
}

/* ---------- Vista: alta / edición de reparación ---------- */
async function renderReparacionForm() {
  const molinoId = App.params.molino;
  const id = App.params.reparacionId;
  let r = { fecha: hoyISO(), problema: '', trabajo: '', piezas: '', costo: '', observaciones: '', fotos: [] };
  if (id) r = Object.assign(r, (await getReparacion(id)) || {});

  $view.innerHTML =
    '<div class="form-group"><label for="fFecha">Fecha</label>' +
    '<input class="input" id="fFecha" type="date" value="' + esc(r.fecha) + '" required /></div>' +
    '<div class="form-group"><label for="fProblema">Descripción del problema</label>' +
    '<textarea class="textarea" id="fProblema" placeholder="Qué le pasaba al molino / aguada…" required>' + esc(r.problema) + '</textarea></div>' +
    '<div class="form-group"><label for="fTrabajo">Trabajo realizado</label>' +
    '<textarea class="textarea" id="fTrabajo" placeholder="Qué hiciste para arreglarlo…">' + esc(r.trabajo) + '</textarea></div>' +
    '<div class="form-group"><label for="fPiezas">Piezas utilizadas</label>' +
    '<textarea class="textarea" id="fPiezas" placeholder="Ej.: cueros, válvula, tuercas…">' + esc(r.piezas) + '</textarea></div>' +
    '<div class="form-group"><label for="fCosto">Costo</label>' +
    '<input class="input" id="fCosto" type="text" inputmode="decimal" value="' + esc(r.costo) + '" placeholder="Ej.: 45000" /></div>' +
    '<div class="form-group"><label>Fotos</label>' + buildPhotoPicker(r.fotos) + '</div>' +
    '<div class="form-group"><label for="fObs">Observaciones</label>' +
    '<textarea class="textarea" id="fObs" placeholder="Notas adicionales…">' + esc(r.observaciones) + '</textarea></div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-ghost btn-big" data-action="cancel-form">&#10005; Cancelar</button>' +
    '<button class="btn btn-primary btn-big" data-action="save-reparacion">&#128190; Guardar reparación</button>' +
    '</div>' +
    (id ? '<button class="btn btn-danger btn-big" data-action="delete-reparacion" data-id="' + esc(id) + '">&#128465;&#65039; Eliminar reparación</button>' : '');

  bindPhotoPicker();
  refreshPhotoThumbs();
}

/* ==================================================================
   ACCIONES (delegación de eventos)
   ================================================================== */
function val(id) {
  const el = document.getElementById(id);
  return el ? (el.value || '') : '';
}

async function guardarCliente() {
  const nombre = val('fNombre').trim();
  if (!nombre) { snack('Escribí el nombre del cliente.'); return; }
  const datos = {
    nombre: nombre,
    campo: val('fCampo').trim(),
    localidad: val('fLocalidad').trim(),
    telefono: val('fTelefono').trim(),
    observaciones: val('fObs').trim()
  };
  let clienteId = App.params.clienteId;
  if (clienteId) {
    const viejo = await getCliente(clienteId);
    datos.id = clienteId;
    datos.createdAt = viejo.createdAt;
    await actualizarCliente(datos);
    snack('Cliente actualizado.');
  } else {
    const nuevo = await crearCliente(datos);
    clienteId = nuevo.id;
    snack('Cliente guardado.');
  }
  go('ficha-cliente', { clienteId: clienteId });
}

async function guardarMolino() {
  const nombre = val('fNombre').trim();
  if (!nombre) { snack('Escribí el nombre del molino.'); return; }
  const datos = {
    nombre: nombre,
    tipoInstalacion: val('fTipo'),
    marca: val('fMarca').trim(),
    modelo: val('fModelo').trim(),
    tamanoCilindro: val('fCilindro').trim(),
    diametroSuccion: val('fSuccion').trim(),
    diametroImpulsion: val('fImpulsion').trim(),
    profundidadPozo: val('fProfundidad').trim(),
    estado: val('fEstado'),
    observaciones: val('fObs').trim(),
    fotos: App.fotosTemp,
    lat: App.gpsTemp ? App.gpsTemp.lat : null,
    lng: App.gpsTemp ? App.gpsTemp.lng : null
  };
  const id = App.params.molinoId;
  if (id) {
    const viejo = await getMolino(id);
    datos.id = id;
    datos.clienteId = viejo.clienteId;
    datos.createdAt = viejo.createdAt;
    await actualizarMolino(datos);
    snack('Molino guardado.');
    go('ficha-molino', { molinoId: id });
  } else {
    const nuevo = await crearMolino(Object.assign({ clienteId: App.params.clienteId }, datos));
    snack('Molino guardado.');
    go('ficha-molino', { molinoId: nuevo.id });
  }
}

async function guardarReparacion() {
  const problema = val('fProblema').trim();
  if (!problema) { snack('Contá cuál fue el problema.'); return; }
  const datos = {
    molinoId: App.params.molino,
    fecha: val('fFecha'),
    problema: problema,
    trabajo: val('fTrabajo').trim(),
    piezas: val('fPiezas').trim(),
    costo: val('fCosto').trim(),
    observaciones: val('fObs').trim(),
    fotos: App.fotosTemp
  };
  const id = App.params.reparacionId;
  if (id) {
    const viejo = await getReparacion(id);
    datos.id = id;
    datos.createdAt = viejo.createdAt;
    await actualizarReparacion(datos);
    snack('Reparación actualizada.');
  } else {
    await crearReparacion(datos);
    snack('Reparación guardada.');
  }
  go('ficha-molino', { molinoId: App.params.molino });
}

/* ---------- Borrados (con confirmación) ---------- */
async function borrarCliente(d) {
  if (!confirm('¿Seguro que querés eliminar este cliente? Se borrarán también todos sus molinos y reparaciones.')) return;
  await eliminarCliente(d.id);
  snack('Cliente eliminado.');
  go('clientes', {});
}

async function borrarMolino(d) {
  if (!confirm('¿Seguro que querés eliminar este molino? Se borrará también su historial de reparaciones.')) return;
  await eliminarMolino(d.id);
  snack('Molino eliminado.');
  const clienteId = d.clienteid || App.params.clienteId;
  if (clienteId) go('ficha-cliente', { clienteId: clienteId });
  else go('clientes', {});
}

async function borrarReparacion(d) {
  if (!confirm('¿Seguro que querés eliminar esta reparación?')) return;
  await eliminarReparacion(d.id);
  snack('Reparación eliminada.');
  render();
}

/* ---------- Mapa de acciones ---------- */
const ACTIONS = {
  'nav-ficha-cliente': d => go('ficha-cliente', { clienteId: d.id }),
  'nav-cliente-form': d => go('cliente-form', { clienteId: d.id }),
  'nav-ficha-molino': d => go('ficha-molino', { molinoId: d.id }),
  'nav-molino-form': d => go('molino-form', { clienteId: d.clienteid, molinoId: d.molino }),
  'nav-reparacion-form': d => go('reparacion-form', { molino: d.molino, reparacionId: d.repid }),
  'save-cliente': guardarCliente,
  'save-molino': guardarMolino,
  'save-reparacion': guardarReparacion,
  'delete-cliente': borrarCliente,
  'delete-molino': borrarMolino,
  'delete-reparacion': borrarReparacion,
  'ver-foto': d => abrirFoto(d.src),
    'remove-photo': d => { App.fotosTemp.splice(+d.index, 1); refreshPhotoThumbs(); },
  'cancel-form': () => goBack()
};
/* ==================================================================
   RESPALDO (exportar / restaurar)
   ================================================================== */
const $backupModal = document.getElementById('backupModal');
const $importFile = document.getElementById('importFile');

function abrirBackup() { $backupModal.hidden = false; }
function cerrarBackup() { $backupModal.hidden = true; }

async function exportar() {
  try {
    await exportarRespaldo();
    snack('Respaldo descargado en el teléfono.');
  } catch (e) {
    snack('No se pudo exportar el respaldo.');
    console.error(e);
  }
}

async function restaurar(archivo) {
  // Guardamos la base actual por si algo sale mal
  const copia = await armarRespaldo();
  try {
    const texto = await archivo.text();
    const objeto = JSON.parse(texto);
    const res = await importarRespaldo(objeto);
    snack('Respaldo restaurado: ' + res.clientes + ' clientes, ' + res.molinos + ' molinos, ' + res.reparaciones + ' reparaciones.');
    cerrarBackup();
    App.history = [];
    await sincronizarYMostrar(); // sube el respaldo a la nube si hay conexión
    go('clientes', {});
  } catch (e) {
    console.error(e);
    snack('El archivo no se pudo leer o no es un respaldo válido.');
    // Volvemos a dejar la base como estaba
    try { await importarRespaldo(copia); } catch (e2) {}
  }
}

/* ==================================================================
   ARRANQUE DE LA APP
   ================================================================== */

// Delegación de clics sobre acciones
$view.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const accion = ACTIONS[el.getAttribute('data-action')];
  if (accion) accion(el.dataset);
});

$btnBack.addEventListener('click', goBack);
$btnBackup.addEventListener('click', abrirBackup);
$backupModal.addEventListener('click', ev => { if (ev.target === $backupModal) cerrarBackup(); });
// Cerrar modales con Escape (comportamiento esperado en desktop)
window.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape') return;
  if ($backupModal && !$backupModal.hidden) { cerrarBackup(); return; }
  const gal = document.getElementById('fotoGallery');
  if (gal) gal.remove();
});
document.getElementById('btnCloseBackup').addEventListener('click', cerrarBackup);
document.getElementById('btnExport').addEventListener('click', exportar);
document.getElementById('btnImportPick').addEventListener('click', () => $importFile.click());
$importFile.addEventListener('change', ev => {
  const f = ev.target.files && ev.target.files[0];
  if (f) restaurar(f);
  ev.target.value = '';
});

// Indicador de conexión y estado de sincronización
const $status = document.getElementById('statusLine');

function mostrarSincronizando() {
  $status.textContent = '☁ Sincronizando datos...';
  $status.className = 'status-line sync';
  $status.hidden = false;
}

function mostrarSincronizado() {
  $status.textContent = '☁ Datos sincronizados';
  $status.className = 'status-line online';
  $status.hidden = false;
  setTimeout(() => { $status.hidden = true; }, 3000);
}

function mostrarPendientes(n) {
  $status.textContent = '⚠ Hay ' + n + (n === 1 ? ' cambio pendiente' : ' cambios pendientes') + ' de sincronización. Se subirán solos cuando haya buena conexión.';
  $status.className = 'status-line sync';
  $status.hidden = false;
}

function mostrarErrorSync() {
  $status.textContent = '⚠ No se pudo sincronizar con la nube. Revisá la conexión e intentá de nuevo.';
  $status.className = 'status-line sync';
  $status.hidden = false;
}

// Sube la cola de pendientes y después descarga: muestra el estado final.
// Si queda algo sin subir, NO se toca lo local.
async function sincronizarYMostrar() {
  if (!nubeLista()) return;
  mostrarSincronizando();
  const ok = await sincronizar();
  const pendientes = await contarPendientes();
  if (ok && pendientes === 0) mostrarSincronizado();
  else if (pendientes > 0) mostrarPendientes(pendientes);
  else mostrarErrorSync();
}

function actualizarEstado() {
  if (navigator.onLine) {
    $status.hidden = true;
  } else {
    $status.textContent = '📵 Sin señal — los datos se guardan en el teléfono y se sincronizarán al volver la conexión.';
    $status.hidden = false;
    $status.className = 'status-line offline';
  }
}
// Arranque de la app
async function iniciar() {
  actualizarEstado();
  await sincronizarYMostrar();
  render();
}

window.addEventListener('online', async () => {
  actualizarEstado();
  await sincronizarYMostrar();
  render();
});
window.addEventListener('offline', actualizarEstado);

// Registro del Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(reg => {
      console.log('Service Worker registrado:', reg.scope);
    }).catch(err => console.warn('No se pudo registrar el Service Worker:', err));
  });
}

iniciar();
