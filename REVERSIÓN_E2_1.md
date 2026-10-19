# Reversion de E2.1

Para volver exactamente a E2, sustituir la carpeta E2.1 por la copia conservada:

`C:\Users\NOSTROMO\Downloads\Voltflow3-E2-CORPUS-PILOTO-20261015`

Una reversion selectiva debe restaurar desde E2:

- `modules/business-providers.js`
- `.github/workflows/quality-gate.yml`
- `CONFIGURACION_FUNCIONAL.md`
- Las herramientas `business-coverage-*`, `build-business-coverage-corpus.cjs`, `fetch-business-coverage-sources.cjs` y `validate-business-coverage-corpus.cjs`.
- `tests/fixtures/business-coverage/`.
- Los manifiestos SHA256.

No se requiere migracion ni borrado de localStorage, IndexedDB, leads, backups o perfiles del navegador. Despues de revertir se deben ejecutar los contratos E1 y E2 y verificar el manifiesto correspondiente.
