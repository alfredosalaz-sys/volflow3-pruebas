# Diferencias exactas respecto a la base corregida

## Codigo y contratos

- `modules/historical-import.js`: huella del estado analizado, rechazo controlado de planes obsoletos y bloqueo de planes legacy incompletos.
- `modules/ui.js`: entrega del snapshot completo a `analyze()`, salida segura con `textContent` y reinicio obligatorio ante plan obsoleto.
- `tools/historical-import-browser-harness.html`: analiza con el payload completo en merge y rollback.
- `tools/historical-import-test.cjs`: H03 usa el contrato completo requerido por commit.
- `tools/historical-import-hx05-hx06-test.cjs`: nueva regresion de IndexedDB y metadatos hostiles.
- `.github/workflows/quality-gate.yml`: las pruebas independiente y ampliada HX05-HX06 son bloqueantes.
- `data/persistence-contract.v1.json`: inventario regenerado para reflejar las nuevas referencias y lineas, sin valores secretos.

## Evidencias y documentacion

- `RESULTADOS_NAVEGADOR_IMPORTACION_HISTORICA.json` y artefacto sintetico asociado.
- `RESULTADOS_NAVEGADOR_RESTAURACION.json` y artefacto sintetico asociado.
- `INFORME_CORRECCION_HX05_HX06_20261016.md`.
- `RESULTADOS_CORRECCION_HX05_HX06.md`.
- `DIFERENCIAS_HX05_HX06.md`.
- `REVERSION_HX05_HX06.md`.

No hay archivos eliminados. Los manifiestos se regeneran al final y reflejan exactamente la entrega.
