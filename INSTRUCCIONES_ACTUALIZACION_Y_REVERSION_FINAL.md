# Actualizacion controlada y reversion final

No se ha ejecutado ninguna de estas operaciones. Requieren autorizacion expresa.

## Antes de actualizar

1. Confirmar repositorio `alfredosalaz-sys/Voltflow3`, rama de destino `main` y clon correcto.
2. Ejecutar `git fetch origin` y comprobar que `origin/main` sigue en `41b2e34daaf43c754f9cf799a8cf01d9965ce814`.
3. Guardar ese SHA como punto de reversion. Si cambio, detener la publicacion y revisar de nuevo.
4. Verificar `MANIFEST_SHA256.txt`, version 2.9.4 y build `2026.10.15.0300`.
5. Ejecutar todos los tests del informe, incluido `quality-check.js` y Chrome aislado.
6. Revisar manualmente el diff y excluir informes, herramientas o datos que no deban servirse en GitHub Pages.

## Actualizacion

1. Crear una rama de publicacion desde el `origin/main` verificado.
2. Copiar las rutas de aplicacion conservando su estructura: `app.html`, `index.html`, `version.json`, `assets/`, `data/`, `modules/`, `styles/` y el manifiesto de aplicacion.
3. Incluir el quality gate y sus pruebas en el repositorio, pero mantener informes fuera del contenido operativo si asi lo requiere la politica del proyecto.
4. Crear un unico commit revisable y abrir Pull Request. No usar force push.
5. Esperar CI, revision humana y autorizacion antes de merge o despliegue.
6. Tras publicar, consultar de nuevo `origin/main` y verificar por SHA256 el contenido descargado.
7. Comprobar GitHub Pages por contenido efectivo: build, recursos, textos corregidos, Madrid/Barcelona, bloqueo IA y ausencia de Google Maps en `ZERO_COST_MODE`.

## Reversion

1. Crear una rama desde el `main` publicado.
2. Ejecutar `git revert <SHA_PUBLICADO>`; no usar `reset --hard` ni `push --force`.
3. Repetir tests, manifiesto y Chrome aislado sobre el revert.
4. Publicar la reversion mediante otro Pull Request autorizado.
5. No borrar, reinicializar ni reemplazar `localStorage`, IndexedDB, backups o datos de Chrome. La reversion es solo de codigo.

## Cuentas y hardware

- No autorizar proveedores hasta completar `PROTOCOLO_VERIFICACION_CUENTAS_IA_GRATUITA.md`.
- No afirmar compatibilidad fisica demostrada con N4020 hasta completar `PROTOCOLO_PRUEBA_CELERON_N4020.md`.
