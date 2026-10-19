# Informe técnico P0 de persistencia y backup seguro

## Dictamen

**NOT READY para publicación.** La copia cifrada completa y su restauración sustitutiva están implementadas y probadas en un perfil Chrome temporal limpio. Sin embargo, la adenda P0 exige además una fusión histórica relacional, no destructiva e idempotente sobre una instalación con trabajo nuevo. Esa reconciliación no se ha implementado ni probado para todas las familias legacy. Tampoco se ha probado el Celeron N4020 físico.

La versión estable, el perfil habitual de Chrome y los datos reales no se han tocado. No hubo llamadas a APIs, subidas cloud, envíos, commits, push, merge ni despliegue.

## Alcance implementado

### S0 — inventario y contratos

- `tools/build-persistence-inventory.cjs` escanea referencias literales y dinámicas de `localStorage`, `sessionStorage` e IndexedDB.
- `data/persistence-contract.v1.json` define clasificación, retención, stores y formatos soportados.
- `PERSISTENCE_COVERAGE_REPORT.json` contiene nombres, clases y cantidades, nunca valores.
- La enumeración en ejecución conserva claves desconocidas. Los markers `gordi_indexeddb_ready` y `_voltflow_idb_manifest` no se importan: se reconstruyen desde IndexedDB.
- Los handles de carpeta se clasifican como no transportables y requieren reautorización.

### S1 — copia externa cifrada

- Nuevo `modules/secure-backup.js` con AES-256-GCM autenticado y PBKDF2-HMAC-SHA256 versionado, 210.000 iteraciones, salt de 16 bytes e IV de 12 bytes únicos.
- Contraseña mínima de 12 caracteres, solo en memoria; no se almacena en JavaScript, `localStorage` ni el archivo.
- Hash SHA256 por sección y hash del ciphertext.
- Captura de claves dinámicas, secrets persistentes, stores completos de `VoltiumCRM`, binarios incorporados y referencias no incorporadas.
- IndexedDB prevalece sobre copias obsoletas de `localStorage` al capturar.
- Nombres únicos con fecha, milisegundos y entropía aleatoria.
- La descarga manual queda “pendiente” hasta que el usuario relee el archivo mediante **Comprobar copia**.
- La carpeta autorizada escribe, relee y descifra el archivo antes de marcarlo verificado. Requiere desbloquear la contraseña en cada sesión.

### Contención de filtraciones

- `githubPush()`, `githubPull()`, `jsonbinCreateBin()`, `jsonbinPush()` y `jsonbinPull()` terminan antes de cualquier `fetch` de datos.
- Las banderas automáticas se fuerzan a `false` sin borrar tokens ni configuración histórica.
- Las antiguas exportaciones portátiles, snapshots descargables y rescates externos redirigen a la copia cifrada.
- Los snapshots internos del navegador se conservan para compatibilidad y recuperación local.

### S2 — restauración

- El formato cifrado se valida completamente antes de escribir.
- Staging persistente en `VoltflowRestoreStaging`, rollback cifrado y marker de transacción.
- Reemplazo de todos los stores conocidos de `VoltiumCRM` dentro de una transacción IndexedDB.
- Rollback de IndexedDB, `localStorage` y `sessionStorage` ante fallo.
- Secretos temporales solo vuelven a `sessionStorage` con consentimiento explícito.
- Validación previa del límite de cinco comunicaciones confirmadas.
- Oposiciones, exclusiones, `commercialRefs`, identidades y campos desconocidos se conservan en la copia completa.
- `auto_disk_daily` se reconoce expresamente como formato histórico.

**Pendiente bloqueante:** los formatos legacy siguen usando rutas históricas de reemplazo por claves. Falta la fusión relacional por empresa/establecimiento/contacto/evento, informe de conflictos e idempotencia sobre datos nuevos. Por ello no se aprueba S2 completo.

### S3 — actualización y UX

- Panel **Estado de mis datos** distingue descarga creada, copia externa verificada y restauración probada.
- Comprobación no destructiva por cambio de build; no inicia migraciones.
- Aviso para rutas de prueba bajo `alfredosalaz-sys.github.io`, que comparten origen y almacenamiento.
- Una restauración interrumpida queda visible y no se oculta.

## Seguridad e incidentes previos

No se inspeccionó GitHub ni ningún repositorio remoto, por lo que **no se puede afirmar** si hubo exposición previa. Si `voltflow-data.json` o un snapshot histórico llegó a publicarse:

1. Tratar como comprometidos GitHub PAT, JSONBin Master Key, Gemini, Groq, OpenRouter, Gmail/Sheets OAuth y cualquier otra credencial incluida.
2. Revocar cada token desde el panel oficial del proveedor; no basta con borrar el archivo actual porque existe historial Git.
3. Rotar las claves, revisar actividad y sesiones, y retirar permisos OAuth desconocidos.
4. Eliminar el secreto del historial mediante el procedimiento oficial de GitHub y considerar el repositorio comprometido hasta confirmar la purga.
5. No incluir valores en tickets, capturas o informes.

## Evidencia

- B01-B20: 20/20 comprobaciones automatizadas PASS.
- Chrome aislado: creación, archivo en disco, perfil limpio, restauración, rollback entre stores y tres reinicios PASS.
- Regresiones existentes: 26 comandos PASS.
- Sintaxis: 59 archivos JS/CJS PASS.
- Quality check: PASS.
- Procesador de esta máquina: Intel Core i9-11900KF; el N4020 físico queda pendiente.

## Riesgos pendientes

- Fusión histórica no destructiva e idempotente: pendiente, bloqueante.
- Muestras reales saneadas de todas las exportaciones antiguas: no disponibles.
- Falta de espacio real y revocación de permisos durante una escritura: cubiertos por fallo seguro en código, pendientes de matriz física completa.
- Adjuntos: los bytes custodiados se serializan y prueban; las rutas/referencias externas no pueden recuperar archivos del PC y se marcan como no incluidos.
- OAuth puede caducar; restaurar el token no evita la reautorización del proveedor.
- Seguridad absoluta de secretos en una SPA estática no existe frente a XSS o scripts comprometidos del mismo origen.

