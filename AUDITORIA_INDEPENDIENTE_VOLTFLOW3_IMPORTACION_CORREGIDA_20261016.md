# Voltflow3 — Auditoría independiente de importación histórica corregida

**Fecha:** 16 de octubre de 2026  
**Paquete:** `Voltflow3-IMPORTACION-HISTORICA-CORREGIDA-20261016.rar`  
**Versión declarada:** 2.9.4, build `2026.10.15.0300`  
**Dictamen:** **NOT READY para datos reales ni publicación definitiva**. El software pasa las regresiones heredadas, pero se han detectado dos defectos adicionales, uno de pérdida de datos y otro de inyección HTML.

## Alcance comprobado

- Extracción completa del RAR en carpeta de auditoría separada, sin utilizar datos de usuario ni credenciales reales.
- Integridad con `node tools/verify-manifest.cjs`: **208 archivos válidos**.
- Regresiones HX01–HX04: **4/4 PASS**.
- Importación histórica H01–H20: **20/20 PASS**.
- Backup cifrado B01–B20: **20/20 PASS**.
- Quality check: **PASS**.
- Ejecución adicional de **32/32 comandos `node` declarados en `.github/workflows/quality-gate.yml`: PASS**. No implica haber ejecutado un pipeline real en GitHub Actions ni un navegador sobre el Celeron.
- Revisión estática de `modules/historical-import.js`, `modules/secure-backup.js`, `modules/ui.js` y flujos de recuperación.
- Nuevas pruebas HX05–HX06: **0/2 PASS** en esta candidata.

## Hallazgo HX05 — Pérdida de datos por plan obsoleto (bloqueante)

**Código:** `modules/ui.js`, flujo `historicalImportFromFile` → `verifyHistoricalSafetyBackup` → `applyHistoricalImport`; `modules/historical-import.js`, funciones `analyze`, `commit`.

**Reproducción:**

1. El usuario analiza un backup histórico mientras el navegador tiene el lead `existente`. Se congela un `plan.mergedLocalStorage` con el resultado previsto.
2. Antes de crear y comprobar la copia de seguridad, el navegador incorpora otro lead legítimo `creado_tras_vista_previa` (por otra pestaña, edición o actualización).
3. Se genera y valida desde disco una copia de seguridad del estado **nuevo**, que incluye ambos leads actuales.
4. `commit` solo compara la huella de ese estado nuevo con la copia de seguridad; **no comprueba que el plan fuera calculado a partir de ese mismo estado**.
5. Se aplica `plan.mergedLocalStorage`, calculado sobre el estado antiguo. El commit informa `ok: true`, pero se pierde `creado_tras_vista_previa`.

**Resultado reproducido:** backup previo con `[existente, creado_tras_vista_previa]`; resultado final `[existente, historico]` con `ok: true`.

**Causa:** el plan de fusión no está ligado criptográficamente a la huella del estado que se analizó y el código no vuelve a analizar/reconciliar el snapshot vivo antes de confirmar.

**Corrección exigida:** capturar y guardar huella de estado **completo** al analizar; en `commit` verificar dicha huella contra estado vivo, contra la copia leída del disco y contra la versión del plan. Si difiere, **rechazar el plan con error claro** y exigir nuevo análisis y nueva aprobación; alternativamente reconstruirlo desde el estado vivo actual, repetir la vista previa y volver a solicitar confirmación. No admitir importación silenciosa con el plan obsoleto. Aplicar una coordinación de escrituras/pestañas efectiva durante la transacción.

## Hallazgo HX06 — Campo de versión de un backup incrustado como HTML (seguridad)

**Código:** `modules/historical-import.js`: `decodeSource` acepta `sourceVersion` del archivo de origen; `publicReport` lo devuelve sin escapar. `modules/ui.js`, `renderHistoricalImportPreview`, inserta `${report.sourceVersion || 'desconocida'}` en `modal.innerHTML`.

**Reproducción estática y funcional del flujo de datos:** un archivo sintético `voltflow-portable` con `version: '<img src=x onerror="alert(1)">'` pasa el análisis; la cadena HTML llega literalmente a `report.sourceVersion` y se interpola sin escapar en la plantilla enviada a `innerHTML`.

**Riesgo:** potencial ejecución de JavaScript al visualizar un archivo manipulado, especialmente grave porque el mismo origen de Chrome contiene tokens y API keys. No se ha realizado aquí una ejecución efectiva del payload en un navegador real; el hallazgo está sustentado por flujo de código y prueba estructural.

**Corrección exigida:** nunca interpolar metadatos procedentes de backups en `innerHTML` sin escape contextual estricto. Preferir `textContent` y construcción segura de elementos DOM. Auditar todos los campos importados mostrados en ventanas y reportes, incluidos nombre de archivo, versión, conflictos y mensajes de error. Añadir prueba de regresión con etiquetas HTML/atributos/event handlers. Evitar reproducir valores secretos en la interfaz, consola y logs.

## Cómo repetir los nuevos casos

Guarda `VOLTFLOW_IMPORTACION_PRUEBAS_EXTRA_20261016.cjs` junto a este informe y ejecuta desde Node.js:

```powershell
node "C:\RUTA\VOLTFLOW_IMPORTACION_PRUEBAS_EXTRA_20261016.cjs" "C:\Users\NOSTROMO\Downloads\Voltflow3-IMPORTACION-HISTORICA-CORREGIDA-20261016"
```

Con el paquete recibido, `HX05 FAIL`, `HX06 FAIL`. Las pruebas operan sobre datos sintéticos, sustitutos de navegador en memoria y código fuente; no leen ni alteran Chrome real. HX06 es una comprobación estructural de un sink inseguro, no una prueba de ejecución de JavaScript en Chrome.

## Criterios de aprobación

1. HX05 y HX06: **2/2 PASS**, sin modificar aserciones para ocultar los defectos.
2. Un nuevo lead surgido entre análisis y backup no puede perderse: rechazar/revalidar o regenerar el plan y obtener nueva aprobación.
3. Los backups manipulados no pueden insertar código en la vista previa ni acceder a API keys mediante HTML inyectado.
4. Conservar H01–H20, B01–B20, HX01–HX04 y el resto del quality gate.
5. Repetir backup cifrado, recuperación en perfil aislado, idempotencia y rollback, documentando una prueba de navegador válida.
6. Mantener la versión estable sin cambios, proteger credenciales y excluir datos reales de los tests.
7. Antes de la publicación definitiva, prueba física en Celeron N4020 y duplicados autorizados de backups reales antiguos, siempre en perfil aislado.

**Limitaciones de esta auditoría:** no se ha verificado el funcionamiento con backups reales del usuario ni la estabilidad física en su Celeron. El intento de Chromium en este entorno no produjo evidencia válida; no se declara prueba real de interfaz ni de XSS ejecutado.
