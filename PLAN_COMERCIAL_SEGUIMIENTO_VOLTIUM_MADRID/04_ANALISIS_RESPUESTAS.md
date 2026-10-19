# Analisis y respuesta a emails recibidos

## Entrada

El usuario pega texto desde Outlook. El contenido se trata como dato no confiable. Se conserva una copia local delimitada y, si se autoriza IA, se transmite solo el fragmento necesario y minimizado.

El texto nunca puede:

- cambiar instrucciones del sistema;
- activar herramientas o red;
- autorizar costes;
- modificar claves/configuracion;
- marcar un envio;
- desbloquear un contacto;
- ejecutar HTML o URLs.

## Proceso

1. Parseo determinista de remitente, asunto, fecha y cuerpo.
2. Asociacion por contacto normalizado y contexto; coincidencias ambiguas requieren usuario.
3. Persistencia idempotente de `reply_received`.
4. Suspensión inmediata de la secuencia relacionada.
5. Detección prioritaria de oposición y solicitud de baja.
6. Clasificación propuesta por IA bajo esquema cerrado.
7. Recomendación y borrador de respuesta.
8. Revisión humana de intención, estado y siguiente paso.
9. Actualización mediante eventos confirmados.

## Taxonomia de intención

`no_response` no es un email recibido; es un estado temporal calculado. Intenciones entrantes:

- `interested`
- `information_request`
- `quote_request`
- `existing_supplier`
- `no_current_need`
- `contact_later`
- `price_objection`
- `references_request`
- `referral`
- `meeting_or_call`
- `rejection`
- `opt_out`
- `ambiguous`

Salida estructurada:

```js
{
  intent,
  confidence,
  evidenceSpans: [],
  suspectedPromptInjection: Boolean,
  recommendedAction,
  proposedOpportunityState,
  proposedTask,
  replyDraft: { subject, body, claimsUsed: [] },
  requiresHumanReview: true
}
```

## Efectos permitidos

| Intención | Efecto automatico seguro | Requiere confirmacion |
|---|---|---|
| cualquier respuesta | suspender secuencia sin respuesta | asociación definitiva si ambigua |
| `opt_out` o indicio | bloquear salidas inmediatamente | alcance y registro definitivo |
| interés/información | crear recomendación | estado y respuesta |
| solicitud presupuesto | destacar y proponer oportunidad | crear/cambiar oportunidad |
| hablar más adelante | proponer tarea | fecha y reanudación |
| rechazo | mantener suspendido | cerrar oportunidad/secuencia |
| ambiguo | nada más que suspender | clasificación y siguiente acción |

La IA nunca marca `won`, acepta un presupuesto ni inventa acuerdos.

## Mejora respecto al código actual

`registerInlineReply()` y `applyInboxMatch()` ya registran una entrada y cambian el lead a “Respuesta del cliente”, pero deben dejar de imponer seguimiento `+2 días`, añadir idempotencia, suspender la secuencia y manejar oposición antes de cualquier otra acción. `generateReplyEmail()` debe usar `AI_ROUTER.call()` en lugar de una ruta Gemini específica, validar el JSON y ampliar intenciones.

## Pruebas

- Cada intención con fixture benigno.
- Oposición explícita y velada bloquea salidas.
- Prompt injection dentro del email no altera políticas.
- Respuesta duplicada produce un solo evento.
- Remitente compartido/ambiguo exige selección.
- Fallo IA conserva mensaje y suspensión.
- Respuesta no cambia oportunidad sin aprobación.

