# Resultados de pruebas HX05-HX06

Entorno: Windows 11, Node local y Google Chrome headless con perfiles temporales aislados. No se uso el perfil habitual ni se hicieron llamadas externas.

| Comprobacion | Resultado |
|---|---:|
| Auditoria independiente HX05-HX06 | 2/2 PASS |
| Regresion ampliada de estado completo y salida segura | 2/2 PASS |
| Importacion historica H01-H20 | 20/20 PASS |
| Backup cifrado B01-B20 | 20/20 PASS |
| Auditoria independiente HX01-HX04 | 4/4 PASS |
| Quality gate Node heredado y nuevo, sin verificacion de manifiesto intermedia | 33/33 PASS |
| Navegador de importacion, CPU x4 | 6 etapas PASS |
| Navegador de backup/restauracion | 6 etapas PASS |
| Sintaxis JS/CJS | PASS |
| Quality check | PASS |
| Integridad de release | PASS |
| Manifiesto completo | Consultar salida final de `verify-manifest.cjs` |
| Manifiesto de aplicacion | Consultar salida final de `verify-manifest.cjs MANIFEST_APLICACION_SHA256.txt` |

La regresion ampliada modifica exclusivamente IndexedDB entre vista previa y commit, mantiene localStorage identico y confirma que no se llama a restauracion. HX06 usa una version sintetica con etiqueta, atributo y handler HTML, y comprueba que el sink de vista previa es `textContent`.

No se declara prueba fisica sobre Celeron N4020 ni prueba con datos reales del usuario.
