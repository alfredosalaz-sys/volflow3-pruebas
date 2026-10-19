# Auditoría independiente — Voltflow3 E2 (15/10/2026)

**Paquete examinado:** `Voltflow3-E2-CORPUS-PILOTO-20261015.rar` (105 archivos extraídos sin errores).  
**Entorno de auditoría:** Linux, Node.js 22.16.0, sin peticiones externas ni APIs facturables.  
**Dictamen:** **NO APROBADA para alimentar el buscador ni para iniciar E3**. E2 sí constituye un prototipo evaluable, pero requiere E2.1.

## Resultados repetidos de forma independiente

| Comprobación | Resultado |
|---|---|
| SHA256 del manifiesto | **104/104 PASS** en el paquete original |
| Integridad de app | **PASS**, Voltflow3 2.9.4 / build `2026.10.15.0300` |
| Validador E1 | **PASS**, cinco proveedores, 1 partición, 29 registros |
| Contratos E1 | **33/33 PASS** |
| Validador de corpus E2 | **PASS**: 236 observaciones, 16 capturas, 2 ciudades, 8 sectores, 9 grupos de locales |
| Contratos E2, zona horaria de Madrid | **20/20 PASS** |
| Contratos E2, UTC/Linux | **FAIL** en prueba de construcción determinista |
| Regresiones antiguas | **7/7 PASS** |
| Pruebas de IA y proveedores | **PASS** |
| Control de calidad funcional E2, modo estricto | **FAIL**, como indica el informe original |
| Pruebas nuevas independientes | **0/2 PASS**, reproducen los defectos detallados abajo |
| Integridad después de reconstruir con TZ=UTC | **FAIL** en `corpus.v1.json` y `corpus-manifest.json` por distinta serialización temporal; recuperable con `TZ=Europe/Madrid` |

La revisión de sintaxis Node y `tools/quality-check.js` pasa. La diferencia de zona horaria es una variación real del resultado, **no corrupción del RAR**; el paquete original es íntegro.

## Hallazgo 1 — Fusión incorrecta de establecimientos (bloqueante)

**Código:** `modules/business-providers.js`, función `isLikelyDuplicate` (aprox. línea 314), usada por `deduplicateMultisource` (aprox. línea 417).

- `280001783`: `COBOS GESTOR ADMINISTRATIVO GRADUADO SOCIAL`, calle Núñez de Balboa 8, **unidad 1DR**.
- `280001784`: mismo nombre y edificio, pero **local 30**.
- Las coordenadas también son distintas (aunque próximas), y los identificadores oficiales de local son diferentes.
- Al reproducir la deduplicación de estas dos observaciones, el algoritmo devuelve **1** resultado en lugar de **2**.
- Corpus completo: 199 identidades de origen, 198 salidas, una fusión errónea, un grupo de locales colapsado.

**Causa:** la similitud de nombre y dirección de edificio prevalece sobre la identidad de la unidad. La presencia de `branches` en un resultado fusionado no sustituye mantener dos establecimientos independientes.

**Corrección necesaria:** distinguir unidades físicas (planta, puerta, local, escala) y la granularidad de los identificadores oficiales; si las unidades están explícitamente diferenciadas, bloquear la fusión automática y, en caso de duda, marcar para revisión. No introducir una excepción literal para los ID de COBOS.

## Hallazgo 2 — Corpus no reproducible entre Windows y Linux (bloqueante)

**Código:** `tools/build-business-coverage-corpus.cjs`, línea aproximada 108:

```js
sourceUpdatedAt: row.Data_Revisio ? new Date(row.Data_Revisio).toISOString() : null
```

Las 103 observaciones de Barcelona usan, en la fuente, valores sin zona horaria, por ejemplo `2023-05-11T00:00:00`. JavaScript interpreta esas fechas según la zona del equipo:

- `TZ=Europe/Madrid`: `2023-05-10T22:00:00.000Z`, corpus SHA256 `df71567514f3d984b93977b1e1ac003338f5a6789232a7146d3c36d3cdddf410`.
- `TZ=UTC`: `2023-05-11T00:00:00.000Z`, corpus SHA256 `e7c6ace347c3110737da7740d7ab69ac578024ac3db38b2a8382533605ef0ea7`.

