# VOLTFLOW3 / VOLTIUM MADRID — P0 OBLIGATORIO: MEMORIA PERMANENTE EN CHROME, API KEYS, BACKUP CIFRADO Y RESTAURACIÓN REAL

## Contexto y archivos de referencia
Trabaja en una **NUEVA copia aislada** de:

`C:\Users\NOSTROMO\Downloads\Voltflow3-C1.2-CORRECCION-20261016`

En la raíz de esa carpeta encontrarás, tras copiarlos, estos dos documentos de auditoría:

1. `PLAN_MAESTRO_PERSISTENCIA_BACKUP_VOLTFLOW3_C2_20261016.md`
2. `INVENTARIO_PERSISTENCIA_VOLTFLOW3_C12.json`

**Léelos íntegramente** y contrástalos con el código actual; el inventario es estático, no exhaustivo. Localiza otras claves dinámicas o almacenes que puedan contener datos y añádelos a la cobertura, sin copiar secretos reales a informes.

La empresa es **Voltium Madrid**, dedicada a reformas, obras y mantenimiento. Voltflow3 es su CRM local-first: prospección de empresas, contactos, correos personalizados con IA, aprobación humana de envíos y seguimiento de hasta cinco comunicaciones con historial idempotente. **Nunca comprometas ese historial.**

## Requisito empresarial absoluto

El usuario usará siempre su mismo perfil habitual de Chrome. Actualizar el código de Voltflow3 **no debe hacerle perder ningún dato ni obligarle a introducir de nuevo sus API keys persistentes**. El navegador seguirá siendo el almacenamiento operativo principal. Además, debe poder generar, verificar y restaurar una **copia externa completa cuando quiera**, incluidas credenciales mediante **cifrado auténtico**. Debe poder importar archivos de backups y datos de versiones anteriores.

No prometas imposibilidad absoluta de pérdida de datos por fallo físico, daño del perfil o borrado externo. Proporciona protección real, copias redundantes, diagnóstico visible y restauración probada.

## Prioridad inmediata: contener filtraciones

Audita `modules/chat.js` (`githubPush`) y `modules/init.js` (`jsonbinCreateBin`, `jsonbinPush` y pulls), y cualquier otro mecanismo cloud:

- Hay una ruta que sube todo el snapshot a GitHub y solo excluye el token de GitHub. **Eso puede exponer las otras API keys y datos personales en el repositorio.**
- JSONBin recibe snapshot completo sin cifrado extremo a extremo de aplicación.
- No basta con eliminar un par de nombres de campos: diseñar una lista de clasificación de secretos extensible y un esquema cifrado autenticado.
- Hasta resolverlo, bloquear explícitamente la subida de snapshots con datos/credenciales sin cifrar. No eliminar los backups locales actuales.
- No subir credenciales sintéticas ni reales a servicios externos durante pruebas; intercepta `fetch`.
- Si detectas incidentes previos de exposición en repositorio, describir el procedimiento para revocar/rotar las claves sin revelar sus valores.

## Desarrollo que debes realizar, aislado y por hitos

### S0 — Inventario vivo y contratos
- Catalogar todas las claves `localStorage`, `sessionStorage`, stores IndexedDB y futuros blobs (incluyendo dinámicas).
- Clasificar en datos críticos, secretos, configuración, recuperable/recreable y permisos no transportables.
- Conservar campos desconocidos de versiones anteriores, sin perder los flags comerciales ni la lista de exclusión.
- Proveer un `manifest` de datos y un reporte de cobertura real exportado sin valores sensibles.
- Crear fixtures sintéticos desde varias versiones soportadas.

### S1 — Backup completo externo y cifrado
- Mantener datos operativos en Chrome, con IndexedDB como almacén autoritativo cuando corresponda.
- Crear botón **«Crear copia completa ahora»**, progreso y resumen.
- Capturar un snapshot consistente de toda la información crítica: leads, empresas/establecimientos, contactos, mails/estados/evidencias, oposiciones, secuencias, campañas, búsquedas/históricos, scraping/coverage, workflows, plantillas, ajustes, API keys/tokens y binarios incorporados al CRM.
- Esperar escrituras pendientes y coordinar pestañas; abortar en caso de inconsistencia.
- Cifrar íntegramente la copia con WebCrypto AES-256-GCM, contraseña maestra introducida en el proceso y KDF seguro versionado, salt/nonce únicos. No almacenar la contraseña ni dejar secretos legibles en el backup. No inventar criptografía propia.
- Utilizar manifiestos de integridad SHA256 por sección, schema/version/build y cantidades verificables. No marcar PASS sin verificar realmente lectura del archivo escrito.
- Nombres de archivo únicos: nunca sobrescribir copias del mismo día.
- Guardar varias generaciones en carpeta autorizada cuando sea posible; si no hay permiso, exportación manual normal por descarga. Si una copia automática no puede cifrar/incluir secretos, marcarla como incompleta de forma inequívoca y advertir al usuario.

