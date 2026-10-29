# Notificaciones de Casa al Día

Disponibles para todos los integrantes con acceso activo. Son voluntarias y se activan en cada navegador/dispositivo desde **Mi cuenta → Notificaciones**, o **Miembros y ajustes → Configurar notificaciones**.

## Instalación y permiso

En iPhone/iPad con iOS/iPadOS 16.4 o posterior: abrir en Safari, Compartir → Agregar a pantalla de inicio, abrir desde el icono y activar las notificaciones. En Android y escritorio, usar un navegador compatible y conceder el permiso; la instalación puede ser opcional según el navegador. Instalar el icono no concede permiso automáticamente.

El botón **Enviar prueba** solicita un aviso exclusivamente al dispositivo actual. Se limita a uno por minuto y requiere una suscripción de la cuenta autenticada. Cada dispositivo puede activar servicios, recordatorios e inventario por separado. Se puede desactivar desde la app o desde los ajustes del navegador/sistema.

## Avisos diarios

Vercel ejecuta `/api/push-cron` diariamente a las 15:00 UTC: alrededor de las 9:00 de Monterrey. El plan Hobby permite variación dentro de esa hora; no se promete una entrega exacta. Los permisos, la conexión y los modos de concentración/ahorro del dispositivo también afectan la entrega.

Se envía como máximo un resumen por dispositivo y fecha de México cuando existan pendientes elegibles:

- Servicios con vencimiento hoy, mañana o en los siete días anteriores, solo para sus participantes. Los recibos confirmados completamente pagados se omiten. Las cuotas de renta existentes y sus participantes no se modifican.
- Recordatorios sin completar con la misma ventana de vencimiento. Los recordatorios existentes son de la casa; si un documento tiene `memberId`, se restringe a esa persona.
- Productos con poco stock o agotados, si el usuario activa esta categoría.

No consulta préstamos privados ni envía sus datos. La notificación muestra texto general; los importes, nombres y detalles se consultan en la app autenticada, con información actualizada. Un aviso no registra gastos ni pagos.

## Seguridad y persistencia

- `pushSubscriptions` y `pushDeliveries` solo los lee/escribe el servidor; las reglas vigentes los niegan desde clientes, incluso administradores. No hace falta una publicación nueva de reglas.
- El UID se deriva del token verificado; la selección de un integrante en la pantalla no otorga acceso a otras suscripciones.
- Un endpoint del navegador pertenece a una cuenta a la vez. Al cerrar sesión se quita su vínculo local antes de intentar eliminar la suscripción del servidor y del navegador. El service worker comprueba el UID activo antes de mostrar un aviso; un mensaje de la cuenta anterior no debe mostrarse a la siguiente.
- Los endpoints se limitan a proveedores Web Push conocidos, con HTTPS, sin credenciales ni puertos alternos. No se permiten destinos arbitrarios ni direcciones internas.
- Se usan registros de entrega y etiquetas de notificación para limitar duplicados. No hay garantía absoluta de entrega: es un canal de aviso, no un comprobante de pago.
- El service worker no guarda HTML de cuentas, respuestas de Firebase ni datos financieros en una caché offline. Sin conexión, la app muestra una pantalla de reintento y no permite escrituras aisladas.
- Los respaldos administrativos incluyen las suscripciones y entregas; contienen datos privados del navegador y no deben compartirse. Las claves de firma permanecen en variables secretas de Vercel, fuera del repositorio y de los respaldos de Firestore.

## Configuración del servidor

Solo en producción: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` y `CRON_SECRET`. La clave privada y el secreto del cron nunca se devuelven al navegador ni se publican. Las claves VAPID deben conservarse entre despliegues para no invalidar dispositivos existentes. La invocación programada exige `Authorization: Bearer <CRON_SECRET>`; Vercel adjunta este encabezado.

Las pruebas usan proveedores y cuentas ficticias, transporte simulado y service workers locales. No suscriben ni notifican a usuarios reales. Después de publicar, cada persona debe conceder permiso y usar **Enviar prueba** para comprobar la recepción en su dispositivo.
