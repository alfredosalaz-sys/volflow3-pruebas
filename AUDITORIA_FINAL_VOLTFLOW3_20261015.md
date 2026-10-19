# Voltflow3 — auditoría independiente de la entrega multifuente corregida

**Fecha:** 15 de octubre de 2026  
**Paquete inspeccionado:** `ENTREGA_GITHUB_BUSCADOR_MULTIFUENTE_CORREGIDO.rar` (RAR5).  
**Contenido:** 40 archivos regulares en la carpeta de entrega; sin modificaciones de la instalación del usuario o del repositorio publicado.  
**Versión indicada:** 2.9.3 / build 2026.10.14.0200.

## Dictamen

**NO publicar en producción todavía si el requisito es coste externo estrictamente igual a 0 €.** La reparación del núcleo de búsqueda supera las pruebas facilitadas, pero la aplicación conserva llamadas directas de IA a Gemini fuera del router de límites gratuitos. La verificación de rendimiento en el Celeron N4020 real sigue pendiente. Tampoco está demostrada una cobertura empresarial nacional.

## Pruebas que he ejecutado, sin llamadas a servicios externos

- `node tools/verify-manifest.cjs`: **PASS**, 40 archivos, hashes SHA256 correctos.
- `node tools/check-release-integrity.cjs`: **PASS**, v2.9.3, build 2026.10.14.0200 y 21 recursos de carga.
- `node voltflow-regression-tests.cjs .`: **PASS 7/7**.
- `node tools/business-providers-mock-test.cjs`: **PASS**.
- `node tools/real-provider-index-test.cjs`: **PASS**, Madrid Dental=9, 28015 Dental=1, 28015 Gestorías=1. Usa el índice empaquetado: no es una consulta nueva al portal de Madrid.
- `node tools/provider-performance-smoke.cjs`: **PASS**, 600 sintéticos -> 300 únicos en 27 ms en este entorno.
- `node tools/places-search-mock-test.cjs`: **PASS**, simula errores de autenticación, facturación, cuota y red.
- `node --check` sobre módulos, herramientas y test principal: **PASS**.

**Prueba de navegador independiente:** se intentó adaptar el comprobador Chromium a este contenedor; el navegador devolvió `net::ERR_BLOCKED_BY_ADMINISTRATOR` al navegar incluso a la URL HTTP local de la aplicación. Es una restricción de este entorno de ejecución; **no se atribuye a un error del CRM**. No puedo confirmar desde aquí el rendimiento de Chrome ni reproducir las métricas de CPU x4 aportadas por Codex.

## Hallazgos que exigen acción

### A. [Alta prioridad] Rutas de Gemini que eluden el router ZERO_COST

- `modules/search.js` en torno a **5327** invoca `generateSessionIntel(...)` de manera automática al terminar el flujo de búsqueda con enriquecimiento, y la función (`~5400–5435`) llama directamente a `generativelanguage.googleapis.com` si hay clave guardada.
- `modules/ui.js` en torno a **385–410** (`regenerateSubjectOnly`) y **~499** (generación de seguimiento) llama directamente a Gemini, sin consultar `AI_ZERO_COST_PROVIDERS` ni `aiZeroCostAllowed`.
- Hay más invocaciones directas en `modules/inbox.js`, `modules/chat.js`, `modules/ai-email.js` y otras secciones de `modules/search.js`; requieren un inventario y pruebas por ruta.
- `modules/ai-router.js` sí tiene un control local de proveedores y cuotas, pero las rutas anteriores no están obligadas a utilizarlo.

**Riesgo:** el coste cero no se puede certificar si se usan claves vinculadas a un proyecto o proveedor que pueda facturar. Una cuota guardada en `localStorage` no equivale a un bloqueo oficial del proveedor. **No se han observado cargos ni se han efectuado llamadas reales en esta auditoría.**

