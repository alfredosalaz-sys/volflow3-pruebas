# Auditoria final de cierre - Voltflow 3 2.9.4

Build: `2026.10.15.0300`  
Fecha: 2026-10-15  
Base declarada: `origin/main` en `41b2e34daaf43c754f9cf799a8cf01d9965ce814`

## Dictamen

La entrega es **TECNICAMENTE CANDIDATA A PUBLICACION CONTROLADA**. Todos los validadores disponibles, incluido `quality-check.js`, pasan. La facturacion real de las cuentas y el rendimiento en el Celeron N4020 fisico siguen pendientes y no se declaran verificados.

No se realizo commit, push, merge, Pull Request remoto, despliegue ni llamada real a Gemini, Groq, OpenRouter o Google Places.

## Cierre del mojibake

El validador identificaba seis archivos, no seis cadenas individuales:

| Archivo | Marcadores antes | Marcadores despues | Lineas de texto corregidas |
|---|---:|---:|---:|
| `app.html` | 198 | 0 | 161 |
| `modules/inbox.js` | 148 | 0 | 134 |
| `modules/init.js` | 48 | 0 | 42 |
| `modules/search.js` | 920 | 0 | 575 |
| `modules/ui.js` | 179 | 0 | 134 |
| `modules/workflow.js` | 4 | 0 | 3 |

Las coincidencias correspondian a corrupcion real Windows-1252/UTF-8: acentos, signos, separadores y emojis. No se encontraron falsos positivos en texto fuente visible. Las expresiones y tablas de compatibilidad del normalizador usan escapes Unicode y conservaron sus valores.

Controles de alcance:

- **PROBADO AUTOMATICAMENTE:** cero marcadores despues de la reparacion y ausencia de `U+FFFD`.
- **PROBADO AUTOMATICAMENTE:** mismo numero de lineas y misma proyeccion ASCII por archivo.
- **PROBADO AUTOMATICAMENTE:** mismas declaraciones de funciones JavaScript.
- **VERIFICADO EN CODIGO:** no se modificaron nombres de claves persistentes, identificadores ni operaciones de almacenamiento.
- **PROBADO AUTOMATICAMENTE:** `quality-check.js` y sintaxis JavaScript pasan sin debilitar el validador.

## Pruebas finales

| Prueba | Resultado |
|---|---|
| Sintaxis de todos los modulos JavaScript | PASS |
| `quality-check.js` | PASS |
| `voltflow-regression-tests.cjs` | 7/7 PASS |
| `business-providers-mock-test.cjs` | PASS |
| `real-provider-index-test.cjs` | PASS: Madrid Dental 9; 28015 Dental 1; Gestorias 1 |
| `provider-performance-smoke.cjs` | PASS: 600 -> 300 unicos en 32 ms |
| `places-search-mock-test.cjs` | PASS |
| `ai-zero-cost-gate-test.cjs` | PASS |
| `ai-email-free-personalization-test.cjs` | PASS |
| `ai-security-test.cjs` | PASS |
| `check-release-integrity.cjs` | PASS: 2.9.4 / 2026.10.15.0300 / 22 recursos |
| Chrome aislado con CPU x4 y HTTPS externo bloqueado | PASS funcional; 0 errores y 0 excepciones runtime |

## Navegador, persistencia y backup

**PROBADO EN NAVEGADOR:** Madrid devuelve 9 resultados, Barcelona conserva DIBA, los indices locales responden sin esperar proveedores remotos, dos empresas con telefono comun permanecen separadas y un duplicado real conserva dos procedencias.

**PROBADO EN NAVEGADOR:** lead, cobertura y clave historica sinteticos se incluyen en snapshot; la restauracion recupera el lead; una clave IA nueva queda solo en sesion. `runDiskBackupNow` esta disponible.

**PENDIENTE DE PRUEBA MANUAL:** escritura real en una carpeta mediante File System Access, porque requiere gesto y permiso humano. No se tocaron datos reales ni carpetas de backup del usuario.

## Coste cero e IA

**PROBADO AUTOMATICAMENTE:** proveedor no aprobado, clave cambiada, aprobacion caducada, modelo no permitido, herramienta/grounding, limite, concurrencia y configuracion corrupta producen cero llamadas no autorizadas. El fallback simulado solo usa proveedores aprobados y gratuitos.

**NO VERIFICADO:** que una cuenta concreta carezca de facturacion. Los controles locales no son un limite economico del proveedor. Seguir `PROTOCOLO_VERIFICACION_CUENTAS_IA_GRATUITA.md` antes de autorizar una cuenta.

## Rendimiento

La ejecucion final en Chrome aislado con CPU x4 registro 62,9 ms de interaccion, 527 ms de long task maxima de arranque, 131 ms de long task maxima de operacion y 2.971.852 bytes de heap, sin bloqueo ni excepciones. Es una muestra en otro ordenador y presenta variabilidad respecto de ejecuciones anteriores.

Clasificacion: **PROBADO EN NAVEGADOR SIMULADO**, no en el hardware objetivo. Seguir `PROTOCOLO_PRUEBA_CELERON_N4020.md`; hasta entonces el rendimiento fisico es **PENDIENTE DE PRUEBA REAL**.

## Integridad y GitHub Pages

- **PROBADO AUTOMATICAMENTE:** los 22 recursos declarados existen y la version/build estan sincronizadas.
- **PROBADO AUTOMATICAMENTE:** la aplicacion arranca por HTTP local con la misma estructura estatica que GitHub Pages.
- **VERIFICADO EN CODIGO:** no se requiere backend para servir la interfaz; proveedores externos permanecen bloqueados por defecto.
- **PENDIENTE DE PRUEBA REAL:** contenido servido por GitHub Pages, porque no se desplego.

## Riesgos residuales

1. Facturacion y limites de cuentas externas: **NO VERIFICADO**.
2. Rendimiento fisico N4020: **PENDIENTE DE PRUEBA REAL**.
3. Backup a disco con permiso humano: **PENDIENTE DE PRUEBA MANUAL**.
4. Una aplicacion estatica no puede ocultar completamente claves frente a XSS, extensiones o scripts del mismo origen: **LIMITACION ARQUITECTONICA**.
5. GitHub Pages real: **PENDIENTE DE DESPLIEGUE AUTORIZADO**.

## Recomendacion

La build puede pasar a revision humana y publicacion controlada cuando:

1. se verifique manualmente al menos una cuenta gratuita siguiendo el protocolo, o se mantenga toda IA externa bloqueada;
2. se acepte expresamente que el N4020 aun no ha sido probado, o se complete su protocolo;
3. se ejecute nuevamente el manifiesto y el quality gate sobre la carpeta final sin modificar archivos;
4. se guarde el SHA previo y se use Pull Request/revert, nunca force push.
