/* Tests: pestaña Empresa, condición fiscal, letra A/B/C e IVA.
   node test-empresa-fiscal.js */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const RAIZ = path.join(__dirname, 'pwa');
let ok = 0, mal = 0;
function t(nombre, cond) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre); }
}

// ---- Stubs para cargar db.js y pdf.js en Node ----
function DexieStub() {}
DexieStub.prototype.version = function () {
  return { stores: function () { return { upgrade: function () {} }; } };
};
const sandbox = {
  console: console,
  Dexie: DexieStub,
  navigator: { onLine: true },
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  Blob: class {
    constructor(partes, opts) { this._partes = partes; this.type = (opts && opts.type) || ''; this.size = partes.reduce((a, p) => a + p.length, 0); }
    async arrayBuffer() {
      const total = this._partes.reduce((a, p) => a + p.length, 0);
      const u = new Uint8Array(total);
      let o = 0;
      for (const p of this._partes) { u.set(p, o); o += p.length; }
      return u.buffer;
    }
  },
  fetch: async () => { throw new Error('sin red en tests'); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
function cargar(rel) {
  const codigo = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  vm.runInContext(codigo, sandbox, { filename: rel });
}
cargar('db.js');
cargar('js/pdf.js');
const S = (nombre) => vm.runInContext(nombre, sandbox);

console.log('== Cálculos de IVA ==');
{
  const d = S('discriminarIVA')(121, 21);
  t('121 al 21% → neto 100', d.neto === 100);
  t('121 al 21% → iva 21', d.iva === 21);
  const d2 = S('discriminarIVA')(110.5, 10.5);
  t('110.5 al 10,5% → neto 100', d2.neto === 100);
  t('110.5 al 10,5% → iva 10.5', d2.iva === 10.5);
  const d3 = S('discriminarIVA')(100, 0);
  t('exento → neto 100, iva 0', d3.neto === 100 && d3.iva === 0);
  const tot = S('totalesConIVA')([
    { cantidad: 1, precioUnit: 121, iva: 21 },
    { cantidad: 2, precioUnit: 55.25, iva: 10.5 }
  ], 21);
  t('mixto → total 231.5', tot.total === 231.5);
  t('mixto → neto 200', tot.neto === 200);
  t('mixto → iva 31.5', tot.iva === 31.5);
}

console.log('== Fiscales ==');
{
  t('monotributista → letra C', S('letraSugerida')('monotributista') === 'C');
  t('responsable_inscripto → letra B', S('letraSugerida')('responsable_inscripto') === 'B');
  t('nombreCondicionFiscal exento', S('nombreCondicionFiscal')('exento') === 'IVA Exento');
  t('nombreAlicuota 10.5 → 10,5%', S('nombreAlicuota')(10.5) === '10,5%');
  t('nombreAlicuota 0 → Exento', S('nombreAlicuota')(0) === 'Exento');
  t('CONDICIONES_FISCALES tiene 5', Object.keys(S('CONDICIONES_FISCALES')).length === 5);
}

console.log('== Conversores ==');
{
  const c = S('rowToCliente')(S('clienteToRow')({ id: 'x', nombre: 'N', condicionFiscal: 'monotributista' }));
  t('cliente condicionFiscal viaja', c.condicionFiscal === 'monotributista');
  const f = S('rowToFactura')(S('facturaToRow')({ id: 'y', letra: 'B', neto: 100, ivaMonto: 21, total: 121 }));
  t('factura letra viaja', f.letra === 'B');
  t('factura neto/ivaMonto viajan', f.neto === 100 && f.ivaMonto === 21);
  const it = S('rowToFacturaItem')(S('facturaItemToRow')({ id: 'z', facturaId: 'y', iva: 10.5 }));
  t('item iva viaja', it.iva === 10.5);
  const e = S('rowToEmpresa')(S('empresaToRow')({
    nombre: 'Mi Empresa', cuit: '20-1-1', condicionFiscal: 'responsable_inscripto',
    domicilio: 'Ruta 1', localidad: 'Lobos', telefono: '1', email: 'a@b.c',
    puntoVenta: 3, logo: 'data:image/jpeg;base64,AAA'
  }));
  t('empresa id fijo', e.id === 'empresa');
  t('empresa campos viajan', e.nombre === 'Mi Empresa' && e.puntoVenta === 3 && e.logo === 'data:image/jpeg;base64,AAA');
  t('empresa condicionFiscal viaja', e.condicionFiscal === 'responsable_inscripto');
}

console.log('== Esquema (Dexie v5 + Turso) ==');
{
  const dbjs = fs.readFileSync(path.join(RAIZ, 'db.js'), 'utf8');
  t('Dexie version(5)', dbjs.includes('dbLocal.version(5)'));
  t('tabla empresa en Dexie', /empresa:\s*'id'/.test(dbjs));
  const cols = S('COLUMNAS');
  t('COLUMNAS.empresa existe', Array.isArray(cols.empresa) && cols.empresa.includes('logo'));
  t('COLUMNAS.clientes tiene condicion_fiscal', cols.clientes.includes('condicion_fiscal'));
  t('COLUMNAS.facturas tiene letra/neto/iva_monto', cols.facturas.includes('letra') && cols.facturas.includes('neto') && cols.facturas.includes('iva_monto'));
  t('COLUMNAS.factura_items tiene iva', cols.factura_items.includes('iva'));
  const ddl = S('TURSO_DDL').join('\n');
  t('DDL crea tabla empresa', /CREATE TABLE IF NOT EXISTS empresa/.test(ddl));
  t('DDL ALTER clientes condicion_fiscal', ddl.includes('ALTER TABLE clientes ADD COLUMN condicion_fiscal TEXT'));
  t('DDL ALTER facturas letra/neto/iva_monto', ddl.includes('ALTER TABLE facturas ADD COLUMN letra TEXT') && ddl.includes('ALTER TABLE facturas ADD COLUMN neto REAL') && ddl.includes('ALTER TABLE facturas ADD COLUMN iva_monto REAL'));
  t('DDL ALTER factura_items iva', ddl.includes('ALTER TABLE factura_items ADD COLUMN iva REAL'));
}

console.log('== JPEG / logo ==');
{
  // JPEG sintético: SOI + APP0 + SOF0 (100x72) + EOI
  const jpg = Buffer.from([
    0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x48, 0x00, 0x64, 0x01, 0x01, 0x11, 0x00,
    0xFF, 0xD9
  ]);
  const d = S('jpegDims')(new Uint8Array(jpg));
  t('jpegDims 100x72', d && d.w === 100 && d.h === 72);
  const du = 'data:image/jpeg;base64,' + jpg.toString('base64');
  const l = S('logoParaPDF')(du);
  t('logoParaPDF extrae bytes y dims', l && l.w === 100 && l.h === 72 && l.bytes.length === jpg.length);
  t('logoParaPDF rechaza PNG', S('logoParaPDF')('data:image/png;base64,AAA') === null);
  t('logoParaPDF rechaza vacío', S('logoParaPDF')(null) === null);
}

console.log('== PDF con empresa y logo ==');
(async () => {
  const generarPDF = S('generarPDF');
  const jpg = Buffer.from([
    0xFF, 0xD8,
    0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x48, 0x00, 0x64, 0x01, 0x01, 0x11, 0x00,
    0xFF, 0xD9
  ]);
  const du = 'data:image/jpeg;base64,' + jpg.toString('base64');
  const doc = {
    titulo: 'Factura B', numero: '00000042', fecha: '30/09/2026', estado: 'Pendiente',
    empresa: {
      nombre: 'Molinero Demo', cuit: '20-87654321-9', condicionFiscal: 'Monotributista',
      domicilio: 'Ruta 29 km 12', localidad: 'General Belgrano',
      telefono: '02223-550011', email: 'demo@molinero.com', logo: du
    },
    cliente: { nombre: 'Estancia La Prueba', condicionFiscal: 'Responsable Inscripto', cuit: '20-12345678-9' },
    items: [{ cantidad: 1, descripcion: 'Cambio de cueros y aletas', precioUnit: 121000 }],
    neto: 100000, iva: 21000, total: 121000,
    observaciones: ''
  };
  const blob = generarPDF(doc);
  const buf = Buffer.from(await blob.arrayBuffer());
  const txt = buf.toString('latin1');
  t('es PDF válido', txt.startsWith('%PDF-1.4') && txt.trimEnd().endsWith('%%EOF'));
  t('incrusta logo (/ImLogo + DCTDecode)', txt.includes('/ImLogo') && txt.includes('/DCTDecode'));
  t('título FACTURA B', txt.includes('FACTURA B'));
  t('empresa en el PDF', txt.includes('Molinero Demo') && txt.includes('20-87654321-9'));
  t('condición fiscal cliente', txt.includes('Responsable Inscripto'));
  t('discrimina Neto e IVA', txt.includes('Neto:') && txt.includes('IVA:') && txt.includes('TOTAL:'));
  // xref válido
  const m = txt.match(/startxref\s+(\d+)/);
  const pos = m ? parseInt(m[1], 10) : -1;
  t('xref apunta bien', pos > 0 && buf.toString('latin1', pos, pos + 4) === 'xref');

  const blob2 = generarPDF(Object.assign({}, doc, { empresa: { nombre: 'Sin logo' } }));
  const txt2 = Buffer.from(await blob2.arrayBuffer()).toString('latin1');
  t('sin logo no hay /ImLogo', !txt2.includes('/ImLogo'));
  t('sin logo sigue válido', txt2.startsWith('%PDF-1.4') && txt2.trimEnd().endsWith('%%EOF'));

  console.log('\n' + ok + ' ok, ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})();
