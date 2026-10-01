/* ============================================================
   MolineroApp v2 - Datos de ejemplo (demo)
   Crea un cliente de prueba con instalaciones georreferenciadas,
   trabajos, stock, factura, gastos y un vehículo.
   Todo pasa por las funciones normales de db.js, así que entra
   en la cola de sincronización y sube a la nube si hay conexión.
   ============================================================ */

async function cargarDatosEjemplo() {
  const existentes = await getClientes();
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
    telefono: '02223-440011',
    observaciones: 'Cliente de prueba cargado automáticamente. Se puede borrar desde Más → datos.'
  });

  // Instalaciones georreferenciadas
  const molino = await crearInstalacion({
    clienteId: cli.id, tipo: 'molino', nombre: 'Molino Norte #1',
    marca: 'Fiasa', modelo: '8 pies', estado: 'operativo',
    lat: -35.8231, lng: -58.5023,
    caracteristicas: { diametro: '8 pies', altura: '12 m', orientacion: 'Norte' },
    observaciones: 'Instalación de ejemplo'
  });
  const tanque = await crearInstalacion({
    clienteId: cli.id, tipo: 'tanque', nombre: 'Tanque Australiano',
    estado: 'operativo', lat: -35.8245, lng: -58.5001,
    caracteristicas: { capacidad: '20000 l', diametro: '5 m' },
    observaciones: 'Instalación de ejemplo'
  });
  const bebedero = await crearInstalacion({
    clienteId: cli.id, tipo: 'bebedero', nombre: 'Bebedero Lote 3',
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
  await crearFactura({
    tipo: 'factura', clienteId: cli.id, fecha: hoy,
    estado: 'pendiente', observaciones: 'Factura de ejemplo'
  }, [
    { trabajoId: tra1.id, descripcion: 'Cambio de cueros y aletas — Molino Norte #1', cantidad: 1, precioUnit: totalTra1 }
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
