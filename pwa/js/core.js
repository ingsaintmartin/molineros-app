/* ============================================================
   MolineroApp v2 - Núcleo de la interfaz
   Router por tabs, helpers compartidos, fotos, GPS y modal.
   Cada pantalla vive en js/t-*.js y se registra en `Pantallas`.
   ============================================================ */

const App = {
  tab: 'inicio',
  params: {},
  pila: [],          // historial para "volver"
  fotosTemp: {},     // pickers de fotos por prefijo
  exifTemp: {}       // último GPS leído de foto, por prefijo
};

const Pantallas = {};   // tab -> { titulo, render(params), bind(params) }

/* ---------- Navegación ---------- */
function go(tab, params, reemplazar) {
  params = params || {};
  if (!reemplazar && (App.tab !== tab || JSON.stringify(App.params) !== JSON.stringify(params))) {
    App.pila.push({ tab: App.tab, params: App.params });
    if (App.pila.length > 30) App.pila.shift();
  }
  App.tab = tab;
  App.params = params;
  render();
  window.scrollTo(0, 0);
}

function goBack() {
  const anterior = App.pila.pop();
  if (anterior) {
    App.tab = anterior.tab;
    App.params = anterior.params;
    render();
    window.scrollTo(0, 0);
  } else {
    go('inicio', {}, true);
  }
}

function setTitulo(t) {
  document.getElementById('appTitle').textContent = t || 'MolineroApp';
}

async function render() {
  const def = Pantallas[App.tab] || Pantallas.inicio;
  const vista = document.getElementById('view');
  vista.innerHTML = '<div class="cargando"><span class="spin">⚙️</span><br>Cargando…</div>';
  setTitulo(def.titulo);
  document.getElementById('btnBack').hidden = App.pila.length === 0;
  document.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('activo', b.dataset.tab === App.tab);
  });
  try {
    vista.innerHTML = await def.render(App.params);
  } catch (e) {
    console.error(e);
    vista.innerHTML = '<div class="vacio"><span class="emoji">⚠️</span>Algo salió mal cargando esta pantalla.</div>';
  }
  try { await def.bind(App.params); } catch (e) { console.error(e); }
  // Los mapas se inicializan después de pintar el HTML
  if (typeof Mapa !== 'undefined' && Mapa.hidratar) {
    try { Mapa.hidratar(); } catch (e) { console.error(e); }
  }
}

