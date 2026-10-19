# Activación y conservación de datos

## 1. Entorno de revisión

Primero usar otro proyecto Firebase para staging. Crear una cuenta por adulto autorizado en Authentication y habilitar Email/Password. El usuario final ingresa con esa cuenta; no hay registro público en la aplicación.

En Firestore crear `access/{UID}` desde la consola administrativa:

```json
{"enabled":true,"role":"admin"}
```

Para los demás: `role: "member"`. El rol admin permite modificar presupuestos y cerrar ciclos. La autorización es para una sola casa: los perfiles de `members` son personas del reparto, no credenciales. Elegir quién pagó no cambia quién realizó la acción: el UID queda en auditoría.

Publicar `firestore.rules` en el proyecto **de staging**. Crear `settings/config` desde la consola si se quiere un inicio distinto de 1 antes de registrar datos; después el inicio queda fijo. Debe tener `cycleStartDay` entero 1–28 y `currency: "MXN"`.

## 2. Variables en Vercel

Configurar por separado Preview y Production:

| Variable | Contenido |
|---|---|
| `CASA_FIREBASE_WEB_CONFIG` | JSON de la app web del proyecto correspondiente: apiKey, authDomain, projectId, appId y demás campos públicos |
| `FIREBASE_SERVICE_ACCOUNT` | JSON privado de una cuenta de servicio del mismo proyecto, con permisos para operar Firestore y validar/revocar sesiones de Authentication |
| `ANTHROPIC_API_KEY` | Clave privada del lector de tickets |
| `ANTHROPIC_MODEL` | Opcional; el valor inicial se conserva en el código del endpoint |

Guardar credenciales exclusivamente como variables protegidas del entorno. No pegarlas en GitHub, chats, backups de negocio o `runtime-config.js`. El build solo extrae los campos públicos permitidos de la configuración web.

El build falla en Vercel si falta la configuración web. Esto evita que una preview use accidentalmente el Firebase de producción indicado como fallback local en el HTML.

Agregar el dominio de preview o producción a los dominios autorizados de Authentication. Comprobar login y cierre de sesión. No probar contra los datos reales desde la preview.

## 3. Respaldo y migración

Antes del cambio de producción, detener las escrituras del cliente anterior. Usar una ventana de mantenimiento; no habilitar temporalmente reglas públicas. Respaldar el proyecto con el SDK administrativo desde un equipo seguro. Los scripts leen `FIREBASE_SERVICE_ACCOUNT` del entorno.

```sh
mkdir -p backups
node scripts/backup.js backups/casa-antes-v2.json
node scripts/audit-data.js
```

`backup.js` toma una lectura consistente y crea un archivo nuevo sin sobrescribir otros. Incluye las colecciones del negocio, cuentas autorizadas y auditoría; excluye el contador efímero de uso de IA. La exportación del navegador es una copia operativa y no sustituye este respaldo íntegro.

Los gastos anteriores NO guardaban beneficiarios. Identificar sus IDs reales y acordar una base histórica explícita. Por ejemplo, establecer en el entorno `LEGACY_PARTICIPANTS` como JSON `["id-erick","id-axel"]`. No inferir personas por nombre ni incluir automáticamente a menores de edad. Si el reparto histórico varió por fecha, preparar una migración específica por gasto antes de continuar; una sola base no recupera ese dato faltante.

```sh
node scripts/migrate.js
node scripts/migrate.js --apply
node scripts/migrate.js
node scripts/audit-data.js
```

La primera ejecución es dry-run. Aplicar solo después de revisar el plan. Cada servicio se migra en una transacción: se crean sus pagos con IDs deterministas y se vacía su arreglo antiguo juntos. Repetir no duplica pagos. Un servicio con más de 400 pagos requiere un plan por lotes específico; el script se detiene antes de modificar ese servicio.

Antes de activar corregir gastos sin pagador, importes inválidos, referencias desaparecidas y cierres antiguos cuyo total no concuerde con los movimientos completos. La auditoría informa diferencias; no las corrige ni inventa datos. Los cierres anteriores se conservan tal como estaban, porque recalcularlos sin revisar podría alterar acuerdos ya liquidados.

## 4. Validación de recuperación

Restaurar el respaldo primero en un proyecto vacío de pruebas. Cambiar las credenciales del entorno al **destino** antes de ejecutar:

```sh
node scripts/restore.js backups/casa-antes-v2.json
node scripts/restore.js backups/casa-antes-v2.json --apply
node scripts/audit-data.js
```

El dry-run comprueba formato y destino vacío. La restauración usa creación exclusiva, nunca sobrescribe ni elimina documentos existentes. Si falla a mitad, conservar el respaldo y restaurar de nuevo en otro proyecto vacío; no intentar una mezcla parcial. Comparar cantidades, importes y saldos. El respaldo es de Firestore: no incluye las cuentas/contraseñas de Authentication ni variables de Vercel. En otro proyecto se deben preparar sus cuentas y revisar los UIDs de la lista de acceso. No apuntar dos versiones de la app a bases distintas de manera permanente.

## 5. Paso a producción

1. Validar staging con dos dispositivos y usuarios distintos: compra simultánea, ticket repetido, pago dividido 900/100, anulación y cierre.
2. Crear cuentas autorizadas y variables de Production; preparar el despliegue nuevo sin enviar usuarios al anterior durante la ventana de cambio.
3. Respaldar, auditar y migrar con clientes detenidos. Publicar las reglas nuevas y desplegar la aplicación nueva coordinadamente.
4. Comprobar inicio de sesión, lectura completa, registro de una operación identificable, lector IA y cierre de un periodo de prueba revisado. Confirmar que no quedan pestañas del cliente anterior en uso.
5. Conservar el respaldo y los resultados de auditoría fuera del repositorio. Un rollback del frontend antiguo no es compatible automáticamente con las nuevas reglas ni con los pagos migrados; decidirlo con los datos y credenciales del mismo momento.

Las tareas de configuración y migración de producción no se ejecutaron al preparar este cambio: necesitan acceso administrativo a Firebase/Vercel y verificación de los datos reales. La aprobación del PR no prueba esas configuraciones.
