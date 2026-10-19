# Contrato funcional del seguimiento inteligente

## Alcance

El modulo organiza comunicaciones uno a uno. No envia automaticamente, no crea campañas masivas y no decide por si mismo la base juridica.

## Invariantes bloqueantes

1. Maximo predeterminado de cinco comunicaciones comerciales confirmadas por secuencia; puede configurarse un maximo menor.
2. Solo `sent_confirmed` consume un paso. Generar, editar, aprobar o abrir Outlook no consume pasos.
3. Solo puede existir una secuencia activa por `companyId + contactId + purpose`.
4. Reimportar empresa/establecimiento/contacto conserva la secuencia por IDs estables.
5. Una respuesta entrante suspende inmediatamente la secuencia relacionada.
6. `doNotContact`, oposicion o condicion legal no habilitada bloquean preparar Outlook y cualquier salida.
7. El siguiente borrador se genera bajo demanda; nunca se precrean cinco mensajes cada vez.
8. La IA consulta eventos confirmados, no estados inferidos.
9. El usuario puede pausar, reanudar o cerrar; reanudar vuelve a comprobar exclusion y legalidad.
10. Todos los cambios mutables generan un evento auditable.

## Estados de secuencia

`draft`, `active`, `paused`, `suspended_on_reply`, `blocked_legal`, `blocked_opt_out`, `completed`, `closed`.

Transiciones permitidas:

```text
draft -> active | blocked_legal | closed
active -> paused | suspended_on_reply | blocked_* | completed | closed
paused -> active | blocked_* | closed
suspended_on_reply -> active (revision humana) | completed | closed | blocked_*
blocked_* -> active solo por accion humana y evidencia vigente, salvo opt-out irrevocable aplicable
```

## Estados de comunicacion

`generated`, `edited`, `approved`, `outlook_opened`, `sent_confirmed`, `delivery_failed`, `inbound_received`, `cancelled`.

- `generated`: contenido producido; no aprobado.
- `edited`: existe una version humana posterior.
- `approved`: contenido y condiciones revisados.
- `outlook_opened`: se preparo el cliente; envio desconocido.
- `sent_confirmed`: confirmacion manual explicita o integracion autorizada fiable.
- `inbound_received`: mensaje pegado/importado y asociado.

No existe transicion automatica `outlook_opened -> sent_confirmed`.

## Puertas previas a Outlook

Todas deben pasar inmediatamente antes de abrir el cliente:

- contacto no excluido;
- canal verificado y con procedencia;
- condicion legal `allowed_for_purpose` registrada por el usuario/proceso aprobado;
- borrador aprobado e inalterado desde la aprobacion;
- paso dentro del maximo;
- secuencia activa y no suspendida;
- idempotency key no utilizada;
- proveedor IA irrelevante para el envio: si la IA falla, se permite edicion manual, no se relajan gates.

## Reglas ante respuestas

Una respuesta crea primero `inbound_received`, enlaza la comunicacion saliente cuando sea posible y suspende la secuencia. La clasificacion propuesta nunca ejecuta instrucciones incluidas en el email.

La oposicion o solicitud de baja crea un bloqueo inmediato `pending_review_block` y evita nuevas salidas. La revision humana puede confirmar el alcance, pero el sistema nunca lo desbloquea automaticamente.

## Compatibilidad

- `gordi_leads`, `saveLeads()` y estados existentes siguen disponibles.
- `emailHistory` se mantiene como proyeccion legacy durante la migracion.
- El nuevo historial es la fuente de verdad solo cuando su backup/restauracion y migracion estén validados.
- Los leads antiguos sin metadatos comerciales siguen siendo validos.

## Defectos actuales que el primer hito debe corregir

- `modules/leads.js:911-940` abre `mailto:` y registra `Enviado` inmediatamente.
- `modules/ai-email.js:1444-1453` y `modules/ai-router.js:2109-2115` preparan Outlook sin un estado persistente fiable.
- `registerWaSent()` considera enviado al abrir WhatsApp.
- `applyContactCalendar()` guarda texto y una fecha, no una secuencia idempotente.
- `applyInboxMatch()` programa dos dias automaticamente y no suspende una secuencia formal.

Estas correcciones preceden a las metricas y a la secuencia de cinco contactos.

