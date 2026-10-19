# Criterios E3-E8: segmentos comerciales prioritarios

## Alcance

Este contrato amplia el plan ejecutivo sin ejecutar E3-E8. No habilita fuentes, no descarga datasets, no modifica el buscador de produccion y no escribe datos CRM. E2.2 permanece como baseline funcional.

Las cinco lineas comerciales se representan mediante cinco perfiles y cuatro sectores existentes. `property-management` contiene dos perfiles distintos: administracion de fincas/comunidades y gestion patrimonial/inmobiliaria. Esta separacion permite mensajes y metricas diferentes sin duplicar la taxonomia.

## Contrato comun

Todo resultado debe mantener identidad de establecimiento, sector con evidencia, rol comercial, procedencia y fecha. Los campos de contacto se modelan por campo; un valor sin `sourceId`, `sourceUrl`, `obtainedAt`, `confidence` y `verificationStatus` no cuenta como contacto util.

Los roles admitidos son:

- `direct-client`: puede contratar reformas, rehabilitacion o mantenimiento.
- `collaborator`: puede participar profesionalmente en la ejecucion.
- `prescriber`: puede recomendar o incluir al proveedor en una actuacion.

Un perfil puede tener mas de un rol. El rol no altera la identidad ni el sector de la empresa.

## Desambiguacion bloqueante

| Texto/evidencia | Sector esperado |
|---|---|
| gestoria administrativa, fiscal, laboral o contable | `accounting-advisory` |
| administrador/administracion/gestoria de fincas | `property-management` |
| administracion o gestion de comunidades | `property-management` |
| gestion patrimonial o gestion de inmuebles | `property-management` |

Las expresiones especificas prevalecen sobre la palabra generica `gestoria`. El sector solicitado por el usuario no es evidencia. Un mapping amplio, como `office=architect` o CNAE 7111, no basta para distinguir arquitectura tecnica de arquitectura general.

## Metricas de negocio

Cada ciudad, provincia, fuente y perfil debe informar:

1. `companiesFound`: empresas o marcas localizadas antes de resolver sedes.
2. `uniqueEstablishments`: establecimientos unicos despues de revision/dedupe.
3. `usefulContacts`: establecimientos con un canal corporativo verificable y trazable.
4. `decisionMakersIdentified`: responsables con nombre, cargo, fuente profesional publica y fecha.
5. `personalizedEmailsPrepared`: borradores revisados y aprobados; no envios.

Tambien se conservan precision, geografia falsa, fusiones falsas, duplicados residuales, primer parcial, tiempo final, memoria, bytes y peticiones. Ninguna cifra se estima cuando no se ha ejecutado la prueba.

## E3 - Overture piloto offline

- Filtrar Madrid y Barcelona por los cinco perfiles, conservando el resultado bruto.
- Validar los IDs reales de categorias de la release antes de activar mappings. Los arrays Overture vacios actuales son una barrera deliberada.
- Informar precision y las cinco metricas comerciales por perfil.
- No contar como responsable una persona inferida por IA o por el nombre del negocio.
- Gate: cero fusiones falsas; artefactos dentro de limites; licencia/atribucion; mappings documentados y reproducibles.

## E4 - OSM piloto offline

- Mantener ODbL y atribucion separadas.
- Tratar `office=architect` como candidato amplio; confirmar arquitecto tecnico solo con evidencia adicional.
- Medir aporte marginal de contactos publicos sin recopilar metadatos de colaboradores OSM.
- Gate: valor marginal medido, contactos trazables y cero fusion automatica de sedes distintas.

## E5 - Busqueda progresiva

- Indices locales primero y parciales visibles sin esperar enriquecimiento.
- Filtros por perfil y rol comercial sin crear nuevos IDs de sector.
- Enriquecimiento opt-in, cancelable y con concurrencia inicial de uno.
- Importar mediante el flujo existente y conservar procedencia por campo.
- Mantener correos como borradores editables: generar, regenerar, editar y aprobar individualmente antes de Outlook.
- Gate: regresiones E2.2 completas, desambiguacion bloqueante, estados de fuente correctos, sin envio automatico.

## E6 - Cache aislada

- La clave de cache incluye release, taxonomia y version de perfiles.
- Un dato nuevo no sobrescribe otro sin conservar conflicto y procedencia.
- La caducidad marca datos; no inventa ni borra datos CRM.
- Gate: desactivar/borrar solo la cache no cambia leads, historial, campanas, exclusiones ni backups.

## E7 - Expansion provincial

- Lotes de 5-10 provincias; capital, municipio medio y zona rural.
- Informe por perfil de cobertura instalada y las cinco metricas comerciales.
- Una provincia sin fuente instalada se muestra como no cubierta, no como cero empresas.
- Gate: limites de shard/memoria, coste externo cero y benchmark x4; el rendimiento fisico N4020 sigue pendiente hasta probarlo alli.

## E8 - Seguridad de backups

- El backup comercial conserva procedencia, fechas, confianza, roles, oposiciones y exclusiones.
- Secretos fuera del backup normal; restauracion compatible con formatos anteriores.
- Los borradores de correo no contienen hechos no verificados y nunca se envian automaticamente.
- Gate: backup/restauracion sintetica, ausencia de claves, exclusiones intactas y revision legal previa a automatizaciones comerciales.

## Reversion

Antes de E5, retirar `data/prospecting-priorities.v1.json`, sus validadores y volver la referencia de taxonomia a 1.0.0 restaura el contrato anterior. E5-E8 deben usar feature flags y formatos compatibles; la reversion nunca elimina `gordi_*`, IndexedDB, backups ni datos del usuario.
