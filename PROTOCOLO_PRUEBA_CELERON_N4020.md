# Protocolo de prueba fisica - Intel Celeron N4020

Estado actual: **PENDIENTE DE PRUEBA REAL**. CPU throttling x4 en otro ordenador no reproduce exactamente este equipo.

## Preparacion

1. Equipo: Intel Celeron N4020, 8 GB RAM, Intel UHD 600, Windows 11 y Chrome actualizado.
2. Conectar a corriente y usar el mismo modo de energia en todas las ejecuciones.
3. Cerrar aplicaciones ajenas a la prueba y registrar version de Chrome, RAM libre y temperatura aproximada si esta disponible.
4. Crear un perfil temporal de Chrome. No usar ni modificar el perfil real.
5. Servir la entrega final por HTTP local o una URL de previsualizacion sin despliegue estable.
6. Bloquear APIs potencialmente facturables. Usar indices y datos sinteticos.
7. Conservar un backup externo antes de cualquier prueba con datos del usuario; preferentemente no usar datos reales.

## Escenarios

Ejecutar por separado con 0, 1.182 y 11.820 leads sinteticos de estructura y longitud representativas:

1. Arranque y apertura del dashboard.
2. Navegacion repetida por Dashboard, Buscar, Leads, Cobertura, Campanas y Configuracion.
3. Busqueda Madrid y Barcelona solo con indices locales.
4. Filtros, ordenacion, apertura y edicion de un lead.
5. Importacion y deduplicacion de resultados sinteticos.
6. Estadisticas, cobertura y exportacion.
7. Exportacion de snapshot, modificacion sintetica y restauracion.
8. Borrador de correo con proveedor IA simulado; edicion, regeneracion simulada y aprobacion sin enviar.
9. Mantener actividad durante 30 minutos, incluyendo los minutos 3, 3:30, 4 y 5. Ampliar a 60 minutos si no hay degradacion.

## Instrumentacion

- Chrome Performance/PerformanceObserver para long tasks globales.
- Chrome Task Manager o `performance.memory` para heap, indicando cual se uso.
- Medicion de retraso del event loop con una sonda periodica independiente.
- Marcas `performance.now()` desde clic hasta siguiente pintura para interacciones representativas.
- Consola y `unhandledrejection` para errores.
- Contadores antes/despues de leads, historial, campanas, cobertura y claves sinteticas.

## Criterios medibles

La candidata se acepta para este equipo solo si todas las condiciones se cumplen en dos ejecuciones consecutivas:

| Criterio | Umbral |
|---|---:|
| Dialogo “La pagina no responde” | 0 |
| Excepciones JavaScript no controladas | 0 |
| Perdida/corrupcion de registros sinteticos | 0 |
| Respuesta visual p95 de acciones habituales | <= 300 ms |
| Respuesta maxima de accion habitual, excluido arranque/exportacion | <= 1.000 ms |
| Long task maxima despues de estabilizar el arranque | <= 1.000 ms |
| Retraso del event loop p95 | <= 150 ms |
| Crecimiento sostenido de heap entre minuto 10 y 30 | <= 20 % y <= 50 MB |
| Busqueda local inicial | resultados progresivos sin esperar proveedor remoto |
| Tareas de minutos 3-5 | ejecutadas sin impedir navegacion/edicion |

Las tareas superiores a 50 ms deben registrarse y analizarse aunque no incumplan el umbral de rechazo del equipo modesto. Si una metrica no esta disponible, marcarla `N/D`; no sustituirla por una estimacion.

## Evidencias

Guardar localmente, sin credenciales ni datos reales:

- Fecha, hardware, Windows y Chrome.
- Tamano del conjunto sintetico y hash del generador/dataset.
- Tabla de metricas por ejecucion.
- Exportacion de Performance o capturas sin secretos.
- Errores de consola.
- Conteos y hashes de los snapshots antes/despues.
- Resultado `APTO`, `NO APTO` o `INCONCLUSO` con motivo.

No declarar resuelto el bloqueo del Celeron hasta completar este protocolo en el hardware fisico.
