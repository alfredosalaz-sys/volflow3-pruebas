# Reversión y medidas de emergencia

## Reversión de código

1. Cerrar la copia de desarrollo.
2. Volver a la entrega intacta `Voltflow3-C1.2-CORRECCION-20261016`.
3. No copiar `gordi_indexeddb_ready` ni `_voltflow_idb_manifest` manualmente.
4. Abrir siempre con el mismo perfil y origen que se utilizaba antes.

No hay commit ni despliegue que revertir.

## Restauración interrumpida

- Si aparece `_voltflow_restore_transaction`, no ejecutes migraciones ni vacíes almacenamiento.
- Conserva el `.vfbackup` original y su contraseña.
- Reabre la misma copia aislada e intenta la restauración de nuevo.
- Si el marker indica `rollback_required`, exporta diagnósticos sin valores y conserva `VoltflowRestoreStaging`; no borres esa base.

## Sospecha de secreto expuesto

- Desactiva sincronización GitHub/JSONBin.
- Revoca y rota credenciales desde cada proveedor.
- Revisa actividad y OAuth; no pegues las claves en informes.
- Eliminar un archivo actual no limpia el historial Git. Usa el procedimiento oficial y considera comprometida la clave anterior.

## Pérdida o contraseña olvidada

AES-GCM no permite recuperar la copia sin la contraseña. Mantén al menos dos generaciones verificadas en ubicaciones distintas. El sistema no promete recuperación ante fallo físico si no existe una copia externa válida.

