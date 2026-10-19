# Diferencias respecto a main

Referencia: `origin/main` = `41b2e34daaf43c754f9cf799a8cf01d9965ce814`.

La diferencia final se documenta en tres partes:

1. `CAMBIOS_ORIGIN_MAIN.patch`: cambios rastreados de la candidata auditada respecto a la referencia.
2. `CAMBIOS_CIERRE_MOJIBAKE.patch`: correccion textual final de los seis archivos, aplicada sobre la candidata auditada.
3. `ARCHIVOS_NUEVOS_CANDIDATA.txt`: archivos nuevos entregados completos y cubiertos por SHA256.

El contenido completo de la carpeta final y `MANIFEST_SHA256.txt` son la referencia autoritativa para publicacion. Los patches son material de revision; no deben aplicarse a ciegas si `origin/main` cambia.

Archivos modificados por el cierre de mojibake:

- `app.html`
- `modules/inbox.js`
- `modules/init.js`
- `modules/search.js`
- `modules/ui.js`
- `modules/workflow.js`

No se modificaron `BASELINE_ESTABLE.json`, datos reales, credenciales ni almacenamiento del navegador.
