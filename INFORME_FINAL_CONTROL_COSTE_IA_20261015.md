# Informe final: control de coste IA y busqueda local

Fecha: 2026-10-15  
Version candidata: 2.9.4  
Build: 2026.10.15.0100  
Base Git: `41b2e34daaf43c754f9cf799a8cf01d9965ce814`

## Dictamen

Los riesgos comprobables de la auditoria quedan corregidos. Todas las salidas a Gemini, Groq y OpenRouter pasan por una unica pasarela que falla en modo cerrado. Con claves sinteticas configuradas, la prueba registro cero solicitudes de red. El buscador selecciona indices locales sin enriquecimiento como modo predeterminado y termina tras el indice local cuando este ya ofrece resultados.

La entrega esta preparada para revision mediante Pull Request, pero no se ha creado el PR, hecho push, merge ni despliegue. Tampoco se certifica coste cero contractual del proveedor: mientras no exista un bloqueo externo de facturacion verificable, las API de IA permanecen deshabilitadas. Falta validar en el Celeron N4020 real.

## Correcciones

1. `modules/ai-router.js` concentra la unica salida de red para proveedores IA en `aiGatewayFetch()`.
2. Gemini, Groq y OpenRouter declaran `externallyEnforcedFree: false`; una clave de `localStorage` no cambia esa politica.
3. Correo, chat, bandeja, UI e inteligencia de busqueda llaman a la pasarela y etiquetan el proposito de cada solicitud.
4. La inteligencia de sesion deja de ejecutarse automaticamente al terminar una busqueda.
5. La configuracion muestra `Bloqueado por coste cero` y deja de presentar una clave guardada como proveedor activo.
6. El selector `plan-enrich` comienza en `none`: descubrimiento local/gratuito. El enriquecimiento completo queda optativo.
7. Si el indice estatico devuelve resultados en el modo predeterminado, no se espera a Overpass o DIBA. Cuando no hay datos locales, se conservan los respaldos gratuitos y sus diagnosticos.
8. `.github/workflows/quality-gate.yml` ejecuta la nueva prueba fail-closed.

## Evidencia automatizada

| Prueba | Resultado |
|---|---|
| `voltflow-regression-tests.cjs` | PASS 7/7 |
| `ai-zero-cost-gate-test.cjs` | PASS, 0 llamadas de red; 3 proveedores bloqueados |
| `business-providers-mock-test.cjs` | PASS |
| `real-provider-index-test.cjs` | PASS: Madrid Dental 9; 28015 Dental 1; 28015 Gestorias 1 |
| `provider-performance-smoke.cjs` | PASS: 600 -> 300 en 37 ms |
| `places-search-mock-test.cjs` | PASS |
| `check-release-integrity.cjs` | PASS: 2.9.4 / 2026.10.15.0100 / 21 recursos |
| `verify-manifest.cjs` | PASS: 28 archivos en el arbol servido |
| Sintaxis Node | PASS: 34 archivos JS/CJS |
| `git diff --check` | PASS; solo avisos informativos de EOL de Git |

`tools/quality-check.js` sigue detectando marcadores de mojibake heredados en `app.html`, `inbox.js`, `init.js`, `search.js`, `ui.js` y `workflow.js`. No se hizo una conversion masiva de codificacion porque no forma parte de las incidencias funcionales y presenta riesgo de alterar cientos de cadenas. Este control no forma parte del workflow actual y queda documentado como deuda, no como PASS.

Las pruebas Python antiguas `b2b_quality_audit.py`, `b2b_segments_test.py`, `idb_consistency_test.py`, `idb_migration_test.py`, `idb_recovery_audit.py`, `functional_smoke.py`, `perf_startup.py` y `stability_120s.py` no existen en este clon y no se declaran superadas.

## Chrome aislado

Chrome headless uso un perfil temporal, CPU throttling x4, HTTPS externo bloqueado y datos sinteticos. No se accedio al perfil real ni al almacenamiento del CRM.

| Metrica | Build 2026.10.14.0200 | Build 2026.10.15.0100 |
|---|---:|---:|
| Madrid Dental | 9 progresivos | 9 progresivos |
| Adaptadores remotos tras resultado local | no medido | 0 |
| Modo inicial de enriquecimiento | `all` | `none` |
| Bloqueo de IA con clave sintetica | no existia de forma global | `AI_ZERO_COST_BLOCKED` |
| Interaccion medida | 77,2 ms | 76,2 ms |
| Tarea larga maxima de arranque | 494 ms | 356 ms |
| Tarea larga maxima del flujo | 92 ms | 109 ms |
| Heap JS | 2,67 MB | 3,09 MB |
| Excepciones JavaScript | 0 | 0 |

Las medidas son ejecuciones puntuales y no prueban una mejora estadistica. El cambio demostrado es funcional: el modo predeterminado evita esperas remotas cuando ya existen resultados locales. Bajo CPU x4 siguen observandose tareas superiores a 50 ms.

## Integridad funcional

- Las siete regresiones de deduplicacion, clasificacion, ubicacion, errores de proveedor y bloqueo de Google Places permanecen en PASS.
- `getMergeableSectors()` sigue conectado a la deduplicacion real.
- La procedencia y las sucursales se preservan en una fusion valida.
- Madrid usa el indice versionado y devuelve 9 resultados Dental.
- Barcelona se valida con un fixture DIBA normalizado; en esta fase no se hizo una llamada externa nueva.
- Importacion y filtros aceptan un resultado local valido en Chrome.
- `BASELINE_ESTABLE.json` no se modifico.

## Archivos de esta auditoria

- `app.html`, `index.html`, `version.json`
- `modules/ai-router.js`, `modules/ai-email.js`, `modules/chat.js`, `modules/inbox.js`, `modules/ui.js`, `modules/search.js`, `modules/init.js`
- `tools/ai-zero-cost-gate-test.cjs`, `tools/browser-search-regression.cjs`
- `.github/workflows/quality-gate.yml`
- `MANIFEST_SHA256.txt`
- `INSTRUCCIONES_PUBLICACION_Y_REVERSION.md`

El paquete tambien conserva los archivos de la reparacion multifuente anterior que aun no forman parte del commit base. `DIFF_EXACTO_AUDITORIA_20261015.patch` compara esta entrega con `ENTREGA_GITHUB_BUSCADOR_MULTIFUENTE_CORREGIDO`.

## Riesgos pendientes

- No hay prueba en el Celeron N4020 real.
- La cobertura nacional no esta demostrada; Madrid es el unico indice local empaquetado y Barcelona depende de DIBA en operacion real.
- Los proveedores IA quedan inutilizables en ZERO_COST_MODE hasta disponer de un control externo efectivo. Es una decision deliberada de seguridad economica.
- Persiste mojibake heredado y el control historico `quality-check.js` falla por ese motivo.
- Las API externas pueden cambiar sus condiciones; no se afirma que una etiqueta comercial `free` garantice ausencia de facturacion.

## Estado de Pull Request

Estado: **preparado, no creado**. La restriccion de no hacer push impide abrir un Pull Request remoto. El procedimiento correcto es publicar una rama, ejecutar el quality gate y abrir un PR hacia `main`; nunca sustituir el repositorio con la carpeta ni hacer push directo a `main`.

Recomendacion: apta para Pull Request y revision controlada. No recomendar despliegue final hasta revisar el diff, resolver o aceptar expresamente la deuda de mojibake y repetir la prueba en el equipo objetivo.
