# Préstamos privados: activación y alcance

## Qué cambia

`privateLoans` es un libro separado de compras, servicios, saldos compartidos y `debts` anteriores. Solo las dos cuentas participantes pueden consultar cada préstamo desde la app o el SDK. El rol `admin` de la casa no ofrece excepción. El SDK no puede crear, editar ni borrar préstamos: `/api/loans` valida el token, el acceso habilitado, la identidad vinculada y cada transición en una transacción.

No es cifrado de extremo a extremo. Quienes administran técnicamente el proyecto Firebase, las credenciales de servicio o los respaldos completos conservan acceso. El respaldo del servidor incluye `privateLoans`; custodiarlo con el mismo control que las credenciales. La exportación de la app y el respaldo local del navegador no incluyen préstamos privados. No se activa persistencia offline para estos datos y las capturas de caché no se muestran.

## Activación en staging primero

1. Mantener la configuración web y el service account de Preview apuntando al mismo proyecto de staging. No copiar secretos al repositorio.
2. Cada integrante debe tener su propia cuenta Firebase Authentication por correo y contraseña. No compartir credenciales; “Registrando como” solo es atribución operativa de movimientos compartidos.
3. Verificar la identidad humana detrás de cada cuenta y el ID exacto de su documento `members`. No deducirlo por el nombre visible ni por el selector actual.
4. Habilitar cada cuenta verificada en `access/{UID}` con `enabled: true` y su rol. Agregar `memberId` (string) igual al ID exacto de `members/{id}`. Una cuenta por integrante. Este campo no es modificable desde la app, ni por el administrador de la casa.
5. Alternativa controlada: con el service account del entorno, ejecutar `node scripts/bind-account.js UID MEMBER_ID` para revisar proyecto y vínculo; repetir con `--apply` una vez verificados. El script no crea usuarios, no habilita accesos y rechaza reasignaciones y vínculos duplicados.
6. Publicar las reglas de esta rama en STAGING. Desplegar la app/API de esta misma revisión. Recargar sesión después de vincular. Sin vínculo, el módulo permanece bloqueado; si faltan reglas, muestra error sin impedir los módulos compartidos.
7. Probar con tres sesiones independientes: A y B crean y confirman un préstamo; C, incluso con rol admin de casa, no puede verlo. Cambiar “Registrando como” en C no debe cambiar esta restricción. Probar devolución reportada por deudor y confirmada por acreedor; comprobar que el saldo compartido y stock no cambian.
8. Producción requiere respaldo probado, migraciones de la guía de activación y verificación del entorno. Este código no publica reglas ni cambia cuentas automáticamente.

Los UID permanecen como participantes históricos. No reciclar una cuenta para otra persona. Un cambio de correo que conserve UID mantiene identidad; para pérdida de cuenta, revocar acceso y revisar una recuperación explícita. No hay reasignación automática de préstamos a otra cuenta ni borrado del historial.

## Flujo entendible

- Quien entrega o recibe dinero registra una solicitud sobre un préstamo ya ocurrido. La otra persona acepta o rechaza. Antes de aceptar no se presenta como deuda confirmada.
- El deudor reporta una devolución efectivamente enviada. Hasta que el acreedor confirma recepción, el pendiente no baja. Puede rechazar un abono no recibido; queda constancia.
- Solo hay un abono pendiente a la vez. No se admiten importes mayores al pendiente. Al confirmar la devolución completa pasa a liquidado.
- Se conservan solicitudes, confirmaciones y abonos rechazados. No se editan importes, participantes ni principal de un préstamo activo. Ante un dato incorrecto, rechazar o cancelar la solicitud pendiente y capturar la correcta. Las controversias de un préstamo ya confirmado requieren conciliación entre participantes; no se inventa un ajuste automático.
- Reenvíos se reconocen por operación y las versiones evitan modificaciones simultáneas obsoletas. Máximo 500 eventos por préstamo para mantener tamaño acotado.

## Historial anterior

`debts`, incluidos adelantos vinculados a compras, siguen siendo compartidos. No se migran automáticamente porque no es posible determinar identidades y consentimientos retroactivamente. La interfaz lo indica como “Deudas de compras”. Los nuevos préstamos personales se capturan en el módulo privado; se retira del formulario común la opción de crear adelantos como deuda separada para evitar confundirlos con privacidad.

La privacidad aquí se refiere al nuevo módulo. No convierte en privados tickets, inventario, deudas anteriores, operaciones ni saldos de la casa.
