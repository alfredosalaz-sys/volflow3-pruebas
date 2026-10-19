# Resultados HX09

| Prueba | Resultado |
|---|---:|
| HX09 independiente | PASS |
| HX09 ampliada: replay parcial y reconocimiento por evento | 2/2 PASS |
| Chrome HX09: dos pestanas, fence readquirido y lock concurrente, CPU x4 | PASS |
| HX08 independiente | PASS |
| HX08 ampliada | 2/2 PASS |
| Chrome HX08: cierre real de pestana escritora | PASS |
| HX07 independiente | PASS |
| Chrome HX07: dos pestanas, localStorage e IndexedDB | PASS |
| H01-H20 | 20/20 PASS |
| B01-B20 | 20/20 PASS |
| Chrome importacion historica | 6 etapas PASS |
| Chrome backup/restauracion | 6 etapas PASS |
| Quality gate completo sin manifiesto final | 39/39 comandos PASS |
| Sintaxis JavaScript/CJS | 81/81 PASS |
| Quality check | PASS |
| Manifiesto de aplicacion | 36/36 SHA256 |
| Manifiesto completo HX09 | 246/246 SHA256 |
| Manifiesto existente de la base HX08 | 236/236 entradas SHA256 |

Las pruebas Chrome usaron perfiles temporales, red externa bloqueada y datos sinteticos. El throttling x4 no equivale a una prueba fisica en Celeron N4020.
