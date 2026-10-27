# Modelo de Casa al Día — 27 de octubre de 2026

## Acuerdos confirmados por Erick
- Renta: total $18,500 mensual, vencimiento día 15. Cuotas: Erick $6,000; Axel $5,500; Marbet $7,000. Es la excepción al reparto igualitario.
- Los tres pagos mostrados corresponden a octubre. El periodo noviembre de Marbet era una clasificación incorrecta.
- Internet fijo mensual, partes iguales entre los tres.
- Luz, agua y gas: importe real de cada recibo y periodicidad configurada, partes iguales entre los tres. No inferir que todos vencen el mismo día o son todos bimestrales.
- Otros gastos: partes iguales entre los participantes seleccionados, incluso por producto de un mismo ticket.
- Los porcentajes muestran avance de aportaciones, no pesos de reparto.

## Responsabilidades de las pantallas
Inicio: prioridades. Espacios: ubicación física. Por comprar: planificación de reposición. Inventario: existencias y consumo. Servicios: contratos, vencimientos y aportaciones a recibos. Cuentas: gasto comprometido y saldo acumulado. Reportes: ciclos y presupuesto. Ajustes: integrantes y preferencias.
Compra → movimiento + reparto + existencias, en una transacción.
Consumo → disminuye existencias, sin volver a cobrar la compra.
Un artículo personal conserva participantes propios en su línea de ticket.

## Recibos y pagos
Un servicio es una plantilla. Cada vencimiento tiene un billReceipts/{billId-fecha} con total y reparto congelados. Las billPayments son aportaciones ligadas a ese recibo. El primer pago confirma el total; pagos siguientes no lo cambian. Puede ser parcial o cubrirlo completo. El calendario avanza solo cuando las aportaciones cubren el total. Anular una aportación reabre el vencimiento. La cuota y el pago son conceptos diferentes: adelantar parte ajena crea saldo a favor, nunca otra copia del gasto.
El importe estimado es para planear; el recibo real es el compromiso. Reportes cuentan el recibo una sola vez por vencimiento; aportaciones no crean gastos adicionales. Historial legado conserva su criterio de fecha de pago hasta conciliación.
Los porcentajes se limitan al 100%; el exceso se muestra como adelanto.
El pendiente de aportaciones no certifica que un proveedor recibió una transferencia: esta versión registra pagos efectivamente destinados al servicio. Si se necesita una caja común con dinero custodiado y pago posterior al proveedor, requiere un libro de caja adicional; no usar aportaciones como promesas.
No se cierra un ciclo con recibos nuevos pendientes, pues impediría completar sus pagos con el modelo actual de periodos protegidos.
La corrección de aportaciones nuevas es anulación + nueva captura, conservando recibo y cuotas. Corregir el total de un recibo ya confirmado requiere conciliación administrativa; la interfaz lo bloquea.

## Migración, sin ejecutar en producción
1. Respaldo completo y restauración de prueba; congelar capturas durante la migración.
2. Ejecutar scripts/consolidate-rent.js en dry-run. Valida exactamente las tres plantillas y sus pagos vistos. Aplicación exige RENT_MIGRATION_BACKUP_CONFIRMED=yes y --apply.
3. La consolidación conserva originales en un comprobante de auditoría, archiva plantillas anteriores y mueve pagos al recibo único de octubre. Corrige periodo de Marbet, sin cambiar montos ni fechas reales.
4. Luego ejecutar migración genérica y auditoría. Para movimientos antiguos NO asumir que todos beneficiaron a tres: conciliar participantes por operación.
5. Conservar ciclo presupuestal día 12; el vencimiento de renta día 15 no lo modifica.
6. Resolver presupuesto $36,230 frente a categorías $6,730 antes de interpretar desvíos; no ajustar automáticamente.
7. Validar staging con cuentas autorizadas, reglas, APIs y datos restaurados. Solo después activar producción.
