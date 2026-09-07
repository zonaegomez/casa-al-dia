# Casa al Día — versión web (Vercel + Firebase)

Esta es la versión de "Casa al Día" pensada para vivir en tu propio dominio de Vercel,
con una base de datos en Firebase para que todos en casa vean los mismos datos en
tiempo real, sin depender de una cuenta de Claude.

Es un solo archivo (`index.html`) sin backend propio: todo corre en el navegador y
se conecta directo a Firebase.

## ✅ Firebase ya está configurado

Ya entré a tu proyecto de Firebase (**Casa al dia**, ID `casa-al-dia-ceb5a`) y dejé
todo listo:

- Se registró la app web "Casa al Dia web" y sus valores de configuración ya están
  pegados en `index.html` (el bloque `firebaseConfig`, con tus datos reales).
- Se creó la base de datos de **Cloud Firestore** (edición Standard, plan gratuito
  Spark, ubicación `nam5`).
- Se publicaron las reglas de seguridad de `firestore.rules` (exigen sesión
  autenticada, aunque sea anónima, para leer o escribir).
- Se habilitó el método de acceso **Anónimo** en Authentication: cada persona que
  abra la app recibe una sesión automática, sin pedir usuario ni contraseña.

No necesitas tocar nada de Firebase. Los pasos que faltan son solo para publicar
el sitio.

## 1. Subir el código a GitHub

Esto lo hago yo directamente si me compartes un token de acceso personal (PAT)
de GitHub con permisos mínimos (idealmente solo para un repositorio vacío que
tú crees de antemano, o permiso de "Contents" en un repo nuevo). Con eso creo
el repositorio (si no existe) y subo estos archivos (`index.html`,
`firestore.rules`, este `README.md`).

## 2. Desplegar en Vercel

Una vez que el código esté en GitHub:

1. Entra a https://vercel.com/new
2. Elige "Import Git Repository" y selecciona el repositorio recién creado.
3. Vercel detecta que es un sitio estático (no hay que configurar nada de
   "Build Command" ni "Output Directory" — puedes dejarlos en blanco/default).
4. Clic en **Deploy**.

Cada vez que se suba un cambio nuevo a la rama principal del repositorio,
Vercel vuelve a desplegar automáticamente.

## Notas

- Esta versión web es independiente de la versión que vive como Claude
  Artifact: cada una tiene su propia base de datos, así que los datos **no**
  se sincronizan entre ambas. Úsalas como quieras mientras decides cuál
  prefieres para el día a día.
- Las reglas actuales dan acceso de lectura/escritura a cualquiera que tenga
  el enlace de la app (con una sesión anónima, sin contraseñas). Es el nivel
  adecuado para uso familiar/privado. Si más adelante quieres restringirlo
  por persona (usuario y contraseña reales), lo podemos migrar sin perder
  los datos ya guardados.
- No se requiere ningún paso de "build": es HTML/CSS/JS puro en un solo
  archivo, así que cualquier hosting estático (Vercel, Netlify, GitHub Pages)
  sirve igual de bien.
- Puedes revisar o ajustar la configuración de Firebase en cualquier momento
  desde https://console.firebase.google.com/project/casa-al-dia-ceb5a
