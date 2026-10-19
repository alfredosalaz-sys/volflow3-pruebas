# Informe tecnico - correccion HX05 y HX06

Fecha: 2026-10-16

Base inmutable: `Voltflow3-IMPORTACION-HISTORICA-CORREGIDA-20261016`

Entrega aislada: `Voltflow3-IMPORTACION-HISTORICA-HX05-HX06-20261016`

Version conservada: 2.9.4, build 2026.10.15.0300.

## HX05 - plan de importacion obsoleto

La vista previa vincula el plan a una huella SHA256 del estado persistente completo capturado: localStorage, todos los stores IndexedDB, archivos incorporados y archivos referenciados. `commit()` vuelve a capturar el estado vivo justo antes de mutar y compara:

1. Estado analizado frente a estado vivo.
2. Estado vivo frente a la copia externa verificada desde disco.
3. Estado restaurado frente al payload fusionado esperado.

Si cambia cualquier seccion desde la vista previa, la operacion devuelve `ok:false` con `IMPORT_PLAN_STALE_REANALYSIS_REQUIRED`. No ejecuta restauracion, elimina la sesion de aprobacion y exige seleccionar otra vez el archivo para repetir analisis, backup y confirmacion.

Las llamadas legacy que solo suministran localStorage conservan capacidad de analisis. Su commit queda bloqueado si detecta contenido persistente auxiliar, mediante `IMPORT_PLAN_COMPLETE_STATE_REANALYSIS_REQUIRED`.

## HX06 - salida segura de metadatos

La vista previa ya no interpola formato, version, recuentos, conflictos ni avisos derivados del archivo en `innerHTML`. La estructura estatica se crea primero y los valores se asignan despues con `textContent`.

Los conflictos de credenciales muestran solo el nombre de la clave y nunca su valor. El nombre del backup verificado ya utilizaba `textContent` y se conserva asi. Los mensajes de error se muestran como texto en cuadros nativos, no como HTML.

## Alcance preservado

No se modificaron cifrado, fusion de registros, deduplicacion, buscador, corpus, taxonomia, IndexedDB de produccion, claves, protecciones de coste cero ni estados comerciales. No se usaron datos reales ni red externa.

## Dictamen

READY para auditoria independiente de HX05-HX06. Continuan pendientes, fuera de este alcance, la prueba con backups reales autorizados y la prueba fisica en Celeron N4020.
