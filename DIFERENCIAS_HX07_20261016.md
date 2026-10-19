# Diferencias HX07 respecto a HX05-HX06

## Aplicacion

- `app.html`: carga el coordinador antes de storage.
- `modules/write-coordinator.js`: nuevo protocolo compartido de escritores.
- `modules/storage.js`: las escrituras IndexedDB respetan el cercado y el token propietario.
- `modules/secure-backup.js`: la restauracion usa operaciones autorizadas y excluye claves internas de coordinacion.
- `modules/historical-import.js`: segunda captura pre-restauracion, deteccion de contencion y rollback posterior.
- `modules/ui.js`: tratamiento comprensible de los rechazos concurrentes.

## Pruebas

- `HX07_CARRERA_ESCRITURA_CONCURRENTE_20261016.cjs`: prueba independiente, sin modificaciones.
- `tools/write-coordinator-contract-test.cjs`: contrato bloqueante.
- `tools/hx07-two-tab-harness.html`: escenario con escritor e importador.
- `tools/hx07-two-tab-browser-test.cjs`: Chrome aislado, dos pestanas y CPU x4.
- `tools/historical-import-browser-harness.html`: carga el coordinador y conserva la evidencia detallada de rollback.
- `.github/workflows/quality-gate.yml`: HX07 independiente y contrato incorporados.

## Evidencias y metadatos

- `RESULTADOS_NAVEGADOR_HX07_DOS_PESTANAS.json`.
- Resultados de navegador historico y backup regenerados con datos sinteticos.
- Inventario de persistencia regenerado, sin valores secretos.
- Informes HX07 y manifiestos SHA256 finales.

No hay cambios de version, corpus, taxonomia, buscador o datos persistentes del usuario.
