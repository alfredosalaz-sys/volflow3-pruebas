# Riesgos y controles

| Riesgo | Impacto | Control | Condición de parada/reversión |
|---|---|---|---|
| mailto marcado como enviado | métricas e historial falsos | C1 antes de secuencias | cualquier apertura incrementa envíos |
| historial duplicado | contacto excesivo | IDs/idempotencia/store único | reimportación crea secuencia nueva |
| mezcla matriz/sucursales | conversación atribuida mal | IDs separados y revisión ambigua | evento asignado a sede incorrecta |
| falsa base legal | riesgo LSSI/RGPD | gate humano y estado explícito | `unknown` permite Outlook |
| oposición ignorada | riesgo jurídico alto | bloqueo inmediato persistente | cualquier salida tras opt-out |
| prompt injection | fuga/cambio de política | datos delimitados, sin tools, schema | email modifica instrucciones |
| alucinación IA | reputación/compliance | claims con fuente y revisión | dato no verificable en borrador aprobado |
| coste IA | cargo externo | gateway, aprobación sesión, allowlist | petición no autorizada |
| proveedor gratuito cambia | indisponibilidad/coste | fail closed y manual | fallback a modelo no verificado |
| secretos en navegador | exposición XSS/extensiones | sesión, CSP/reducción scripts, no export | secreto en log/backup normal |
| cronología crece | bloqueo N4020 | IndexedDB, índices, paginación | long task reproducible sin fallback |
| backup incompleto | pérdida de historial/oposición | backup gate antes de escritura | restauración cambia IDs/recuentos |
| estado IA aplicado solo | pipeline falso | sugerencia + aprobación | oportunidad fuerte sin confirmación |
| mappings no validados | falsos positivos | estados contractuales bloqueantes | candidate activado en runtime |
| DIBA geografía dudosa | empresa en municipio erróneo | cuarentena | entrada DIBA en corpus activo |

## Decisiones jurídicas del propietario/asesoría

Requieren validación externa antes de habilitar salidas reales:

- base legal por tipo de destinatario/finalidad;
- información obligatoria y mecanismo de oposición;
- número/intervalo razonable de seguimientos;
- retención y anonimización;
- uso de datos de responsables profesionales;
- uso de proveedores IA y transferencias internacionales;
- tratamiento de listas de exclusión y prueba de cumplimiento.

El software registra decisiones; no sustituye asesoramiento jurídico.

## Outlook

`mailto:` es compatible y sin autenticación, pero no confirma envío. Microsoft Graph podría confirmarlo, pero requiere registro, OAuth, permisos y revisión de coste/privacidad; queda fuera hasta autorización. No se almacenan contraseñas de Outlook.

## IA gratuita

Gemini/Groq/OpenRouter tienen código y mocks. La situación de facturación de cada cuenta es externa y no se garantiza. Mistral/Cloudflare son candidatos, no integraciones activas. Nunca se introducen claves en esta revisión.

## Reversión

Cada hito usa feature flag. Los eventos se conservan aunque la UI vuelva a legacy. Nunca se hace downgrade destructivo, `localStorage.clear()` ni borrado automático de IndexedDB. La reversión restaura lectura anterior y deja exportables los datos nuevos.

