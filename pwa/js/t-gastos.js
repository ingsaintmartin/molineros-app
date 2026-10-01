/* ============================================================
   MolineroApp v2 - Tabs: Gastos y Vehículos
   ============================================================ */

function emojiCategoriaGasto(cat) {
  const lbl = CATEGORIAS_GASTO[cat] || '';
  return lbl.split(' ')[0] || '🧾';
}
function textoCategoriaGasto(cat) {
  const lbl = CATEGORIAS_GASTO[cat] || String(cat || '');
  const e = lbl.split(' ')[0];
  return lbl.slice(e.length).trim() || lbl;
}

Pantallas.gastos = {
  titulo: 'Gastos',

  async render(params) {
    params = params || {};
    if (params.vista === 'form') return await this._renderForm(params);
    return await this._renderLista(params);
  },

  async _renderLista(params) {
    const mes = params.mes || mesActual();
    const cat = params.cat || 'todas';
    const gastos = await getGastos();
    const delMes = gastos.filter(g => enMes(g.fecha, mes));
    const filtrados = cat === 'todas' ? delMes : delMes.filter(g => g.categoria === cat);
    const total = filtrados.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);

    let h = '<div class="card">' +
      '<div class="field"><label for="gasMes">Mes</label>' +
      '<input type="month" id="gasMes" value="' + esc(mes) + '" /></div>' +
      '<div class="etiqueta">Total de gastos · ' + esc(nombreMes(mes)) + '</div>' +
      '<div class="monto-grande">' + esc(formatoPeso(total)) + '</div></div>';

    h += '<div class="chips">' +
      '<button class="fchip' + (cat === 'todas' ? ' activo' : '') + '" data-gas-cat="todas">Todas</button>';
    for (const clave of Object.keys(CATEGORIAS_GASTO)) {
      h += '<button class="fchip' + (cat === clave ? ' activo' : '') + '" data-gas-cat="' + esc(clave) + '">' +
        esc(CATEGORIAS_GASTO[clave]) + '</button>';
    }
    h += '</div>';

    if (!filtrados.length) {
      h += '<div class="vacio"><span class="emoji">💸</span>No hay gastos en este mes.</div>';
    } else {
      for (const g of filtrados) {
        h += '<button class="fila" data-ver-gasto="' + esc(g.id) + '">' +
          '<div class="avatar">' + emojiCategoriaGasto(g.categoria) + '</div>' +
          '<div class="cuerpo">' +
          '<div class="titulo">' + esc(g.descripcion || 'Gasto') + '</div>' +
          '<div class="bajada">' + esc(fechaLegible(g.fecha)) + ' · ' +
          esc(textoCategoriaGasto(g.categoria)) + '</div></div>' +
          '<div class="lateral"><div class="monto">' + esc(formatoPeso(g.monto)) + '</div></div></button>';
      }
    }

    h += '<button class="fab" id="fabGasto" aria-label="Agregar gasto">＋</button>';
    return h;
  },

  async _renderForm(params) {
    const id = params.id || null;
    const g = id ? await getGasto(id) : null;
    const mesOrigen = params.mes || (g && g.fecha ? g.fecha.slice(0, 7) : mesActual());

    const fecha = g ? (g.fecha || hoyISO()) : hoyISO();
    const catOpts = Object.keys(CATEGORIAS_GASTO).map(k => ({
      value: k, texto: CATEGORIAS_GASTO[k]
    }));

    const trabajos = await getTrabajos();
    const traOpts = [{ value: '', texto: 'Sin asignar' }].concat(
      trabajos.slice(0, 60).map(t => ({
        value: t.id,
        texto: fechaLegible(t.fecha) + ' · ' + (t.descripcion || 'Trabajo')
      }))
    );

    const vehiculos = await getVehiculos();
    const vehOpts = [{ value: '', texto: 'Sin asignar' }].concat(
      vehiculos.map(v => ({ value: v.id, texto: v.nombre || 'Vehículo' }))
    );

    let h = '<div class="card"><div class="form">' +
      campo('date', 'gasFecha', 'Fecha', fecha) +
      campoSelect('gasCategoria', 'Categoría', catOpts, g ? g.categoria : 'varios') +
      campo('text', 'gasDescripcion', 'Descripción', g ? g.descripcion : '', { req: true }) +
      campo('number', 'gasMonto', 'Monto ($)', g ? g.monto : '', { req: true, inputmode: 'decimal' }) +
      campoSelect('gasTrabajo', 'Trabajo (opcional)', traOpts, g ? (g.trabajoId || '') : (params.trabajoId || '')) +
      campoSelect('gasImputacion', 'Cómo afecta el costo', [
        { value: 'adicional', texto: 'Costo adicional: sumar al margen' },
        { value: 'incluido_materiales', texto: 'Ya incluido en los conceptos del trabajo' },
        { value: 'incluido_vehiculo', texto: 'Ya incluido en el costo por km del vehículo' },
        { value: 'stock', texto: 'Compra para stock: costo al consumir el repuesto' }
      ], g ? (g.imputacion || 'adicional') : 'adicional') +
      campoSelect('gasVehiculo', 'Vehículo (opcional)', vehOpts, g ? (g.vehiculoId || '') : '') +
      '<button class="btn btn-ambar" id="gasGuardar">' + (g ? 'Guardar cambios' : 'Guardar gasto') + '</button>';
    if (g) {
      h += '<button class="btn btn-danger" id="gasEliminar">Eliminar gasto</button>';
    }
    h += '<button class="btn btn-ghost" id="gasCancelar">Cancelar</button></div></div>';
    return h;
  },

  async bind(params) {
    params = params || {};
    if (params.vista === 'form') { await this._bindForm(params); return; }

    const mes = params.mes || mesActual();
    const cat = params.cat || 'todas';

    const inputMes = document.getElementById('gasMes');
    if (inputMes) {
      inputMes.onchange = () => go('gastos', { vista: 'lista', mes: inputMes.value || mes, cat: cat });
    }
    document.querySelectorAll('[data-gas-cat]').forEach(b => {
      b.onclick = () => go('gastos', { vista: 'lista', mes: mes, cat: b.dataset.gasCat });
    });
    document.querySelectorAll('[data-ver-gasto]').forEach(b => {
      b.onclick = () => go('gastos', { vista: 'form', id: b.dataset.verGasto, mes: mes });
    });
    const fab = document.getElementById('fabGasto');
    if (fab) fab.onclick = () => go('gastos', { vista: 'form', mes: mes });
  },

  async _bindForm(params) {
    const id = params.id || null;
    const mesOrigen = params.mes || mesActual();

    const btnGuardar = document.getElementById('gasGuardar');
    if (btnGuardar) {
      btnGuardar.onclick = async () => {
        const descripcion = val('gasDescripcion');
        const monto = valNum('gasMonto');
        if (!descripcion || monto === null) {
          snack('Completá descripción y monto.');
          return;
        }
        const datos = {
          fecha: val('gasFecha') || hoyISO(),
          categoria: val('gasCategoria') || 'varios',
          descripcion: descripcion,
          monto: monto,
          imputacion: val('gasImputacion') || 'adicional',
          trabajoId: val('gasTrabajo') || null,
          vehiculoId: val('gasVehiculo') || null
        };
        let guardado;
        if (id) {
          const anterior = await getGasto(id);
          guardado = await actualizarGasto(Object.assign({}, anterior || {}, datos, { id: id }));
        } else {
          guardado = await crearGasto(datos);
        }
        snack('Gasto guardado.');
        const mesDestino = String(guardado.fecha || hoyISO()).slice(0, 7);
        go('gastos', { vista: 'lista', mes: mesDestino });
      };
    }

    const btnEliminar = document.getElementById('gasEliminar');
    if (btnEliminar) {
      btnEliminar.onclick = async () => {
        const ok = await confirmar('Eliminar gasto', '¿Eliminar este gasto? Esta acción no se puede deshacer.');
        if (!ok) return;
        await eliminarGasto(id);
        snack('Gasto eliminado.');
        go('gastos', { vista: 'lista', mes: mesOrigen });
      };
    }

    const btnCancelar = document.getElementById('gasCancelar');
    if (btnCancelar) btnCancelar.onclick = () => goBack();
  }
};

