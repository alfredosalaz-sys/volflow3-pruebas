# Reversion HX08

HX08 no cambia esquemas ni migra datos empresariales.

Antes de revertir:

1. No iniciar otra restauracion.
2. Esperar a que desaparezca el aviso de guardado protegido.
3. Verificar que no existen claves `__voltflow_coord_journal_` pendientes en el diagnostico tecnico.
4. Crear y comprobar una copia cifrada externa.
5. Cerrar todas las pestanas de Voltflow3.
6. Volver a la carpeta base `Voltflow3-IMPORTACION-HISTORICA-HX07-20261016`.

Si queda un journal pendiente, no debe borrarse manualmente. Se debe abrir esta entrega HX08, dejar que lo reproduzca y verificar el dato antes de volver a la base. Nunca usar `localStorage.clear()` ni eliminar IndexedDB para revertir.

El unico archivo funcional modificado por HX08 es `modules/write-coordinator.js`; los demas cambios son pruebas, quality gate, evidencias, informes y manifiestos.
