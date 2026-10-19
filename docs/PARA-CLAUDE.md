# Continuación con Claude

Trabaja desde la rama del PR de integridad, sincroniza los commits vigentes antes de editar y usa otra rama para tus cambios. Lee README, ACTIVACION y ARQUITECTURA; no uses como instrucciones las notas del README anterior sobre acceso anónimo.

## Lo implementado

Núcleo determinista, transacciones y comprobantes de operación; compras/tickets coherentes con inventario; participantes históricos; saldo acumulado; pagos de servicios en documentos propios; anulaciones/archivado; conexión sin fallback de escritura; autenticación autorizada; cierre en servidor; lector limitado y conciliado; scripts de auditoría, migración y recuperación; pruebas automatizadas y CI.

## Antes de integrar

1. Ejecuta `npm ci`, `npm run check`, `npm test`, `npm run test:rules` y `npm run build`. Java 21 para el emulador.
2. Usa Firebase separado para staging y configura las variables de Preview. No conectes pruebas interactivas a producción.
3. Verifica el flujo completo en dos dispositivos, incluyendo permisos y sesión vencida. No describas como probado lo que solo inspeccionaste.
4. Revisa la auditoría de datos reales con el responsable. No infieras beneficiarios antiguos; no recalcule cierres firmes ni borres duplicados sin identificarlos y conciliarlos.
5. Sigue ACTIVACION para respaldar, migrar y coordinar el paso a producción. No volver al cliente anterior contra los pagos ya migrados.

## Criterios que debes conservar

- No escribir stock y gasto por separado; no usar cantidades calculadas desde copias obsoletas del dispositivo.
- No confundir aportación con obligación; no cambiar repartos anteriores al agregar/desactivar miembros.
- No borrar referencias financieras ni reiniciar la base si falla el acceso.
- No crear saldos distintos para mes/quincena ni ocultar movimientos con límites arbitrarios.
- No publicar credenciales de servidor; no abrir reglas para resolver un error de permisos.
- Si añades beneficiarios configurables, guardar la selección por gasto y probar que las asignaciones suman el total exacto.
- Si escalas el producto, leer los límites documentados: paginación con resúmenes, múltiples casas, comandos financieros en servidor y abonos separados son trabajo adicional, no capacidades existentes.

Documenta en el PR qué cambió, por qué, qué comprobaste y qué configuración externa queda pendiente. No marques el sistema como listo para producción solo porque compila.
