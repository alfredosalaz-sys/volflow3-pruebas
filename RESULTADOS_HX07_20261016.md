# Resultados HX07

| Prueba | Resultado |
|---|---:|
| Reproduccion independiente HX07 | PASS |
| Contrato compartido de coordinacion | PASS |
| Chrome aislado, dos pestanas y autosave concurrente, CPU x4 | PASS |
| Importacion historica Chrome, seis etapas y CPU x4 | PASS |
| Backup/restauracion Chrome, seis etapas | PASS |
| H01-H20 | 20/20 PASS |
| B01-B20 | 20/20 PASS |
| HX01-HX04 | 4/4 PASS |
| HX05-HX06 independientes | 2/2 PASS |
| HX05-HX06 ampliadas | 2/2 PASS |
| Quality gate Node | 35/35 PASS |
| Sintaxis JS/CJS | 75/75 PASS |
| Quality check | PASS |
| Integridad de release | PASS, 26 recursos |

El escenario de dos pestanas verifica por contenido que `created-in-another-tab` permanece tanto en localStorage como en IndexedDB, que `historic` no se aplica parcialmente, que el resultado es `ok:false` y que el cercado queda liberado.

No se usaron datos reales, credenciales reales, red externa, el perfil habitual ni el Celeron fisico.
