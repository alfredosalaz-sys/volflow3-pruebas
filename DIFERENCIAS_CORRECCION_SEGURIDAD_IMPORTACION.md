# Diferencias de la correccion

## Cambios funcionales

- `modules/historical-import.js`: payload completo, huella completa, identidad sin ID, validacion estricta y cuarentena.
- `modules/secure-backup.js`: persistencia recuperable de archivos incorporados y referencias.
- `modules/ui.js`: la verificacion y el commit capturan el estado vivo, no el snapshot previo de la pantalla.
- `.github/workflows/quality-gate.yml`: incorpora HX01-HX04 sin alterar el archivo independiente.

## Pruebas e inventario

- `tools/historical-import-browser-harness.html`: contenido IndexedDB-only, store desconocido, relacion y adjunto binario.
- `tools/build-persistence-inventory.cjs`: resuelve constantes de claves persistentes.
- `data/persistence-contract.v1.json` y `PERSISTENCE_COVERAGE_REPORT.json`: regenerados sin valores.
- Evidencias de navegador y manifests: regenerados.

## No modificado

Buscador, proveedores, corpus, taxonomia, prioridades comerciales, estados C0-C1.2, configuracion funcional y `version.json` permanecen fuera del cambio funcional.

## Comparacion SHA256 con la entrega anterior

- Modificados: 16 archivos.
- Nuevos: 4 archivos.
- Eliminados: 0 archivos.

Modificados:

- `.github/workflows/quality-gate.yml`
- `modules/historical-import.js`, `modules/secure-backup.js`, `modules/ui.js`
- `tools/build-persistence-inventory.cjs`, `tools/historical-import-browser-harness.html`
- `data/persistence-contract.v1.json`, `PERSISTENCE_COVERAGE_REPORT.json`
- `INVENTARIO_CLAVES_STORES_RELACIONES.md`, `MATRIZ_FORMATOS_HISTORICOS_PROBADOS.md`
- `RESULTADOS_NAVEGADOR_IMPORTACION_HISTORICA.json`, `RESULTADOS_NAVEGADOR_RESTAURACION.json`
- `tests/artifacts/historical-import/merged-synthetic.vfbackup`, `tests/artifacts/secure-backup/browser-synthetic.vfbackup`
- `MANIFEST_APLICACION_SHA256.txt`, `MANIFEST_SHA256.txt`

Los cuatro archivos nuevos son este documento, el informe tecnico de correccion, los resultados y el procedimiento de reversion.
