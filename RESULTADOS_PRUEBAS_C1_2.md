# Resultados de pruebas C1.2

Fecha: 2026-10-16. Se utilizaron exclusivamente datos sinteticos y ejecucion offline.

| Control | Resultado |
|---|---:|
| Regresiones independientes de identidad/evento | PASS, 3/3 |
| Regresiones ampliadas C1.2 | PASS, 8/8 |
| Contratos C0+C1 | PASS, 26/26 |
| Regresiones C1.1 | PASS, 9/9 |
| Auditoria independiente C1.1 | PASS, 3/3 |
| Rutas comerciales | PASS, 8/8 |
| Navegador simulado | PASS, 6/6 |
| Buscador historico | PASS, 7/7 |
| Catalogo E1 | PASS, 33/33 |
| Segmentos prioritarios | PASS, 15/15 |
| Corpus E2.1 | PASS, 23/23 |
| Regresiones E2 | PASS, 2/2 |
| Direcciones E2.2 | PASS, 7/7 |
| Calidad del corpus | PASS, 236 observaciones / 199 establecimientos / 0 fusiones falsas |
| IA coste cero, personalizacion y seguridad | PASS |
| `quality-check.js` | PASS |
| Integridad de version | PASS, 2.9.4 / 2026.10.15.0300 |

## Evidencia C1.2

- Cinco confirmaciones sobreviven a serializacion, restauracion, adicion de web y normalizacion de direccion; el sexto intento se bloquea.
- Una reimportacion con referencias persistentes no reinicia la secuencia.
- Cinco registros importados con claves de secuencia obsoletas siguen bloqueando el sexto.
- Dos sucursales comparten empresa sin compartir establecimiento.
- Una colision explicita de `companyId` queda bloqueada.
- Una evidencia manual repetida deja un solo confirmado y un intento rechazado trazable.
- Un evento de proveedor se deduplica dentro de proveedor y cuenta; otra cuenta constituye un ambito independiente.
- El validador rechaza contratos que desactiven persistencia de identidad, autoridad canonica o unicidad de eventos.

No hubo llamadas externas, APIs facturables, apertura de clientes reales ni envios.
