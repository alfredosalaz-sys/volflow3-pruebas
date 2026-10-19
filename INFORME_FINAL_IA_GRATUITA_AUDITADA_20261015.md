# Voltflow 3 2.9.4 - Auditoria final de IA gratuita

Build candidata: `2026.10.15.0300`  
Rama: `reparacion-buscador-places-20261014`  
Base comprobada: `41b2e34daaf43c754f9cf799a8cf01d9965ce814`  
Fecha: 2026-10-15

## 1. Resumen ejecutivo

- **VERIFICADO EN CODIGO:** las salidas de red de Gemini, Groq y OpenRouter estan centralizadas en `aiGatewayFetch()`. Los demas modulos no contienen sus endpoints.
- **PROBADO AUTOMATICAMENTE:** una clave existente, un modelo no permitido, una aprobacion caducada, una clave cambiada, herramientas/grounding no verificados, cuotas agotadas, concurrencia, proveedor desconocido y configuracion corrupta no alcanzan la red.
- **PROBADO EN NAVEGADOR:** Chrome con perfil temporal, HTTPS externo bloqueado y CPU x4 completo busqueda local, deduplicacion, importacion, filtros, persistencia/restauracion sintetica y seguridad de contenido sin excepciones.
- **VERIFICADO EN CODIGO:** los borradores conservan generacion, regeneracion, edicion y aprobacion previa al cliente de correo. Los prompts usan solo campos disponibles y prohiben inventar datos.
- **NO VERIFICADO:** el estado de facturacion de las cuentas del usuario. Voltflow exige confirmacion por sesion, pero un control local no garantiza coste cero en el proveedor.
- **PENDIENTE DE PRUEBA REAL:** llamadas a cuentas reales y comportamiento en un Celeron N4020 fisico. No se realizaron para respetar las restricciones.

Dictamen: candidata apta para Pull Request tecnico tras revisar el riesgo de mojibake historico. No debe desplegarse como coste cero garantizado hasta verificar externamente que cada cuenta autorizada carece de facturacion.

## 2. Defectos encontrados y corregidos

| Defecto | Correccion | Evidencia |
|---|---|---|
| Respuestas IA insertadas como HTML sin una politica unica | Nuevo `modules/ai-security.js`; escape de texto y sanitizacion de HTML permitido en correo, chat y UI | **PROBADO AUTOMATICAMENTE** |
| Clave Gemini incluida en la URL | Se envia mediante `x-goog-api-key` | **PROBADO AUTOMATICAMENTE** |
| Una clave podia persistirse como nueva credencial de IA | Las claves nuevas de Gemini, Groq y OpenRouter se guardan solo en `sessionStorage`; se conservan claves antiguas para compatibilidad y backups | **PROBADO EN NAVEGADOR** |
| Aprobacion insuficiente | Se exige plan gratuito, facturacion desactivada, riesgo del navegador y tratamiento de datos, por sesion y huella de clave | **PROBADO AUTOMATICAMENTE** |
| Cuotas solo diarias | Limites por minuto/sesion/dia/mes, concurrencia 1, cooldown, tokens maximos, timeout y cancelacion | **PROBADO AUTOMATICAMENTE** |
| Telemetria mezclaba estimaciones y datos reales | Campos separados para estimacion local y cabeceras/tokens reportados por proveedor | **PROBADO AUTOMATICAMENTE** |
| Fallback podia duplicar solicitudes ambiguas | Solo se permite automaticamente tras un 429 identificado; timeout, red/CORS y respuesta malformada no se repiten | **PROBADO AUTOMATICAMENTE** |
| Etiquetas afirmaban que la cuenta estaba confirmada | La UI muestra `REQUIERE CONFIRMACION` | **VERIFICADO EN CODIGO** |
| Falta de seleccion/privacidad simples | Modos Automatico gratuito/Manual y privacidad minima/solo anonimo | **PROBADO AUTOMATICAMENTE** |

## 3. Arquitectura final del router

- **VERIFICADO EN CODIGO:** registro inmutable de proveedores/modelos permitidos: Gemini `gemini-2.5-flash-lite`, Groq `openai/gpt-oss-20b` y OpenRouter `openrouter/free`.
- **VERIFICADO EN CODIGO:** perfiles para redaccion, asuntos, seguimiento, estilo, clasificacion, extraccion y resumen.
- **VERIFICADO EN CODIGO:** autorizacion inmediatamente antes de `fetch`, una unica salida para los tres endpoints, validacion de cuerpo y modelo, limite de entrada/salida y bloqueo de herramientas no verificadas.
- **VERIFICADO EN CODIGO:** selector automatico y selector manual limitado al registro permitido.
- **VERIFICADO EN CODIGO:** cancelacion por proposito y sustitucion de trabajos obsoletos.
- **PROBADO AUTOMATICAMENTE:** fallback 429 Gemini -> Groq; un proveedor manual no hace fallback automatico.

## 4. Gestor de cuotas

