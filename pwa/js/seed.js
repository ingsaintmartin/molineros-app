/* ============================================================
   MolineroApp v2 - Datos de ejemplo (demo)
   Crea un cliente de prueba con instalaciones georreferenciadas,
   trabajos, stock, factura, gastos y un vehículo.
   Todo pasa por las funciones normales de db.js, así que entra
   en la cola de sincronización y sube a la nube si hay conexión.
   ============================================================ */

// Empresa de ejemplo: solo se carga si el usuario todavía no
// configuró sus datos (así no pisa los datos reales).
async function sembrarEmpresaDemoSiFalta() {
  const empActual = await getEmpresa();
  if (!empActual.nombre) {
    await guardarEmpresa({
      nombre: 'Molinero Demo',
      cuit: '20-87654321-9',
      condicionFiscal: 'monotributista',
      domicilio: 'Ruta 29 km 12', localidad: 'General Belgrano',
      telefono: '02223-550011', email: 'demo@molinero.com',
      puntoVenta: 1
    });
  }
}

async function cargarDatosEjemplo() {
  const existentes = await getClientes();
  // La empresa de ejemplo se asegura igual aunque ya exista el cliente (DEMO)
  await sembrarEmpresaDemoSiFalta();
  if (existentes.some(c => /\(DEMO\)/i.test(c.nombre || ''))) {
    snack('Los datos de ejemplo ya están cargados');
    return false;
  }

  const hoy = hoyISO();
  const manana = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + String(d.getDate()).padStart(2, '0');
  })();

  // Cliente
  const cli = await crearCliente({
    nombre: 'Estancia La Prueba (DEMO)',
    campo: 'La Prueba', localidad: 'General Belgrano',
    telefono: '02223-440011', cuit: '20-12345678-9',
    condicionFiscal: 'responsable_inscripto',
    observaciones: 'Cliente de prueba cargado automáticamente. Se puede borrar desde Más → datos.'
  });

  // Empresa de ejemplo (solo si no hay una cargada)
  await sembrarEmpresaDemoSiFalta();

  // Establecimientos: el mismo cliente/CUIT, cada uno con su contacto
  const casco = await crearEstablecimiento({
    clienteId: cli.id, nombre: 'Casco',
    contacto: 'Juan Pérez', telefono: '+54 9 2223 44-0101',
    localidad: 'General Belgrano',
    observaciones: 'Establecimiento de ejemplo'
  });
  const lote3 = await crearEstablecimiento({
    clienteId: cli.id, nombre: 'Lote 3',
    contacto: 'María Gómez', telefono: '+54 9 2223 44-0202',
    localidad: 'General Belgrano',
    observaciones: 'Establecimiento de ejemplo'
  });

  // Instalaciones georreferenciadas
  const molino = await crearInstalacion({
    clienteId: cli.id, establecimientoId: casco.id, tipo: 'molino', nombre: 'Molino Norte #1',
    marca: 'Fiasa', modelo: '8 pies', estado: 'operativo',
    lat: -35.8231, lng: -58.5023,
    caracteristicas: { diametro: '8 pies', altura: '12 m', orientacion: 'Norte' },
    observaciones: 'Instalación de ejemplo'
  });
  const tanque = await crearInstalacion({
    clienteId: cli.id, establecimientoId: casco.id, tipo: 'tanque', nombre: 'Tanque Australiano',
    estado: 'operativo', lat: -35.8245, lng: -58.5001,
    caracteristicas: { capacidad: '20000 l', diametro: '5 m' },
    observaciones: 'Instalación de ejemplo'
  });
  const bebedero = await crearInstalacion({
    clienteId: cli.id, establecimientoId: lote3.id, tipo: 'bebedero', nombre: 'Bebedero Lote 3',
    estado: 'mantenimiento', lat: -35.8201, lng: -58.5055,
    observaciones: 'Instalación de ejemplo'
  });

  // Stock
  const cuero = await crearRepuesto({
    nombre: 'Cuero de cilindro 8"', categoria: 'Cueros y gomas',
    stock: 12, stockMin: 4, costo: 8500, precio: 12500
  });
  const aleta = await crearRepuesto({
    nombre: 'Aleta 8 pies', categoria: 'Rueda y aletas',
    stock: 20, stockMin: 8, costo: 3200, precio: 4800
  });
  await crearRepuesto({
    nombre: 'Rayo galvanizado', categoria: 'Rueda y aletas',
    stock: 30, stockMin: 10, costo: 1500, precio: 2300
  });

  // Trabajo terminado con materiales (descuenta stock)
  const tra1 = await crearTrabajo({
    instalacionId: molino.id, clienteId: cli.id, fecha: hoy,
    descripcion: 'Cambio de cueros y aletas',
    tareas: [
      { t: 'Desarmar cilindro', hecha: true },
      { t: 'Cambiar cueros', hecha: true },
      { t: 'Reemplazar 4 aletas', hecha: true }
    ],
    horas: 5, tarifaHora: 18000, km: 62, costoKm: 900,
    estado: 'terminado', observaciones: 'Trabajo de ejemplo'
  });
  await guardarItemsTrabajo(tra1.id, [
    { repuestoId: cuero.id, descripcion: 'Cuero de cilindro 8"', cantidad: 2, costoUnit: 8500, precioUnit: 12500 },
    { repuestoId: aleta.id, descripcion: 'Aleta 8 pies', cantidad: 4, costoUnit: 3200, precioUnit: 4800 }
  ]);

  // Trabajo pendiente
  await crearTrabajo({
    instalacionId: tanque.id, clienteId: cli.id, fecha: manana,
    descripcion: 'Limpieza de tanque australiano',
    tareas: [{ t: 'Vaciar tanque', hecha: false }, { t: 'Limpiar sedimento', hecha: false }],
    horas: 3, tarifaHora: 18000, km: 62, costoKm: 900,
    estado: 'a_hacer', observaciones: 'Trabajo de ejemplo'
  });

  // Factura del trabajo terminado (mano de obra + materiales + km)
  const totalTra1 = 5 * 18000 + (2 * 12500 + 4 * 4800) + 62 * 900;
  const totDemo = totalesConIVA([{ cantidad: 1, precioUnit: totalTra1, iva: 21 }], 21);
  await crearFactura({
    tipo: 'factura', letra: 'B', clienteId: cli.id, fecha: hoy,
    estado: 'pendiente', observaciones: 'Factura de ejemplo',
    subtotal: totDemo.total, neto: totDemo.neto, ivaMonto: totDemo.iva, total: totDemo.total
  }, [
    { trabajoId: tra1.id, descripcion: 'Cambio de cueros y aletas — Molino Norte #1', cantidad: 1, precioUnit: totalTra1, iva: 21 }
  ]);

  // Gastos del trabajo
  await crearGasto({ descripcion: 'Combustible viaje', categoria: 'combustible', monto: 45000, fecha: hoy, trabajoId: tra1.id });
  await crearGasto({ descripcion: 'Peaje', categoria: 'peajes', monto: 3200, fecha: hoy, trabajoId: tra1.id });

  // Vehículo
  await crearVehiculo({
    nombre: 'Camioneta (DEMO)', patente: 'ABC123',
    kmActual: 125000, costoKm: 900,
    observaciones: 'Vehículo de ejemplo'
  });

  snack('Datos de ejemplo cargados');
  return true;
}

