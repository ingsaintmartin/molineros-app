/* ============================================================
   MolineroApp v2 - Tab: Más (atajos, datos, configuración)
   ============================================================ */

Pantallas.mas = {
  titulo: 'Más',

  async render() {
    const accesos = [
      { ico: '🏢', t: 'Mi empresa', b: 'Datos fiscales y configuración del emisor', tab: 'empresa' },
      { ico: '🗺️', t: 'Mapa', b: 'Ubicación de molinos y aguadas', tab: 'mapa' },
      { ico: '📦', t: 'Stock', b: 'Repuestos y materiales', tab: 'stock' },
      { ico: '🧾', t: 'Facturación', b: 'Presupuestos, facturas y recibos', tab: 'facturacion' },
      { ico: '💸', t: 'Gastos', b: 'Combustible, peajes, ayudante…', tab: 'gastos' },
      { ico: '🚚', t: 'Vehículos', b: 'Costo por kilómetro', tab: 'vehiculos' },
      { ico: '📊', t: 'Reportes', b: 'Márgenes por mes', tab: 'reportes' }
    ];

    let h = '<div class="card menu-lista">';
    for (const a of accesos) {
      h += '<button class="menu-item" data-go-tab="' + esc(a.tab) + '">' +
        '<span class="ico">' + a.ico + '</span>' +
        '<span><span class="t">' + esc(a.t) + '</span><br><span class="b">' + esc(a.b) + '</span></span>' +
        '<span class="chev">›</span></button>';
    }
    h += '</div>';

    h += '<div class="card"><div class="sec-titulo">💾 Datos</div><div class="menu-lista">' +
      '<button class="menu-item" id="btnExportar">' +
      '<span class="ico">💾</span>' +
      '<span><span class="t">Exportar respaldo</span><br><span class="b">Descarga un archivo con todos tus datos</span></span>' +
      '<span class="chev">›</span></button>' +
      '<button class="menu-item" id="btnImportar">' +
      '<span class="ico">📥</span>' +
      '<span><span class="t">Importar respaldo</span><br><span class="b">Restaura datos desde un archivo</span></span>' +
      '<span class="chev">›</span></button>' +
      '<button class="menu-item" id="btnSinc">' +
      '<span class="ico">🔄</span>' +
      '<span><span class="t">Sincronizar ahora</span><br><span class="b">Sube y baja los cambios de la nube</span></span>' +
      '<span class="chev">›</span></button>' +
      '<button class="menu-item" id="btnEjemplo">' +
      '<span class="ico">🧪</span>' +
      '<span><span class="t">Cargar datos de ejemplo</span><br><span class="b">Cliente, molinos, trabajos y stock de prueba</span></span>' +
      '<span class="chev">›</span></button>' +
      '</div><input type="file" id="impFile" accept="application/json,.json" hidden /></div>';

    h += '<div class="card"><div class="sec-titulo">⚙️ Configuración</div><div class="form">' +
      campo('number', 'cfgTarifa', 'Tarifa por hora por defecto ($)', getCfg('tarifaHora', ''), { inputmode: 'decimal' }) +
      campo('number', 'cfgCostoKm', 'Costo por km por defecto ($)', getCfg('costoKm', ''), { inputmode: 'decimal' }) +
      campo('number', 'cfgPrecioLitro', 'Precio del litro de gasoil por defecto ($)', getCfg('precioLitro', '2500'), { inputmode: 'decimal' }) +
      '<button class="btn btn-ambar" id="btnCfgGuardar">Guardar</button>' +
      '</div></div>';

    h += '<div class="card"><div class="sec-titulo">ℹ️ Acerca de</div>' +
      '<p class="bajada">MolineroApp v2 · Funciona sin señal: los datos viven en el equipo y se sincronizan cuando hay internet.</p></div>';

    return h;
  },

  async bind() {
    document.querySelectorAll('[data-go-tab]').forEach(b => {
      b.onclick = () => go(b.dataset.goTab, {}, true);
    });

    const btnExportar = document.getElementById('btnExportar');
    if (btnExportar) {
      btnExportar.onclick = async () => {
        await exportarRespaldo();
        snack('Respaldo descargado.');
      };
    }

    const btnImportar = document.getElementById('btnImportar');
    const impFile = document.getElementById('impFile');
    if (btnImportar && impFile) {
      btnImportar.onclick = () => impFile.click();
      impFile.onchange = async () => {
        const archivo = impFile.files && impFile.files[0];
        impFile.value = '';
        if (!archivo) return;
        let objeto = null;
        try {
          const texto = await archivo.text();
          objeto = JSON.parse(texto);
        } catch (e) {
          snack('El archivo no es un respaldo válido.');
          return;
        }
        const ok = await confirmar(
          'Importar respaldo',
          'Se reemplazan todos los datos actuales por los del archivo. ¿Continuar?',
          'Importar'
        );
        if (!ok) return;
        try {
          const r = await importarRespaldo(objeto);
          snack('Respaldo importado: ' + r.clientes + ' cliente(s), ' + r.trabajos + ' trabajo(s).');
          go('inicio', {}, true);
        } catch (e) {
          snack('No se pudo importar el respaldo.');
        }
      };
    }

    const btnSinc = document.getElementById('btnSinc');
    if (btnSinc) btnSinc.onclick = () => sincronizarAhora();

    const btnEjemplo = document.getElementById('btnEjemplo');
    if (btnEjemplo) {
      btnEjemplo.onclick = async () => {
        const ok = await confirmar('Datos de ejemplo', 'Se cargará un cliente de prueba con molinos, trabajos, stock y facturas. ¿Continuar?', 'Cargar');
        if (!ok) return;
        const creado = await cargarDatosEjemplo();
        if (creado) go('inicio', {}, true);
      };
    }

    const btnCfgGuardar = document.getElementById('btnCfgGuardar');
    if (btnCfgGuardar) {
      btnCfgGuardar.onclick = () => {
        setCfg('tarifaHora', val('cfgTarifa'));
        setCfg('costoKm', val('cfgCostoKm'));
        setCfg('precioLitro', val('cfgPrecioLitro'));
        snack('Configuración guardada.');
      };
    }
  }
};
