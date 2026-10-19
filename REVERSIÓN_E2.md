# Reversion de E2

E2 no altera el runtime ni los datos del CRM. Para revertirla, eliminar exclusivamente los archivos añadidos por E2 y restaurar desde la copia E1 los dos archivos documentales modificados:

- `.github/workflows/quality-gate.yml`
- `CONFIGURACION_FUNCIONAL.md`

Archivos y directorios exclusivos de E2:

- `tools/business-coverage-sources.cjs`
- `tools/fetch-business-coverage-sources.cjs`
- `tools/build-business-coverage-corpus.cjs`
- `tools/validate-business-coverage-corpus.cjs`
- `tools/business-coverage-quality.cjs`
- `tools/business-coverage-corpus-test.cjs`
- `tests/fixtures/business-coverage/`
- `INFORME_TECNICO_E2_CORPUS_PILOTO.md`
- `REVERSIÓN_E2.md`

No se debe borrar ni reinicializar localStorage, IndexedDB o perfiles de navegador. La reversion no requiere migracion de datos porque ningun dato de usuario fue modificado.

Tras revertir, ejecutar el contrato E1 y verificar el manifiesto SHA256 de la copia E1.
