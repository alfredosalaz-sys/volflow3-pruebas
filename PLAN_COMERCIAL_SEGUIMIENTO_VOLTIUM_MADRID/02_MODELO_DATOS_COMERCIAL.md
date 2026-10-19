# Modelo de datos comercial y migracion

## Entidades

| Entidad | Identidad estable | Finalidad |
|---|---|---|
| `Company` | `companyId` local | empresa/marca consolidada, no necesariamente persona juridica probada |
| `Establishment` | `establishmentId` | oficina, sede o local fisico con procedencia |
| `Contact` | `contactId` | persona o canal corporativo; puede vincularse a empresa y sede |
| `Prospect` | `prospectId` | cualificacion comercial de empresa/sede para un perfil |
| `Opportunity` | `opportunityId` | posibilidad concreta de obra, mantenimiento o colaboracion |
| `Sequence` | `sequenceId` | plan de hasta cinco comunicaciones para contacto/finalidad |
| `MessageDraft` | `draftId` | contenido versionado, editable y aprobable |
| `CommercialEvent` | `eventId` | hecho inmutable de la cronologia |
| `Task` | `taskId` | siguiente accion y vencimiento |
| `Exclusion` | `exclusionId` | oposicion/bloqueo por canal, contacto o empresa |

Empresa, establecimiento y persona no se fusionan. Una empresa puede tener sedes y contactos; un contacto puede estar asignado a una sede o a la matriz.

## Contacto y procedencia

```js
ContactPoint = {
  id, contactId, establishmentId, companyId,
  type: 'email' | 'phone' | 'webform',
  value, normalizedValue, corporate: Boolean,
  sourceId, sourceUrl, obtainedAt, sourceLicense,
  confidence: 'high' | 'medium' | 'low' | 'unknown',
  verificationStatus: 'found' | 'technical_valid' | 'stale' | 'invalid',
  commercialRelevance: 'unknown' | 'relevant' | 'not_relevant',
  legalBasisStatus: 'unknown' | 'pending_review' | 'allowed_for_purpose' | 'blocked',
  legalPurpose, reviewedAt, reviewedBy,
  doNotContact, doNotContactAt, doNotContactReason,
  lastVerifiedAt, retentionReviewAt
}
```

Responsable y cargo son campos con su propia procedencia; no se derivan de un email ni se completan con IA.

## Evento comercial

```js
CommercialEvent = {
  schemaVersion: 1,
  eventId, idempotencyKey,
  companyId, establishmentId, contactId,
  prospectId, opportunityId, sequenceId, draftId,
  type, channel, occurredAt, recordedAt,
  actor: 'user' | 'system' | 'ai' | 'import',
  payload, sourceRef, previousEventId,
  integrity: { contentHash }
}
```

Tipos iniciales: `draft_generated`, `draft_edited`, `draft_approved`, `outlook_opened`, `sent_confirmed`, `reply_received`, `reply_classified`, `sequence_paused`, `sequence_resumed`, `sequence_closed`, `opt_out_detected`, `opt_out_confirmed`, `call_logged`, `meeting_logged`, `information_requested`, `quote_requested`, `quote_sent`, `quote_accepted`, `opportunity_status_changed`, `task_created`, `task_completed`.

El evento es inmutable. Correcciones producen un nuevo evento que referencia al anterior.

## Idempotencia

- Secuencia: `companyId|contactId|purpose|profileVersion`.
- Paso: `sequenceId|stepNumber`.
- Apertura Outlook: `draftId|contentVersion|openedAtBucket`; no marca envio.
- Envio manual: UUID generado al confirmar más hash de destinatario/asunto/cuerpo/fecha.
- Respuesta importada: hash normalizado de remitente, asunto, fecha declarada y cuerpo.
- Reimportacion: resolver IDs antes de crear prospecto o secuencia.

## Oportunidad

Estados propuestos: `identified`, `qualifying`, `information_requested`, `meeting_proposed`, `site_visit`, `quote_requested`, `quote_preparing`, `quote_sent`, `negotiating`, `won`, `lost`, `dormant`.

Solo hechos confirmados cambian estados fuertes. La IA puede sugerir, nunca marcar `quote_requested`, `won` o `lost` sin confirmacion humana/evidencia.

## Persistencia y compatibilidad

Implementacion gradual:

1. Proyeccion pura desde `gordi_leads`, `gordi_email_history` y actividad, sin escribir.
2. Base sombra separada `VoltflowCommercial` con datos sinteticos y feature flag.
3. Backup/restauracion del nuevo store antes de habilitar escritura real.
4. Escritura de eventos y proyeccion hacia `emailHistory`/lead legacy.
5. Comparacion de recuentos y rollback por flag, sin borrar la base sombra.

No se cambia `VoltiumCRM.DB_VERSION` en el primer hito. Ninguna migracion destructiva. Las nuevas referencias opcionales viven bajo `lead.commercialRefs`; su ausencia es valida.

## Rendimiento

- Indices por `companyId`, `contactId`, `sequenceId`, `type` y `occurredAt`.
- Consultas paginadas; no serializar todo el historial en cada cambio.
- Proyecciones incrementales para panel y metricas.
- Retencion configurable sin borrar oposiciones ni evidencia minima.
- Cronologia completa solo al abrir ficha; panel usa resumen.

