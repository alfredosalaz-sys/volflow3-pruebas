# Criterios de aceptación y pruebas

## Gates globales

- E1 `33/33`, E2.1 `23/23`, E2.2 `2/2 + 7/7`, históricas `7/7`.
- Cero fusiones falsas y sucursales colapsadas en corpus.
- `quality-check.js`, sintaxis y SHA256.
- Cero red comercial en tests; fetch mockeado.
- Mappings no validados permanecen inactivos.
- DIBA continúa en cuarentena.
- Ningún borrado o mutación de datos reales.

## Matriz obligatoria A-P

| Requisito | Prueba verificable | Gate |
|---|---|---|
| A primer correo | fixtures por cinco perfiles, rol y datos escasos | claims trazables; 0 hechos inventados |
| B cinco contactos | secuencia completa y similitud entre pasos | max 5 confirmados; ángulos distintos |
| C historial | reinicio, backup/restauración e interrupción | mismos IDs/eventos/hashes |
| D respuestas | fixtures de 13 intenciones | intención/evidencia/revisión correctas |
| E suspensión | respuesta durante paso 2 | estado `suspended_on_reply`; 0 salidas |
| F exclusiones | opt-out y configuración manipulada | 0 aperturas/envíos posibles |
| G aprobación | generar/editar/abrir | no abre sin aprobación vigente |
| H estados | recorrido completo | solo confirmación crea envío |
| I multisucursal/contactos | matriz empresa-sede-persona | no mezcla historiales |
| J reimportación | importar tres veces | una secuencia activa |
| K coste cero | proveedor/modelo/clave/cuota corruptos | 0 llamadas no autorizadas |
| L regresiones | suites acumuladas | todas PASS |
| M Celeron | Chromium x4 y equipo físico | presupuestos definidos; físico no inferido |
| N E3-E8 | validadores cruzados | perfiles/versiones coherentes |
| O roles | mismo sector con roles distintos | copy/CTA adecuados |
| P mappings | candidate/requires-* | no consultables como activos |

## Seguridad

- HTML y URLs sanitizados.
- Prompt injection en empresa, web y respuesta.
- Claves ausentes de logs, eventos, export y manifiesto.
- Cuerpos minimizados antes de IA.
- JSON IA validado; respuesta libre nunca muta estado.
- Exclusión prevalece sobre feature flags/localStorage manipulable.

## Persistencia

- Migración sobre copias sintéticas de 0, 1.182, 5.000 y 11.820 leads.
- Cronologías de 0, 5, 50 y 500 eventos por empresa.
- Backup antes/después semánticamente equivalente.
- QuotaExceededError visible y sin pérdida silenciosa.
- Fallo a mitad de escritura recuperable por journal/idempotencia.

## Rendimiento

- C1: preparación y confirmación inferiores a 100 ms p95 en Chromium x4 con fixture.
- Panel: primer contenido menor de 500 ms x4; paginación/incremental.
- Ninguna operación normal superior a 50 ms sin división/fallback medido.
- Memoria sin crecimiento sostenido en 30 minutos de navegación sintética.
- Prueba física N4020 obligatoria antes de afirmar compatibilidad real.

Estos objetivos son gates iniciales y deben medirse; no se declaran cumplidos en esta planificación.

## Coste y Outlook

- Mocks demuestran control local; no prueban gratuidad de una cuenta.
- Sin aprobación de cuenta gratuita: IA bloqueada y edición manual disponible.
- Abrir `mailto:` registra `outlook_opened`; test afirma que `sent_confirmed` sigue ausente.
- Confirmación manual idempotente; importación de enviados deduplica.

