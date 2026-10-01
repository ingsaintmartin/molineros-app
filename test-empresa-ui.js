/* Tests de integración UI: empresa, condición fiscal, letra e IVA.
   node test-empresa-ui.js */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, 'pwa');
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), 'utf8');
let ok = 0, mal = 0;
function t(nombre, cond) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre); }
}

const empresa = leer('js/t-empresa.js');
t('Pantallas.empresa definida', /Pantallas\.empresa\s*=/.test(empresa));
t('empresa render + bind', /async render\(\)/.test(empresa) && /async bind\(\)/.test(empresa));
t('form: nombre/cuit/condición/domicilio', /emp-nombre/.test(empresa) && /emp-cuit/.test(empresa) && /emp-cond/.test(empresa) && /emp-dom/.test(empresa));
t('form: punto de venta', /emp-pv/.test(empresa));
t('logo: cargar con procesarFoto', /emp-logo-input/.test(empresa) && /procesarFoto/.test(empresa));
t('guarda con guardarEmpresa', /guardarEmpresa/.test(empresa));
t('usa CONDICIONES_FISCALES', /CONDICIONES_FISCALES/.test(empresa));

const index = leer('index.html');
t('Empresa accesible desde Más', /tab: 'empresa'/.test(leer('js/t-mas.js')));
t('script t-empresa.js incluido', /js\/t-empresa\.js/.test(index));

const cli = leer('js/t-clientes.js');
t('cliente form: select condición fiscal', /clif-cond/.test(cli));
t('cliente guarda condicionFiscal', /condicionFiscal: val\('clif-cond'\)/.test(cli));
t('cliente detalle muestra cond. fiscal', /nombreCondicionFiscal\(c\.condicionFiscal\)/.test(cli));

