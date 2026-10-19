# Resultados de pruebas E2

> Resultado historico anterior a E2.1. Consulte `RESULTADOS_PRUEBAS_E2_1.md` para el cierre vigente.

Fecha de ejecucion: 2026-10-15

Entorno: Node.js 22, Windows 11, ejecucion local sin APIs facturables.

| Prueba | Resultado |
|---|---|
| Sintaxis JavaScript/CJS | PASS, 46 archivos |
| `quality-check.js` | PASS |
| Integridad release | PASS, 2.9.4 / `2026.10.15.0300`, 22 recursos |
| Places mock | PASS |
| Proveedores mock | PASS |
| Indice real local de Madrid | PASS |
| Rendimiento proveedores | PASS, 600 -> 300 en 29-42 ms en este equipo |
| Regresion independiente | PASS, 7/7 |
| Pasarela IA coste cero | PASS |
| Personalizacion de correo IA | PASS |
| Seguridad IA | PASS |
| Validador catalogo E1 | PASS |
| Contrato E1 | PASS, 33/33 |
| Validador corpus E2 | PASS, 236 observaciones |
| Contrato E2 | PASS, 20/20 |
| Medicion de calidad E2 | **NOT READY**: 1 fusion incorrecta y 1 grupo de locales colapsado |

Las pruebas de APIs son mocks. No se realizaron llamadas reales a Google Places, IA ni servicios facturables. El rango de 29-42 ms no representa un Celeron N4020 fisico.

El resultado 20/20 de E2 significa que el corpus detecta correctamente tanto entradas validas como corrupciones y el fallo conocido. No significa que el criterio funcional de cero fusiones incorrectas se haya cumplido.
