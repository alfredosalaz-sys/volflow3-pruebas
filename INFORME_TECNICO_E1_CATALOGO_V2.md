# Informe tecnico E1 - Contrato de catalogo empresarial v2

Fecha de ejecucion: 2026-10-15

Base: Voltflow 3 2.9.4, build `2026.10.15.0300`

Copia aislada: `C:\Users\NOSTROMO\Downloads\Voltflow3-E1-DESARROLLO-20261015`

## Dictamen

**E1 se recomienda para aprobacion tecnica.** El manifiesto v2, sus catalogos y el validador pasan las pruebas positivas, negativas y de regresion. E1 no activa fuentes, no descarga datasets, no cambia el buscador de produccion y no modifica datos del CRM.

La recomendacion se limita a E1. No autoriza E2-E8, publicacion ni ingestion de datos reales.

## Alcance implementado

- Manifiesto `schemaVersion: 2` con version de dataset independiente del build.
- Esquema documental v2 y validacion semantica sin dependencias ni red.
- Taxonomia v1 con 17 sectores heredados, IDs ASCII estables, seis familias, alias, mapeos y redirects.
- Geografia v1 con las 52 provincias INE y tres municipios piloto: Barcelona, Manresa y Madrid.
- Integridad SHA256, bytes y conteo de registros por particion.
- Limites: manifiesto 250 KiB, particion 1 MiB y 10.000 registros.
- Rechazo de traversal, referencias inexistentes, IDs duplicados, redirects ciclicos, secretos, licencias desconocidas e incoherencias geograficas/sectoriales.
- Compatibilidad explicita de lectura de manifiestos v1 y v2 en `modules/business-providers.js`.
- Generador actualizado para exigir metadatos v2 y rechazar particiones que excedan los limites.
- Quality gate actualizado para validar sintaxis de herramientas y ejecutar el contrato v2.

## Archivos modificados

- `.github/workflows/quality-gate.yml`
- `CONFIGURACION_FUNCIONAL.md`
- `data/business-indexes/manifest.json`
- `modules/business-providers.js`
- `tools/build-business-index.cjs`
- `tools/generate-manifest.cjs`
- `MANIFEST_APLICACION_SHA256.txt`
- `MANIFEST_SHA256.txt`

## Archivos creados

- `data/business-indexes/schema-v2.json`
- `data/business-taxonomy.v1.json`
- `data/geography-es.v1.json`
- `tools/validate-business-catalog.cjs`
- `tools/business-catalog-contract-test.cjs`
- `tools/fixtures/business-catalog/README.md`
- `tools/fixtures/business-catalog/valid-source-records.json`
- `INFORME_TECNICO_E1_CATALOGO_V2.md`

## Evidencia de pruebas

| Prueba | Resultado |
|---|---|
| Validador sobre catalogo real | PASS: 5 proveedores, 1 particion, 29 registros, 17 sectores, 52 provincias, 3 municipios |
| Contrato positivo/negativo | PASS: 33/33 |
| Sintaxis JavaScript | PASS: 40 archivos |
| Integridad release | PASS: 2.9.4 / 2026.10.15.0300 / 22 recursos |
| Places mock | PASS |
| Proveedores mock | PASS |
| Indice real Madrid | PASS: Dental Madrid 9; Dental 28015 1; Gestorias 28015 1 |
| Rendimiento de proveedor | PASS: 600 registros a 300 unicos en 34 ms en este equipo |
| Auditoria independiente del buscador | PASS: 7/7 |
| Pasarela IA coste cero | PASS |
| Personalizacion de correo IA | PASS |
| Seguridad IA | PASS |
| `quality-check.js` | PASS |
| Manifiesto SHA256 completo | PASS: 72 archivos |
| Manifiesto de aplicacion | 32 archivos; incluye esquema, taxonomia, geografia, manifiesto e indice |

Los 33 casos del contrato cubren catalogo valido, compatibilidad v1/v2, JSON corrupto, esquema/taxonomia/particion inexistentes, schemaVersion incorrecta, versiones incoherentes, traversal, provincia y municipio invalidos, municipio en provincia incorrecta, sector o familia desconocidos, duplicados, redirects ciclicos, hash/tamano/conteo alterados, identidad de origen incompleta, geografia y sectores de registro inconsistentes, contaminacion por sector solicitado, limites, referencias legales, secretos y confusion entre datasetRelease y build.

Todas las API se probaron con mocks. No se hizo ninguna llamada externa.

## Proteccion de la entrega estable

La copia se creo a partir de la entrega final auditada. Los SHA256 de los siguientes archivos coinciden con la base:

- `app.html`, `index.html`, `version.json`
- `modules/search.js`, `modules/leads.js`, `modules/storage.js`
- `modules/init.js`, `modules/ai-router.js`
- `modules/workflow.js`, `modules/coverage.js`

Por tanto, E1 no modifica `gordi_leads`, `saveLeads()`, IndexedDB, API keys, backups, interfaz, version ni comportamiento de busqueda.

## Riesgos y limites

1. El catalogo municipal es deliberadamente piloto: solo incluye Barcelona, Manresa y Madrid. Las 52 provincias estan representadas, pero E1 no afirma cobertura municipal nacional.
2. La particion Madrid existente conserva `recordSchemaVersion: 1`. El manifiesto v2 la describe e integra con compatibilidad transitoria; futuros ETL deben generar registros v2 completos.
3. El JSON Schema documenta la forma estructural. Las comprobaciones cruzadas de archivos, hashes, taxonomia, geografia y licencias dependen del validador Node, porque JSON Schema por si solo no puede verificarlas.
4. El generador rechaza una particion excesiva; no la divide automaticamente. La estrategia de particionado/ETL corresponde a entregas posteriores.
5. Las licencias deben volver a comprobarse contra la fuente concreta antes de descargar o publicar datasets nuevos. E1 no descarga ni habilita ninguno.
6. El tiempo de 34 ms es un smoke test local, no una medicion del Celeron N4020 fisico.

## Reversion

E1 es aditivo y no migra datos. Para revertirlo, se descarta esta copia aislada y se conserva sin cambios la entrega base `ENTREGA_GITHUB_IA_GRATUITA_PUBLICACION_FINAL_20261015`. No hay datos de usuario que restaurar.

## Decision solicitada

Aprobar E1 permite iniciar posteriormente E2 bajo una autorizacion separada. Hasta esa revision, no deben descargarse fuentes reales, habilitarse proveedores ni cambiarse el flujo de produccion.