const fac = leer('js/t-facturacion.js');
t('factura form: select letra', /facLetra/.test(fac) && /facLetraWrap/.test(fac));
t('letra visible solo en facturas', /tipoSel\.value === 'factura'/.test(fac));
t('letra sugerida por emisor y receptor', /determinarLetraFactura\(_facCondicionEmisor, clienteObjeto/.test(fac));
t('ítem: select IVA', /data-f-iva/.test(fac) && /facIvaOptionsHTML/.test(fac));
t('ítem lee iva', /parseFloat\(ivaSel\.value\)/.test(fac));
t('totales Neto/IVA/Total', /facNeto/.test(fac) && /facIva/.test(fac) && /facTotal/.test(fac));
t('usa totalesConIVA', /totalesConIVA\(/.test(fac));
t('guarda letra/neto/ivaMonto', /datos\.neto = tot\.neto/.test(fac) && /datos\.ivaMonto = tot\.iva/.test(fac));
t('detalle: título con letra', /nombreTipoDoc\(f\.tipo\) \+ \(\(f\.tipo === 'factura' && f\.letra\)/.test(fac));
t('detalle: discrimina neto/IVA', /totalesConIVA\(items, 21/.test(fac));
t('lista: letra en la fila', /const letra = \(f\.tipo === 'factura' && f\.letra\)/.test(fac));
t('facturación continúa desde el trabajo', /Continuar con el trabajo/.test(fac));
t('desglose conserva IVA de conceptos ejecutados', /iva: it\.iva == null \? 21 : it\.iva/.test(fac));
t('estados presupuesto: aceptado/rechazado', /'aceptado', 'rechazado'/.test(fac) && /f\.tipo === 'presupuesto'/.test(fac));
t('detalle: botón Descargar PDF', /data-descargar-pdf/.test(fac) && /descargarDocumentoPDF\(id\)/.test(fac));
t('form: selector modo IVA (facIvaModo)', /facIvaModo/.test(fac) && /Más IVA/.test(fac));
t('form: recalcula con facModoIVA', /function facModoIVA/.test(fac) && /totalesConIVA\(facLeerItems\(\), 21, facModoIVA\(\)\)/.test(fac));
t('guarda ivaIncluido + recalcula al editar', /ivaIncluido: facModoIVA\(\)/.test(fac) && /f\.ivaIncluido = datos\.ivaIncluido/.test(fac));
t('detalle: muestra modo de precios', /Precios.*Con IVA incluido.*Más IVA/s.test(fac));
t('aceptado → crearTrabajoDesdePresupuesto', /crearTrabajoDesdePresupuesto\(id\)/.test(fac));
t('detalle: sección Órdenes de trabajo', /Órdenes de trabajo/.test(fac) && /data-nuevo-trabajo/.test(fac) && /data-ir-trabajo/.test(fac));
t('desglose conserva modo de precios del trabajo', /ivaIncluido: t\.ivaIncluido !== false/.test(fac));

const pdf = leer('js/pdf.js');
t('pdf: encabezado empresa', /doc\.empresa/.test(pdf));
t('pdf: incrusta logo JPEG', /\/ImLogo/.test(pdf) && /DCTDecode/.test(pdf));
t('pdf: jpegDims', /function jpegDims/.test(pdf));
t('pdf: cliente con cond. fiscal', /cli\.condicionFiscal/.test(pdf));
t('pdf: discrimina neto/IVA', /'Neto:'/.test(pdf) && /IVA: /.test(pdf));
t('compartir: pasa empresa y totales', /empresa: \{/.test(pdf) && /neto: tot\.neto/.test(pdf));
t('pdf: fuentes con WinAnsiEncoding (Nº/—)', /\/Encoding \/WinAnsiEncoding/.test(pdf));
t('pdf: aclara modo IVA', /modoIVA/.test(pdf) && /Precios con IVA incluido/.test(pdf) && /Precios más IVA/.test(pdf));
t('pdf: columna IVA por ítem', /tb2\('IVA', xIVA/.test(pdf));
t('pdf: Subtotal cuando es más IVA', /Subtotal:/.test(pdf));

const idx = leer('index.html');
t('index.html carga t-empresa.js', idx.includes('js/t-empresa.js'));

const sw = leer('service-worker.js');
t('SW tiene versión de caché', /molineroapp-v\d+/.test(sw));
t('SW precachea t-empresa.js', sw.includes("'./js/t-empresa.js'"));

const tra = leer('js/t-trabajos.js');
t('trabajo detalle: link al presupuesto', /data-go-presupuesto/.test(tra));
t('trabajo form: preserva presupuestoId', /traPresupuestoId/.test(tra) && /datos\.presupuestoId/.test(tra));
t('trabajo form: viáticos km × l/km × $/l', /traLitrosKm/.test(tra) && /traPrecioLitro/.test(tra));
t('trabajo detalle: viaje como km × l/km × $/l', /l\/km/.test(tra));
t('trabajo detalle: monto manual según presupuesto', /según presupuesto/.test(tra));

const gas = leer('js/t-gastos.js');
t('vehículo form: litros de gasoil por km', /vehLitrosKm/.test(gas));
t('vehículo no reemplaza la tarifa de viáticos por consumo', !/inpLitrosKm/.test(tra) && /Litros cobrados por km de ida/.test(tra));

const mas = leer('js/t-mas.js');
t('config: precio del litro de gasoil', /cfgPrecioLitro/.test(mas));

const db = leer('db.js');
t('db: crearTrabajoDesdePresupuesto', /async function crearTrabajoDesdePresupuesto/.test(db));
t('db: getTrabajosDePresupuesto', /async function getTrabajosDePresupuesto/.test(db));
t('db: guardarItemsFactura', /async function guardarItemsFactura/.test(db));
t('db: desvincularTrabajosDePresupuesto', /async function desvincularTrabajosDePresupuesto/.test(db));
t('db: eliminarPresupuesto', /async function eliminarPresupuesto/.test(db));

const facJs = leer('js/t-facturacion.js');
t('flujo: botón crear orden en presupuesto aceptado', /data-crear-orden/.test(facJs));
t('flujo: texto crear orden de trabajo', /Crear orden de trabajo/.test(facJs));
t('flujo: edición de documento e ítems juntos', /guardarDocumentoConItems/.test(facJs));
t('flujo: ya no dice "eliminá y creá de nuevo"', !/eliminá y creá de nuevo/.test(facJs));
t('flujo: aviso de orden existente al editar', /no modifican las órdenes existentes/.test(facJs));
t('flujo: eliminar presupuesto desvincula', /eliminarPresupuesto/.test(facJs));
t('flujo: continúa sólo desde presupuesto aceptado', /f\.estado === 'aceptado'/.test(facJs));
t('flujo: trabajoId se conserva en atributo dataset', /data-trabajo-id/.test(facJs));
t('flujo: agregar ítem también al editar', /facAddItem/.test(facJs));

const seed = leer('js/seed.js');
t('seed: empresa demo', /guardarEmpresa/.test(seed));
t('seed: cliente demo con condición fiscal', /condicionFiscal: 'responsable_inscripto'/.test(seed));
t('seed: factura demo con letra B e IVA', /letra: 'B'/.test(seed) && /iva: 21/.test(seed));

console.log('\n' + ok + ' ok, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
