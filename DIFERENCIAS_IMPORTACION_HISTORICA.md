# Diferencias exactas de la entrega

## Codigo de aplicacion

- Nuevo `modules/historical-import.js`.
- Modificado `modules/ui.js` para el asistente no destructivo.
- Modificado `app.html` para cargar el modulo y mostrar el acceso.

## Pruebas y fixtures

- Nuevo `tools/historical-import-test.cjs`.
- Nuevo `tools/historical-import-browser-test.cjs`.
- Nuevo `tools/historical-import-browser-harness.html`.
- Nuevos fixtures `historical-rich-current.json` y `historical-rich-import.json`.
- Quality gate ampliado con H01-H20.

## Evidencia y documentacion

- Inventario vivo regenerado.
- Evidencia estructurada de Chrome aislado.
- Matriz, informe, manual, resultados, reversion y protocolo fisico.

No se modificaron `version.json`, buscador, corpus, taxonomia, claves, datos reales ni contratos E1-E2.2/C0-C1.2. No hubo commit, push, merge, despliegue, envios ni llamadas externas.

## Comparacion SHA256 con la entrega de origen

- Modificados: 7 archivos.
- Nuevos: 16 archivos.
- Eliminados: 0 archivos.

Modificados: `.github/workflows/quality-gate.yml`, `app.html`, `modules/ui.js`, `data/persistence-contract.v1.json`, `PERSISTENCE_COVERAGE_REPORT.json` y los dos manifiestos SHA256.

Nuevos: el modulo, tres herramientas de prueba, dos fixtures, un artefacto cifrado sintetico, la evidencia JSON de navegador y los ocho documentos especificos de esta entrega.
