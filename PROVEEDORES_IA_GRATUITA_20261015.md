# Evaluacion de proveedores de IA gratuita

Fecha de consulta: 2026-10-15.

## Criterio de integracion

Voltflow aplica `ZERO_COST_MODE` con denegacion por defecto. Una clave no autoriza una llamada: el usuario debe confirmar durante la sesion que la cuenta no tiene facturacion habilitada, aceptar el riesgo del navegador y el tratamiento de datos. Esta confirmacion local no demuestra el estado economico real de la cuenta. Si este no puede verificarse, el proveedor permanece bloqueado.

## Proveedores activos en la candidata

| Proveedor | Modelo permitido | Plan gratuito documentado | Facturacion | Bloqueo efectivo de cargos | Cuota documentada | Renovacion | REST | CORS | Privacidad | Integracion |
|---|---|---|---|---|---|---|---|---|---|---|
| Google Gemini | `gemini-2.5-flash-lite` | Si, segun tabla de precios | Puede existir facturacion en proyectos vinculados | Solo si el proyecto se mantiene en Free Tier sin facturacion; estado de la cuenta no verificable desde Voltflow | Limites por proyecto/modelo visibles en AI Studio; la aplicacion usa limites locales mas bajos | Segun ventana publicada para el proyecto | Si | Compatible en la integracion actual, pendiente de cuenta real | Los datos se transmiten a Google bajo sus terminos | Condicionada a confirmacion por sesion |
| Groq | `openai/gpt-oss-20b` | Si, Free Plan documentado | Existen planes de pago | Requiere cuenta Free sin facturacion; estado no verificable desde Voltflow | La tabla oficial publica RPM/RPD/TPM/TPD por modelo; puede cambiar | Segun cabeceras y consola | Si | Compatible en la integracion actual, pendiente de cuenta real | Los datos se transmiten a Groq | Condicionada a confirmacion por sesion |
| OpenRouter | `openrouter/free` | Si; plan Free sin opciones de pago y 50 solicitudes/dia en la pagina consultada | Otros planes y creditos existen | La candidata solo permite `openrouter/free`, pero exige ademas confirmar una cuenta sin creditos/metodo de pago | 50 solicitudes/dia para el plan Free; disponibilidad del modelo subyacente variable | Diaria segun documentacion | Si | Compatible en la integracion actual, pendiente de cuenta real | El proveedor subyacente puede variar y aplicar retencion o entrenamiento | Ultimo fallback, condicionado a confirmacion por sesion |

Fuentes oficiales:

- Gemini: https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/docs/rate-limits y https://ai.google.dev/gemini-api/docs/billing
- Groq: https://console.groq.com/docs/rate-limits y https://console.groq.com/docs/billing-faqs
- OpenRouter: https://openrouter.ai/pricing, https://openrouter.ai/models?pricing=free, https://openrouter.ai/docs y https://openrouter.ai/privacy

Clasificacion: **VERIFICADO EN DOCUMENTACION OFICIAL** para las caracteristicas de los planes. **PENDIENTE DE PRUEBA REAL** para CORS, cuotas y estado economico de cada cuenta concreta. **NO VERIFICADO** que una cuenta concreta del usuario tenga coste cero.

## Candidatos evaluados y no activados

| Proveedor | Modelos | Plan gratuito | Facturacion | Bloqueo efectivo de cargos | Cuota | Renovacion | REST | CORS | Privacidad | Integracion | Motivo |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Cloudflare Workers AI | Catalogo Workers AI; ejemplo oficial `@cf/meta/llama-3.1-8b-instruct` | Si en Workers Free | Workers Paid factura uso superior | Si se demuestra que la cuenta permanece en Workers Free: al superar 10.000 neurons/dia la solicitud falla | 10.000 neurons/dia en Free | 00:00 UTC | Si | Sin verificar desde GitHub Pages | Token y contenido se envian a Cloudflare; los tokens de AI Gateway tienen alcance de cuenta | Condicionada, adaptador no activado | No se verificaron cuenta, CORS ni alcance minimo de token; no se desplego infraestructura |
| Hugging Face Inference Providers | Modelos de texto variables por proveedor | Credito mensual limitado | El uso adicional requiere creditos comprados o facturacion del proveedor con clave propia | No verificable desde la aplicacion estatica | USD 0,10/mes para usuario Free en la pagina consultada, sujeto a cambios | Mensual | Si | Sin verificar | Depende del proveedor de inferencia elegido | Descartada en esta fase | Credito muy reducido, disponibilidad variable y estado de pago no verificable |
| Mistral AI | Modelos disponibles en la cuenta; modelos Labs experimentales | Free mode documentado | PAYG opcional con creditos y auto-recarga | Potencialmente si PAYG esta desactivado, pero no puede comprobarse desde Voltflow | Limites exactos visibles en el panel de la cuenta | Segun panel | Si | Sin verificar | Condiciones y opt-out dependen del modelo; Labs puede cambiar sin aviso | Condicionada, no activada | Cuotas/modelos y estado PAYG no verificables; CORS no probado |
| Cerebras Inference | Catalogo Inference | Documentacion oficial no coherente entre una pagina antigua Free y la oferta actual con credito inicial | La pagina actual describe PAYGO tras credito inicial | Sin verificar | Sin cuota gratuita permanente verificable | Sin verificar | Si | Sin verificar | Segun terminos de Cerebras | Descartada | No se pudo demostrar un plan gratuito permanente y bloqueado frente a cargos |
| Ollama local | Modelos locales compatibles con el equipo | Sin coste de API | No requiere facturacion | Si, para ejecucion estrictamente local | Limitada por hardware | No aplica | Si, local | Sin verificar en este navegador | Datos locales si no se instalan integraciones remotas | No incorporada | Instalacion, CORS, espacio, memoria y rendimiento en Celeron N4020 no probados |

Fuentes oficiales:

- Cloudflare: https://developers.cloudflare.com/workers-ai/platform/pricing/, https://developers.cloudflare.com/workers-ai/get-started/rest-api/ y https://developers.cloudflare.com/ai-gateway/configuration/authentication/
- Hugging Face: https://huggingface.co/docs/inference-providers/en/pricing
- Mistral: https://docs.mistral.ai/admin/billing-usage/subscriptions, https://docs.mistral.ai/admin/billing-usage/usage-limits, https://docs.mistral.ai/admin/billing-usage/billing y https://docs.mistral.ai/inference/model-lifecycle
- Cerebras: https://www.cerebras.ai/pricing y https://inference-docs.cerebras.ai/support/pricing
- Ollama: https://docs.ollama.com/api/introduction

Clasificacion: **VERIFICADO EN DOCUMENTACION OFICIAL** para las condiciones descritas en las fuentes. **NO VERIFICADO** para CORS, cuentas concretas y controles economicos que requieren acceso autenticado. Ninguno de estos candidatos recibe llamadas en esta candidata.

## Decision

No se anaden adaptadores de red solo para aumentar el numero de proveedores. Se mantienen tres integraciones conocidas detras de una unica pasarela, con modelos permitidos inmutables, autorizacion por sesion, limites conservadores, cancelacion, telemetria sin secretos y fallback restringido. Cloudflare y Mistral quedan como candidatos razonables para una fase posterior, condicionados a una comprobacion real de cuenta gratuita, facturacion desactivada, CORS y alcance minimo de credenciales.

Clasificacion: **VERIFICADO EN CODIGO** y **PROBADO AUTOMATICAMENTE** para el bloqueo de proveedores no registrados. **PENDIENTE DE PRUEBA REAL** para cualquier cuenta o proveedor externo.