/* ---------- Texto seguro ---------- */
function esc(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Solo deja pasar data URLs de imagen válidas (anti-XSS)
function fotoSegura(f) {
  if (typeof f !== 'string') return '';
  const m = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.exec(f.trim());
  return m ? m[0] : '';
}

function normalizarTexto(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* ---------- Nombres y chips ---------- */
const ESTADOS_TRABAJO = {
  a_hacer: 'A hacer', terminado: 'Terminado',
  facturado: 'Facturado', cobrado: 'Cobrado'
};
const ESTADOS_FACTURA = {
  pendiente: 'Pendiente', pagada: 'Cobrada', vencida: 'Vencida', anulada: 'Anulada'
};
const TIPOS_INSTALACION = {
  molino: 'Molino', tanque: 'Tanque australiano', bebedero: 'Bebedero',
  bomba: 'Bomba', caneria: 'Cañería', otro: 'Otro'
};
const ICONOS_TIPO = {
  molino: '🌀', tanque: '🛢️', bebedero: '🐄',
  bomba: '⚙️', caneria: '🔧', otro: '📍'
};
const ESTADOS_INSTALACION = {
  Operativo: 'operativo', 'Fuera de servicio': 'fuera', 'En mantenimiento': 'mantenimiento'
};
const CATEGORIAS_GASTO = {
  combustible: '⛽ Combustible', peajes: '🛣️ Peajes', repuestos: '🔩 Repuestos',
  ayudante: '👷 Ayudante', vehiculo: '🚚 Vehículo', varios: '🧾 Varios'
};
const CATEGORIAS_REPUESTO = ['Cilindro', 'Cueros y gomas', 'Caños', 'Bridas y válvulas',
  'Varillas', 'Rueda y aletas', 'Torre', 'Bebederos', 'Herramientas', 'Varios'];

function chipEstado(estado) {
  const mapa = Object.assign({}, ESTADOS_TRABAJO, ESTADOS_FACTURA);
  const texto = mapa[estado] || estado || '';
  const clase = String(estado || '').toLowerCase().replace(/ /g, '_');
  return '<span class="chip ' + esc(clase) + '">' + esc(texto) + '</span>';
}
function chipInstalacion(estado) {
  const clase = ESTADOS_INSTALACION[estado] || 'operativo';
  return '<span class="chip ' + clase + '">' + esc(estado || 'Operativo') + '</span>';
}
function iconoTipo(tipo) { return ICONOS_TIPO[tipo] || '📍'; }
function nombreTipo(tipo) { return TIPOS_INSTALACION[tipo] || tipo || ''; }

function iniciales(nombre) {
  const partes = String(nombre || '?').trim().split(/\s+/);
  return ((partes[0] || '?')[0] + ((partes[1] || '')[0] || '')).toUpperCase();
}

/* ---------- Snackbar ---------- */
let snackTimer = null;
function snack(msg) {
  const el = document.getElementById('snackbar');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------- Modal ---------- */
function abrirModal(html) {
  document.getElementById('modalCard').innerHTML = html;
  document.getElementById('modal').hidden = false;
}
function cerrarModal() {
  document.getElementById('modal').hidden = true;
  document.getElementById('modalCard').innerHTML = '';
}
// Confirmación que devuelve Promise<boolean>
function confirmar(titulo, mensaje, textoOk) {
  return new Promise(resolve => {
    abrirModal(
      '<h2>' + esc(titulo) + '</h2>' +
      '<p class="modal-sub">' + esc(mensaje) + '</p>' +
      '<button class="btn btn-danger" id="cfOk">' + esc(textoOk || 'Eliminar') + '</button>' +
      '<button class="btn btn-ghost" id="cfNo">Cancelar</button>'
    );
    document.getElementById('cfOk').onclick = () => { cerrarModal(); resolve(true); };
    document.getElementById('cfNo').onclick = () => { cerrarModal(); resolve(false); };
  });
}

/* ---------- Fotos: picker reutilizable ---------- */
const MAX_FOTOS = 12;
const FOTO_MAX_PX = 1280;

function photoPickerHTML(prefijo, fotos, conExif) {
  App.fotosTemp[prefijo] = (fotos || []).slice();
  return '<div class="photo-picker" id="' + prefijo + '-picker">' +
    '<input type="file" id="' + prefijo + '-input" accept="image/*" multiple hidden />' +
    '<button type="button" class="photo-add" data-fotos-add="' + prefijo + '" aria-label="Agregar fotos">＋</button>' +
    '<div class="photo-picker" id="' + prefijo + '-thumbs" style="margin-top:0"></div>' +
    '</div>' +
    (conExif
      ? '<div class="hint" style="font-size:.82rem;color:var(--muted);margin-top:6px">💡 Si la foto tiene ubicación guardada, podés usarla para el mapa.</div>'
      : '');
}

function refreshPhotoThumbs(prefijo) {
  const cont = document.getElementById(prefijo + '-thumbs');
  if (!cont) return;
  cont.innerHTML = (App.fotosTemp[prefijo] || []).map((f, i) => {
    const src = fotoSegura(f);
    if (!src) return '';
    return '<div class="thumb"><img src="' + src + '" alt="Foto ' + (i + 1) + '" />' +
      '<button type="button" data-fotos-del="' + prefijo + '" data-index="' + i + '" aria-label="Quitar foto">✕</button></div>';
  }).join('');
}

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
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('foto')); };
    img.src = url;
  });
}

