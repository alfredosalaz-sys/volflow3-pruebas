# VOLTFLOW3 — REQUISITO VINCULANTE DE PERSISTENCIA, VERSIONES Y BACKUP PARA C2

Fecha: 2026-10-16. Contexto: Voltium Madrid, CRM de prospección B2B, correos asistidos por IA y seguimiento comercial supervisado por el usuario.

## Decisión del propietario

Voltflow3 se usará normalmente desde el mismo navegador/perfil en el mismo equipo. Toda la memoria comercial debe mantenerse local, persistir entre sesiones y actualizaciones y poder respaldarse y recuperarse a voluntad. No se exige base de datos remota ni sincronización automática con servidores. Las futuras funcionalidades de C2-C7 deben respetar estos requisitos como condiciones bloqueantes.

## Contrato de almacenamiento

1. Fuente de verdad local: IndexedDB para colecciones grandes (empresas, establecimientos, contactos, oportunidades, eventos, secuencias, exclusiones, adjuntos cuando proceda); localStorage para opciones y estados pequeños. Transacciones y escritura confirmada; no depender solo de variables JavaScript en memoria.
2. Identidades estables: preservar commercialRefs, IDs de lead/establecimiento/persona, eventos y confirmaciones. La reimportación, enriquecimiento, deduplicación y actualización de versión no deben reiniciar la secuencia de cinco contactos ni duplicar comunicaciones.
3. Migración: detectar formatos anteriores, validar versiones y esquemas, ofrecer previsualización, crear copia previa recuperable y realizar migraciones idempotentes con rollback probado. Preservar archivos/adjuntos; no fusionar registros ambiguos por heurística.
4. Datos históricos: admitir restauración/importación desde exports anteriores de Voltflow/Voltflow3 (JSON y formatos realmente soportados), incluso si el archivo procede de una versión distinta. Conservar estado incierto LEGACY_SENT_UNVERIFIED. Los archivos físicos que estén fuera del navegador solo pueden incorporarse previa selección o permiso del usuario; no prometer acceso automático a carpetas privadas por ser una web de GitHub Pages.
5. Copia bajo demanda: botón claro «Crear backup ahora» que produzca un archivo completo descargable. Incluir datos comerciales, preferencias pertinentes, cronología y adjuntos gestionados. Generar nombre único con fecha, hora, build y opcional hash: no sobrescribir el backup previo del mismo día.
6. Copia en carpeta autorizada: puede ofrecerse tras permiso expreso mediante File System Access API; soportar renovación de permisos, ausencia de soporte y errores de disco. Mostrar fecha, destino y última verificación. No considerar EXITOSA una copia que no sea escribible y verificable.
7. Restauración: reconocer explícitamente todos los formatos que crea el propio sistema, incluidos backup completo, snapshot portátil y backup diario con portableSnapshot; nunca reportar una copia como válida sin demostrar ida/vuelta. Prevalidar integridad, duplicados, schema y versión; mostrar recuentos de antes/después y exigir confirmación. Crear backup previo, aplicar cambios de forma recuperable y verificar resultado.
8. Seguridad: no incluir API keys, tokens, PIN ni secretos en copias normales sin una elección clara y una protección criptográfica apropiada; preferir exportar datos sin secretos y pedir reconfigurar claves. Documentar riesgo localStorage y acceso desde scripts del mismo origen.
9. Versiones y orígenes: datos de GitHub Pages se aíslan por origen (esquema + dominio + puerto), NO por carpeta/repo. Evitar contaminación de datos entre CRM estable y repositorios de pruebas del mismo `alfredosalaz-sys.github.io`. Las pruebas deben usar perfil aislado; no importar copias en el perfil productivo sin previsualización.
10. Resistencia: evaluar persistencia del origen mediante `navigator.storage.persist` cuando sea viable, cuota, fallo/cierre abrupto, reinicio, desconexión y volumen elevado en equipo Celeron N4020. El navegador puede perder datos si el usuario borra datos del sitio o cambia de perfil; los backups externos son imprescindibles.
11. Alcance del backup: distinguir archivos de datos/adjuntos del código fuente del CRM. Un backup de navegador no equivale a guardar todo el repositorio GitHub; el repositorio/versiones de código se resguardan por su propio sistema de versionado.

## Hallazgos estáticos en el paquete C1.2 recibido

- `modules/storage.js` implementa almacenamiento IndexedDB (`VoltiumCRM`) y `modules/init.js` exportación de snapshots con lectura de IndexedDB cuando está activada.
- `modules/ui.js` ya ofrece «Backup completo (JSON)» y restauración de copias completas/portátiles. `modules/disk-backup.js` dispone de botón «Crear backup diario ahora» y guardado en carpeta autorizada.
- **Incompatibilidad por corregir/verificar:** `modules/disk-backup.js` genera `{version, backupType, date, portableSnapshot, integrity}`, mientras que `restoreBackup()` de `modules/ui.js` reconoce archivos con `leads` o con `gordi_leads`/`_voltflow_version`/`_exported` en la raíz. La restauración directa del backup diario podría ser rechazada como formato no reconocido.
- **Riesgo de sobrescritura:** el backup de disco utiliza `gordi_backup_auto_YYYY-MM-DD.json`. Forzar «Crear backup diario ahora» en el mismo día reescribe el archivo; exigir historial de varias copias independientes.
- **Riesgo de claves expuestas:** `VOLTFLOW_DATA_KEYS` y la exportación adicional de claves `gordi_*` incluyen potencialmente claves API y tokens. Los backups en JSON sin cifrar deben excluir secretos por defecto o tratarlos mediante flujo específico seguro.

Estos son hallazgos sobre el código; NO se han validado aún mediante ciclo completo de copia/restauración en Chrome real ni en el Celeron.

## Pruebas bloqueantes para C2

A. Datos creados -> cerrar navegador -> reabrir misma URL/origen -> mismos registros, IDs, eventos y adjuntos.
B. Datos de versión anterior -> actualizar versión -> mismo historial, con migración y rollback comprobados.
C. Importar backup de versión anterior: previsualización, sin duplicaciones, fechas y exclusiones intactas.
D. Backup completo -> restauración -> mismo contenido semántico e IDs, incluida secuencia de cinco contactos.
E. Backup de disco diario -> restauración completa: funciona con su formato real.
F. Dos backups bajo demanda el mismo día -> dos archivos separados y recuperables, sin sobrescritura silenciosa.
G. Corte/fallo de escritura o falta de cuota -> error visible y datos anteriores intactos, no éxito ficticio.
H. Conflictos entre empresa jurídica/establecimiento/contacto -> no fusionar por compartir email o dominio.
I. Datos de prueba de repo distinto en el mismo origen -> no contaminar CRM real.
J. Archivo corrupto/manipulado -> rechazo seguro, sin sobrescribir datos vigentes.
K. Secrets/API keys -> excluidos de backups sin cifrar por defecto; prueba automática.
L. Pruebas con cantidades grandes y arranque modesto; no bloquear Chrome ni superar presupuesto externo 0 EUR.

## Restricciones

No publicar ni hacer push/merge/commit, no realizar comunicaciones reales, no usar API facturables ni alterar versiones estables. Trabajar en copia aislada. No implementar C3-C7 hasta que C2 tenga persistencia y restauración comprobadas. Diferenciar explícitamente «implementado», «simulado», «probado con navegador» y «probado en equipo real».
