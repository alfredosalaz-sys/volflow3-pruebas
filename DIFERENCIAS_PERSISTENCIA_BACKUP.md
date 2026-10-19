# Diferencias respecto a C1.2

## Modificados

- `.github/workflows/quality-gate.yml`: inventario, B01-B20 y quality check.
- `app.html`: módulo seguro, controles de copia/comprobación/restauración y bloqueo visual cloud.
- `modules/chat.js`: GitHub snapshot sync cerrado antes de red.
- `modules/disk-backup.js`: escritura cifrada, nombre único y verificación desde disco.
- `modules/init.js`: JSONBin cerrado, exportación de snapshots en claro bloqueada.
- `modules/storage.js`: exportación/restauración cruda de stores y reconstrucción de markers.
- `modules/ui.js`: copia cifrada, comprobación, restauración y soporte explícito `auto_disk_daily`.
- `MANIFEST_APLICACION_SHA256.txt`: 34 archivos ejecutables y recursos.
- `MANIFEST_SHA256.txt`: 186 archivos de la entrega completa.

## Nuevos

- `modules/secure-backup.js`.
- `data/persistence-contract.v1.json`.
- `PERSISTENCE_COVERAGE_REPORT.json`.
- `tools/build-persistence-inventory.cjs`.
- `tools/secure-backup-b01-b20-test.cjs`.
- `tools/secure-backup-browser-harness.html`.
- `tools/secure-backup-browser-recovery.cjs`.
- `tests/fixtures/persistence/*`.
- `tests/artifacts/secure-backup/browser-synthetic.vfbackup` (solo datos sintéticos cifrados).
- `INFORME_TECNICO_PERSISTENCIA_BACKUP_20261016.md`.
- `MATRIZ_FORMATOS_Y_RETENCION.md`.
- `MANUAL_COPIA_COMPRUEBA_RESTAURA.md`.
- `RESULTADOS_PRUEBAS_PERSISTENCIA_20261016.md`.
- `REVERSION_Y_EMERGENCIA_PERSISTENCIA.md`.
- `DIFERENCIAS_PERSISTENCIA_BACKUP.md`.
- `RESULTADOS_B01_B20.json`.
- `RESULTADOS_NAVEGADOR_RESTAURACION.json`.

## Sin cambios funcionales

Buscador, corpus E1/E2.2, taxonomía, deduplicación, router IA, contratos comerciales y `version.json` permanecen sin cambios. La adenda C2 se copió sin alteración desde la base.
