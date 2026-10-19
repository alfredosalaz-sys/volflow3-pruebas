# Informe tecnico E2 - corpus empresarial piloto

> Documento historico de E2. Sus bloqueos fueron tratados en `INFORME_TECNICO_E2_1_CORRECCION.md`; no representa el estado final de E2.1.

Fecha: 2026-10-15

Base: Voltflow 3 2.9.4, build `2026.10.15.0300`

Estado: **E2 construida, validada estructuralmente y no aprobada para alimentar produccion**

## Alcance ejecutado

Se creo una copia aislada de E1 y se implementaron exclusivamente herramientas y fixtures de evaluacion. No se modificaron `gordi_leads`, `saveLeads()`, IndexedDB, claves, backups ni el comportamiento de la SPA. No se descargo Overture ni OSM y no se avanzo a E3-E8.

## Evidencia E1

- Contrato del catalogo v2: 33/33 PASS.
- Manifiesto de E1: 72 archivos verificados antes de aislar E2.
- Catalogo: 5 proveedores, 1 particion, 29 registros, 17 sectores, 52 provincias y 3 municipios.
- Indice real de Madrid y siete regresiones independientes: PASS.
- Version: 2.9.4, build `2026.10.15.0300`.

## Construccion del corpus

Se conservaron 16 capturas acotadas: ocho consultas por ciudad y un maximo de 30 filas por consulta. El corpus final contiene:

| Metrica | Resultado |
|---|---:|
| Observaciones | 236 |
| Establecimientos de origen unicos | 199 |
| Madrid | 133 |
| Barcelona | 103 |
| Sectores | 8 |
| Grupos de sucursales/locales relacionados | 9 |
| Tamano | 715634 bytes |
| Limite | 1048576 bytes |
| Procedencia completa | 100 % |
| Geografia etiquetada correcta | 100 % |
| Positivos por evidencia de fuente | 199 |
| Negativos cruzados | 28 |
| Ambiguos | 9 |

La normalizacion incluye nombre comercial, actividad, direccion y unidad de local cuando existe, codigos INE, coordenadas WGS84, sector y procedencia. La razon social, codigo postal y contactos quedan vacios cuando el recurso no los publica. El 100 % se clasifica como incompleto bajo el criterio estricto de tener todos esos campos; no se han inventado datos.

## Calidad y limitaciones

La proporcion positiva del 87,67 % entre filas clasificadas es un equilibrio de etiquetas basadas en evidencia de fuente, no una medida independiente de precision del buscador. Hace falta revision humana externa de una muestra antes de usarla como verdad de referencia.

### Bloqueo de deduplicacion

El motor actual produce 198 salidas para 199 establecimientos unicos. Fusiona incorrectamente:

- `madrid_open_data_activities:280001783`
- `madrid_open_data_activities:280001784`

Ambos registros publican `COBOS GESTOR ADMINISTRATIVO GRADUADO SOCIAL` en calle Nunez de Balboa 8, pero corresponden a unidades oficiales distintas (`1DR` y `local 30`). Resultado: 1 fusion automatica incorrecta y 1 grupo de locales colapsado. El criterio de E2 exige cero; por tanto el quality gate queda `ready: false`.

### DIBA

La captura diagnostica de diez filas muestra `adreca.nom_municipi = BARCELONA`, mientras `rel_municipi` contiene ocho municipios distintos y ninguno es `08019`. DIBA queda fuera del corpus puntuado. No se infiere cobertura de Barcelona ni nacional a partir de esa consulta.

## Pruebas E2

- Validador estructural: PASS, 236 observaciones, 16 capturas, 2 ciudades, 8 sectores y 9 grupos.
- Contrato E2: 20/20 PASS.
- Casos negativos: hash, duplicado, procedencia, geografia, contacto sin fuente, positivo sin evidencia, ambiguo sin doble decision, NIF, DIBA insegura, fuente E3/E4, compatibilidad v1, captura alterada, limite de filas y coste cero.
- Construccion determinista sin red: PASS.
- Quality gate funcional: FAIL esperado y conservado por la fusion descrita.

Los resultados completos estan en `tests/fixtures/business-coverage/quality-metrics.json`. Las pruebas de E1 se repiten en el cierre y se registran junto al manifiesto final.

## Coste y licencias

Las capturas fueron solicitudes publicas, no autenticadas y acotadas. No se usaron APIs facturables ni credenciales. Madrid y Barcelona se documentan como CC BY 4.0. DIBA se conserva solo como diagnostico bajo la licencia indicada por su propia respuesta. INE se usa para codigos geograficos, no como fuente de empresas.

## Compatibilidad y rendimiento

El indice de Madrid conserva `recordSchemaVersion: 1`. El corpus no se incluye en el manifiesto de recursos de la aplicacion y no afecta arranque, memoria ni almacenamiento del CRM. La construccion procesa menos de 500 filas de origen secuencialmente; el artefacto queda por debajo de 1 MiB.

## Dictamen

**Lista para auditoria independiente: SI**, porque el corpus, herramientas, integridad, limitaciones y fallo detectado son reproducibles.

**E2 aprobada para alimentar el buscador: NO.** Antes debe corregirse en una entrega posterior autorizada la deduplicacion de establecimientos con unidades distintas y repetirse la prueba hasta obtener cero fusiones incorrectas. Tambien debe realizarse una revision humana independiente del etiquetado sectorial. No se autoriza avanzar a E3-E8 con este dictamen.
