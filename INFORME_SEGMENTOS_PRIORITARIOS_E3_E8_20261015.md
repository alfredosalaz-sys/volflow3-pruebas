# Informe tecnico: segmentos prioritarios E3-E8

## Resultado

Se ha preparado una ampliacion contractual aislada sobre E2.2. No se ha activado ningun proveedor, descargado ningun dataset, modificado el runtime, llamado a APIs ni alterado datos CRM.

## Decisiones

- Cinco perfiles comerciales reutilizan cuatro sectores E2.2; no se crean sectores duplicados.
- `property-management` diferencia mediante perfiles la administracion de fincas/comunidades y la gestion patrimonial/de inmuebles.
- Arquitectos tecnicos y arquitectos generales comparten mappings amplios en algunas fuentes, pero exigen evidencia textual para separarse.
- Gestoria administrativa se mantiene en `accounting-advisory`; los terminos especificos de fincas/comunidades resuelven a `property-management`.
- Cliente directo, colaborador y prescriptor son roles independientes del sector.

## Archivos funcionales

Ninguno de `modules/`, `app.html`, `index.html`, `version.json`, persistencia, backups o claves ha sido modificado. Los cambios se limitan a contratos de datos, pruebas, quality gate y documentacion.

## Validacion esperada

Los gates nuevos comprueban conjunto exacto de perfiles, reutilizacion de sectores, desambiguacion, mappings con estado, trazabilidad de contactos, cinco metricas comerciales, politica de correo individual, rendimiento y criterios E3-E8. Los resultados ejecutados se registraran en `RESULTADOS_PRUEBAS_SEGMENTOS_PRIORITARIOS.md`.

## Limitaciones

- Los mappings marcados `requires-etl-validation` o `requires-source-taxonomy-validation` no estan aprobados para ingestiones hasta contrastarlos con la release real.
- No se ha medido cobertura de estos segmentos en datasets E3/E4.
- No se ha probado rendimiento fisico en Celeron N4020.
- El cumplimiento juridico de comunicaciones comerciales requiere validacion del propietario/asesoria antes de automatizar; esta entrega mantiene envio automatico bloqueado.
