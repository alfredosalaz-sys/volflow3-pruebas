# Integración del seguimiento en E3-E8

## Principio

No se reabre E1/E2.2. La pista comercial usa sus identidades, procedencia y dedupe. Las subentregas comerciales se añaden donde existe dependencia real.

## E3 - Overture piloto

- Medir canales corporativos disponibles, no solo establecimientos.
- Producir `Company/Establishment/ContactPoint` candidatos sin escribir CRM.
- Validar mappings por release y cinco perfiles.
- Métricas: cinco contractuales más teléfono/email/responsable/personalización suficiente.
- No generar mensajes ni activar secuencias.

## E4 - OSM piloto

- Medir aporte marginal de contacto y conflictos con Overture.
- Conservar ODbL y atribución por campo.
- No importar metadatos de contribuidores ni inferir responsables.
- Gate común E3/E4 antes de E5.

## E5.0 - Busqueda progresiva v2

- Mantener objetivo original: parciales, estados de fuente, dedupe, importación compatible.
- Importar `discovery` y procedencia opcional sin crear secuencia.

## E5.1 - Semántica comercial mínima (primera implementación)

- Introducir estados `generated/edited/approved/outlook_opened/sent_confirmed`.
- Corregir las rutas `mailto:`/WhatsApp que hoy marcan enviado al abrir.
- Confirmación manual de envío y métricas separadas.
- Fixtures, feature flag y proyección legacy.
- Sin IA nueva y sin secuencia múltiple todavía.

## E5.2 - Identidad y cronología sombra

- Proyección Company/Establishment/Contact desde leads sintéticos.
- Store sombra y eventos idempotentes.
- Backup/restauración de la sombra antes de escritura real.
- Reimportar no duplica empresa, contacto ni secuencia.

## E5.3 - Primer contacto IA útil

- Perfil/rol, nivel de personalización, claims con fuente.
- Generar, editar, regenerar, aprobar y preparar Outlook.
- Fallback manual; router de coste cero obligatorio.

## E6 - Cache y seguimiento

- Mantener cache de índices aislada original.
- Añadir secuencia hasta cinco pasos, tareas y suspensión por respuesta como subentrega separada.
- Panel inicial: pendientes de aprobar, confirmar envío, responder y próximos seguimientos.
- Ninguna dependencia entre borrar cache de búsqueda e historial comercial.

## E7 - Expansión y priorización

- Cobertura provincial modular original.
- Scoring multidimensional, métricas comerciales y panel de oportunidades.
- Pruebas de rendimiento con volumen nacional y cronologías grandes.
- No afirmar compatibilidad física hasta probar N4020.

## E8 - Seguridad y recuperación

- Alcances de backup original más eventos, contactos, oportunidades, secuencias, exclusiones y tareas.
- Secretos excluidos por defecto.
- Restauración conserva IDs e idempotencia.
- Exportación de informe técnico sin cuerpos completos/contactos cuando se elige anonimización.

## Dependencias

```text
E3 + E4 -> E5.0
E5.0 -> E5.1 -> E5.2 -> E5.3
E5.2 + E5.3 -> E6 seguimiento
E6 -> E7 scoring/metricas nacionales
E5.2 backup minimo -> escritura real
E7 + modelo estable -> E8 endurecimiento final
```

E5.1 puede desarrollarse antes de completar E3/E4 si se prueba solo con leads sintéticos y permanece tras feature flag, porque corrige un defecto del flujo actual sin depender de nuevos índices. No se activa para datos reales hasta su gate independiente.

