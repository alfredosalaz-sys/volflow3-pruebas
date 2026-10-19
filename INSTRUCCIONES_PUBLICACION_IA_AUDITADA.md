# Publicacion controlada y reversion

Esta candidata no se ha publicado. El procedimiento siguiente requiere autorizacion expresa.

## Pull Request

1. Trabajar en `reparacion-buscador-places-20261014`; no cambiar `main` local.
2. Confirmar que `origin/main` sigue en `41b2e34daaf43c754f9cf799a8cf01d9965ce814`. Si cambio, detenerse y revisar el diff.
3. Verificar `MANIFEST_SHA256.txt` y ejecutar el quality gate completo.
4. Revisar el fallo documentado de mojibake; no omitirlo del PR.
5. Confirmar en las consolas externas que cualquier cuenta que se vaya a autorizar esta en plan gratuito y sin facturacion/recarga. No realizar llamadas de prueba desde la candidata para esta comprobacion.
6. Crear un unico commit en la rama de desarrollo solo tras aprobacion. No usar `--force`.
7. Abrir un Pull Request hacia `main` con el informe, las pruebas y los riesgos residuales. No activar despliegue automatico hasta aprobar la revision.
8. Tras merge autorizado, comprobar `origin/main`, descargar los archivos publicados y verificar SHA256.
9. Comprobar GitHub Pages por contenido efectivo: build, `ai-security.js`, cabecera Gemini, bloqueo de modelos no permitidos y ausencia de Google Maps bajo `ZERO_COST_MODE`.

## Reversion

1. Guardar antes de publicar el SHA de `origin/main` y el SHA del commit candidato.
2. Ante una regresion, crear una rama desde `main` y revertir el commit candidato con `git revert <SHA_CANDIDATO>`.
3. Ejecutar pruebas, manifiesto y navegador aislado sobre el revert.
4. Publicar el revert mediante otro Pull Request. No usar `git reset --hard` ni `git push --force`.
5. No borrar ni reinicializar `localStorage`, IndexedDB, backups o datos de Chrome. La reversion de codigo debe conservar los datos existentes.

## Verificacion posterior

- `version.json`, `app.html` e `index.html` deben declarar `2.9.4` / `2026.10.15.0300`.
- Los hashes del servidor deben coincidir con el manifiesto de la entrega.
- La interfaz debe mostrar `REQUIERE CONFIRMACION` antes de autorizar proveedores.
- Sin confirmacion de sesion, las pruebas de red deben registrar cero peticiones.
- El indice local de Madrid debe responder antes de proveedores remotos y Barcelona debe conservar DIBA.

Estado actual: **PENDIENTE DE AUTORIZACION**, sin PR remoto ni despliegue.