Registra intentos, exitos, fallos, latencia, peticiones por minuto/sesion/dia/mes, tokens estimados, tokens reportados, cuota reportada, cooldown y ultimo error. Interpreta `Retry-After`, limites/restantes de peticiones y tokens, y tiempos de reinicio cuando el proveedor los incluye.

Clasificacion: **PROBADO AUTOMATICAMENTE** con respuestas simuladas. **PENDIENTE DE PRUEBA REAL** para los nombres y semantica de cabeceras que entregue cada cuenta concreta.

Los limites locales son conservadores y evitan uso deliberado por encima del presupuesto, pero no son un control de facturacion del proveedor. Clasificacion: **VERIFICADO EN CODIGO** y **NO VERIFICADO** como garantia economica externa.

## 5. Proveedores evaluados

- Gemini, Groq y OpenRouter: conservados y bloqueados hasta aprobacion completa por sesion. **VERIFICADO EN CODIGO**.
- Cloudflare Workers AI: plan Free documentado y exceso rechazado en Workers Free; no activado porque cuenta, CORS y alcance de token no fueron verificados. **VERIFICADO EN DOCUMENTACION OFICIAL** / **PENDIENTE DE PRUEBA REAL**.
- Hugging Face: no activado; credito gratuito pequeno y uso adicional condicionado a creditos/proveedor. **VERIFICADO EN DOCUMENTACION OFICIAL**.
- Mistral: no activado; Free mode existe, pero limites/modelos y estado PAYG son de cuenta. **VERIFICADO EN DOCUMENTACION OFICIAL** / **PENDIENTE DE PRUEBA REAL**.
- Cerebras: descartado por documentacion oficial no coherente entre Free antiguo y oferta actual PAYGO con credito inicial. **VERIFICADO EN DOCUMENTACION OFICIAL**.
- Ollama local: no incorporado; coste API local cero, pero instalacion, CORS y rendimiento en N4020 no se probaron. **PENDIENTE DE PRUEBA REAL**.

Detalle y fuentes: `PROVEEDORES_IA_GRATUITA_20261015.md`.

## 6. Proteccion de datos y credenciales

- **PROBADO AUTOMATICAMENTE:** secretos no aparecen en endpoints, logs de telemetria ni archivos revisados; Gemini no usa query string.
- **PROBADO AUTOMATICAMENTE:** sanitizacion de script, manejadores de eventos y URLs `javascript:`; conserva formato seguro.
- **VERIFICADO EN CODIGO:** defensa central ante instrucciones incrustadas en datos empresariales y envio de contexto minimo.
- **VERIFICADO EN CODIGO:** modo `anonymous_only` bloquea operaciones marcadas con datos personales.
- **VERIFICADO EN CODIGO:** al cambiar una clave se revoca la autorizacion anterior.

Riesgo residual: una aplicacion estatica no puede proteger por completo una clave frente a XSS, extensiones o scripts de terceros ejecutados en el mismo origen. Existen dependencias CDN en la pagina. Las claves antiguas se conservan por compatibilidad y respaldo exigidos por `CONFIGURACION_FUNCIONAL.md`. Clasificacion: **NO VERIFICADO** como aislamiento equivalente a un backend.

## 7. Buscador y CRM preservados

- **PROBADO AUTOMATICAMENTE:** auditoria independiente 7/7.
- **PROBADO EN NAVEGADOR:** Madrid devuelve 9 registros del indice; Barcelona devuelve 1 de DIBA; los resultados locales aparecen antes de adaptadores remotos.
- **PROBADO EN NAVEGADOR:** dos negocios con telefono comun permanecen separados; duplicados reales se fusionan y conservan dos procedencias.
- **PROBADO AUTOMATICAMENTE:** `getMergeableSectors()` permanece conectado al flujo de deduplicacion.
- **PROBADO EN NAVEGADOR:** lead, cobertura y clave historica sinteticos se exportan; la restauracion recupera el lead sin tocar datos reales.
- **VERIFICADO EN CODIGO:** no se usa `localStorage.clear()` ni `indexedDB.deleteDatabase()` en el cambio.

## 8. Resultados de pruebas

| Prueba | Resultado |
|---|---|
| `voltflow-regression-tests.cjs` | 7/7 PASS |
| `business-providers-mock-test.cjs` | PASS |
| `real-provider-index-test.cjs` | PASS: Madrid Dental 9, 28015 Dental 1, Gestorias 1 |
| `provider-performance-smoke.cjs` | PASS: 600 -> 300 unicos, 39 ms en la ejecucion final |
| `places-search-mock-test.cjs` | PASS |
| `ai-zero-cost-gate-test.cjs` | PASS |
| `ai-email-free-personalization-test.cjs` | PASS |
| `ai-security-test.cjs` | PASS |
| Sintaxis de todos los modulos JS | PASS |
| `check-release-integrity.cjs` | PASS: 2.9.4 / 2026.10.15.0300 / 22 recursos |
| `verify-manifest.cjs` | PASS: 29 archivos de aplicacion; la entrega completa dispone ademas de manifiesto integral |
| Navegador aislado CPU x4 | PASS, 0 errores de ventana y 0 excepciones runtime |
| `git diff --check` | PASS |
| `quality-check.js` | FAIL por mojibake historico en `app.html`, `inbox.js`, `init.js`, `search.js`, `ui.js` y `workflow.js` |

