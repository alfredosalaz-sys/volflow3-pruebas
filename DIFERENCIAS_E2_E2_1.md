# Diferencias exactas E2 -> E2.1

## Archivo funcional modificado

- `modules/business-providers.js`: detección general de unidades físicas incompatibles antes de fusionar registros.

Los otros 31 archivos del manifiesto funcional permanecen idénticos por SHA256 a E2.

## Herramientas y pruebas modificadas

- `tools/build-business-coverage-corpus.cjs`
- `tools/fetch-business-coverage-sources.cjs`
- `tools/validate-business-coverage-corpus.cjs`
- `tools/business-coverage-corpus-test.cjs`
- `tools/business-providers-mock-test.cjs`
- `.github/workflows/quality-gate.yml`

## Fixtures y métricas regenerados

- `tests/fixtures/business-coverage/source-manifest.json`
- `tests/fixtures/business-coverage/corpus.v1.json`
- `tests/fixtures/business-coverage/corpus-manifest.json`
- `tests/fixtures/business-coverage/quality-metrics.json`
- `tests/fixtures/business-coverage/README.md`

Las 17 capturas de `tests/fixtures/business-coverage/raw/` permanecen idénticas. No se descargaron datos nuevos.

## Documentación

- `CONFIGURACION_FUNCIONAL.md`
- `INFORME_TECNICO_E2_CORPUS_PILOTO.md` (marcado como histórico)
- `RESULTADOS_PRUEBAS_E2.md` (marcado como histórico)
- `INFORME_TECNICO_E2_1_CORRECCION.md` (nuevo)
- `RESULTADOS_PRUEBAS_E2_1.md` (nuevo)
- `REVERSIÓN_E2_1.md` (nuevo)
- `DIFERENCIAS_E2_E2_1.md` (nuevo)

## Manifiestos

- `MANIFEST_APLICACION_SHA256.txt`
- `MANIFEST_SHA256.txt`

No cambian `app.html`, `index.html`, `version.json`, el resto de `modules/`, `styles/`, el índice Madrid v1, leads, almacenamiento, backups o credenciales.
