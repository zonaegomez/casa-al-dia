# Integridad y límites operativos

## Flujo principal

La interfaz convierte un formulario en un comando con un ID de operación. `store.js` lee documentos vigentes, prepara todos los cambios, verifica ciclos abiertos y confirma una transacción. El comprobante en `operations` impide repetir el mismo comando y conserva UID, tipo, rutas afectadas y valores resumidos anteriores/nuevos. No guarda fotos de tickets ni contraseñas.

Toda operación financiera incrementa `settings/config.revision`. El cierre de servidor participa del mismo documento para serializarse con compras, pagos y cambios de integrantes. Además consulta colecciones completas dentro de su transacción; no cierra sobre las copias parciales del navegador.

Los nuevos pagos de servicios tienen documento propio en `billPayments`. El cliente agrega esos documentos al historial antiguo únicamente para mostrarlo. Los arreglos heredados se leen, pero no se editan desde el cliente. La migración mueve ambos lados atómicamente por servicio.

## Semántica contable

Cada gasto registra `participantIds`; el total se distribuye en centavos, con el residuo asignado en orden de ID para que la suma siempre cuadre. “Pago dividido” registra aportaciones de pagadores, manteniendo separado lo que le correspondía a cada beneficiario. El saldo es lo pagado menos lo correspondiente, ajustado por transferencias. Gastos sin referencias válidas o con aportaciones inconsistentes se muestran como no asignados y no distorsionan los demás saldos.

El saldo de la casa es acumulado. Los filtros de mes/quincena operan sobre gastos, no crean libros de deuda distintos. Una transferencia tiene fecha de registro real. Su endpoint vuelve a leer el libro y la revisión en una transacción de servidor para rechazar sobrepagos y sugerencias obsoletas. Los cierres congelan gastos/presupuestos del ciclo, pero no impiden liquidar después una deuda del saldo acumulado.

El reparto nuevo es igualitario entre miembros activos. Para gastos personales o porcentajes especiales aún se necesita una interfaz explícita de beneficiarios y proporciones; no se pretende deducirlos de cuánto aportó cada persona.

## Seguridad

Solo usuarios con cuenta no anónima y `access/{uid}.enabled == true` pueden operar. No pueden autorizarse a sí mismos. Configuraciones presupuestales y cierres requieren admin. Las reglas protegen creación/modificación de movimientos y pagos en periodos cerrados; los cierres solo se crean desde servidor. Las reglas validan tipos y límites básicos; el núcleo valida repartos, cantidades y consistencia de montos. El cierre vuelve a validar el libro.

El contador `revision` coordina transacciones y cierres; NO es una barrera contra escrituras directas del SDK. Un usuario autorizado puede construir un batch que también incremente ese contador. La autorización real está en Authentication, la lista de acceso y las reglas.

Esto es una aplicación doméstica para un grupo autorizado, no un libro contable legal ni un sistema contra administradores maliciosos. Un integrante autorizado aún puede escribir documentos directamente con su SDK; la validación de cada regla de negocio no está completamente centralizada en servidor. Antes de abrir a terceros, llevar todos los comandos financieros a endpoints y autorizar por casa/rol con esquemas estrictos, no ampliar las reglas actuales.

El lector verifica el token en servidor, consulta la allowlist y limita persistentemente por UID a 2 solicitudes/minuto y 20/día. No devuelve errores privados del proveedor. Las imágenes admitidas se validan por tipo, tamaño y cabecera; la revisión humana del resultado sigue siendo obligatoria. Configurar en Firestore una política TTL para `apiUsage.expiresAt` permite retirar contadores vencidos sin tocar los registros financieros.

## Desconexión y crecimiento

No se escriben cambios durante desconexión o sincronización incompleta. Los datos locales anteriores solo se ofrecen para descargar. Un fallo de cuota, permisos o red se muestra al usuario, sin convertirlo en un guardado local aparentemente exitoso. No hay sincronización offline implementada ni se promete.

El límite de 400 movimientos fue retirado para que el historial no se trunque. Actualmente se cargan las colecciones completas; esto es apropiado para una sola casa con volumen moderado, pero las lecturas y el tiempo de arranque crecen con el historial. Antes de convertirlo en producto multiusuario o acumular volúmenes grandes: usar consultas paginadas por periodo, resúmenes contables en servidor y archivado conciliado, midiendo lecturas y latencia. Nunca volver a limitar la consulta global sin cambiar también los cálculos.

Los abonos de deudas permanecen en un arreglo transaccional con tope de 1,000 entradas por deuda. No se sobrescriben concurrentemente, pero no es almacenamiento ilimitado. Si una deuda se acerca a ese tope, migrar a documentos de abono antes de alcanzarlo. Los tickets admiten hasta 100 líneas. La infraestructura sigue siendo Firebase + Vercel; vigilar cuotas y facturación desde sus paneles.

No hay recordatorios automáticos programados; se muestran pendientes y se comparte un resumen cuando el usuario lo decide.

## Comprobaciones

- Pruebas deterministas de dinero, participantes, aportaciones, fechas y existencias.
- Pruebas con conflictos transaccionales, reintentos, fallos de commit y operación repetida.
- Integración de formularios/comandos con datos ficticios.
- Emulador real de Firestore: acceso, cierres, escritura real, migración repetida, más de 400 movimientos y respaldo/restauración.
- El pipeline ejecuta sintaxis, pruebas y reglas en Node 24 / Java 21.
- Un ensayo en emulador no acredita configuración ni saldos reales de producción. La llamada real a Anthropic y el despliegue necesitan credenciales y verificación en staging.