Las pruebas historicas Python citadas en fases anteriores (`b2b_quality_audit.py`, `b2b_segments_test.py`, `idb_consistency_test.py`, `idb_migration_test.py`, `idb_recovery_audit.py`, `functional_smoke.py`, `perf_startup.py`, `stability_120s.py`) no existen en este arbol y no se declaran superadas. Clasificacion: **NO VERIFICADO**.

No se modifico el quality gate para ocultar el fallo de mojibake. Una recodificacion masiva se descarto por riesgo de regresion. Clasificacion: **VERIFICADO EN CODIGO**.

## 9. Rendimiento comparable

Chrome aislado, mismo script, datos y CPU throttling x4; mediana de tres ejecuciones. HTTPS externo bloqueado.

| Metrica | Entrega 0200 | Candidata 0300 | Cambio |
|---|---:|---:|---:|
| Respuesta de interaccion | 69,5 ms | 79,0 ms | +9,5 ms |
| Tareas largas de arranque | 8 | 9 | +1 |
| Tarea larga maxima de arranque | 342 ms | 323 ms | -19 ms |
| Tareas largas de operacion | 2 | 2 | igual |
| Tarea larga maxima de operacion | 142 ms | 151 ms | +9 ms |
| Heap JS usado | 2.590.712 B | 2.992.120 B | +401.408 B |

Clasificacion: **PROBADO EN NAVEGADOR**. Resultado mixto: no demuestra mejora global ni bloqueo resuelto en hardware real. La interaccion medida sigue por debajo de 100 ms, pero persisten tareas largas superiores a 50 ms. CPU x4 no equivale al N4020. Clasificacion para el Celeron fisico: **PENDIENTE DE PRUEBA REAL**.

## 10. Archivos de la candidata

Aplicacion y configuracion: `.github/workflows/quality-gate.yml`, `app.html`, `index.html`, `version.json`, `MANIFEST_SHA256.txt`, `modules/ai-router.js`, `modules/ai-security.js`, `modules/ai-email.js`, `modules/chat.js`, `modules/init.js`, `modules/state.js`, `modules/ui.js`, mas las correcciones ya validadas de `modules/search.js`, `modules/inbox.js`, `modules/business-providers.js` y `data/business-indexes/`.

Pruebas: `voltflow-regression-tests.cjs`, `tools/ai-zero-cost-gate-test.cjs`, `tools/ai-email-free-personalization-test.cjs`, `tools/ai-security-test.cjs`, `tools/browser-search-regression.cjs` y las pruebas previas de proveedores, indices, Places, rendimiento, integridad y manifiesto.

## 11. Riesgos y limitaciones

1. **NO VERIFICADO:** coste cero de cuentas concretas; requiere revisar facturacion en cada consola.
2. **NO VERIFICADO:** proteccion total de secretos en GitHub Pages; un backend gratuito opcional seria mas seguro.
3. **PENDIENTE DE PRUEBA REAL:** CORS y respuesta real de proveedores; no se consumieron cuotas.
4. **PENDIENTE DE PRUEBA REAL:** rendimiento sostenido en Celeron N4020.
5. **VERIFICADO EN CODIGO:** mojibake historico permanece y hace fallar `quality-check.js`.
6. **NO VERIFICADO:** terminos RGPD de cada cuenta/configuracion; el responsable debe aprobar proveedor, base juridica y minimizacion antes de enviar datos identificables.

## 12. Estado de publicacion

- **VERIFICADO EN CODIGO:** build candidata preparada sin commit, push, merge, PR remoto ni despliegue.
- **PROBADO AUTOMATICAMENTE:** tests indicados salvo el gate de mojibake documentado.
- **PENDIENTE DE PRUEBA REAL:** verificacion manual de cuentas gratuitas y prueba fisica N4020.

Recomendacion: abrir un Pull Request de revision, mantenerlo sin desplegar, ejecutar el mismo quality gate en CI y decidir expresamente si el mojibake historico se corrige en una rama independiente. No promocionar la candidata como “coste cero garantizado”; describirla como “rutas de IA bloqueadas por defecto y limitadas a modelos gratuitos autorizados”.

## 13. Confirmaciones

- No se realizaron llamadas reales a Gemini, Groq, OpenRouter, Google Places ni APIs de pago. **PROBADO EN NAVEGADOR** mediante bloqueo de HTTPS externo y **VERIFICADO EN PRUEBAS** mediante mocks.
- No se modificaron credenciales ni datos reales. **VERIFICADO EN CODIGO** y por uso de perfil temporal/datos sinteticos.
- No se modifico `BASELINE_ESTABLE.json`. **VERIFICADO EN CODIGO**.
- No se hizo commit, push, merge, Pull Request remoto ni despliegue. **VERIFICADO EN GIT**.
