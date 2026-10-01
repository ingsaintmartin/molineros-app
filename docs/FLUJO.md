# Presupuesto, trabajo, liquidación y cobro

## Desarrollo local

Desde la raíz del repositorio:

```text
npm ci
npm test
npm run dev
```

La app se abre en http://127.0.0.1:4173. El servidor local entrega una configuración sin nube para evitar que los datos de prueba se mezclen con los datos reales. Las pruebas de datos usan una IndexedDB simulada y no acceden a Turso.

## Recorrido principal

1. Configurar el emisor en **Más → Mi empresa**. La condición fiscal determina la letra y el tratamiento de IVA.
2. Elegir el cliente y su instalación desde **Presupuestos**, o crear el presupuesto desde la ficha del cliente.
3. Cargar los conceptos: repuesto/material, servicio/mano de obra, traslado o viático. Los servicios habituales permiten iniciar un renglón sin escribir la descripción completa.
4. Registrar validez, alcance, exclusiones y forma de pago. Compartir el PDF del presupuesto.
5. Aceptar y registrar quién aprobó. La app crea una orden vinculada al cliente e instalación, con los conceptos acordados y su modo de precios. El presupuesto aceptado se conserva en la interfaz.
6. Ajustar el trabajo con cantidades y costos reales, horas, vehículo, kilómetros totales, fotos, tareas y gastos directos. Los costos faltantes se señalan como margen estimado.
7. Pasar el trabajo a **Terminado** y abrir **Revisar liquidación**. Se utiliza el detalle final del trabajo, sin volver a sumar los renglones del presupuesto.
8. Revisar y guardar el documento interno. El guardado impide incluir el mismo trabajo en otra factura activa.
9. Emitir la factura fiscal por ARCA o por el sistema autorizado habitual. En el documento interno, usar **Registrar factura emitida** para conservar punto de venta, número, fecha y CAE. Esta referencia se carga manualmente; la app no valida el CAE contra ARCA.
10. Registrar uno o varios cobros. Cada cobro genera un recibo interno, actualiza el saldo y deriva el estado **Cobro parcial** o **Cobrada**. Los recibos no vuelven a crear deuda.

Una urgencia puede comenzar directamente en **Nuevo trabajo**. No requiere presupuesto previo.

## IVA y costos

- Monotributista: comprobante C, importes finales sin IVA discriminado.
- Responsable inscripto: A para receptores responsables inscriptos o monotributistas; B para consumidor final o exento, conforme a la autorización que corresponda al emisor. La app prepara la referencia de clase, pero no gestiona autorizaciones fiscales especiales.
- En los trabajos de responsables inscriptos, el IVA de venta se excluye del ingreso utilizado para calcular el margen. El importe para facturar conserva el IVA.
- Los costos internos deben cargarse con el criterio fiscal que corresponda: para un responsable inscripto, excluir únicamente el IVA efectivamente recuperable; para un monotributista, considerar los importes que integran su costo.
- Un gasto adicional asignado al trabajo integra su costo. Si ya estaba incluido en los conceptos o en el costo por kilómetro, debe marcarse así para evitar duplicarlo.
- Las compras para stock se consideran costo al consumir el repuesto. El listado de gastos conserva el registro del desembolso.
- El costo por kilómetro del vehículo queda capturado al guardar el trabajo. Los cambios posteriores en el vehículo no recalculan ese costo histórico.

## Repuestos

Los materiales de trabajos pendientes se reservan, sin descontar el stock físico. Al comenzar o terminar el trabajo pasan a consumo. Stock muestra existencias, reservas y disponibilidad. Editar la orden no descuenta otra vez los mismos repuestos. Si las existencias son insuficientes, el guardado de trabajo y materiales se revierte.

Los registros anteriores, que ya descontaban stock al guardar, conservan ese tratamiento. Los repuestos consumidos no se devuelven automáticamente por pausar la orden. Quitar un material o eliminar la orden devuelve su cantidad consumida, por lo que debe reflejar una devolución real.

## Cuenta corriente

**Por cobrar** incluye los saldos de facturas activas. **Pendiente de facturar** muestra aparte el precio final de trabajos terminados sin factura activa. Una factura anulada libera la vinculación comercial del trabajo. Las facturas con cobros o referencia fiscal y los recibos vinculados se conservan.

Los estados comerciales en la lista de trabajos se derivan de documentos y saldos. Los estados operativos se gestionan por separado: pendiente, en curso, pausado, terminado o cancelado.

## Alcance de esta etapa

Esta versión gestiona el circuito local y la referencia a facturas externas. No emite facturas electrónicas, no solicita CAE ni reemplaza el sistema fiscal autorizado. Los PDF de liquidaciones se identifican como documentos internos sin validez fiscal.

La gestión detallada de visitas dentro de una misma orden, las ampliaciones versionadas, los anticipos independientes y la facturación parcial por cantidades quedan para una etapa posterior. Actualmente un trabajo se incluye completo en una factura activa.

Las pruebas cubren cálculos y mapeos, presupuesto a orden, facturación sin duplicación, pagos parciales, recibos, respaldo, costos directos, IVA y reserva/consumo de stock con reversión ante errores.
