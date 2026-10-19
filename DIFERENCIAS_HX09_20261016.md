# Diferencias HX09 respecto a HX08

## Produccion

- `modules/write-coordinator.js`: coordinacion fence/replay, comprobacion antes y despues de aplicar y reconocimiento individual de eventos.

No cambian buscador, corpus, taxonomia, leads, historial comercial, API keys, cifrado, backups, importador, IndexedDB ni version.

## Validacion

- `.github/workflows/quality-gate.yml`: HX09 independiente y ampliada pasan a ser bloqueantes.
- `tools/write-coordinator-contract-test.cjs`: exige las invariantes HX09.
- `tools/write-coordinator-hx09-test.cjs`: replay parcial y recuperacion posterior.
- `tools/hx09-replay-fence-harness.html`: escenario real de dos pestanas.
- `tools/hx09-replay-fence-browser-test.cjs`: automatizacion Chrome aislada.
- `RESULTADOS_NAVEGADOR_HX09_REPLAY_FENCE.json`: evidencia sintetica.

`data/persistence-contract.v1.json` cambia solo su `sourceDigest` al inventariar el codigo actualizado. Los artefactos de navegador y backups sinteticos se regeneran durante las pruebas.

Tras incluir documentos y manifiestos, el diff esperado es: 12 archivos modificados, 8 nuevos y 0 eliminados. El unico modulo funcional modificado es `modules/write-coordinator.js`.