// Mejora una sola vez las demos sembradas antes de que existieran los
// establecimientos: crea "Casco" y "Lote 3" (cada uno con su contacto)
// y les asigna las instalaciones de ejemplo existentes.
async function mejorarDemoEstablecimientos() {
  try {
    if (localStorage.getItem('demoEstV1')) return false;
    const clientes = await getClientes();
    const demo = clientes.find(c => /\(DEMO\)/i.test(c.nombre || ''));
    if (!demo) return false;
    const ests = await getEstablecimientosDeCliente(demo.id);
    if (ests.length) {
      try { localStorage.setItem('demoEstV1', '1'); } catch (e) {}
      return false;
    }
    const casco = await crearEstablecimiento({
      clienteId: demo.id, nombre: 'Casco',
      contacto: 'Juan Pérez', telefono: '+54 9 2223 44-0101',
      localidad: 'General Belgrano',
      observaciones: 'Establecimiento de ejemplo'
    });
    const lote3 = await crearEstablecimiento({
      clienteId: demo.id, nombre: 'Lote 3',
      contacto: 'María Gómez', telefono: '+54 9 2223 44-0202',
      localidad: 'General Belgrano',
      observaciones: 'Establecimiento de ejemplo'
    });
    const inss = await getInstalacionesDeCliente(demo.id);
    for (const i of inss) {
      const esLote3 = /lote 3/i.test(i.nombre || '');
      await actualizarInstalacion(Object.assign({}, i, {
        establecimientoId: esLote3 ? lote3.id : casco.id
      }));
    }
    try { localStorage.setItem('demoEstV1', '1'); } catch (e) {}
    return true;
  } catch (e) { console.warn('No se pudo mejorar la demo:', e); return false; }
}
