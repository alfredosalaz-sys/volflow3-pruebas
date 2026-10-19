# Reversion HX07

La entrega no introduce migraciones de datos ni cambia esquemas. Para revertir:

1. No iniciar una importacion.
2. Esperar a que desaparezca cualquier aviso de guardado pendiente.
3. Cerrar todas las pestanas de Voltflow3.
4. Conservar una copia cifrada verificada del estado actual.
5. Volver a la carpeta base intacta `Voltflow3-IMPORTACION-HISTORICA-HX05-HX06-20261016`.
6. Abrir una sola pestana en un perfil de prueba y verificar leads, comunicaciones, oposiciones, claves enmascaradas, IndexedDB y adjuntos.

No se debe borrar localStorage ni IndexedDB. Si el navegador se cerrase durante un cercado, el lease caduca automaticamente; antes de cualquier nueva importacion debe comprobarse que los datos y la copia externa coinciden.

Los archivos de aplicacion a revertir son `app.html`, `modules/historical-import.js`, `modules/secure-backup.js`, `modules/storage.js` y `modules/ui.js`. `modules/write-coordinator.js` y las pruebas HX07 son nuevos en esta candidata.
