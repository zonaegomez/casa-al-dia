# Respaldo con acceso autorizado

Este procedimiento exporta Firestore, incluidos planes en `settings`, préstamos privados, autorizaciones y auditoría. No incluye cuentas ni contraseñas de Authentication, variables de Vercel ni fotos almacenadas fuera de Firestore. No archiva ni modifica registros.

Un archivo del repositorio no concede permisos. El acceso del asistente, el de GitHub, el del servidor publicado y el de una terminal son contextos distintos. Se debe comprobar la identidad y el proyecto en el entorno que ejecuta el respaldo.

## Opción sin descargar una clave de servicio

El script admite Application Default Credentials (ADC) únicamente al seleccionar `--adc`, y exige `--project` para elegir el origen explícitamente.

1. Abre Cloud Shell desde la consola Firebase del proyecto correcto con una cuenta Google que tenga acceso de lectura a su Firestore. Autoriza la sesión si Google lo solicita. Cloud Shell administra esa autenticación; no ejecutes `gcloud auth application-default login` dentro de Cloud Shell.
2. Abre una copia actualizada del repositorio en la rama de revisión y usa Node 24.15 o posterior dentro de la rama 24.x. Ejecuta `npm ci` desde esa copia.
3. Guarda el archivo fuera del repositorio. Sustituye el ID y usa una ruta de archivo que todavía no exista:

```sh
mkdir -p "$HOME/casa-respaldos"
node scripts/backup.js "$HOME/casa-respaldos/antes-de-archivar.json" --adc --project ID_DEL_PROYECTO
```

En una máquina local, fuera de Cloud Shell, ADC puede configurarse mediante `gcloud auth application-default login`; solo si el usuario lo realiza en su equipo y tiene los permisos correspondientes. Esa autenticación no queda configurada por tener una sesión de GitHub o Vercel.

El SDK usa la sesión disponible y verifica el ID del proyecto antes de leer. El script pide una transacción de solo lectura y crea el archivo con permisos `0600`, sin sobrescribir un archivo existente. Si falla la autorización o faltan permisos, se detiene; no cambia reglas ni permisos automáticamente.

## Opción del entorno de servidor

Se conserva el modo anterior para una terminal segura que ya tenga `FIREBASE_SERVICE_ACCOUNT` configurada como secreto. No extraerla del servidor ni pegarla en un chat para seguir este procedimiento.

```sh
node scripts/backup.js /ruta/privada/archivo-nuevo.json --project ID_DEL_PROYECTO
```

Elegir `--adc` no reutiliza automáticamente esa variable: selecciona expresamente la autenticación ADC.

## Qué verificar antes de archivar

- El archivo existe, el proyecto de origen corresponde al esperado y contiene todas las colecciones indicadas en `scripts/backup.js`.
- El plan real está en `settings`, y sus pagos y aportaciones mensuales permanecen dentro de ese documento.
- Se descargó y conservó una copia privada fuera de GitHub antes de cerrar la terminal.
- Se ensayó la restauración en un proyecto vacío y se compararon cantidades y saldos. La verificación de formato sin restaurar no demuestra recuperación completa.

El respaldo contiene información privada de todos los participantes y es material administrativo. No publicarlo en GitHub, adjuntarlo a un chat ni ofrecerlo como exportación general a los integrantes. Este procedimiento no cambia la privacidad de los préstamos dentro de la app.

Referencias oficiales: [SDK administrativo y ADC](https://firebase.google.com/docs/admin/setup), [ADC en Cloud Shell](https://docs.cloud.google.com/docs/authentication/set-up-adc-cloud-dev-environment), [autorización de Cloud Shell](https://docs.cloud.google.com/shell/docs/auth).
