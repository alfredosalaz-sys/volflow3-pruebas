# Reversion de HX05-HX06

Esta entrega no cambia el esquema persistente ni migra datos. La reversion de codigo consiste en volver a la carpeta base intacta:

`C:\Users\NOSTROMO\Downloads\Voltflow3-IMPORTACION-HISTORICA-CORREGIDA-20261016`

Antes de cualquier sustitucion manual:

1. Crear una copia completa cifrada desde la aplicacion actual.
2. Leer y verificar desde disco esa copia.
3. Cerrar las pestanas de Voltflow3.
4. Servir de nuevo la base intacta desde el mismo origen solo durante una prueba controlada.
5. Verificar recuentos, claves enmascaradas, oposiciones, comunicaciones, adjuntos e IndexedDB.

No es necesario borrar localStorage ni IndexedDB. No se debe restaurar un plan de importacion pendiente de esta entrega en codigo anterior. Ante cualquier diferencia, detenerse y restaurar la copia cifrada mediante staging y rollback.

Archivos de codigo que se revierten copiando sus equivalentes de la base: `modules/historical-import.js`, `modules/ui.js`, `tools/historical-import-browser-harness.html`, `tools/historical-import-test.cjs` y `.github/workflows/quality-gate.yml`. El test nuevo puede conservarse fuera de produccion o retirarse junto con esta candidata.
