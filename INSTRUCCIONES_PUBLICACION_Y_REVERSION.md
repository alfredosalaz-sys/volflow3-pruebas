# Publicacion controlada mediante Pull Request

## Estado de esta entrega

- Version candidata: `2.9.4`.
- Build: `2026.10.15.0100`.
- Base auditada: `41b2e34daaf43c754f9cf799a8cf01d9965ce814`.
- Esta preparacion no crea el Pull Request, no hace push y no modifica `main`.

## Publicacion

1. Actualizar el clon autorizado y comprobar que `origin/main` sigue en el SHA base indicado. Si ha cambiado, revisar de nuevo el diff antes de continuar.
2. Crear una rama desde `origin/main`, por ejemplo:

```powershell
git switch -c auditoria-coste-cero-20261015 origin/main
```

3. Aplicar los archivos de la entrega conservando sus rutas. No sustituir el repositorio completo ni modificar `BASELINE_ESTABLE.json`.
4. Ejecutar el quality gate local:

```powershell
node voltflow-regression-tests.cjs .
node tools/ai-zero-cost-gate-test.cjs .
node tools/business-providers-mock-test.cjs
node tools/real-provider-index-test.cjs
node tools/provider-performance-smoke.cjs
node tools/places-search-mock-test.cjs
node tools/check-release-integrity.cjs
node tools/verify-manifest.cjs
node tools/browser-search-regression.cjs .
git diff --check
```

5. Confirmar el diff contra `origin/main`, crear un unico commit y publicar solo la rama:

```powershell
git diff --stat origin/main
git diff --name-status origin/main
git add -- <archivos revisados>
git commit -m "Centraliza IA y prioriza busqueda local"
git push -u origin auditoria-coste-cero-20261015
```

6. Abrir un Pull Request hacia `main`. Exigir que pase `.github/workflows/quality-gate.yml` y revisar el diff antes de aprobar.
7. Tras el merge autorizado, comprobar el contenido efectivo servido por GitHub Pages, no solo `version.json`: `modules/ai-router.js`, `modules/search.js`, `app.html` y sus SHA256.

## Reversion

Si el Pull Request ya fue fusionado, crear una reversion trazable sin reescribir historial:

```powershell
git switch main
git pull --ff-only origin main
git revert <SHA_DEL_COMMIT_FUSIONADO>
git push -u origin revert-coste-cero-20261015
```

Abrir otro Pull Request con la reversion. No usar `push --force`, no borrar datos locales, IndexedDB ni configuraciones del usuario.
