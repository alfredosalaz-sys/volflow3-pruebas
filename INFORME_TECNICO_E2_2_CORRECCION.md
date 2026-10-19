# Informe técnico E2.2

Fecha: 2026-10-15

Base aislada: `Voltflow3-E2.1-CORRECCION-20261015`

## Causa corregida

E2.1 analizaba tokens abreviados solo en segmentos intermedios de una dirección y representaba todos los bajos como `ground-floor`. Por ello no distinguía unidades al final de la dirección, puertas ordinales ni variantes de bajo.

`extractAddressUnitMap()` ahora:

- Examina todos los segmentos posteriores a la vía, incluido el último.
- Separa planta y puerta en expresiones compactas como `1DR` y `1IZ`.
- Reconoce ordinales como `1º D`, `1ª I` y variantes con símbolo de grado.
- Reconoce bajo, bajos, baix, baixos, `BJ` y `BJO` con puerta o dirección.
- Canonicaliza derecha, `D`, `DR`, `DCHA` y `dreta` como `right`.
- Canonicaliza izquierda, `I`, `IZ`, `IZQ`, `IZDA` y `esquerra` como `left`.
- Mantiene separados local, puerta, planta, escalera y edificio para detectar conflictos del mismo tipo.

La solución no contiene nombres, IDs empresariales ni excepciones para los ejemplos de auditoría.

## Contrato de deduplicación

- Unidades físicas explícitas incompatibles bloquean la fusión antes de considerar nombre, teléfono o dominio.
- Notaciones equivalentes como `1DR` y `1º D` siguen siendo fusionables cuando el resto de evidencias coincide.
- Una identidad externa oficial exactamente igual sigue identificando la misma observación física.
- La ausencia de unidad en una fuente no se interpreta automáticamente como una unidad distinta.

## Evidencia

- Batería independiente de direcciones: 7/7 PASS.
- Regresiones E2 anteriores: 2/2 PASS.
- Contrato E2.1: 23/23 PASS.
- Contrato E1: 33/33 PASS.
- Regresiones históricas: 7/7 PASS.
- Corpus: 199 establecimientos, 199 salidas, 0 fusiones incorrectas, 0 duplicados residuales y 0 grupos colapsados.

## Alcance e integridad

El único archivo funcional modificado frente a E2.1 es `modules/business-providers.js`. No cambian corpus, capturas, leads, persistencia, backups, credenciales, versión ni build. DIBA continúa exclusivamente como diagnóstico en cuarentena.

No se realizaron descargas, llamadas facturables, commits, push, merge o despliegues.

## Dictamen

E2.2 puede declararse READY únicamente mientras la ejecución final y los manifiestos mantengan todos los resultados anteriores. Consulte `RESULTADOS_PRUEBAS_E2_2.md`.
