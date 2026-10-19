# Reversion y emergencia

## Reversion de codigo

La entrega anterior permanece en:

`C:\Users\NOSTROMO\Downloads\Voltflow3-IMPORTACION-HISTORICA-SEGURA-20261016`

Para revertir esta candidata antes de publicar, descartar la carpeta corregida completa. No hay commits, migraciones automaticas ni cambios en la version estable.

## Reversion de una importacion

1. No repitas la operacion.
2. Conserva el archivo historico original y la copia cifrada previa.
3. Abre la misma URL y el mismo perfil donde se ejecuto.
4. Usa `Restaurar copia` con la copia previa que el asistente obligo a verificar.
5. Comprueba empresas, contactos, comunicaciones, oposiciones, adjuntos y API keys.
6. Reinicia Chrome y vuelve a comprobar.

El commit historico mantiene staging y rollback. Si queda `_voltflow_restore_transaction`, no inicies otra migracion; utiliza el diagnostico y la copia externa previa.

Los stores incompatibles se conservan en cuarentena. No deben borrarse hasta que una version posterior disponga de un store compatible y una migracion probada.
