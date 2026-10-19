# Diferencias HX08 respecto a HX07

- `modules/write-coordinator.js`: journal durable verificado, registro compartido, lock de replay, recuperacion tras lease, rechazo explicito y estado visible.
- `.github/workflows/quality-gate.yml`: HX08 independiente y ampliada son bloqueantes.
- `tools/write-coordinator-contract-test.cjs`: exige las invariantes del journal.
- `tools/write-coordinator-hx08-test.cjs`: interrupcion, lease y rechazo por fallo de persistencia.
- `tools/hx08-tab-close-harness.html`: escenario real de cierre de pestana.
- `tools/hx08-tab-close-browser-test.cjs`: automatizacion Chrome aislada.
- `RESULTADOS_NAVEGADOR_HX08_CIERRE_PESTANA.json`: evidencia sin datos sensibles.
- Informes, resultados, reversión y manifiestos SHA256 de esta candidata.

Los resultados y artefactos sinteticos de las pruebas de navegador anteriores se regeneran. No hay cambios de version, corpus, taxonomia, buscador ni contratos comerciales.

## Recuento exacto frente a HX07

- Modificados: 11 archivos, incluidos los dos manifiestos regenerados.
- Nuevos: 8 archivos.
- Eliminados: 0 archivos.
- Modulo funcional modificado: solo `modules/write-coordinator.js`.
- `data/persistence-contract.v1.json`: cambia exclusivamente `sourceDigest` al inventariar el coordinador nuevo.
- Artefactos sinteticos regenerados: tres JSON de navegador y dos `.vfbackup` de pruebas.
