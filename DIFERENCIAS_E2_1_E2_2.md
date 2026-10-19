# Diferencias exactas E2.1 -> E2.2

## Archivo funcional modificado

- `modules/business-providers.js`: canonicalización ampliada de unidades físicas.

Los otros 31 archivos funcionales permanecen idénticos por SHA256.

## Pruebas y automatización

- `tools/business-providers-mock-test.cjs`: equivalencias y prioridad de identidad oficial.
- `.github/workflows/quality-gate.yml`: incorpora las siete regresiones independientes E2.2.

## Documentación

- `CONFIGURACION_FUNCIONAL.md`
- `tests/fixtures/business-coverage/README.md`
- `INFORME_TECNICO_E2_1_CORRECCION.md` (marcado como histórico)
- `RESULTADOS_PRUEBAS_E2_1.md` (marcado como histórico)
- `INFORME_TECNICO_E2_2_CORRECCION.md` (nuevo)
- `RESULTADOS_PRUEBAS_E2_2.md` (nuevo)
- `DIFERENCIAS_E2_1_E2_2.md` (nuevo)
- `REVERSIÓN_E2_2.md` (nuevo)

## Manifiestos

- `MANIFEST_APLICACION_SHA256.txt`
- `MANIFEST_SHA256.txt`

No cambian las 17 capturas, el corpus, sus métricas, `version.json`, el índice Madrid v1, leads, persistencia, backups o credenciales.
