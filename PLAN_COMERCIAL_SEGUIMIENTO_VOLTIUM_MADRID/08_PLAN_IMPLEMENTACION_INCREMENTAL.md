# Plan de implementación incremental

## Hito C0 - Gates documentales

**Objetivo:** convertir estos contratos en fixtures/validadores sin runtime.

**Archivos futuros:** `data/commercial-followup-contract.v1.json`, `tools/validate-commercial-followup.cjs`, fixtures y quality gate.

**Pruebas:** estados, transiciones, máximo, exclusión, idempotencia, métricas y referencias a perfiles.

**Aceptación:** casos inválidos bloqueados; cero cambios funcionales; regresión completa.

## Hito C1 - Estado real de correo

**Objetivo:** dejar de registrar “enviado” al abrir un cliente externo.

**Archivos previstos:** `modules/leads.js`, `modules/ai-email.js`, `modules/ai-router.js`, `modules/inbox.js`, nuevo helper pequeño `modules/commercial-communications.js`, `app.html` solo para cargarlo/controles mínimos, tests.

**Cambios exactos:** centralizar `prepareExternalDraft()`, persistir borrador/version/aprobación/apertura, diálogo posterior de confirmación y proyección compatible a `emailHistory`.

**Pruebas:** mailto no suma envío; edición invalida aprobación; confirmar crea uno; doble confirmación no duplica; cancelar conserva borrador; WhatsApp cumple lo mismo.

**Reversión:** feature flag `commercialCommunicationStates=false`; conservar eventos y volver a UI legacy sin borrarlos.

## Hito C2 - Identidades y cronología sombra

**Objetivo:** demostrar Company/Establishment/Contact/Event sin sustituir leads.

**Archivos previstos:** `modules/commercial-store.js`, `modules/commercial-model.js`, tests IndexedDB/backups; `init.js` solo tras aprobar contrato de persistencia.

**Cambios exactos:** proyección de fixtures, IDs estables, store separado, índices e idempotencia. Backup/restauración forma parte del mismo hito.

**Pruebas:** ida/vuelta legacy, multisucursal, varios contactos, reimportación, interrupción, cuota y rollback.

## Hito C3 - Primer contacto por perfil

**Objetivo:** hacer utilizable la cadena empresa -> contacto -> borrador aprobado.

**Archivos previstos:** ampliar `ai-email.js`, `ai-router.js`, plantillas/perfiles y UI mínima.

**Cambios exactos:** contexto verificado, claims trazables, tres niveles de personalización, perfiles/roles, revisión y aprobación.

**Pruebas:** cinco perfiles, roles, pocos datos, alucinaciones, fallo IA y fallback manual.

## Hito C4 - Respuestas y exclusiones

**Objetivo:** registrar respuestas seguras, detener secuencias y bloquear oposición.

**Archivos previstos:** `inbox.js`, analizador estructurado, `commercial-store.js`, UI de revisión.

**Cambios exactos:** dedupe de inbound, intención, evidencia, bloqueo provisional, exclusión persistente y recomendación.

**Pruebas:** catálogo de intenciones, prompt injection, opt-out, ambiguos y fallo de proveedor.

## Hito C5 - Secuencia de hasta cinco pasos

**Objetivo:** seguimiento controlado, no campaña automática.

**Cambios exactos:** una secuencia activa por contacto/finalidad, siguiente paso bajo demanda, intervalos configurables, no repetición y cierre.

**Pruebas:** máximo, pausa, respuesta, oposición, reimportación, regeneración y conteo real.

## Hito C6 - Panel y oportunidades

**Objetivo:** mostrar qué ocurrió y qué hacer después.

**Vistas:** primer contacto pendiente, borradores, confirmación de envío, respuestas, tareas, interesados, presupuestos, activos, cerrados y excluidos.

**Pruebas:** proyecciones incrementales, filtros, cronología, accesibilidad y datos grandes.

## Hito C7 - Scoring y métricas

**Objetivo:** priorización explicable y resultado comercial.

**Cambios exactos:** dimensiones separadas, denominadores, series temporales y diferenciación test/real.

**Pruebas:** no inventar necesidad, oposición no aumenta score, hechos confirmados y métricas reproducibles.

## Orden recomendado

`C0 -> C1 -> C2 -> C3 -> C4 -> C5 -> C6 -> C7`.

C1 es la primera tarea de programación. C2 no se activa sin backup probado. C5 no empieza antes de C1/C2/C4. C6 puede mostrar datos parciales desde C2, pero no se presenta como panel completo.

