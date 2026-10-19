# Reversion C1.2

## Antes de publicar

Descartar esta carpeta aislada y continuar usando, sin modificar:

`C:\Users\NOSTROMO\Downloads\Voltflow3-C1.1-CORRECCION-20261016`

## Tras una publicacion futura

1. Crear y verificar un backup completo antes de cambiar archivos.
2. Revertir mediante un commit ordinario los archivos de aplicacion enumerados en `DIFERENCIAS_C1_2.md`; no usar `push --force`.
3. No borrar `commercialRefs`, `identityEquivalences`, `confirmationAttempts`, `sendConfirmation` ni `gordi_email_history`.
4. Una version anterior ignorara los campos adicionales, por lo que no se requiere migracion destructiva.
5. No convertir intentos duplicados rechazados en envios confirmados.
6. Repetir 3/3 independiente, 8/8 C1.2, 26/26 contractual, 9/9 C1.1, rutas, persistencia y SHA256.

La reversion del codigo no debe usarse para fusionar fichas o eliminar equivalencias. Cualquier correccion de identidad debe conservarse como dato y revisarse expresamente.
