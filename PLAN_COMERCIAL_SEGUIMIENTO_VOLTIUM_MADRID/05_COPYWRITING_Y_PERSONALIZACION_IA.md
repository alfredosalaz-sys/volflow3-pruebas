# Copywriting y personalizacion mediante IA

## Objetivo

Crear comunicaciones breves, naturales y útiles para reformas, obras, rehabilitacion y mantenimiento, diferenciadas por empresa, perfil, rol y momento comercial.

## Contexto permitido

- Datos verificados y su procedencia.
- Perfil/sector con evidencia.
- Rol comercial.
- Servicios de Voltium aprobados.
- Historial confirmado y objeciones.
- Señales reales de oportunidad con fuente.
- Firma corporativa configurada.

No usar: campos desconocidos, inferencias sobre necesidades, cargos inventados, webs supuestamente visitadas, reseñas no disponibles, cifras/promesas no verificadas o historial completo innecesario.

## Personalizacion por niveles

1. `company_specific`: existe evidencia propia suficiente.
2. `sector_honest`: solo sector/rol y datos básicos; declara propuesta general sin fingir investigación.
3. `manual_only`: contexto o legalidad insuficientes; IA no genera salida lista para aprobar.

## Técnicas

AIDA, PAS, propuesta de valor, venta consultiva y tratamiento de objeciones se seleccionan por tarea. No aparecen como texto mecánico. Prueba social solo con evidencia registrada. Prohibidos falsa urgencia, miedo, presión, exageración y garantías inexistentes.

## Contrato de salida

```js
{
  subject,
  bodyText,
  personalizationLevel,
  claims: [{ text, sourceField, sourceRef }],
  angle,
  callToAction,
  role,
  sequenceStep,
  factsNotUsed: [],
  warnings: [],
  modelAudit: { provider, model, purpose, generatedAt }
}
```

Se almacena texto, versión y auditoría; nunca la API key ni prompt con datos innecesarios.

## Router gratuito

Toda generación pasa por `AI_ROUTER.call()`/`aiGatewayFetch()` inmediatamente antes de red. Solo proveedores/modelos permitidos y aprobados por sesión. El diseño actual admite Gemini, Groq y OpenRouter; Mistral y Cloudflare permanecen `designed/pending` hasta verificar cuenta, modelo, CORS, cuota y bloqueo económico.

Fallback solo entre proveedores autorizados para el mismo nivel de privacidad. Sin proveedor elegible, edición manual con mensaje claro. Los mocks prueban lógica, no disponibilidad real.

## Perfiles de tarea

- `commercial_first_contact`
- `commercial_followup`
- `commercial_subject_improvement`
- `commercial_reply_analysis`
- `commercial_reply_draft`
- `commercial_objection_handling`
- `commercial_summary`

Cada perfil define máximo de contexto/salida, temperatura, campos permitidos y política de datos personales.

## Aprobación

La UI muestra hechos utilizados, advertencias, procedencia y cambios desde la última aprobación. Editar invalida aprobación anterior. Un botón distinto prepara Outlook. Después se solicita confirmación de envío; no se presupone.

## Pruebas

- Cinco perfiles y tres roles producen propuestas coherentes.
- Empresa con pocos datos recibe personalización sectorial honesta.
- No inventa responsable, necesidad, proyecto ni prueba social.
- Regenerar crea versión y no secuencia nueva.
- Los pasos no repiten argumento.
- Clave/proveedor no aprobado genera cero peticiones.
- Respuesta malformada no llega al editor como aprobada.
- Datos empresariales con instrucciones hostiles quedan delimitados.

