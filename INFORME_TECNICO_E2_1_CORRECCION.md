# Informe tecnico E2.1

> Documento histórico. E2.2 amplía la identificación de unidades físicas; consulte `INFORME_TECNICO_E2_2_CORRECCION.md`.

Fecha: 2026-10-15

Base aislada: `Voltflow3-E2-CORPUS-PILOTO-20261015`

## Defectos corregidos

### Identidad fisica

`modules/business-providers.js` extrae unidades explicitas de las direcciones: local, puerta, piso/planta, escalera, portal, bloque y codigos de unidad aislados. Si dos registros declaran unidades incompatibles, `isLikelyDuplicate()` rechaza la fusion antes de evaluar similitud, telefono o dominio. Una identidad externa exactamente coincidente conserva prioridad.

La regla no contiene nombres ni identificadores de COBOS. Incluye pruebas sinteticas con unidades distintas, notaciones equivalentes y plantas diferentes con igual puerta.

Resultado del corpus: 199 establecimientos unicos, 199 salidas, cero fusiones incorrectas, cero duplicados residuales y cero grupos de locales colapsados.

### Fechas de Barcelona

Los valores civiles sin zona de `Data_Revisio`, como `2023-05-11T00:00:00`, se convierten mediante analisis de componentes a `2023-05-11T00:00:00.000Z`. No pasan por el constructor local de `Date` y producen serializacion identica en UTC, Europe/Madrid y America/New_York.

SHA256 reproducido en las tres zonas: `fca183475a6e7159bf2eba408673bfbb72b36ffceaa1733fc27b6cddcb0e5ce5`.

### Cronologia

- Dia acreditado de captura: `2026-10-15`.
- Hora exacta de captura: desconocida, representada por `acquiredAt: null` y `timeStatus: exact_time_unknown`.
- Reindexacion local: `2026-10-15T15:08:53.343Z`.
- Generacion del corpus: `2026-10-15T15:08:54.343Z`.

El validador rechaza instantes futuros, orden cronologico incorrecto, diferencias entre manifiesto y corpus y procedencia temporal incompleta. Una futura captura con `--refresh` registra un instante exacto real; `--index-existing` conserva la captura conocida o exige el dia con hora desconocida.

### Quality gate

GitHub Actions ejecuta ahora `node tools/business-coverage-quality.cjs` sin `--report-only`. Tambien ejecuta las dos regresiones independientes. Cualquier fusion incorrecta, colapso de locales, error geografico, procedencia incompleta o exceso de presupuesto produce salida distinta de cero.

## Datos y seguridad

No se modificaron leads, almacenamiento, backups, claves, contactos ni datos empresariales de origen. No se hicieron llamadas a Google Places, IA o APIs facturables. DIBA permanece excluida del corpus puntuado por su semantica geografica no aclarada.

## Compatibilidad

La aplicacion conserva version 2.9.4 y build `2026.10.15.0300`. El indice Madrid mantiene `recordSchemaVersion: 1`. De los 32 archivos funcionales, solo cambia `modules/business-providers.js` para la correccion de deduplicacion.

## Dictamen

El dictamen se emite tras ejecutar la bateria completa y verificar los manifiestos. Consulte `RESULTADOS_PRUEBAS_E2_1.md`.
