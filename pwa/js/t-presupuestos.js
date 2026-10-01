/* ============================================================
   MolineroApp v2 - Pestaña Presupuestos
   Acceso directo a los presupuestos (documentos tipo 'presupuesto').
   Reutiliza las vistas de t-facturacion.js pero navegando dentro de
   esta pestaña: _usarTabDoc('presupuestos').
   Vistas: lista | detalle | form
   ============================================================ */

Pantallas.presupuestos = {
  titulo: 'Presupuestos',

  async render(params) {
    _usarTabDoc('presupuestos');
    const vista = params.vista || 'lista';
    if (vista === 'detalle') return await facDetalleHTML(params.id);
    if (vista === 'form')    return await facFormHTML(Object.assign({}, params, { tipo: 'presupuesto' }));
    return await facListaHTML('presupuesto', true);
  },

  async bind(params) {
    _usarTabDoc('presupuestos');
    const vista = params.vista || 'lista';
    if (vista === 'lista')   facListaBind('presupuesto');
    if (vista === 'detalle') facDetalleBind(params.id);
    if (vista === 'form')    await facFormBind(params);
  }
};
