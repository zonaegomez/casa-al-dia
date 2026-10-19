# Casa al Día

Aplicación doméstica de inventario, compras, servicios y cuentas compartidas.
Frontend HTML/JavaScript, Firebase Authentication/Firestore y funciones de Vercel.

La rama de integridad cambia el acceso anónimo por cuentas autorizadas. **No se puede desplegar encima de la versión anterior sin preparar Authentication, las reglas y las variables de servidor.** El procedimiento está en [docs/ACTIVACION.md](docs/ACTIVACION.md).

## Desarrollo

Node.js 22. Para las reglas: Java 21 o posterior.

```sh
npm ci
npm run check
npm test
npm run test:rules
npm run build
```

El build crea `public/`; solo publica los archivos necesarios del frontend. Las funciones de servidor viven en `api/`. Las credenciales de servicio nunca se copian al build.

Prueba de navegación con datos ficticios, sin conectarse a Firebase:

```sh
npx playwright install chromium --only-shell
npm run test:browser
```

## Reglas de negocio

- Un gasto guarda los IDs de sus beneficiarios. Se reparte por partes iguales, conservando todos los centavos. Las aportaciones indican quién pagó; no cambian automáticamente la obligación de cada persona.
- El saldo entre integrantes es **acumulado**, independiente del filtro mensual/quincenal de gastos. Una transferencia se cuenta una sola vez.
- Las deudas explícitas y sus abonos son un registro separado del reparto de gastos. No registrar la misma obligación en ambos lugares.
- Compra, inventario y líneas de ticket se confirman en una transacción con comprobante de operación. El mismo formulario reenviado conserva su ID.
- Los miembros se desactivan; artículos, servicios y deudas se archivan. No se borran sus referencias históricas.
- Una compra anulada revierte las unidades si el movimiento las controló. Si se produciría inventario negativo, se rechaza la anulación para que se concilie primero.
- Los cierres se calculan en servidor y bloquean movimientos y pagos del ciclo desde las reglas. Solo se cierran periodos terminados. Las cuentas pendientes se conservan en el saldo acumulado y pueden liquidarse después.
- El sistema bloquea escrituras sin conexión; no promete sincronizar capturas locales aisladas. El respaldo local anterior se puede descargar.
- Inventario exacto o sencillo por artículo. En modo sencillo se marca “hay / queda poco / comprar”; las compras no simulan un conteo exacto.

## Mapa del código

| Archivo | Responsabilidad |
|---|---|
| `core.js` | Dinero en centavos, fechas de México, reparto y saldo |
| `store.js` | Transacciones, idempotencia, validación y auditoría |
| `index.html` | Vistas, formularios y comandos de aplicación |
| `api/parse-ticket.js` | Lectura autorizada, límites persistentes y revisión del ticket |
| `api/settle.js` | Verifica el saldo vigente antes de registrar una transferencia |
| `api/close-cycle.js` | Conciliación y cierre con lectura consistente de todos los movimientos |
| `server/firebase.js` | Verificación de token, permisos y credenciales de servidor |
| `firestore.rules` | Acceso, validación básica y protección de ciclos cerrados |
| `scripts/` | Build, auditoría, migración, respaldo y restauración |

[Alcance y límites](docs/ARQUITECTURA.md) · [Trabajo con Claude](docs/PARA-CLAUDE.md)
