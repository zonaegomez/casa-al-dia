# Integrantes, invitaciones y fotos

## Invitar desde la app

En **Miembros y ajustes → Invitar integrante**, el administrador indica nombre y correo. La app genera un enlace que el administrador copia y comparte por el canal que elija. **No se envía un correo de invitación automáticamente**; no requiere un proveedor SMTP nuevo.

El enlace vence en siete días y está vinculado al correo indicado. La persona abre el enlace, crea su propia contraseña o inicia sesión y verifica su correo con Firebase Authentication. La verificación sí envía un correo de Firebase. Debe volver a la pestaña de la invitación y pulsar **Ya verifiqué mi correo · Entrar**. El servidor verifica el ID token y su `email_verified`; tener el enlace por sí solo no concede acceso.

En **Invitaciones**, el administrador puede cancelar un enlace o generar uno nuevo. Generar uno nuevo invalida el anterior. La aceptación es transaccional e idempotente, crea un acceso con rol `member` y conserva los permisos de las cuentas existentes. Un perfil ya vinculado no se puede reasignar mediante este flujo. Las invitaciones canceladas o vencidas no autorizan acceso.

Un perfil nuevo permanece inactivo mientras la invitación está pendiente. Al aceptar, se activa para los siguientes registros de gastos. No cambia participantes, importes ni abonos de documentos anteriores; conserva `legacyParticipantIds` y no modifica los planes a plazos ni las cuotas fijas de renta. Si se incorpora a un acuerdo existente, el administrador debe revisarlo explícitamente con la casa.

## Mi perfil

Cada integrante puede editar exclusivamente su nombre, color y foto. La foto se recorta al centro, se convierte a JPEG de hasta 256 × 256 píxeles y se guarda como miniatura en el documento de su perfil. Los integrantes autorizados de la misma casa pueden verla. La foto original y sus metadatos no se conservan. Para quitarla, usar **Quitar foto** y guardar.

`POST /api/profile` deriva el integrante desde `access/{uid}` y verifica la coincidencia del perfil solicitado. No acepta cambios a rol, estado ni otros perfiles. Las reglas actuales impiden escribir `photoData` directamente desde Firestore; solo el servidor valida y guarda la miniatura. No hace falta publicar reglas nuevas ni habilitar Storage para esta función.

## Respaldo y operación

El respaldo de Firestore ahora incluye `invitations` y las miniaturas guardadas dentro de `members`. Las invitaciones contienen el hash del secreto, no el enlace utilizable. Los archivos de respaldo siguen siendo administrativos y privados. La exportación de Firestore no sustituye un respaldo independiente de Firebase Authentication.

Producción utiliza el proyecto Firebase `casa-al-dia-staging`. El nombre histórico no significa que sus datos puedan usarse para pruebas. Los tests de invitaciones, perfiles y verificación de correo usan únicamente emuladores `demo-*` y solicitudes locales ficticias. No generan cuentas, fotos, correos ni invitaciones en producción.
