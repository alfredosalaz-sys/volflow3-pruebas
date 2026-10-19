# Reversion C1.1

## Antes de publicar

Descartar esta carpeta aislada y continuar usando, sin modificar:

`C:\Users\NOSTROMO\Downloads\Voltflow3-C0-C1-ESTADOS-COMERCIALES`

No existe migracion de datos que deshacer.

## Tras una publicacion futura

1. Crear un backup completo y verificar que puede leerse.
2. Revertir mediante un commit ordinario los archivos enumerados en `DIFERENCIAS_C1_1.md`; no usar `push --force`.
3. No borrar `gordi_email_history`, `commercialContactPolicy` ni `authorizations`.
4. No transformar confirmaciones incompletas en envios confirmados.
5. Repetir contratos 26/26, rutas 8/8, navegador simulado 6/6, regresiones C1.1 3/3 y manifiesto SHA256.

Las versiones anteriores ignoran los campos adicionales de autorizacion y secuencia, por lo que la reversion de codigo no requiere una migracion destructiva.
