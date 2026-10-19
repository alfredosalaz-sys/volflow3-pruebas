# Diferencias exactas C1.1

Base: `Voltflow3-C0-C1-ESTADOS-COMERCIALES`.

## Aplicacion y contrato modificados

- `data/commercial-communications.v1.json`
- `modules/commercial-communications.js`
- `modules/leads.js`
- `modules/ai-email.js`
- `modules/ai-router.js`
- `CONFIGURACION_FUNCIONAL.md`

## Pruebas y quality gate modificados

- `.github/workflows/quality-gate.yml`
- `tools/validate-commercial-communications.cjs`
- `tools/commercial-communications-contract-test.cjs`
- `tools/commercial-communications-browser-mock-test.cjs`
- `tools/browser-search-regression.cjs`

## Nuevo

- `tools/commercial-communications-c11-test.cjs`
- `INFORME_TECNICO_C1_1.md`
- `RESULTADOS_PRUEBAS_C1_1.md`
- `DIFERENCIAS_C1_1.md`
- `REVERSION_C1_1.md`

Los manifiestos SHA256 se regeneran al cerrar la entrega. No hay archivos eliminados. No se modificaron buscador, corpus E1-E2.2, taxonomia, IndexedDB, claves, backups, `version.json` ni C2-C7.
