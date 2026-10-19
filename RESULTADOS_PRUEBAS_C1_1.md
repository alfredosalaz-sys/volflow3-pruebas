# Resultados de pruebas C1.1

Fecha: 2026-10-16. Datos exclusivamente sinteticos. Sin envios ni llamadas externas.

| Control | Resultado |
|---|---:|
| Auditoria independiente C1.1 | PASS, 3/3 |
| Regresiones ampliadas C1.1 | PASS, 9/9 |
| Contratos C0+C1 | PASS, 26/26 |
| Regresiones de rutas C1 | PASS, 8/8 |
| Navegador simulado C1 | PASS, 6/6 |
| Contrato comercial | PASS, 9 estados / maximo 5 |
| Buscador historico | PASS, 7/7 |
| Catalogo E1 | PASS, 33/33 |
| Segmentos prioritarios | PASS, 15/15 |
| Corpus E2.1 | PASS, 23/23 |
| Regresiones E2 | PASS, 2/2 |
| Direcciones E2.2 | PASS, 7/7 |
| Calidad corpus | PASS, 236 observaciones / 199 establecimientos / 0 fusiones falsas |
| IA coste cero, personalizacion y seguridad | PASS |
| Places, proveedores e indices | PASS |
| `quality-check.js` | PASS |
| Integridad de release | PASS, 2.9.4 / 2026.10.15.0300 |

## Cobertura de los tres defectos

1. Un permiso de `oficina@empresa.test` no autoriza `otro@empresa.test`; el formato y mayusculas del mismo destino si se normalizan.
2. Cinco confirmaciones agotan la secuencia canonica; cambiar `sequenceId`, reimportar o precrear seis borradores no evita el bloqueo. Otro contacto o finalidad dispone de secuencia propia.
3. Evidencias vacias, arrays, tipos incorrectos y fechas invalidas no cuentan. Evidencias manuales y de proveedor completas si cuentan.

## Chrome y WhatsApp

La prueba automatizada instrumentada verifica que la reserva de `about:blank` sucede antes del primer `await` y sobrevive al salto asincrono. Se intento ejecutar Chrome headless con perfil aislado, CPU x4 y red HTTPS bloqueada, pero Chrome no respondio a la primera orden CDP (`Page.enable`). El test finalizo por timeout controlado sin abrir WhatsApp ni enviar datos.

Por ello, la apertura visible real y el efecto de extensiones o politica de popup se clasifican como **PENDIENTE DE PRUEBA MANUAL EN CHROME AISLADO**; no se presentan como PASS.
