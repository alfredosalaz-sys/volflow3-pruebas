# Diferencias respecto a E2.2

## Modificados

- `.github/workflows/quality-gate.yml`: incorpora los dos gates nuevos.
- `CONFIGURACION_FUNCIONAL.md`: registra sectores, roles, trazabilidad, metricas y correo individual.
- `data/business-taxonomy.v1.json`: version 1.1.0; amplia alias, terminos negativos y mappings de los cuatro sectores reutilizados, ademas de separar gestoria administrativa.
- `data/business-indexes/manifest.json`: referencia taxonomia 1.1.0 y release contractual independiente.
- `tools/business-catalog-contract-test.cjs`: deriva la version de la taxonomia del fixture.
- `MANIFEST_SHA256.txt`: regenerado tras cerrar la entrega.

## Nuevos

- `data/prospecting-priorities.v1.json`
- `tools/validate-prospecting-priorities.cjs`
- `tools/prospecting-priorities-contract-test.cjs`
- `CRITERIOS_E3_E8_SEGMENTOS_PRIORITARIOS.md`
- `INFORME_SEGMENTOS_PRIORITARIOS_E3_E8_20261015.md`
- `RESULTADOS_PRUEBAS_SEGMENTOS_PRIORITARIOS.md`
- `DIFERENCIAS_RESPECTO_E2_2_SEGMENTOS.md`

## Intactos

Todos los archivos de `modules/`, entradas HTML, version, baseline, corpus/capturas E2.2, persistencia, backups, credenciales y configuracion del usuario.