async function getGasto(id) {
  const lista = await dbLocal.gastos.get(id);
  return lista || null;
}

Pantallas.vehiculos = {
  titulo: 'Vehículos',

  async render(params) {
    params = params || {};
    if (params.vista === 'form') return await this._renderForm(params);
    return await this._renderLista(params);
  },

  async _renderLista() {
    const vehiculos = await getVehiculos();

    let h = '';
    if (!vehiculos.length) {
      h += '<div class="vacio"><span class="emoji">🚚</span>Todavía no cargaste vehículos.<br>' +
        'Sumá la camioneta o el camión para calcular el costo por kilómetro.</div>';
    } else {
      for (const v of vehiculos) {
        h += '<div class="card">' +
          '<h3>' + esc(v.nombre || 'Vehículo') + '</h3>' +
          '<div class="dato"><span class="k">Patente</span><span class="v">' +
          esc(v.patente || '—') + '</span></div>' +
          '<div class="dato"><span class="k">Km actual</span><span class="v">' +
          esc((parseFloat(v.kmActual) || 0).toLocaleString('es-AR')) + ' km</span></div>' +
          '<div class="dato"><span class="k">Litros de gasoil por km</span><span class="v">' +
          esc(v.litrosKm != null && v.litrosKm !== '' ? String(v.litrosKm) : '—') + '</span></div>';
        if (v.observaciones) {
          h += '<div class="dato"><span class="k">Notas</span><span class="v">' +
            esc(v.observaciones) + '</span></div>';
        }
        h += '<div class="mt">' +
          '<button class="btn btn-ambar" data-veh-km="' + esc(v.id) + '">＋ Km</button> ' +
          '<button class="btn" data-veh-editar="' + esc(v.id) + '">Editar</button> ' +
          '<button class="btn btn-ghost" data-veh-eliminar="' + esc(v.id) + '">Eliminar</button>' +
          '</div></div>';
      }
    }

    h += '<button class="fab" id="fabVehiculo" aria-label="Agregar vehículo">＋</button>';
    return h;
  },

  async _renderForm(params) {
    const id = params.id || null;
    const v = id ? await getVehiculo(id) : null;

    let h = '<div class="card"><div class="form">' +
      campo('text', 'vehNombre', 'Nombre', v ? v.nombre : '', { req: true }) +
      campo('text', 'vehPatente', 'Patente', v ? v.patente : '') +
      campo('number', 'vehKm', 'Km actual', v ? v.kmActual : '', { inputmode: 'numeric' }) +
      campo('number', 'vehLitrosKm', 'Litros de gasoil por km', v && v.litrosKm !== null && v.litrosKm !== undefined ? v.litrosKm : '', {
        inputmode: 'decimal', placeholder: '1',
        hint: 'Viáticos: para una camioneta suele ser 1 litro por km'
      }) +
      campoTexto('vehObs', 'Observaciones', v ? v.observaciones : '') +
      '<button class="btn btn-ambar" id="vehGuardar">' + (v ? 'Guardar cambios' : 'Guardar vehículo') + '</button>';
    if (v) {
      h += '<button class="btn btn-danger" id="vehEliminar">Eliminar vehículo</button>';
    }
    h += '<button class="btn btn-ghost" id="vehCancelar">Cancelar</button></div></div>';
    return h;
  },

  async bind(params) {
    params = params || {};
    if (params.vista === 'form') { await this._bindForm(params); return; }

    document.querySelectorAll('[data-veh-km]').forEach(b => {
      b.onclick = () => this._modalKm(b.dataset.vehKm);
    });
    document.querySelectorAll('[data-veh-editar]').forEach(b => {
      b.onclick = () => go('vehiculos', { vista: 'form', id: b.dataset.vehEditar });
    });
    document.querySelectorAll('[data-veh-eliminar]').forEach(b => {
      b.onclick = async () => {
        const v = await getVehiculo(b.dataset.vehEliminar);
        const ok = await confirmar(
          'Eliminar vehículo',
          '¿Eliminar "' + (v ? v.nombre : 'vehículo') + '"? Los gastos que lo usaban quedan sin vehículo asignado.'
        );
        if (!ok) return;
        await eliminarVehiculo(b.dataset.vehEliminar);
        snack('Vehículo eliminado.');
        render();
      };
    });
    const fab = document.getElementById('fabVehiculo');
    if (fab) fab.onclick = () => go('vehiculos', { vista: 'form' });
  },

  async _bindForm(params) {
    const id = params.id || null;

    const btnGuardar = document.getElementById('vehGuardar');
    if (btnGuardar) {
      btnGuardar.onclick = async () => {
        const nombre = val('vehNombre');
        if (!nombre) { snack('El nombre es obligatorio.'); return; }
        const anterior = id ? await getVehiculo(id) : null;
        const datos = {
          nombre: nombre,
          patente: val('vehPatente'),
          kmActual: valNum('vehKm'),
          litrosKm: valNum('vehLitrosKm'),
          costoKm: (anterior && anterior.costoKm) || 0,
          observaciones: val('vehObs')
        };
        if (id) {
          await actualizarVehiculo(Object.assign({}, anterior || {}, datos, { id: id }));
        } else {
          await crearVehiculo(datos);
        }
        snack('Vehículo guardado.');
        go('vehiculos', { vista: 'lista' });
      };
    }

    const btnEliminar = document.getElementById('vehEliminar');
    if (btnEliminar) {
      btnEliminar.onclick = async () => {
        const ok = await confirmar('Eliminar vehículo', '¿Eliminar este vehículo? Esta acción no se puede deshacer.');
        if (!ok) return;
        await eliminarVehiculo(id);
        snack('Vehículo eliminado.');
        go('vehiculos', { vista: 'lista' });
      };
    }

    const btnCancelar = document.getElementById('vehCancelar');
    if (btnCancelar) btnCancelar.onclick = () => goBack();
  },

  async _modalKm(vehId) {
    const v = await getVehiculo(vehId);
    if (!v) return;
    abrirModal(
      '<h2>＋ Km · ' + esc(v.nombre || 'Vehículo') + '</h2>' +
      '<p class="modal-sub">Actualizá el kilometraje actual del vehículo.</p>' +
      campo('number', 'kmNuevo', 'Km actual', v.kmActual, { inputmode: 'numeric' }) +
      '<button class="btn btn-ambar" id="kmOk">Guardar</button>' +
      '<button class="btn btn-ghost" id="kmNo">Cancelar</button>'
    );
    document.getElementById('kmNo').onclick = cerrarModal;
    document.getElementById('kmOk').onclick = async () => {
      const n = valNum('kmNuevo');
      if (n === null || n < 0) { snack('Ingresá un kilometraje válido.'); return; }
      await actualizarVehiculo(Object.assign({}, v, { kmActual: n }));
      cerrarModal();
      snack('Kilometraje actualizado.');
      render();
    };
  }
};
