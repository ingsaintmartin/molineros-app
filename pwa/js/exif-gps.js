/* ============================================================
   MolineroApp v2 - Lector de GPS desde fotos (EXIF)
   Lee la ubicación guardada en los metadatos EXIF de un JPEG
   sin ninguna dependencia. Devuelve {lat, lng} o null.
   Uso: const gps = await leerGPSDeFoto(file);
   ============================================================ */

function leerGPSDeFoto(archivo) {
  return new Promise(resolve => {
    if (!archivo) { resolve(null); return; }
    const lector = new FileReader();
    lector.onload = () => {
      try {
        resolve(extraerGPS(new DataView(lector.result)));
      } catch (e) {
        resolve(null);
      }
    };
    lector.onerror = () => resolve(null);
    // Alcanzan los primeros 128 KB: el EXIF va al principio del JPEG
    lector.readAsArrayBuffer(archivo.slice(0, 131072));
  });
}

function extraerGPS(view) {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null; // no es JPEG
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xFF) break;
    const marcador = view.getUint8(offset + 1);
    const largo = view.getUint16(offset + 2);
    if (marcador === 0xFFE1 && largo > 14) { // APP1
      const inicio = offset + 4;
      if (leerASCII(view, inicio, 4) === 'Exif') {
        const gps = leerIFDGPS(view, inicio + 6);
        if (gps) return gps;
      }
    }
    if (marcador === 0xFFDA) break; // inicio de los datos de imagen
    offset += 2 + largo;
  }
  return null;
}

function leerASCII(view, offset, largo) {
  let s = '';
  for (let i = 0; i < largo; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

function leerIFDGPS(view, tiff) {
  const le = view.getUint16(tiff) === 0x4949; // "II" = little endian
  const get16 = o => view.getUint16(o, le);
  const get32 = o => view.getUint32(o, le);

  // IFD0: buscar el tag GPS (0x8825)
  const n0 = get16(tiff + 8);
  let gpsOffset = 0;
  for (let i = 0; i < n0; i++) {
    const e = tiff + 8 + 2 + i * 12;
    if (get16(e) === 0x8825) { gpsOffset = tiff + get32(e + 8); break; }
  }
  if (!gpsOffset) return null;

  // IFD GPS: refs y coordenadas
  const n = get16(gpsOffset);
  let latRef = 'N', lngRef = 'E', lat = null, lng = null;
  for (let i = 0; i < n; i++) {
    const e = gpsOffset + 2 + i * 12;
    const tag = get16(e), tipo = get16(e + 2), cuenta = get32(e + 4);
    const valOff = e + 8;
    const bytes = [1, 1, 2, 4, 8][tipo - 1] * cuenta || 0;
    const datos = bytes <= 4 ? valOff : tiff + get32(valOff);
    if (tag === 0x0001) latRef = leerASCII(view, datos, 1);
    else if (tag === 0x0003) lngRef = leerASCII(view, datos, 1);
    else if (tag === 0x0002) lat = leerDMS(view, datos, le);
    else if (tag === 0x0004) lng = leerDMS(view, datos, le);
  }
  if (lat === null || lng === null) return null;
  if (latRef === 'S') lat = -lat;
  if (lngRef === 'W') lng = -lng;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
}

function leerDMS(view, offset, le) {
  const r = i => {
    const num = view.getUint32(offset + i * 8, le);
    const den = view.getUint32(offset + i * 8 + 4, le);
    return den ? num / den : 0;
  };
  return r(0) + r(1) / 60 + r(2) / 3600;
}
