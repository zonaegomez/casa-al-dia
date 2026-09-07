# Casa al Día — versión web (Vercel + Firebase)

Esta es la versión de "Casa al Día" pensada para vivir en tu propio dominio de Vercel,
con una base de datos en Firebase para que todos en casa vean los mismos datos en
tiempo real, sin depender de una cuenta de Claude.

Es un solo archivo (`index.html`) sin backend propio: todo corre en el navegador y
se conecta directo a Firebase.

## 🚀 Ya está en vivo

- Sitio: https://casa-al-dia-three.vercel.app
- Código: https://github.com/zonaegomez/casa-al-dia
- Cada vez que se sube un `index.html` nuevo al repo, Vercel vuelve a desplegar
  automáticamente en 1–2 minutos.

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

## Cómo se hizo (referencia)

1. Se subió el código a GitHub (`zonaegomez/casa-al-dia`, rama `main`) usando
   la función de "Upload files" de GitHub (no `git push`, porque esta sesión
   no tenía permiso de push directo al repo).
2. Se importó el repo en Vercel (Import Git Repository → sin framework, sin
   build command) y se desplegó.

Para futuras actualizaciones del código, basta con subir un `index.html`
nuevo a la rama `main` del repo (por la web de GitHub o con `git push` si ya
tienes acceso) — Vercel vuelve a desplegar solo.

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
- Hubo un problema detectado y corregido: al abrir la app en dos pestañas/dispositivos
  casi al mismo tiempo, cada una podía "sembrar" sus propios datos de arranque
  (miembro inicial, despensa, etc.), duplicándolos. Ya se corrigió con un candado
  atómico en Firestore (un campo `seeded` en `settings/config`) para que la siembra
  inicial ocurra una sola vez sin importar cuántos dispositivos abran la app a la vez.
  Los duplicados que ya existían en tu base de datos (dos "Erick", varios artículos de
  despensa repetidos) siguen ahí — bórralos manualmente desde la app o desde
  https://console.firebase.google.com/project/casa-al-dia-ceb5a/firestore si quieres
  limpiarlos.
