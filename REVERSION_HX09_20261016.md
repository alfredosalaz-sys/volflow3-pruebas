# Reversion HX09

HX09 no cambia esquemas ni migra datos empresariales.

Antes de revertir:

1. No iniciar otra importacion o restauracion.
2. Abrir exclusivamente esta entrega HX09.
3. Esperar a que no exista fence ni aviso de guardado pendiente.
4. Verificar que `journalKeys()` no informa journals pendientes.
5. Crear y comprobar una copia cifrada externa.
6. Cerrar todas las pestanas de Voltflow3.
7. Volver a la entrega HX08 solo con el almacenamiento ya drenado.

Si existe cualquier journal, no borrarlo ni retroceder mientras siga pendiente: HX08 contiene precisamente la condicion de carrera que HX09 corrige. Dejar que HX09 lo reproduzca, verificar el dato y repetir la copia cifrada.

Nunca usar `localStorage.clear()`, borrar IndexedDB ni editar manualmente journals como procedimiento de reversion.
