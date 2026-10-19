# Procedimiento de reversion C0 + C1

## Reversion antes de publicar

Descartar esta carpeta aislada y volver a usar, sin modificarla:

`C:\Users\NOSTROMO\Downloads\Voltflow3-PLAN-COMERCIAL-SEGUIMIENTO-20261015`

No hay datos de usuario en esta entrega ni migracion que deshacer.

## Reversion despues de una futura publicacion

1. Conservar primero un backup completo verificable de la version en uso.
2. Restaurar los archivos de aplicacion del commit anterior mediante un commit ordinario de reversion; no usar `push --force`.
3. No eliminar `gordi_email_history`. Los registros C1 son objetos JSON compatibles con el almacenamiento previo; una version anterior conservara los campos adicionales aunque no los interprete.
4. No convertir `LEGACY_SENT_UNVERIFIED` a `Enviado` ni borrar `sendConfirmation`.
5. Verificar sintaxis, integridad, manifiesto, carga de leads, historial, backups y buscador antes del despliegue.

## Reversion selectiva durante auditoria

Para comparar comportamiento, usar una copia nueva de la base aislada. No copiar solo `modules/leads.js` o `modules/ai-email.js`: C1 depende conjuntamente del contrato, `commercial-communications.js`, el orden de scripts y los consumidores de contadores.
