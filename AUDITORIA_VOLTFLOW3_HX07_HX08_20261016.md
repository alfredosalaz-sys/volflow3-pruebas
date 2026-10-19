# Auditoría independiente de Voltflow3 HX07 — 16/10/2026

**Objeto:** entrega `Voltflow3-IMPORTACION-HISTORICA-HX07-20261016.rar` recibida en esta conversación. No se ha tocado GitHub, el perfil de Chrome habitual ni datos comerciales reales.

## Dictamen

**HX07 supera los tests entregados, pero el cierre de protección de datos sigue condicionado por HX08: cola de escrituras no durable.** No se recomienda restaurar backups reales en el Chrome habitual antes de resolverlo o establecer un bloqueo operativo demostrable de todas las pestañas editoras.

## Comprobaciones directamente realizadas

- Extracción de 227 archivos ordinarios del RAR con libarchive. No se extrajeron rutas fuera de la carpeta de trabajo.
- `node tools/verify-manifest.cjs`: **226/226 SHA256**.
- `node tools/check-release-integrity.cjs`: versión **2.9.4**, build **2026.10.15.0300**, 26 recursos.
- `node HX07_CARRERA_ESCRITURA_CONCURRENTE_20261016.cjs`: **PASS**.
- `node tools/write-coordinator-contract-test.cjs`: **PASS**.
- `node tools/historical-import-test.cjs`: **20/20 PASS**.
- `node tools/secure-backup-b01-b20-test.cjs`: **20/20 PASS**.
- HX01–HX04: **4/4 PASS**; HX05–HX06 independientes **2/2 PASS**; HX05–HX06 ampliadas **2/2 PASS**.
- **36 de 36 comandos `run: node`** extraídos del workflow `.github/workflows/quality-gate.yml`: retorno 0. Otros pasos del workflow, como comprobaciones de sintaxis con `find`, no se incluyen en esa cuenta.
- Ninguna petición a APIs externas ni pruebas con datos reales.

La reproducción adicional no pudo ejecutarse dentro de Chromium porque el navegador de este entorno respondió `net::ERR_BLOCKED_BY_ADMINISTRATOR` al abrir el servidor HTTP local. **No está verificado aquí el escenario real de dos pestañas Chrome**; Codex declara que sí lo probó, pero no es evidencia independiente de la presente auditoría.

## HX08: escritura aparentemente aceptada y perdida al cerrar pestaña

**Archivo afectado:** `modules/write-coordinator.js`.

- `queueMutation`, aprox. líneas 45–52, guarda la operación únicamente en el array `queued` de la pestaña.
- Interceptores de `Storage.prototype.setItem`, `removeItem` y `clear`, aprox. líneas 72–93: con `getFence()` activo, llaman a `queueMutation(...)` y devuelven `undefined`, igual que una escritura ordinaria satisfactoria, aunque no han persistido el dato.
- `replayQueued`, aprox. líneas 54–65, solo ejecuta la escritura cuando el JavaScript de esa pestaña continúa activo y recibe la liberación (aprox. líneas 95–104).
- No se observa un journal durable de pendientes ni una señal de error obligatoria al código que cree haber guardado.

**Escenario:** pestaña A comienza restauración y adquiere el fence; pestaña B invoca `localStorage.setItem('gordi_hx08_new_lead', '...')`, el coordinador lo deja solo en memoria y retorna sin error; la pestaña B se cierra/crashea; A libera el fence. La escritura de B nunca llega a `localStorage` y no existe una cola persistida desde la que reconstruirla.

**Prueba incluida:** `HX08_REGRESION_COLA_VOLATIL_20261016.cjs`. Carga directamente el módulo entregado en dos contextos de VM con `Storage` compartido y simula el cierre de la pestaña mediante la desuscripción del canal. Un control positivo reproduce el guardado si ambas pestañas sobreviven. El escenario de cierre **falla como se esperaba**:

```
Control PASS: con pestaña abierta, la cola se reproduce tras liberar el cerco.
AssertionError: HX08 FALLO: setItem aparentó éxito; el dato se perdió al cerrar la pestaña antes del replay.
actual: null
expected: 'lead-created-during-import'
```

Esto es una **reproducción estructural con el código real y un navegador simulado**, no una demostración visual en Chrome. La pérdida de memoria de una pestaña cerrada es inherente al modelo usado; la prueba de dos pestañas reales es requisito adicional de aceptación.

## Corrección requerida

1. Una operación de guardado durante restauración **no puede considerarse completada si sus datos únicamente están en una cola en memoria**. Elegir diseño que haga durables los pendientes (journal transaccional persistente, recuperable tras cerrar pestaña y sin interferir en la restauración), o rechazar/pausar explícitamente el guardado antes de que la UI lo trate como hecho. La alternativa de rechazo requiere reintento visible y no pérdida silenciosa en funciones que guardan datos.
2. Si el sistema bloquea la edición durante una restauración, mostrar estado claro en todas las pestañas modernas; no basta un toast fugaz ni devolver `undefined` de `setItem` como si se hubiera guardado.
3. Probar con dos pestañas reales que una pestaña que cierra después de intentar guardar no provoca pérdidas declaradas exitosas; probar cierres de la pestaña importadora, pérdida de lease, rollback y apertura posterior.
4. Conservar HX01–HX07, B01–B20, H01–H20, idempotencia de importación, API keys, cifrado, estados comerciales y protección de coste cero.
5. No utilizar perfiles reales ni versiones publicadas; la prueba en Celeron N4020 y la validación con copias de backups antiguos siguen pendientes.

## Estado de publicación

**NOT READY para restaurar datos reales en el perfil habitual**, aunque HX07 y el quality gate actual pasan. No justifica rehacer la arquitectura: requiere asegurar la semántica de guardado durante el fence y luego verificarla en navegador real y hardware objetivo. Los informes favorables del resto de pruebas mantienen su valor dentro de sus alcances.
