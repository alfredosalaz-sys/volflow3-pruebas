# Correccion de seguridad de importacion historica

Fecha: 2026-10-16  
Base: Voltflow 3 2.9.4, build 2026.10.15.0300  
Origen: `Voltflow3-IMPORTACION-HISTORICA-SEGURA-20261016`

Este documento sustituye el dictamen de la entrega anterior para los defectos H-01 a H-04.

## H-01: payload cifrado incompleto

Corregido en `modules/historical-import.js`.

- Las colecciones `leads`, `emailHistory`, `campaigns`, `searchHistory` y `savedSearches` se materializan desde IndexedDB cuando es autoritativo.
- Los registros solo presentes en IndexedDB participan en la misma fusion conservadora que los datos portatiles.
- Los stores auxiliares existentes se fusionan por su keyPath o por huella completa.
- Un store que no existe en el esquema actual queda conservado en `gordi_historical_indexeddb_quarantine`, con nombre, keyPath, registros y motivo. No se declara restaurado en su store original.
- Los archivos incorporados y las referencias se fusionan por contenido codificado, no por nombre ni contador.
- Los adjuntos se conservan en la seccion cifrada y en los archivos internos `gordi_incorporated_files_archive` y `gordi_referenced_files_archive` para sobrevivir reinicios y nuevos backups.

## H-02: prueba de seguridad incompleta

Corregido.

La huella previa y posterior incluye:

- `localStorage`, excluyendo un conjunto cerrado de metadatos transaccionales volatiles.
- Base, version, schemas y registros completos de todos los stores IndexedDB.
- Archivos incorporados codificados byte a byte.
- Referencias de archivos.

Se normalizan solamente `exportedAt` y `updatedAt` de filas KV, que cambian sin alterar el dato. No se omiten stores. La compatibilidad con pruebas antiguas de huella local se limita a estados sin ningun registro IndexedDB, adjunto o referencia.

## H-03: registros sin identificador

Corregido.

Un lead sin ID recibe una identidad determinista derivada del registro completo. La segunda importacion localiza esa misma identidad y no crea otra fila. No se usan nombre, telefono, email o dominio como coincidencias aisladas. Dos registros materialmente distintos siguen separados.

## H-04: JSON corrupto

Corregido.

Las colecciones conocidas se validan antes del plan. JSON malformado, array convertido en objeto, store sin `records` o archivos con estructura invalida bloquean la importacion con un error identificable. No se convierten a colecciones vacias.

## Seguridad conservada

Permanecen activos el cifrado AES-256-GCM, secretos enmascarados, decision explicita ante colisiones, coste cero, oposiciones, limite de cinco contactos, revision humana y bloqueo de sync cloud en claro.

## Dictamen

READY para auditoria independiente con datos sinteticos. Siguen pendientes como gates independientes la prueba fisica en Celeron N4020 y una prueba autorizada sobre copias de backups reales antiguos.
