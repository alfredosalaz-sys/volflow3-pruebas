# Integridad, inventario funcional y no regresión

## Base

- Origen: `Voltflow3-SEGMENTOS-PRIORITARIOS-E3-E8-20261015`.
- Versión: 2.9.4.
- Build: `2026.10.15.0300`.
- E2.2 funcional comparada por SHA256: idéntica.
- Esta fase solo añade documentación y regenera el manifiesto integral de la nueva copia.

## Inventario real

| Función | Evidencia aproximada | Estado |
|---|---|---|
| Leads/pipeline | `modules/leads.js`, `saveLeads`, `renderLeads`, estados | operativo legacy |
| Historial email | `modules/state.js`, `storage.js`, `emailHistory` | operativo, semántica de envío defectuosa |
| Plantillas sectoriales | `modules/email-templates.js` | operativo legacy |
| Generación IA editable | `modules/ai-email.js:openAiEmailModal/runAiEmailGeneration` | operativo en código, mocks |
| Router coste cero | `modules/ai-router.js:aiGatewayFetch/AI_ROUTER` | probado automáticamente |
| Calendario seguimiento | `modules/ai-email.js:generateContactCalendar/applyContactCalendar` | prototipo, no idempotente |
| Respuestas pegadas | `modules/inbox.js:registerInlineReply/applyInboxMatch` | operativo parcial |
| Respuesta IA | `modules/ai-router.js:generateReplyEmail` | prototipo Gemini específico |
| Seguimiento por fecha | `modules/ai-router.js:applySequenceRule/updateFollowupBadge` | operativo legacy |
| Apertura Outlook | rutas `mailto:` en leads/ai-email/ai-router | operativo; no confirma envío |
| Exclusión global | contrato ejecutivo | pendiente |
| Empresa/contacto/oportunidad separados | modelo ejecutivo | diseñado, pendiente |
| Panel comercial unificado | este plan | diseñado, pendiente |

## Incumplimientos detectados que no se corrigen aquí

1. Abrir correo/WhatsApp puede registrarse como enviado.
2. Calendario actual impone días y mezcla canales sin gate jurídico.
3. Respuesta entrante añade seguimiento `+2 días` en vez de suspender formalmente.
4. Intenciones actuales no cubren opt-out, derivación, reunión ni referencias.
5. No existe exclusión global persistente.
6. Historial se asocia principalmente por `leadId/email`, insuficiente para multisucursal/multicontacto.
7. Algunas funciones llaman Gemini directamente, aunque pasan por gateway; no aprovechan selector multiproveedor.

## Pruebas de base ejecutadas

- Manifiesto origen: 125/125 PASS.
- Contrato prioritario: 15/15 PASS.
- Quality gate E2.2: 236 observaciones, 199 únicos, 0 fusiones falsas, 0 duplicados residuales, 0 sucursales colapsadas.
- `quality-check.js`: PASS.
- Release: 2.9.4 / build 2026.10.15.0300 / 22 recursos.

## No modificación funcional

Se verificará al cierre que hashes de `modules/`, HTML, versión, baseline, corpus E2.2, contratos y herramientas de la entrega origen permanecen iguales. Solo deben aparecer los doce documentos de este directorio y el cambio esperado del manifiesto integral.

## Dictamen documental

La planificación será READY para revisión independiente si existen los doce documentos, no hay referencias contradictorias, el manifiesto verifica y la comparación SHA256 no detecta cambios funcionales.

