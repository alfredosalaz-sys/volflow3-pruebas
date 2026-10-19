# Auditoría independiente — Voltflow3 E2.1

Fecha de revisión: 15 de octubre de 2026  
Entrada: `Voltflow3-E2.1-CORRECCION-20261015.rar`  
Alcance: auditoría estática y pruebas Node.js offline. No se publicó, descargó ni llamó a APIs externas, ni se realizaron pruebas en el Celeron físico.

## Dictamen

**READY para corpus piloto limitado, pero NOT READY para iniciar ingestión amplia de E3 sin una corrección E2.2 de identidad física.**

Los dos problemas de E2 detectados anteriormente (fusión COBOS y dependencia de zona horaria) han quedado resueltos en el corpus auditado. Sin embargo, el deduplicador todavía fusiona erróneamente establecimientos con unidades físicas diferentes expresadas con abreviaturas comunes no reconocidas. Los tests originales pasan porque el corpus piloto no ejerce todos estos formatos.

## Verificaciones reproducidas

| Prueba | Resultado independiente |
|---|---|
| SHA256 del manifiesto | 112/112 OK |
| Contrato E1 | 33/33 PASS |
| Contrato E2.1 | 23/23 PASS |
| Regresiones independientes anteriores | 2/2 PASS |
| Regresiones generales del buscador | 7/7 PASS |
| Quality gate piloto | PASS, 236 observaciones y 199 establecimientos |
| Fusiones falsas / grupos de sucursales colapsados en el corpus piloto | 0 / 0 |
| Hash corpus publicado | `fca183475a6e7159bf2eba408673bfbb72b36ffceaa1733fc27b6cddcb0e5ce5` |
| Zonas horarias UTC/Madrid/Nueva York | reproducibilidad PASS |
| Fuente DIBA | solo diagnóstico, no incorporada al corpus puntuado |
| Contratos de IA, seguridad, correo y proveedores, índice Madrid | PASS |
| Integridad de release | `2.9.4`, `2026.10.15.0300`, 22 recursos |
| `quality-check.js` | PASS |
| Sintaxis JS/CJS módulos y herramientas | 46 archivos PASS; el informe de Codex contabiliza 47 con un alcance distinto |
| Comparación con E2 anterior | 17 capturas sin cambios; único módulo funcional modificado: `modules/business-providers.js` |

Se utilizó una copia del RAR para ejecutar pruebas que generan métricas o corpus. No se modificó el paquete original.

### Ensayo activo del bloqueo del quality gate

Se alteró en una copia una etiqueta `sameEstablishmentGroup` dentro de un par que sí se deduplica, creando una fusión falsa con corpus estructuralmente válido y hashes regenerados:

- `validate-business-coverage-corpus.cjs`: salida **0** (corpus estructuralmente válido).
- `business-coverage-quality.cjs`: salida **1** (rechazo, fusión falsa detectada).
- `business-coverage-quality.cjs --report-only`: salida **0** con aviso `NOT READY`.

El workflow `.github/workflows/quality-gate.yml` ejecuta la modalidad estricta, sin `--report-only`, de modo que ese defecto sí bloquearía el job.

## Nuevo fallo demostrado: formatos de unidad física insuficientes

En `modules/business-providers.js`, la función `extractAddressUnitMap` (aprox. línea 185) analiza unidades expresadas con palabras `local`, `puerta`, `piso`, `portal`, etc. Sin embargo, los tokens abreviados de unidad sin etiqueta explícita se buscan solo entre los **segmentos intermedios** separados por coma (`text.split(',').slice(1, -1)`). Cuando la unidad está en el último segmento, se pierde. Además, `bajo derecha` y `bajo izquierda` reciben la misma señal `ground-floor`, sin distinguir la puerta.

Con registros de ejemplo sintéticos y nombres iguales pero distintos identificadores por fuente, `deduplicateMultisource()` devuelve 1 donde deben permanecer 2:

| Direcciones alternativas | Esperado | Actual |
|---|---:|---:|
| `Calle Mayor 10, 1DR` / `Calle Mayor 10, 1IZ` | 2 | **1** |
| `Calle Mayor 10, 1º D` / `Calle Mayor 10, 1º I` | 2 | **1** |
| `Calle Mayor 10, bajo derecha` / `Calle Mayor 10, bajo izquierda` | 2 | **1** |
| `Calle Mayor 10, bajo A` / `Calle Mayor 10, bajo B` | 2 | **1** |
| Control: `local 1` / `local 2` | 2 | 2 |
| Control: `puerta A` / `puerta B` | 2 | 2 |
| Control: misma unidad declarada | 1 | 1 |

Resultado de nueva batería: **3/7 PASS**; reproducido con Node.js, sin red. Archivo de reproducción adjunto: `E21_PRUEBAS_DIRECCIONES_ADICIONALES_20261015.cjs`.

No se trata de cuatro fusiones incorrectas encontradas en el corpus actual: son **cuatro contraejemplos sintéticos fuera del corpus**, que muestran un riesgo real al ampliar cobertura a nuevos formatos de dirección en E3.

### Criterio para E2.2

1. Extender el reconocimiento de pisos, puertas, letras, abreviaturas y unidades, incluido el último segmento. No utilizar excepciones para empresas concretas.
2. Distinguir «unidad diferente explícita» de «unidad desconocida», conservando vínculos de empresa jurídica sin colapsar locales físicos.
3. Mantener equivalencias entre formatos inequívocamente idénticos y evitar falsos negativos en duplicados reales.
4. Asegurar que el algoritmo compara tipos de unidades coherentemente y no infiere igualdad de local solo por nombre, teléfono o dominio.
5. Incorporar los siete tests al quality gate; exigir 7/7 PASS, además de 2/2 E2, 23/23 E2.1, 33/33 E1 y siete regresiones generales.
6. Regenerar manifiestos y métricas sin inventar contactos, sin tocar las capturas originales y sin activar DIBA.
7. Trabajar en copia aislada y no desplegar ni avanzar a E3 hasta aprobar la revisión.

## Limitaciones pendientes fuera de E2.1

- El piloto es Madrid y Barcelona, no cobertura nacional.
- DIBA sigue excluida hasta resolver sus identificadores geográficos.
- Los 236 registros carecen de contactos publicados en las fuentes utilizadas; no hay evidencia de enriquecimiento de teléfonos o emails.
- Las etiquetas de precisión sectorial se basan en reglas y evidencias de fuentes, no en una evaluación humana externa.
- Sin prueba de Chrome en el Celeron N4020 físico.
- Los controles offline no certifican por sí solos el coste real de cuentas de servicios externos.

**Recomendación:** corrección puntual E2.2 en `modules/business-providers.js`, sin reconstruir el buscador. Tras validarla, aprobar el piloto E2 y pasar a E3.