// Une el picker a los botones (llamar en el bind de cada pantalla)
function bindPhotoPicker(prefijo, conExif) {
  refreshPhotoThumbs(prefijo);
  document.querySelectorAll('[data-fotos-add="' + prefijo + '"]').forEach(btn => {
    btn.onclick = () => document.getElementById(prefijo + '-input').click();
  });
  const input = document.getElementById(prefijo + '-input');
  if (input) {
    input.onchange = async () => {
      const lugar = MAX_FOTOS - (App.fotosTemp[prefijo] || []).length;
      const files = Array.from(input.files || []).slice(0, Math.max(0, lugar));
      input.value = '';
      if (!files.length) {
        if ((App.fotosTemp[prefijo] || []).length >= MAX_FOTOS) snack('Máximo ' + MAX_FOTOS + ' fotos.');
        return;
      }
      // Si la pantalla quiere, lee el GPS de la primera foto (EXIF)
      if (conExif && typeof leerGPSDeFoto === 'function') {
        try {
          const gps = await leerGPSDeFoto(files[0]);
          if (gps) {
            App.exifTemp[prefijo] = gps;
            if (typeof window['onExifGPS_' + prefijo] === 'function') {
              window['onExifGPS_' + prefijo](gps);
            }
          }
        } catch (e) { /* la foto no trae GPS: no pasa nada */ }
      }
      snack('Procesando fotos…');
      try {
        const urls = await Promise.all(files.map(procesarFoto));
        App.fotosTemp[prefijo].push(...urls.map(fotoSegura).filter(Boolean));
        refreshPhotoThumbs(prefijo);
        snack('Fotos agregadas.');
      } catch (e) { snack('No se pudieron procesar algunas fotos.'); }
    };
  }
  document.querySelectorAll('[data-fotos-del="' + prefijo + '"]').forEach(btn => {
    btn.onclick = () => {
      App.fotosTemp[prefijo].splice(+btn.dataset.index, 1);
      refreshPhotoThumbs(prefijo);
      bindPhotoPicker(prefijo, conExif);
    };
  });
}

function getFotos(prefijo) {
  return (App.fotosTemp[prefijo] || []).map(fotoSegura).filter(Boolean);
}

// Ver foto en grande
function abrirFoto(src) {
  src = fotoSegura(src);
  if (!src) return;
  abrirModal('<img src="' + src + '" class="photo-view" alt="Foto" />' +
    '<button class="btn btn-ghost" onclick="cerrarModal()">Cerrar</button>');
}

/* ---------- GPS ---------- */
function obtenerGPS() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

function mapsUrl(lat, lng) {
  return 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng;
}

