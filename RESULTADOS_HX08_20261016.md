# Resultados HX08

| Prueba | Resultado |
|---|---:|
| HX08 independiente | PASS |
| HX08 ampliada: interrupcion y lease caducado | PASS |
| HX08 ampliada: fallo de journal rechazado | PASS |
| Chrome: cierre real de pestana escritora antes del release, CPU x4 | PASS |
| Chrome HX07: dos pestanas y autosave | PASS |
| Chrome importacion historica | 6 etapas PASS |
| Chrome backup/restauracion | 6 etapas PASS |
| HX07 independiente | PASS |
| H01-H20 | 20/20 PASS |
| B01-B20 | 20/20 PASS |
| HX01-HX04 | 4/4 PASS |
| HX05-HX06 | 2/2 independientes y 2/2 ampliadas |
| Quality gate completo (sin manifiesto, regenerado al final) | 37/37 comandos PASS |
| Sintaxis JavaScript/CJS | 78/78 PASS |
| Manifiesto de aplicacion | 36/36 SHA256 |
| Manifiesto completo HX08 | 236/236 SHA256 |
| Integridad de la base HX07 intacta | 226/226 SHA256 |

La prueba Chrome cierra mediante CDP el target escritor despues de confirmar el journal y antes de liberar el fence. Otra pestana recupera el valor, elimina el journal y comprueba que no queda bloqueo activo.

Todas las pruebas usan perfiles temporales y datos sinteticos. No se uso Chrome habitual, red externa ni credenciales reales.
