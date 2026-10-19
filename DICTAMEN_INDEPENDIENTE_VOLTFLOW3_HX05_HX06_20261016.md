# Voltflow3 — auditoría independiente HX05-HX06 (16/10/2026)

## Alcance y metodología

Se extrajo el RAR `Voltflow3-IMPORTACION-HISTORICA-HX05-HX06-20261016.rar` en un directorio aislado. No se usaron credenciales reales, la sesión habitual de Chrome, APIs externas ni GitHub.

## Comprobaciones superadas

- Manifiesto SHA256: 215 archivos verificados por `node tools/verify-manifest.cjs`.
- Regresiones originales HX05-HX06: 2/2 PASS con `VOLTFLOW_IMPORTACION_PRUEBAS_EXTRA_20261016.cjs`.
- Regresiones ampliadas HX05-HX06: 2/2 PASS con `tools/historical-import-hx05-hx06-test.cjs`.
- Regresiones HX01-HX04: 4/4 PASS.
- Contratos de importación H01-H20: 20/20 PASS.
- Contratos de backup B01-B20: 20/20 PASS.
- `tools/check-release-integrity.cjs`: PASS, 2.9.4, build 2026.10.15.0300, 25 recursos.
- `tools/quality-check.js`: PASS.
- Sintaxis de todos los archivos JS/CJS de `modules/` y `tools/`: PASS.

Estas comprobaciones no certifican los datos históricos reales ni el Celeron N4020.

## HX07 — Bloqueante: pérdida de cambios concurrentes durante commit

**Archivo afectado:** `modules/historical-import.js`, función `commit()` (especialmente líneas 674-725 en esta entrega).

HX05 verifica la huella del estado vivo **antes de comenzar la fusión**. Sin embargo, tras capturar esa huella, `commit()` ejecuta operaciones asíncronas (`mergeExactList`, `buildPayload`, etc.) antes de llamar a `restoreBrowserPayload`. En ese intervalo otra pestaña, un autosave o un flujo del CRM puede escribir nuevos datos que quedan fuera del payload calculado. El código no vuelve a comprobar el estado inmediatamente antes de mutar.

**Reproducción independiente:** `HX07_CARRERA_ESCRITURA_CONCURRENTE_20261016.cjs`. Escenario sintético: existe el lead `original`, se prepara la importación de `historic`; entre la comprobación de huella y la restauración otra pestaña añade `created-in-another-tab`. El resultado actual informa `ok:true` pero solo conserva `original` y `historic`: el tercer lead desaparece. La prueba termina con código 1 por pérdida de datos.

Se usa un adaptador simulado para inyectar el cambio en un punto asíncrono real de la función: no se ha probado una carrera con dos pestañas reales de Chrome. Aun así demuestra que el algoritmo no conserva de forma general las escrituras concurrentes.

**Criterio de corrección:** no permitir que el commit indique éxito ni sobrescriba modificaciones concurrentes. Implementar exclusión mutua efectiva para los escritores del CRM, coordinación y/o congelación de escrituras en todas las pestañas del mismo origen, comprobación de revisión/huella en el límite crítico antes de las escrituras destructivas y rollback correcto. `navigator.locks` por sí solo no protege escritores que no utilicen el mismo lock. La prueba debe demostrar rechazo seguro o conservación de todos los leads.

Añadir esta regresión al quality gate, conservando íntegros HX01-HX06, H01-H20, B01-B20, seguridad IA y los contratos comerciales. Documentar las limitaciones de atomicidad entre IndexedDB y localStorage, y comprobar comportamiento real con dos pestañas y autosave en Chrome aislado.

## Dictamen

**HX05-HX06 corregidos y verificados. La protección de importación NO está aún aprobada para los datos reales del usuario** debido a HX07 y por la ausencia de pruebas autorizadas con backups históricos reales y rendimiento físico en Celeron N4020. Mantener intacta la versión estable; no recuperar todavía backups reales en el perfil habitual.