El ensayo `node tools/business-coverage-corpus-test.cjs` funciona en la zona de Madrid y **falla en UTC** por diferencia de hash. **GitHub Actions utiliza `ubuntu-latest` y no fija `TZ=Europe/Madrid`**, por lo que el flujo CI actual no demuestra reproducibilidad multiplataforma.

**Corrección necesaria:** interpretar explícitamente las fechas sin zona con la semántica documentada por la fuente (o preservar solo la fecha/calendario si eso es lo publicado), convertir de forma determinista y probar UTC, Europe/Madrid y una tercera zona.

## Hallazgo 3 — Cronología de procedencia no fiable (requiere aclaración)

En `tests/fixtures/business-coverage/source-manifest.json` consta `retrievedAt: 2026-10-15T16:00:00.000Z`. Al comprobar el paquete, todavía eran aproximadamente las **14:54 UTC de ese día**, así que el sello de recuperación estaba situado **en el futuro**. También se propaga a `generatedAt` y a cada registro del corpus. El código admite `--retrieved-at` manual.

No es una prueba de que las capturas sean falsas, pero sí impide aceptar ese sello como evidencia fiable del momento real de adquisición.

**Corrección necesaria:** distinguir el instante original de captura, el momento de reindexación y la fecha de generación del corpus; impedir timestamps de recuperación futuros, conservar la fecha auténtica si se conoce y señalar como desconocida una fecha histórica que no pueda acreditarse.

## Hallazgo 4 — El gate de GitHub solo informa (pendiente de endurecer antes de aprobar)

`.github/workflows/quality-gate.yml` ejecuta:

```bash
node tools/business-coverage-quality.cjs --report-only
```

Así, un resultado `NOT READY` **no hace fallar GitHub Actions**. Puede tener sentido durante E2 exploratoria, pero **no debe tratarse como aprobación de E2.1**. Además, la prueba E2 actual exige que exista exactamente **una** fusión falsa; hay que cambiar esa expectativa al corregir la deduplicación.

**Corrección necesaria:** cuando se solicite aprobar E2.1, convertir el gate en bloqueante (sin `--report-only` para el criterio de aceptación); sustituir el test que espera el fallo conocido por pruebas positivas de cero falsas fusiones. Mantener tests negativos que detecten el defecto si reaparece.

## Limitaciones confirmadas, no defectos nuevos

- **Cero teléfonos, webs y correos** en las 236 observaciones. Es un corpus de calidad y evaluación, no una base lista para prospección por email.
- DIBA está correctamente en **cuarentena** ante las discrepancias de municipio/código/coordenadas. No dar por validada su cobertura geográfica.
- El «100 % de geografía verificada» deriva en parte de etiquetas fijadas por el constructor a `true`; no equivale a una verificación humana externa de todos los establecimientos.
- La relevancia sectorial etiquetada por reglas no mide todavía la precisión real del buscador.
- No se certificó rendimiento en el Celeron físico.

## Criterios de aceptación de E2.1

1. Cero fusiones incorrectas y cero colapsos de locales en el corpus; sin eliminar duplicados verdaderos ni alterar el comportamiento correcto para el resto de sectores.
2. El corpus debe producir el **mismo hash** en UTC, Europe/Madrid y otra zona horaria.
3. Fechas de procedencia trazables, no futuras y semánticamente correctas.
4. Quality gate bloqueante para los criterios de aceptación de E2.1, y pruebas que fallen cuando se reintroduzcan ambos defectos.
5. Regresiones antiguas 7/7, contratos E1 33/33, contratos E2, integridad y coste cero superados.
6. No modificar versión estable, GitHub, leads, almacenamiento ni avanzar a E3-E8.

## Archivo de reproducción

Junto a este informe se entrega `E2_PRUEBAS_ADICIONALES_20261015.cjs`, que ejecuta dos ensayos **sin red y sin modificar el proyecto**. Invocación en Windows:

```powershell
node E2_PRUEBAS_ADICIONALES_20261015.cjs "C:\Users\NOSTROMO\Downloads\Voltflow3-E2-CORPUS-PILOTO-20261015"
```

En la versión auditada: **2/2 ensayos fallan**, como debe ocurrir antes de corregirlos. El objetivo de E2.1 es que ambos pasen y se repita toda la batería.
