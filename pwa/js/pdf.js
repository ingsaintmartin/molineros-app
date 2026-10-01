/* ============================================================
   MolineroApp - Generador de PDF (sin dependencias, offline)
   Genera presupuestos/facturas/recibos en PDF (A4) con las
   fuentes base de PDF (Helvetica), y los comparte por WhatsApp,
   email u otra app mediante la hoja de compartir del sistema.
   ============================================================ */

// Texto JS -> bytes WinAnsi con escapes de PDF \\ ( )
function pdfTextoBytes(s) {
  const mapa = {
    '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92,
    '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85, '€': 0x80
  };
  const out = [];
  const t = String(s === null || s === undefined ? '' : s);
  for (const ch of t) {
    const c = ch.codePointAt(0);
    if (c === 0x28 || c === 0x29 || c === 0x5C) { out.push(0x5C, c); continue; }
    if (c < 128) { out.push(c); continue; }
    if (mapa[ch] !== undefined) { out.push(mapa[ch]); continue; }
    // Latin-1 coincide con WinAnsi salvo 5 códigos sin uso en español
    if (c >= 0xA0 && c <= 0xFF && c !== 0x81 && c !== 0x8D &&
        c !== 0x8F && c !== 0x90 && c !== 0x9D) { out.push(c); continue; }
    out.push(0x3F); // '?'
  }
  return out;
}

function pdfAscii(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0x7F);
  return out;
}

function base64ABytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Dimensiones de un JPEG (busca el marcador SOF). Devuelve {w,h} o null.
function jpegDims(bytes) {
  if (!bytes || bytes.length < 10 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    const m = bytes[i + 1];
    if (m === 0xD8 || m === 0xD9 || m === 0x01) { i += 2; continue; }
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      const h = (bytes[i + 5] << 8) | bytes[i + 6];
      const w = (bytes[i + 7] << 8) | bytes[i + 8];
      return (w > 0 && h > 0) ? { w: w, h: h } : null;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

// Extrae {bytes, w, h} del logo (dataURL JPEG) o null si no es usable
function logoParaPDF(dataUrl) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const m = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/);
    if (!m) return null;
    const bytes = base64ABytes(m[1]);
    const d = jpegDims(bytes);
    if (!d) return null;
    return { bytes: bytes, w: d.w, h: d.h };
  } catch (e) {
    return null;
  }
}

