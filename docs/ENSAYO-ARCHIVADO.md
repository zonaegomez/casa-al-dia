# Ensayo de archivado de datos de prueba

Este comando es exclusivamente para una copia restaurada en el emulador local. No implementa ni autoriza un archivado en staging o producción.

Requiere revisar previamente TODOS los registros de purchases, items, movements, bills, billReceipts, billPayments, settlements y closedCycles y confirmar que son de prueba. El script selecciona esas colecciones completas; no decide por nombres ni fechas. No es una herramienta general para una base con datos reales mezclados.

Con el emulador Firestore activo en 127.0.0.1:8088 y una restauración idéntica al respaldo bajo demo-casa-respaldo:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 node scripts/rehearse-test-archive.js /ruta/privada/respaldo.json
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 node scripts/rehearse-test-archive.js /ruta/privada/respaldo.json --apply
```

La primera ejecución solo valida y muestra conteos. La segunda agrega archived, voided y testArchiveId a los documentos seleccionados. Conserva todos los campos previos y guarda sus versiones originales en una operación de auditoría. No borra documentos, no pone existencias a cero y no cambia fechas ni importes. Los artículos archivados mantienen su cantidad histórica, pero quedan fuera del inventario activo.

La operación es atómica, verifica las quince colecciones contra el respaldo antes de escribir y comprueba después cada documento seleccionado o protegido. Los abonos del plan, usuarios, accesos, préstamos privados y operaciones previas permanecen idénticos. Rechaza deudas o recordatorios pendientes de clasificación y aportaciones del plan vinculadas a recibos. No imprime documentos ni préstamos privados. Una segunda ejecución idéntica verifica el resultado sin duplicar la operación.

Los cierres históricos conservan sus documentos: quedan fuera de las listas activas mediante voided, pero el bloqueo de escritura de ese periodo permanece. El ensayo no reabre un ciclo cerrado.

Las pruebas del módulo cubren aislamiento del emulador, datos nuevos, preservación de originales y datos protegidos, modo sin escritura e idempotencia. No sustituyen comprobar el ensayo con el respaldo real ni revisar el comportamiento visual de la aplicación. El respaldo no debe subirse al repositorio.

## Aplicación revisada en staging

`scripts/archive-reviewed-staging.js` es una entrada separada que reutiliza la misma transacción comprobada en el emulador. Solo acepta el origen y destino casa-al-dia-staging, sin variable de emulador. Usa ADC; no se deben copiar credenciales al chat ni al repositorio. Requiere exactamente el alcance revisado de 75 documentos de prueba, un respaldo de 129 documentos y el plan de pagos presente. Estos conteos son barreras adicionales, no un clasificador: la selección se basa en el respaldo previamente revisado por la persona responsable.

Primero comprobar, sin escribir:

```sh
node scripts/archive-reviewed-staging.js /ruta/privada/respaldo.json --project casa-al-dia-staging
```

Solo después de revisar la salida y decidir aplicar el archivado, usar la huella backupSha256 de esa salida:

```sh
node scripts/archive-reviewed-staging.js /ruta/privada/respaldo.json --project casa-al-dia-staging --apply --confirm HUELLA_DE_64_CARACTERES
```

La huella no es una contraseña: vincula la decisión al contenido exacto del respaldo revisado. Dentro de una sola transacción, cada colección se compara con el respaldo; cualquier alta, baja o cambio detiene la operación antes de escribir. La sesión Google debe tener permisos de lectura y, para --apply, de escritura en Firestore staging. No se modifican permisos ni se buscan credenciales alternativas. Producción siempre se rechaza. Si después del commit falla la verificación por un cambio concurrente, el comando puede terminar con error aunque el archivado ya esté hecho: comprobar el estado antes de repetir; no revierte operaciones automáticamente.
