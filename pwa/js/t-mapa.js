/* Mapa: todas las instalaciones georreferenciadas sobre OpenStreetMap */
Pantallas.mapa = {
  titulo: 'Mapa',

  async render(params) {
    const filtro = params.tipo || '';
    const [inss, clientes] = await Promise.all([getInstalaciones(), getClientes()]);

    const nombreCli = {};
    for (const c of clientes) nombreCli[c.id] = c.nombre;

    const tieneUbic = i =>
      i.lat !== null && i.lat !== undefined && i.lng !== null && i.lng !== undefined &&
      isFinite(i.lat) && isFinite(i.lng);

    // Tipos que aparecen en las instalaciones (para los chips)
    const tiposConDatos = [];
    for (const t of Object.keys(TIPOS_INSTALACION)) {
      if (inss.some(i => i.tipo === t)) tiposConDatos.push(t);
    }

    const enFiltro = i => !filtro || i.tipo === filtro;
    const conUbic = inss.filter(i => enFiltro(i) && tieneUbic(i));
    const sinUbic = inss.filter(i => enFiltro(i) && !tieneUbic(i));
    const hayUbicAlguna = inss.some(tieneUbic);

    let h = '';

    // Filtros
    h += '<div class="chips">' +
      '<button class="fchip' + (!filtro ? ' activo' : '') + '" data-mapa-tipo="">Todos</button>' +
      tiposConDatos.map(t =>
        '<button class="fchip' + (filtro === t ? ' activo' : '') + '" data-mapa-tipo="' + esc(t) + '">' +
        esc(iconoTipo(t) + ' ' + nombreTipo(t)) + '</button>'
      ).join('') + '</div>';

    if (!hayUbicAlguna) {
      h += '<div class="vacio"><span class="emoji">🗺️</span>' +
        'Todavía no hay ubicaciones.<br>Abrí la ficha de una instalación y cargá su ubicación ' +
        'desde el mapa, el GPS o una foto.</div>';
    } else if (!conUbic.length) {
      h += '<div class="vacio"><span class="emoji">🗺️</span>' +
        'Con este filtro no hay ubicaciones cargadas.</div>';
    } else {
      // Mapa grande con los marcadores
      const markers = conUbic.map(i => ({
        lat: +i.lat, lng: +i.lng,
        titulo: iconoTipo(i.tipo) + ' ' + (i.nombre || 'Instalación') +
          (nombreCli[i.clienteId] ? ' — ' + nombreCli[i.clienteId] : '')
      }));
      h += '<div class="mapa-box grande" data-mapa data-markers=\'' + esc(JSON.stringify(markers)) + '\'></div>';

      // Lista de instalaciones mostradas
      h += '<div class="seccion-titulo"><h3>Instalaciones en el mapa (' + conUbic.length + ')</h3></div>';
      for (const i of conUbic) {
        h += '<button class="fila" data-ver-ins="' + esc(i.id) + '">' +
          '<div class="avatar">' + esc(iconoTipo(i.tipo)) + '</div><div class="cuerpo">' +
          '<div class="titulo">' + esc(i.nombre || 'Instalación') + '</div>' +
          '<div class="bajada">' + esc(nombreCli[i.clienteId] || 'Sin cliente') + '</div></div>' +
          '<div class="lateral">' + chipInstalacion(i.estado) + '<div class="chevron">›</div></div></button>';
      }
    }

    // Instalaciones sin ubicación (respetando el filtro)
    if (hayUbicAlguna && sinUbic.length) {
      h += '<div class="card"><div class="sec-titulo">📍 Sin ubicación (' + sinUbic.length + ')</div>';
      for (const i of sinUbic) {
        h += '<div class="dato"><span class="k">' + esc(iconoTipo(i.tipo)) + ' ' + esc(i.nombre || 'Instalación') +
          '<br><small>' + esc(nombreCli[i.clienteId] || 'Sin cliente') + '</small></span>' +
          '<span class="v"><button class="btn btn-secondary chico" data-cargar-ubic="' + esc(i.id) + '">' +
          'Cargar ubicación</button></span></div>';
      }
      h += '</div>';
    }

    h += '<div class="hint" style="margin-top:14px">Los mapas usan OpenStreetMap y necesitan ' +
      'internet la primera vez; la ubicación queda guardada en el equipo.</div>';

    return h;
  },

  async bind(params) {
    const filtroActual = params.tipo || '';
    document.querySelectorAll('[data-mapa-tipo]').forEach(b => {
      b.onclick = () => {
        const t = b.dataset.mapaTipo;
        if (t === filtroActual) return;
        go('mapa', t ? { tipo: t } : {}, true);
      };
    });
    document.querySelectorAll('[data-ver-ins]').forEach(b => {
      b.onclick = () => go('clientes', { vista: 'instalacion', id: b.dataset.verIns });
    });
    document.querySelectorAll('[data-cargar-ubic]').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        go('clientes', { vista: 'instalacionForm', id: b.dataset.cargarUbic });
      };
    });
  }
};