// Corta un texto en líneas de hasta `maxChars` caracteres
function pdfEnvolver(texto, maxChars) {
  const palabras = String(texto || '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    if ((actual + ' ' + p).trim().length > maxChars && actual) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = (actual ? actual + ' ' : '') + p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [''];
}

/* doc = {
     titulo: 'FACTURA B', numero: '0001', fecha: '01/10/2026',
     estado: 'pendiente',
     empresa: { nombre, cuit, condicionFiscal, domicilio, localidad,
                telefono, email, logo (dataURL JPEG) },
     cliente: { nombre, localidad, telefono, cuit, condicionFiscal },
     items: [{ cantidad, descripcion, precioUnit }],
     neto, iva, total, observaciones, pie
   }
   Devuelve Blob application/pdf. */
function generarPDF(doc) {
  const ANCHO = 595, ALTO = 842, MARGEN = 48;
  const bytes = [];
  const offsets = [0];
  const push = (arr) => { offsets.push(bytes.length); for (const b of arr) bytes.push(b); };

  const logo = logoParaPDF(doc.empresa && doc.empresa.logo);

  const paginas = []; // cada una: array de comandos (arrays de bytes)
  let cmds = [];
  let y = 0;
  const nuevaPagina = () => {
    if (cmds.length) paginas.push(cmds);
    cmds = [];
    y = ALTO - MARGEN;
  };
  const linea = (texto, x, tam, negrita) => {
    if (y < MARGEN + 20) nuevaPagina();
    const tb = pdfTextoBytes(texto);
    cmds.push(pdfAscii('BT /' + (negrita ? 'F2' : 'F1') + ' ' + tam + ' Tf ' +
      x.toFixed(1) + ' ' + y.toFixed(1) + ' Td ('));
    cmds.push(tb);
    cmds.push(pdfAscii(') Tj ET\n'));
    y -= tam * 1.35;
  };
  const espacio = (n) => { y -= (n || 8); if (y < MARGEN + 20) nuevaPagina(); };
  const regla = () => {
    if (y < MARGEN + 20) nuevaPagina();
    cmds.push(pdfAscii('0.75 G 0.75 w ' + MARGEN + ' ' + y.toFixed(1) +
      ' m ' + (ANCHO - MARGEN) + ' ' + y.toFixed(1) + ' l S 0 G\n'));
    y -= 10;
  };

  // ---- Contenido ----
  nuevaPagina();

  // Encabezado de la empresa (logo + datos fiscales)
  const emp = doc.empresa || {};
  let xTexto = MARGEN;
  let logoH = 0;
  if (logo) {
    const escala = Math.min(110 / logo.w, 64 / logo.h, 1);
    const lw = logo.w * escala, lh = logo.h * escala;
    logoH = lh;
    cmds.push(pdfAscii('q ' + lw.toFixed(1) + ' 0 0 ' + lh.toFixed(1) + ' ' +
      MARGEN.toFixed(1) + ' ' + (y - lh).toFixed(1) + ' cm /ImLogo Do Q\n'));
    xTexto = MARGEN + lw + 12;
  }
  if (emp.nombre) {
    linea(emp.nombre, xTexto, 14, true);
    const fisc = [emp.cuit ? 'CUIT ' + emp.cuit : null,
      emp.condicionFiscal ? emp.condicionFiscal : null].filter(Boolean).join(' · ');
    if (fisc) linea(fisc, xTexto, 10, false);
    const dom = [emp.domicilio, emp.localidad].filter(Boolean).join(' — ');
    if (dom) linea(dom, xTexto, 10, false);
    const tel = [emp.telefono, emp.email].filter(Boolean).join(' · ');
    if (tel) linea(tel, xTexto, 10, false);
  }
  if (logoH > 0) y = Math.min(y, ALTO - MARGEN - logoH - 8);
  espacio(4);
  regla();
  espacio(4);

  const titulo = (doc.titulo || 'DOCUMENTO').toUpperCase();
  linea(titulo + ' Nº ' + (doc.numero || '—'), MARGEN, 18, true);
  espacio(2);
  linea('Fecha: ' + (doc.fecha || '—'), MARGEN, 11, false);
  if (doc.estado) linea('Estado: ' + doc.estado, MARGEN, 11, false);
  if (doc.modoIVA) linea(doc.modoIVA, MARGEN, 11, true);
  espacio(6);
  regla();
  espacio(4);
  const cli = doc.cliente || {};
  linea('Cliente: ' + (cli.nombre || '—'), MARGEN, 12, true);
  if (cli.condicionFiscal) linea('Cond. fiscal: ' + cli.condicionFiscal, MARGEN, 10, false);
  if (cli.localidad) linea('Localidad: ' + cli.localidad, MARGEN, 10, false);
  if (cli.telefono) linea('Teléfono: ' + cli.telefono, MARGEN, 10, false);
  if (cli.cuit) linea('CUIT/DNI: ' + cli.cuit, MARGEN, 10, false);
  espacio(6);
  regla();
  espacio(4);

  // Tabla de ítems
  const xCant = MARGEN, xDesc = MARGEN + 44, xIVA = ANCHO - MARGEN - 215,
        xPU = ANCHO - MARGEN - 160, xImp = ANCHO - MARGEN - 75;
  linea('Cant.', xCant, 10, true);
  const yHead = y + 10 * 1.35;
  // (encabezado en la misma línea: retrocedemos)
  y = yHead;
  const tb2 = (t, x, tam, neg) => {
    const tb = pdfTextoBytes(t);
    cmds.push(pdfAscii('BT /' + (neg ? 'F2' : 'F1') + ' ' + tam + ' Tf ' +
      x.toFixed(1) + ' ' + y.toFixed(1) + ' Td ('));
    cmds.push(tb);
    cmds.push(pdfAscii(') Tj ET\n'));
  };
  tb2('Descripción', xDesc, 10, true);
  tb2('IVA', xIVA, 10, true);
  tb2('P. unit.', xPU, 10, true);
  tb2('Importe', xImp, 10, true);
  y -= 10 * 1.35;
  regla();

  const items = doc.items || [];
  const ivaTxtDe = (v) => (v === null || v === undefined || v === '')
    ? '—' : String(v).replace('.', ',') + '%';
  for (const it of items) {
    const cant = parseFloat(it.cantidad) || 0;
    const pu = parseFloat(it.precioUnit) || 0;
    const cantTxt = (Math.round(cant) === cant ? String(cant) : String(Math.round(cant * 100) / 100));
    const lineasDesc = pdfEnvolver(it.descripcion || 'Ítem', 44);
    if (y - lineasDesc.length * 13 < MARGEN + 20) nuevaPagina();
    tb2(cantTxt, xCant, 10, false);
    tb2(ivaTxtDe(it.iva), xIVA, 10, false);
    tb2(formatoPesoPDF(pu), xPU, 10, false);
    tb2(formatoPesoPDF(cant * pu), xImp, 10, true);
    for (const ld of lineasDesc) {
      tb2(ld, xDesc, 10, false);
      y -= 13;
    }
    y -= 3;
  }
  espacio(4);
  regla();
  espacio(2);
  const esMasIVA = doc.modoIVA && doc.modoIVA.indexOf('más IVA') >= 0;
  if (doc.neto !== undefined && doc.neto !== null) {
    tb2((esMasIVA ? 'Subtotal:' : 'Neto:') + ' ' + formatoPesoPDF(doc.neto), xPU - 40, 11, false);
    y -= 11 * 1.35;
    tb2('IVA: ' + formatoPesoPDF(doc.iva || 0), xPU - 40, 11, false);
    y -= 11 * 1.35;
  }
  tb2('TOTAL: ' + formatoPesoPDF(doc.total || 0), xPU - 40, 13, true);
  y -= 13 * 1.35;
  espacio(8);
  if (doc.observaciones) {
    linea('Observaciones:', MARGEN, 11, true);
    for (const ld of pdfEnvolver(doc.observaciones, 90)) linea(ld, MARGEN, 10, false);
    espacio(6);
  }
  espacio(10);
  linea(doc.pie || 'Documento generado con MolineroApp', MARGEN, 9, false);
  if (cmds.length) paginas.push(cmds);

  // ---- Estructura PDF ----
  const nPag = paginas.length;
  // 1: catálogo, 2: páginas, 3..3+nPag-1: páginas, luego fuentes,
  // imagen del logo (si hay) y contenidos
  const idCatalogo = 1, idPaginas = 2;
  const idFuente1 = 3 + nPag, idFuente2 = 4 + nPag;
  const idImagen = logo ? 5 + nPag : null;
  const baseContenido = logo ? 6 + nPag : 5 + nPag;
  const idsContenido = [];
  for (let k = 0; k < nPag; k++) idsContenido.push(baseContenido + k);

  for (const b of pdfAscii('%PDF-1.4\n')) bytes.push(b);
  push(pdfAscii(idCatalogo + ' 0 obj\n<< /Type /Catalog /Pages ' + idPaginas + ' 0 R >>\nendobj\n'));
  const kids = [];
  for (let k = 0; k < nPag; k++) kids.push((3 + k) + ' 0 R');
  push(pdfAscii(idPaginas + ' 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') +
    '] /Count ' + nPag + ' >>\nendobj\n'));
  for (let k = 0; k < nPag; k++) {
    const xobj = logo ? ' /XObject << /ImLogo ' + idImagen + ' 0 R >>' : '';
    push(pdfAscii((3 + k) + ' 0 obj\n<< /Type /Page /Parent ' + idPaginas + ' 0 R ' +
      '/MediaBox [0 0 ' + ANCHO + ' ' + ALTO + '] ' +
      '/Resources << /Font << /F1 ' + idFuente1 + ' 0 R /F2 ' + idFuente2 + ' 0 R >>' + xobj + ' >> ' +
      '/Contents ' + idsContenido[k] + ' 0 R >>\nendobj\n'));
  }
  push(pdfAscii(idFuente1 + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n'));
  push(pdfAscii(idFuente2 + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n'));
  if (logo) {
    push(pdfAscii(idImagen + ' 0 obj\n<< /Type /XObject /Subtype /Image ' +
      '/Width ' + logo.w + ' /Height ' + logo.h + ' /ColorSpace /DeviceRGB ' +
      '/BitsPerComponent 8 /Filter /DCTDecode /Length ' + logo.bytes.length + ' >>\nstream\n'));
    for (const b of logo.bytes) bytes.push(b);
    const finImg = pdfAscii('\nendstream\nendobj\n');
    for (const b of finImg) bytes.push(b);
  }
  for (let k = 0; k < nPag; k++) {
    const contenido = [];
    for (const c of paginas[k]) for (const b of c) contenido.push(b);
    push(pdfAscii(idsContenido[k] + ' 0 obj\n<< /Length ' + contenido.length + ' >>\nstream\n'));
    for (const b of contenido) bytes.push(b);
    const fin = pdfAscii('\nendstream\nendobj\n');
    for (const b of fin) bytes.push(b);
  }

  const xrefPos = bytes.length;
  const total = idsContenido[nPag - 1] + 1;
  let xref = 'xref\n0 ' + total + '\n';
  xref += '0000000000 65535 f \n';
  for (let k = 1; k < total; k++) {
    xref += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
  }
  xref += 'trailer\n<< /Size ' + total + ' /Root ' + idCatalogo + ' 0 R >>\n' +
    'startxref\n' + xrefPos + '\n%%EOF';
  const xa = pdfAscii(xref);
  for (const b of xa) bytes.push(b);

  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

function formatoPesoPDF(n) {
  const v = Math.round((parseFloat(n) || 0) * 100) / 100;
  return '$ ' + v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Arma el PDF de un documento y devuelve { blob, nombreArchivo, titulo }.
// Devuelve null si el documento no existe (ya muestra el aviso).
async function generarDocumentoPDFBlob(id) {
  const f = await getFactura(id);
  if (!f) { snack('Documento no encontrado.'); return null; }
  const items = await getItemsDeFactura(id);
  const cli = f.clienteId ? await getCliente(f.clienteId) : null;
  const empresa = await getEmpresa();
  const tipoDoc = nombreTipoDoc(f.tipo) + ((f.tipo === 'factura' && f.letra) ? ' ' + f.letra : '');
  const tot = (f.neto !== null && f.neto !== undefined)
    ? { total: f.total, neto: f.neto, iva: f.ivaMonto || 0 }
    : totalesConIVA(items, 21, f.ivaIncluido !== false);
  const conIVA = f.ivaIncluido !== false;
  const blob = generarPDF({
    titulo: tipoDoc,
    numero: f.numero || '—',
    fecha: fechaLegible(f.fecha) || '—',
    estado: (typeof ESTADOS_FACTURA !== 'undefined' && ESTADOS_FACTURA[f.estado]) || f.estado || '',
    modoIVA: conIVA ? 'Precios con IVA incluido' : 'Precios más IVA',
    empresa: {
      nombre: empresa.nombre, cuit: empresa.cuit,
      condicionFiscal: nombreCondicionFiscal(empresa.condicionFiscal),
      domicilio: empresa.domicilio, localidad: empresa.localidad,
      telefono: empresa.telefono, email: empresa.email,
      logo: empresa.logo
    },
    cliente: cli ? {
      nombre: cli.nombre, localidad: cli.localidad,
      telefono: cli.telefono, cuit: cli.cuit,
      condicionFiscal: nombreCondicionFiscal(cli.condicionFiscal)
    } : {},
    items: items.map(it => ({
      cantidad: it.cantidad, descripcion: it.descripcion, precioUnit: it.precioUnit,
      iva: (it.iva === null || it.iva === undefined || it.iva === '') ? null : it.iva
    })),
    neto: tot.neto, iva: tot.iva, total: tot.total,
    observaciones: f.observaciones || ''
  });
  const nombreArchivo = (f.tipo || 'documento') + '_' + (f.numero || id) + '.pdf';
  return { blob: blob, nombreArchivo: nombreArchivo, titulo: tipoDoc + ' Nº ' + (f.numero || '') };
}

// Comparte el PDF: en el celular abre la hoja de compartir
// (WhatsApp, email, etc.); donde no hay hoja de compartir, lo descarga.
async function compartirDocumentoPDF(id) {
  const doc = await generarDocumentoPDFBlob(id);
  if (!doc) return;
  const f = await getFactura(id);
  const cli = f.clienteId ? await getCliente(f.clienteId) : null;
  try {
    const archivo = new File([doc.blob], doc.nombreArchivo, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({
        files: [archivo],
        title: doc.titulo,
        text: doc.titulo + ' — ' + (cli ? cli.nombre : '')
      });
      return;
    }
  } catch (e) {
    // Si el usuario cancela la hoja de compartir, no hacemos nada
    if (e && e.name === 'AbortError') return;
  }
  descargarBlobPDF(doc.blob, doc.nombreArchivo);
}

// Descarga directa del PDF (para imprimir o guardar el archivo).
async function descargarDocumentoPDF(id) {
  const doc = await generarDocumentoPDFBlob(id);
  if (!doc) return;
  descargarBlobPDF(doc.blob, doc.nombreArchivo);
}

function descargarBlobPDF(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  snack('PDF descargado: compartilo por WhatsApp o email desde tus archivos.');
}
