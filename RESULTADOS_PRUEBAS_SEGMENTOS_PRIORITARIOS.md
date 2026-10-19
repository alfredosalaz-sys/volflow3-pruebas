# Resultados de pruebas: segmentos prioritarios E3-E8

Fecha de ejecucion: 2026-10-15.

Entorno: Windows 11, Node.js local, datos sinteticos y capturas offline. No se realizaron llamadas reales, descargas ni pruebas en el Celeron N4020 fisico.

## Contratos nuevos

| Prueba | Resultado |
|---|---|
| Sintaxis de validador y test nuevos | PASS |
| `validate-prospecting-priorities.cjs` | PASS: 5 perfiles, 4 sectores existentes, 6 fases |
| `prospecting-priorities-contract-test.cjs` | PASS 15/15 |
| Desambiguacion independiente | PASS 5/5 casos |
| Taxonomia sin sectores duplicados | PASS: 17 sectores, igual que E2.2 |

Los casos negativos bloquean: sector inventado, perfil duplicado, runtime prematuro, contaminacion por consulta, procedencia incompleta, metrica ausente, envio automatico, falta de revision, fase sin gate, concurrencia excesiva, mapping no validado y version incoherente.

## Regresion acumulada

| Suite | Resultado |
|---|---|
| Sintaxis JS/CJS | PASS: 51 archivos |
| Integridad de release | PASS: 2.9.4 / 2026.10.15.0300 / 22 recursos |
| Places mock | PASS |
| Business providers mock | PASS |
| Indice estatico real | PASS |
| Rendimiento provider smoke | PASS: 600 -> 300 en 52 ms en este equipo |
| Regresiones historicas independientes | PASS 7/7 |
| IA coste cero | PASS |
| Personalizacion de email IA | PASS |
| Seguridad IA | PASS |
| Catalogo v2 | PASS: 5 providers, 1 particion, 29 registros, 17 sectores |
| Contratos E1 | PASS 33/33 |
| Corpus E2 | PASS: 236 observaciones, 2 ciudades, 8 sectores |
| Contratos E2.1 | PASS 23/23 |
| Quality gate E2.2 | PASS: 199 unicos, 0 fusiones falsas, 0 duplicados residuales, 0 sucursales colapsadas |
| Regresiones E2 previas | PASS 2/2 |
| Regresiones de direcciones E2.2 | PASS 7/7 |
| `quality-check.js` | PASS |

## Invariantes comprobados

- Hashes de `modules/`, `app.html`, `index.html`, `version.json`, `BASELINE_ESTABLE.json` y corpus E2.2 identicos a la copia de origen.
- DIBA sigue en cuarentena.
- No se han modificado `gordi_leads`, `saveLeads()`, IndexedDB, claves, backups ni version/build.
- No hay activacion runtime: `runtimeEnabled` permanece `false` hasta E5.
- No se han ejecutado APIs potencialmente facturables.

## Pendientes deliberados

- Validar contra las releases reales los mappings de Overture, OSM, CNAE y datos municipales durante E3/E4.
- Medir cobertura y las cinco metricas comerciales con los pilotos E3/E4.
- Validar rendimiento en el Celeron N4020 fisico antes de afirmar compatibilidad medida.
- Revisar juridicamente base, informacion y oposicion antes de automatizar comunicaciones; el envio automatico sigue prohibido.
