# Protocolo fisico Celeron N4020

Estado: PENDIENTE DE PRUEBA FISICA.

## Preparacion

- Perfil nuevo de Chrome sin sincronizacion.
- Red externa desconectada o bloqueada.
- Fixtures sinteticos, nunca datos reales.
- Copia cifrada verificada antes de cada escenario.
- Administrador de tareas y Chrome Task Manager visibles.

## Escenarios

1. Perfil vacio + portable 2.9.2 con 1.182 leads.
2. Estado nuevo + backup historico con 5.000 leads.
3. Repetir la misma importacion y comprobar cero duplicados.
4. Dataset sintetico de 11.820 leads con contactos, mensajes y oposiciones.
5. Corte simulado durante IndexedDB y rollback.
6. Tres reinicios, backup posterior y restauracion en otro perfil vacio.

## Criterios medibles

- Interfaz responde a clic en menos de 1 segundo durante preview y lotes.
- Ninguna tarea principal continua superior a 5 segundos.
- Sin dialogo `La pagina no responde`.
- Pico de memoria documentado y sin crecimiento sostenido tras finalizar.
- Recuentos, IDs, relaciones, oposiciones y hashes equivalentes.
- Segunda importacion no aumenta entidades ni eventos.
- Tiempo total registrado por escenario.

No aprobar publicacion para ese hardware hasta ejecutar y documentar este protocolo en el equipo fisico.
