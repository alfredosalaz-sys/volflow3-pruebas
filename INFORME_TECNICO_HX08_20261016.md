# Informe tecnico HX08

Fecha: 2026-10-16

Base intacta: `Voltflow3-IMPORTACION-HISTORICA-HX07-20261016`

Entrega aislada: `Voltflow3-IMPORTACION-HISTORICA-HX08-20261016`

Version conservada: 2.9.4, build 2026.10.15.0300.

## Causa

Durante un fence, `setItem` y `removeItem` retornaban despues de guardar la mutacion solamente en un array JavaScript de la pestana. Cerrar esa pestana destruia la unica copia pendiente.

## Correccion

Cada pestana dispone de un journal durable `__voltflow_coord_journal_<tabId>` y existe un registro compartido de journals. Antes de retornar:

1. Se registra el journal en el indice compartido.
2. Se escribe la mutacion completa.
3. Se releen indice y journal.
4. Se comprueba el identificador exacto de la mutacion.

Los journals usan un prefijo interno excluido de snapshots, backups y restauraciones. Cualquier pestana moderna puede reproducir todos los journals cuando desaparece el fence. Un lock de replay evita dos consumidores simultaneos. Tras un corte, un lease caducado permite recuperar los pendientes al abrir otra pestana.

Si falta cuota, el journal esta corrupto o no puede verificarse, el guardado lanza `PERSISTENCE_PENDING_WRITE_REJECTED`, emite un evento y mantiene un aviso visible. No devuelve aparente exito. `localStorage.clear()` durante una restauracion se rechaza con `PERSISTENCE_CLEAR_BLOCKED_RETRY_REQUIRED` porque su reproduccion no seria conservadora.

## Seguridad

El journal nunca se incluye en informes ni manifiestos de datos y no se envia a servicios externos. Permanece en el mismo almacenamiento local del origen hasta su replay. Puede contener temporalmente el valor que el usuario intento guardar, incluidas configuraciones sensibles; su exposicion es equivalente a la del localStorage operativo actual y no constituye cifrado en reposo.

No se modificaron buscador, deduplicacion, historial comercial, API keys, cifrado de backups, corpus o coste cero.

## Dictamen

READY para auditoria independiente de HX08. Siguen pendientes la prueba fisica en Celeron N4020 y el uso controlado de backups reales autorizados.
