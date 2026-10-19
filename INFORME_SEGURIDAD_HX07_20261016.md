# Informe de seguridad HX07

Fecha: 2026-10-16

Base: `Voltflow3-IMPORTACION-HISTORICA-HX05-HX06-20261016`

Entrega aislada: `Voltflow3-IMPORTACION-HISTORICA-HX07-20261016`

Version conservada: 2.9.4, build 2026.10.15.0300.

## Defecto reproducido

La importacion comprobaba el estado al comenzar, pero construia el payload de forma asincrona antes de restaurarlo. Una escritura producida en ese intervalo podia ser sobrescrita y el commit devolvia `ok:true`.

## Correccion

`modules/write-coordinator.js` se carga antes de `storage.js` y establece un protocolo comun:

1. Web Lock exclusivo para evitar dos restauraciones concurrentes.
2. Cercado compartido en el origen, con lease y heartbeat.
3. Revision global modificada por todos los escritores interceptados.
4. Cola temporal por pestana para escrituras localStorage durante el cercado.
5. Espera coordinada para escritores IndexedDB de `VoltflowStorage`.
6. Operaciones autorizadas mediante token para que solo la restauracion propietaria modifique los stores.
7. Reproduccion de escrituras en espera despues de cancelar o liberar la operacion.
8. Aviso visible cuando un guardado queda en espera y cuando se aplica.

El importador vuelve a capturar y comparar todo el estado inmediatamente antes de restaurar. Si cambia, devuelve `CONCURRENT_WRITE_DETECTED_IMPORT_ABORTED` sin mutar. Si aparece contencion durante la restauracion, recupera el snapshot previo, devuelve `CONCURRENT_WRITE_ROLLED_BACK` y solo entonces libera los escritores pendientes. Una diferencia posterior tambien fuerza rollback y nunca se declara exito.

Los metadatos recreables `gordi_last_seen_build` y `gordi_last_build_change_check` se excluyen de la huella para evitar falsos cambios de datos.

## Cobertura

- Escrituras localStorage de todos los modulos cargados por esta build, incluidas llamadas directas.
- Escrituras de los stores CRM mediante `VoltflowStorage`.
- Restauracion localStorage/IndexedDB con token del propietario.
- Eventos storage de pestanas anteriores, cuando escriben localStorage.
- Autosaves simultaneos en dos pestanas reales de Chrome aislado.

No se cambiaron cifrado, fusion, deduplicacion, buscador, corpus, claves, coste cero ni contratos comerciales.

## Riesgo residual

Una pestana antigua ya abierta que no tenga este modulo y escriba exclusivamente IndexedDB sin reflejar ningun marcador en localStorage no puede cooperar retroactivamente. Antes de recuperar datos reales deben cerrarse o recargarse todas las pestanas antiguas de Voltflow3. La prueba se realizo en Chrome headless con CPU x4, no en el Celeron N4020 fisico.

## Dictamen

READY para auditoria independiente de HX07. No autoriza restaurar backups reales en el perfil habitual hasta completar la auditoria y el procedimiento previo de cierre de pestanas antiguas.
