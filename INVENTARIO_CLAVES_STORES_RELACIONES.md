# Inventario de claves, stores y relaciones

El inventario generado se encuentra en `data/persistence-contract.v1.json` y `PERSISTENCE_COVERAGE_REPORT.json`. La ultima ejecucion detecto 101 claves literales, 29 patrones dinamicos y 3 expresiones IndexedDB. El reporte no contiene valores.

## Stores autoritativos

Base `VoltiumCRM`, version 1:

- `leads`
- `emailHistory`
- `campaigns`
- `searchHistory`
- `savedSearches`
- `kv`
- `meta`

El importador actualiza las colecciones y sus representaciones portatiles en una misma restauracion controlada. `gordi_indexeddb_ready` se reconstruye desde el manifiesto real; no se confia en el flag importado.

Los stores desconocidos se fusionan si existen en el schema actual. Si no existen, se conservan integramente en `gordi_historical_indexeddb_quarantine`. Los binarios incorporados y referencias se conservan cifrados mediante `gordi_incorporated_files_archive` y `gordi_referenced_files_archive`.

## Relaciones protegidas

- Empresa -> establecimiento: `commercialRefs.companyIdentityAnchor` y `establishmentIdentityAnchor`.
- Empresa/establecimiento -> contacto: IDs y listas de contacto conservadas.
- Lead -> comunicacion: `leadId`, remapeado solo tras equivalencia canonica.
- Contacto -> secuencia: identidad canonica, canal y finalidad.
- Comunicacion -> confirmacion: evidencia valida y globalmente unica.
- Oposicion/exclusion -> destinatario: union restrictiva, nunca eliminacion implicita.

## Clasificacion

Datos criticos, secretos, configuracion, recreables y permisos no transportables usan el contrato de persistencia extensible. Las claves desconocidas `gordi_*` y `voltium_*` se conservan; una colision escalar mantiene el valor actual y registra el conflicto mediante huellas, no valores.
