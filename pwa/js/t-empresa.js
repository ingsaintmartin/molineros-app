/* ============================================================
   MolineroApp - Pantalla Empresa
   Datos fiscales de la empresa: nombre, CUIT, condición frente
   al IVA, domicilio, punto de venta y logo. Se usan en el
   encabezado del PDF y preparan la futura conexión con ARCA.
   ============================================================ */

Pantallas.empresa = {
  titulo: 'Mi Empresa',

  async render() {
    const e = await getEmpresa();
    const condOpts = Object.keys(CONDICIONES_FISCALES).map(k => ({
      value: k, texto: CONDICIONES_FISCALES[k]
    }));
    let h = '<div class="card"><div class="sec-titulo">🏢 Datos de la empresa</div><div class="form">';
    h += campo('text', 'emp-nombre', 'Nombre / Razón social', e.nombre || '', { req: true });
    h += campo('text', 'emp-cuit', 'CUIT', e.cuit || '', { placeholder: '20-12345678-9' });
    h += campoSelect('emp-cond', 'Condición fiscal', condOpts, e.condicionFiscal || 'monotributista');
    h += campo('text', 'emp-dom', 'Domicilio', e.domicilio || '', {});
    h += campo('text', 'emp-loc', 'Localidad', e.localidad || '', {});
    h += campo('tel', 'emp-tel', 'Teléfono', e.telefono || '', {});
    h += campo('email', 'emp-email', 'Email', e.email || '', {});
    h += campo('number', 'emp-pv', 'Punto de venta', e.puntoVenta || 1, {});
    h += '</div></div>';

    h += '<div class="card"><div class="sec-titulo">🖼️ Logo</div>';
    h += '<div id="emp-logo-prev">' +
      (e.logo ? '<img src="' + e.logo + '" alt="Logo" style="max-width:180px;max-height:120px;border-radius:8px" />' : '<p class="hint">Sin logo. Aparece en el encabezado del PDF.</p>') +
      '</div>';
    h += '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn btn-secondary chico" id="emp-logo-cargar">📷 Cargar logo</button>';
    if (e.logo) h += '<button class="btn btn-ghost chico" id="emp-logo-quitar">Quitar</button>';
    h += '</div><input type="file" id="emp-logo-input" accept="image/*" hidden /></div>';

    h += '<button class="btn btn-primary" id="emp-guardar">💾 Guardar</button>';
    h += '<p class="hint">Estos datos se imprimen en el encabezado de presupuestos y facturas (PDF).</p>';
    return h;
  },

  async bind() {
    let logoTemp = null; // null = sin cambio; '' = quitar; dataURL = nuevo
    const input = document.getElementById('emp-logo-input');
    const prev = document.getElementById('emp-logo-prev');
    const mostrarPrev = (src) => {
      prev.innerHTML = src
        ? '<img src="' + src + '" alt="Logo" style="max-width:180px;max-height:120px;border-radius:8px" />'
        : '<p class="hint">Sin logo. Aparece en el encabezado del PDF.</p>';
    };
    document.getElementById('emp-logo-cargar').onclick = () => input.click();
    const q = document.getElementById('emp-logo-quitar');
    if (q) q.onclick = () => { logoTemp = ''; mostrarPrev(null); q.remove(); };
    input.onchange = async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      try {
        logoTemp = await procesarFoto(f);
        mostrarPrev(logoTemp);
        snack('Logo cargado.');
      } catch (err) {
        snack('No se pudo leer la imagen.');
      }
      input.value = '';
    };
    document.getElementById('emp-guardar').onclick = async () => {
      const nombre = val('emp-nombre');
      if (!nombre) { snack('Poné el nombre de la empresa.'); return; }
      const datos = {
        nombre: nombre,
        cuit: val('emp-cuit'),
        condicionFiscal: val('emp-cond') || 'monotributista',
        domicilio: val('emp-dom'), localidad: val('emp-loc'),
        telefono: val('emp-tel'), email: val('emp-email'),
        puntoVenta: parseInt(val('emp-pv'), 10) || 1
      };
      if (logoTemp !== null) datos.logo = logoTemp || null;
      await guardarEmpresa(datos);
      snack('Empresa guardada.');
      go('empresa', {}, true);
    };
  }
};
