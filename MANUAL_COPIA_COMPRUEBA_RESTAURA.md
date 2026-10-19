# Copia ahora / Comprueba copia / Restaura

## Crear una copia completa

1. Abre **Configuración > Gestión de datos**.
2. Pulsa **Crear copia completa ahora**.
3. Introduce una contraseña maestra de al menos 12 caracteres y repítela.
4. Decide si quieres incluir credenciales temporales de la sesión. Normalmente elige **Cancelar**.
5. Guarda el archivo `.vfbackup`. La contraseña no se guarda: consérvala aparte.

La descarga todavía no se considera verificada.

## Comprobar el archivo

1. Pulsa **Comprobar copia**.
2. Selecciona el `.vfbackup` descargado.
3. Introduce su contraseña.
4. Exige el mensaje de integridad correcta. El panel mostrará fecha, archivo y tamaño de la última copia externa verificada.

## Copia en carpeta

1. Pulsa **Activar backup diario en disco**.
2. Introduce la contraseña para esta sesión y autoriza una carpeta.
3. La aplicación escribe un nombre único, relee el archivo y solo entonces lo marca verificado.
4. Tras cerrar Chrome tendrás que introducir de nuevo la contraseña; no se almacena.

## Restaurar una copia cifrada

1. Pulsa **Restaurar copia** y selecciona el `.vfbackup`.
2. Introduce la contraseña y revisa fecha, build, cantidades y número de secretos.
3. Confirma. Voltflow prepara rollback, restaura IndexedDB y almacenamiento local, verifica y elimina el marker transaccional.
4. Reautoriza OAuth y carpetas si Chrome o el proveedor lo solicitan.

## Backups antiguos

`auto_disk_daily`, completos y portátiles se reconocen, pero la fusión no destructiva sobre trabajo nuevo aún no está aprobada. No los importes sobre datos valiosos en esta entrega candidata. Haz primero una copia cifrada verificada y espera al cierre de la reconciliación histórica.