**Corrección exigida:** centralizar todas las invocaciones a proveedores de IA en una única pasarela verificable y con exclusión predeterminada de rutas no permitidas; impedir toda llamada directa, incluidas las automáticas. Para proveedores con facturación potencial, exigir control externo efectivo documentado o dejarlos deshabilitados. Incorporar pruebas que fallen si alguna función puede realizar una solicitud sin autorización.

### B. [Prioridad media-alta] Selección inicial orientada a enriquecimiento lento

En `app.html` la opción predeterminada de `plan-enrich` es `Todo (recomendado)`. En `modules/search.js` esta opción activa varias fases, incluido scraping web. En ZERO_COST_MODE se evitan los proxies públicos y queda el acceso directo CORS, que puede agotar el timeout en webs que no permitan la lectura desde GitHub Pages.

**Recomendación:** en modo de coste cero, comenzar por descubrimiento con índices locales y resultados progresivos, y ofrecer enriquecimiento adicional optativo por empresa, en lugar de lanzar por defecto una cadena extensa de consultas fallidas.

### C. [Prioridad media] Publicación de la entrega y reglas de GitHub

El archivo `INSTRUCCIONES_PUBLICACION_Y_REVERSION.md` propone hacer `push` directamente a `origin main`. Esto **no es el procedimiento apropiado** si el repositorio tiene activada la protección de rama con Pull Request y comprobaciones obligatorias. Incluso si no está activada, el cambio de 40 archivos debe revisarse como diff contra el `origin/main` actual. La carpeta entregada no incluye necesariamente todos los documentos de gobernanza del repositorio y **no debe tratarse como reemplazo destructivo del repositorio**.

**Corrección exigida:** preparar rama + Pull Request sin forzar `main`, adjuntar informe de diferencias y aprobar solo después del quality gate, pruebas de coste y prueba en el equipo objetivo.

## Aspectos comprobados favorablemente

- Las 7 regresiones de clasificación, deduplicación, ubicación, estados y bloqueo de Google Places pasan sus tests.
- Índice empaquetado real de Madrid: 29 registros en Dental, Gestorías e Inmobiliarias; 9 recuperados para Dental en Madrid, según test.
- Manifiestos SHA256 y versión coherentes.
- `app.html` carga `modules/business-providers.js` antes de `modules/search.js`, ambas con el identificador de caché 2026.10.14.0200.
- `ZERO_COST_MODE` del descubrimiento se declara constante y Google Places se marca como bloqueado; las rutas básicas de geocodificación y SDK de Google Maps tienen guardas.

## Límites no resueltos

- No está probada cobertura nacional; Overture/Foursquare permanecen sin particiones reales incluidas.
- Overpass estaba bloqueado por HTTP 406 en la red probada por Codex; aquí no se han efectuado peticiones reales.
- El índice Madrid es una muestra de 29 registros, sin teléfonos, páginas web ni emails aportados en ella.
- El Celeron N4020 real sigue pendiente de prueba de arranque y búsqueda.
- La prueba de Chrome de Codex emplea fixtures y HTTPS bloqueado; valida rutas offline, no conexión real con todas las fuentes.

## Plan mínimo de corrección

1. Auditar y bloquear/centralizar todas las rutas directas de IA, en particular la inteligencia de sesión automática.
2. Añadir pruebas fail-closed de ZERO_COST para IA y otras APIs, incluida la ausencia de llamadas cuando solo existe una clave de un proyecto potencialmente facturable.
3. Cambiar la búsqueda inicial a modo ligero y progresivo en ZERO_COST_MODE; evitar esperas innecesarias por scraping CORS.
4. Repetir todas las pruebas offline; regenerar manifiesto SHA256 y ajustar la build/caché cuando corresponda.
5. Probar con Chrome en el Celeron real, con perfil aislado y sin alterar datos.
6. Preparar Pull Request desde una rama y no hacer push directo a `main`.

**Conclusión:** el motor de descubrimiento sí ha mejorado y las pruebas disponibles pasan. El paquete sigue siendo un **candidato a publicación controlada**, no una versión certificada como «coste externo 0 € sin excepciones» ni como «buscador nacional completo».