### S2 — Restauración segura de versiones anteriores
- Reconocer los formatos actuales de `exportFullBackup`, `exportPortableData`, `auto_disk_daily`, snapshots de rescate compatibles y el nuevo formato cifrado.
- Validar completamente antes de tocar datos; preview por clases, diferencias, claves restaurables y adjuntos.
- Evitar restauración parcial: staging/commit recuperable, backup previo validado, rollback y prueba de corte entre stores. La base IndexedDB y `localStorage` no comparten transacción global: manejarlo explícitamente.
- Reconstruir markers como `gordi_indexeddb_ready` desde datos reales y manifiestos, jamás confiar en flags importados.
- No reactivar envíos prohibidos ni superar cinco contactos tras restaurar. Preservar alias e identidades canónicas de empresas y establecimientos.
- Credenciales restauradas a su almacén adecuado; gestionar expiración OAuth. Las claves configuradas de forma explícitamente temporal en `sessionStorage` no deben convertirse en persistentes sin consentimiento.
- Handles y permisos de carpeta se reautorizan manualmente; dejar configuración amigable y recuperar claves/IDs.
- Identificar datos de archivos originales no custodiados por el CRM y permitir añadirlos expresamente; no fingir que una web puede recuperar cualquier archivo del PC.

### S3 — Protección de actualizaciones y UX
- Comprobación automática y no destructiva al iniciar cada nueva build: schema, datos, migración pendiente y errores.
- Backup/rollback obligatorio antes de migrar. Nunca sobreescribir datos al inicializar en vacío si falla lectura de IndexedDB.
- Panel «Estado de mis datos» mostrando fecha/hora de última copia EXTERNA verificada, tamaño, cantidad de leads/mensajes, secretos cifrados, lugar de guardado y última restauración probada. Distinción entre copia interna y copia externa.
- Pruebas de versiones anteriores y perfil Chrome completamente vacío. Desplegar solo después de prueba física en Celeron N4020.
- Detectar uso de mismo origen HTTPS entre repositorio de pruebas y producción (`alfredosalaz-sys.github.io`) y mostrar un aviso en modos de prueba para evitar colisiones de almacenamiento.
- No eliminar sistema de backup existente hasta disponer de reemplazo probado y una ruta de compatibilidad.

## Tests bloqueantes

Implementa las pruebas **B01–B20** del documento maestro, especialmente:
1. Se conserva cada API key sintética, Gmail/Sheets/GitHub/JSONBin, preferencias y datos del CRM tras actualizar y reiniciar Chrome.
2. Copia cifrada no contiene credenciales legibles.
3. Restauración 100 % equivalente de backup real leído desde disco en un perfil de navegador nuevo.
4. Funciona `auto_disk_daily` que actualmente carece de rama específica en `restoreBackup()`.
5. Dos backups forzados el mismo día no se sobrescriben.
6. Falla con seguridad cuando falta espacio, contraseña errónea, archivo corrupto o se interrumpe una migración.
7. Cero salidas sin cifrar por GitHub, JSONBin u otra sync.
8. Al restaurar, se conservan bloqueos legales, oposiciones, confirmaciones y límite de cinco comunicaciones.
9. IndexedDB/`localStorage` no divergen y el exportador no lee estado obsoleto.
10. Adjuntos realmente incorporados se recuperan byte a byte; los meramente referenciados se marcan como no incluidos.
11. Probar el rendimiento, con mucha información, en un navegador real limitado; no declarar probado un Celeron físico sin usar ese equipo.

Integrar en quality gate **sin falsear los tests**. Mantener todas las regresiones C0/C1/C1.1/C1.2, E1/E2.2 y las protecciones IA, corpus y buscador.

## Límites
- Presupuesto externo 0 €; no suscripciones, llamadas facturables ni subida de información real a la nube.
- No modificar repositorios GitHub ni desplegar.
- No alterar datos reales, no borrar claves ni perfiles, no generar comunicaciones.
- No avanzar a C3–C7 ni reescribir el buscador.
- No incorporar bibliotecas externas costosas o de confianza desconocida.
- No publicar backups ni datos privados en `main` o repositorios de prueba.
- No prometer seguridad cifrando con un PIN de cuatro dígitos ni incluyendo contraseña en JS/localStorage.

## Entregables
Carpeta aislada: `Voltflow3-PERSISTENCIA-BACKUP-SEGURO-20261016`.

Incluir:
1. Código y listado exacto de cambios.
2. Inventario dinámico y contrato de persistencia/versiones.
3. Matriz de formatos antiguos, export/import con criterios de retención.
4. Pruebas sintéticas y reporte de restauración real.
5. Evidencias de protección de claves y bloqueo de sync en claro.
6. Manifiestos SHA256 y diff.
7. Manual sencillo «Copia ahora / Comprueba copia / Restaura».
8. Procedimiento de reversión y medidas de emergencia.
9. Riesgos pendientes, especialmente navegador físico y credenciales que precisan reautorización.
10. Dictamen READY o NOT READY, justificado.

**Si la amplitud de S0–S3 impide terminarlos sin riesgos, trabaja por hitos, pero NO declares finalizada la protección de datos hasta tener exportación cifrada + restauración íntegra + prueba real de recuperación en un perfil limpio. Detente si no puedes garantizar alguna precondición, y explica qué falta.**