/* ---------- Formularios ---------- */
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
function valNum(id) {
  const v = val(id).replace(',', '.');
  if (v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
function campo(tipo, id, etiqueta, valor, extra) {
  extra = extra || {};
  return '<div class="field"><label for="' + id + '">' + esc(etiqueta) +
    (extra.req ? ' <span class="req">*</span>' : '') + '</label>' +
    '<input type="' + tipo + '" id="' + id + '" value="' + esc(valor === null || valor === undefined ? '' : valor) + '"' +
    (extra.inputmode ? ' inputmode="' + extra.inputmode + '"' : '') +
    (extra.placeholder ? ' placeholder="' + esc(extra.placeholder) + '"' : '') +
    (extra.step ? ' step="' + extra.step + '"' : '') + ' />' +
    (extra.hint ? '<div class="hint">' + esc(extra.hint) + '</div>' : '') + '</div>';
}
function campoSelect(id, etiqueta, opciones, valorActual, extra) {
  extra = extra || {};
  const opts = opciones.map(o =>
    '<option value="' + esc(o.value) + '"' + (String(o.value) === String(valorActual) ? ' selected' : '') + '>' +
    esc(o.texto) + '</option>').join('');
  return '<div class="field"><label for="' + id + '">' + esc(etiqueta) +
    (extra.req ? ' <span class="req">*</span>' : '') + '</label>' +
    '<select id="' + id + '">' + opts + '</select>' +
    (extra.hint ? '<div class="hint">' + esc(extra.hint) + '</div>' : '') + '</div>';
}
function campoTexto(id, etiqueta, valor, extra) {
  extra = extra || {};
  return '<div class="field"><label for="' + id + '">' + esc(etiqueta) +
    (extra.req ? ' <span class="req">*</span>' : '') + '</label>' +
    '<textarea id="' + id + '"' +
    (extra.placeholder ? ' placeholder="' + esc(extra.placeholder) + '"' : '') + '>' +
    esc(valor || '') + '</textarea></div>';
}

/* ---------- Configuración simple (localStorage) ---------- */
function getCfg(clave, defecto) {
  try {
    const v = localStorage.getItem('cfg_' + clave);
    return v === null ? defecto : v;
  } catch (e) { return defecto; }
}
function setCfg(clave, valor) {
  try { localStorage.setItem('cfg_' + clave, String(valor)); } catch (e) {}
}

/* ---------- Sincronización (barra de estado) ---------- */
function syncBarMostrar(texto, clase) {
  const bar = document.getElementById('syncBar');
  bar.textContent = texto;
  bar.className = 'syncbar' + (clase ? ' ' + clase : '');
  bar.hidden = false;
}
function syncBarOcultar() {
  document.getElementById('syncBar').hidden = true;
}

async function actualizarEstadoSync() {
  const n = await contarPendientes();
  if (!tursoConfigOk) {
    syncBarMostrar('Modo local: la nube no está configurada.', '');
  } else if (!navigator.onLine) {
    syncBarMostrar(n > 0
      ? 'Sin conexión · ' + n + ' cambio(s) esperando para subir.'
      : 'Sin conexión. Los datos se guardan en el equipo.', '');
  } else if (n > 0) {
    syncBarMostrar('Hay ' + n + ' cambio(s) sin sincronizar.', '');
  } else {
    syncBarOcultar();
  }
}

async function sincronizarAhora() {
  if (!tursoConfigOk) { snack('La nube no está configurada.'); return; }
  if (!navigator.onLine) { snack('Sin conexión.'); return; }
  syncBarMostrar('Sincronizando…', '');
  const ok = await sincronizar();
  if (ok) {
    syncBarMostrar('Sincronizado ✓', 'ok');
    setTimeout(syncBarOcultar, 2500);
    render();
  } else {
    syncBarMostrar('No se pudo sincronizar. Se reintentará.', 'error');
  }
  actualizarEstadoSync();
}

/* ---------- Arranque ---------- */
async function sembrarDemoSiCorresponde() {
  // Si todavía no hay datos de ejemplo en este equipo, los carga una sola
  // vez. Así quien abre el link por primera vez ve la app completa sin
  // tocar nada. La sincronización previa ya bajó lo de la nube, así que
  // si otro equipo sembró antes, acá no se duplica.
  try {
    if (localStorage.getItem('demoAutoV1')) {
      if (await mejorarDemoEstablecimientos()) render();
      return;
    }
    const clientes = await getClientes();
    if (clientes.some(c => (c.nombre || '').includes('(DEMO)'))) {
      if (await mejorarDemoEstablecimientos()) render();
      return;
    }
    const creado = await cargarDatosEjemplo();
    if (creado) {
      try { localStorage.setItem('demoAutoV1', '1'); } catch (e) {}
      if (nubeLista()) { try { await sincronizar(); } catch (e) {} }
      render();
    }
  } catch (e) { console.warn('No se pudo sembrar la demo:', e); }
}

async function iniciar() {
  // Tabs
  document.querySelectorAll('.tab').forEach(b => {
    b.addEventListener('click', () => go(b.dataset.tab, {}, true));
  });
  document.getElementById('btnBack').addEventListener('click', goBack);
  document.getElementById('btnSync').addEventListener('click', sincronizarAhora);
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target.id === 'modal') cerrarModal();
  });
  window.addEventListener('online', () => { actualizarEstadoSync(); sincronizarAhora(); });
  window.addEventListener('offline', actualizarEstadoSync);

  // La app crea las tablas en la nube si faltan (idempotente)
  try { await asegurarEsquemaNube(); } catch (e) { console.warn(e); }

  render();
  actualizarEstadoSync();
  // Sincroniza al abrir si hay conexión
  if (nubeLista()) {
    sincronizar()
      .then(async ok => { if (ok) render(); await sembrarDemoSiCorresponde(); })
      .catch(() => { sembrarDemoSiCorresponde(); });
    actualizarEstadoSync();
  } else {
    sembrarDemoSiCorresponde();
  }
}
