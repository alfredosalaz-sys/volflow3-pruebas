# Recuperacion de emergencia y reversion

## Si el analisis falla

No se ha modificado ningun dato. Conserva el archivo original y registra el mensaje de formato o integridad.

## Si la fusion falla

El commit usa staging. Voltflow intenta restaurar IndexedDB y almacenamiento local al estado previo. No repitas la importacion hasta comprobar `Estado de mis datos` y `_voltflow_restore_transaction` mediante los diagnosticos.

## Reversion manual

1. Cierra otras pestanas de Voltflow.
2. Abre la misma URL y perfil donde se produjo la incidencia.
3. Pulsa `Restaurar copia`.
4. Selecciona la copia cifrada del estado anterior que el asistente obligo a verificar.
5. Introduce la contrasena y confirma la restauracion completa.
6. Reinicia la pagina y comprueba recuentos, oposiciones, comunicaciones e identidades.

Si una credencial pudo aparecer en un snapshot cloud historico, revocala en el proveedor y crea otra sin incluir su valor en informes. Reautoriza OAuth y permisos de carpeta cuando el navegador lo solicite.
