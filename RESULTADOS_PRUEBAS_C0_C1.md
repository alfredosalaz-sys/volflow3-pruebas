# Resultados de pruebas C0 + C1

Fecha de ejecucion: 2026-10-15. Todas las pruebas usaron datos sinteticos. No hubo llamadas externas facturables ni envios.

| Control | Resultado |
|---|---:|
| Validador contrato C0 | PASS, 9 estados / 9 grupos de transicion |
| Contratos C0-C1 positivos y negativos | PASS, 26/26 |
| Regresiones de rutas de comunicacion | PASS, 8/8 |
| Integracion de navegador simulada | PASS, 6/6 |
| Chrome aislado C1, CPU x4, HTTPS externo bloqueado | PASS |
| Integridad de release | PASS, version 2.9.4 / build 2026.10.15.0300 |
| Regresiones historicas de buscador | PASS, 7/7 |
| E1 catalogo | PASS, 33/33 |
| Segmentos prioritarios | PASS, 15/15 |
| E2 corpus | PASS, 23/23 |
| E2 adicionales | PASS, 2/2 |
| E2.2 direcciones | PASS, 7/7 |
| Calidad E2.2 | PASS, 236 observaciones / 199 establecimientos / 0 fusiones falsas |
| Places mock / proveedores / indices reales | PASS |
| Rendimiento proveedor | PASS, 600 a 300 unicos en 31 ms |
| IA coste cero, personalizacion y seguridad | PASS |
| `quality-check.js` | PASS |
| Sintaxis JS/CJS | PASS |
| Manifiesto SHA256 | PASS, verificacion final posterior a su generacion |

## Evidencia C1 en Chrome

- CPU throttling: x4.
- Red HTTPS externa: bloqueada.
- Aperturas externas simuladas: 1.
- Envios confirmados tras abrir: 0.
- Estado del lead tras abrir: `Pendiente`.
- Envios tras confirmacion manual: 1.
- Transiciones `SENT_CONFIRMED`: 1 incluso despues de confirmar dos veces.
- Errores JavaScript: 0.

## Evidencia de no regresion en Chrome

- Madrid local: 9 resultados, los 9 emitidos progresivamente.
- Busqueda local primero: 1 resultado y 0 llamadas al adaptador remoto.
- Barcelona sintetica: 1 resultado DIBA; DIBA de produccion sigue en cuarentena.
- Empresas diferentes con telefono compartido: 2.
- Duplicado verdadero: 1, con 2 procedencias.
- Persistencia, cobertura, snapshot y restauracion: PASS.
- IA real bloqueada con `AI_ZERO_COST_BLOCKED`.
- Google Places: no permitido y script ausente.
- Interaccion medida: 72 ms.
- Heap JS: 2,924,204 bytes.
- Tareas largas de arranque: 6, maxima 537 ms.
- Tareas largas de operacion: 2, maxima 156 ms.
- Excepciones runtime: 0.

## Limitacion de medicion

Chrome con CPU x4 no reproduce exactamente el Celeron N4020. Las tareas largas observadas son un riesgo real que no pertenece al alcance funcional C0+C1 y no se declara corregido.
