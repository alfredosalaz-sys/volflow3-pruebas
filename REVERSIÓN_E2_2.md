# Reversión de E2.2

La copia E2.1 original permanece en:

`C:\Users\NOSTROMO\Downloads\Voltflow3-E2.1-CORRECCION-20261015`

Para una reversión completa, utilizar esa carpeta en lugar de E2.2. Para una reversión selectiva, restaurar desde E2.1:

- `modules/business-providers.js`
- `tools/business-providers-mock-test.cjs`
- `.github/workflows/quality-gate.yml`
- `CONFIGURACION_FUNCIONAL.md`
- `tests/fixtures/business-coverage/README.md`
- `MANIFEST_APLICACION_SHA256.txt`
- `MANIFEST_SHA256.txt`

No borrar ni reinicializar localStorage, IndexedDB, leads, backups o perfiles del navegador. La reversión no requiere migraciones de datos.
