# Voltflow3 / Voltium Madrid — auditoría y contrato maestro de persistencia, credenciales, copias y restauración
**Fecha:** 16-10-2026  
**Base inspeccionada:** `Voltflow3-C1.2-CORRECCION-20261016.rar`, versión funcional 2.9.4 / build 2026.10.15.0300 según los archivos de entrega.  
**Alcance:** revisión estática de código de `modules/`, `app.html`, y de los mecanismos existentes de copia/recuperación. **No** se ha inspeccionado el perfil personal de Chrome ni se han realizado restauraciones sobre datos reales. **Este documento es un diseño y plan de aceptación, no una implementación.**

## 0. Principio rector y garantía honesta

Voltflow3 es el CRM **local-first, persistente y de uso prolongado** de Voltium Madrid: sus datos residen primordialmente en **el mismo perfil de Chrome**. Una actualización del código no debe borrar, reiniciar ni sobrescribir los datos. Debe permitir recuperar datos y archivos de copias hechas por versiones anteriores. El usuario puede crear una copia completa **cuando quiera** y restaurarla tras una avería, cambio de equipo o pérdida del perfil.

**No es técnicamente posible garantizar una pérdida absoluta de cero datos durante toda la vida de un ordenador utilizando exclusivamente el almacenamiento del navegador.** La garantía responsable es diseñar defensas independientes: escrituras verificadas + backup externo versionado y cifrado + restauración probada + controles de regresión y aviso explícito de falta de cobertura. La continuidad normal de uso no debe requerir volver a escribir las API keys después de cada actualización.

## 1. Hechos comprobados en C1.2

| Área | Evidencia del código | Riesgo y consecuencia |
|---|---|---|
| `localStorage` | `modules/init.js`, `VOLTFLOW_DATA_KEYS`, `exportDataSnapshot()` | Conserva leads, campañas, contactos implícitos, configuración, varias API keys y rutas `gordi_*`/`voltium_*`; también puede incluir secretos en JSON sin cifrar. |
| IndexedDB | `modules/storage.js`: base `VoltiumCRM`, stores `meta`, `kv`, `leads`, `emailHistory`, `campaigns`, `searchHistory`, `savedSearches` | Cuando está activada, puede ser el almacenamiento autoritativo de grandes datos. No basta con respaldar solo `localStorage`. |
| Exportación plena | `modules/ui.js`: `exportFullBackup()` | Exporta `{version,date,leads,emailHistory,campaigns,objectives,templates,portableSnapshot,integrity}` en JSON **sin cifrado**. El `portableSnapshot` puede contener claves. |
| Exportación portátil antigua | `modules/ui.js`: `exportPortableData()` | Usa `exportDataSnapshot()` síncrono, que no espera ni lee explícitamente el backend autoritativo de IndexedDB; riesgo de copia desactualizada si las vistas localStorage/IDB divergen. |
| Backup automático a carpeta | `modules/disk-backup.js`: `buildBackupPayload()`, `runDiskBackupNow()` | Produce `backupType: auto_disk_daily` y nombre `gordi_backup_auto_YYYY-MM-DD.json`; con `force` puede **sobrescribir el archivo del mismo día**. No se ve comprobación de lectura e integridad después de grabar. |
| Restauración | `modules/ui.js`: `restoreBackup()` | Reconoce formato `leads: [...]` y snapshot portátil; **no hay rama explícita para el contenedor `auto_disk_daily`** con solo `portableSnapshot`, por lo que esa copia puede ser rechazada por la interfaz general. |
| Copias internas | `modules/init.js`: `createSafetySnapshot()` y `createCriticalRescueSnapshot()` | En la práctica pueden omitirse si el almacenamiento supera ~1.200.000 bytes. Las copias dentro del mismo `localStorage` se perderían junto con el perfil. |
| Proceso de restauración | `modules/init.js`: `importDataSnapshotAsync()` | Restaura clave a clave, sin transacción global entre IndexedDB y `localStorage` ni ensayo de restauración en sandbox; una interrupción podría dejar estado parcial. |
| Marca IDB | `modules/storage.js`: `isReadySync()` comprueba `gordi_indexeddb_ready` en `localStorage` | Restaurar ese marcador sin la base IndexedDB completa puede producir incoherencias: el marcador debe regenerarse tras validar el manifiesto interno. |
| Sincronización GitHub | `modules/chat.js`: `githubPush()` | Publica snapshot JSON completo a `voltflow-data.json` y **solo excluye `gordi_gh_token`**. Puede incluir otras API keys, tokens y datos comerciales. Si el destino es público, existe riesgo grave de exposición. |
| Sincronización JSONBin | `modules/init.js`: `jsonbinCreateBin()`/`jsonbinPush()` | Transmite `exportCurrentDataSnapshot()` en JSON **antes de cualquier cifrado de aplicación**; privado no significa cifrado de extremo a extremo. |
| Clave Gemini temporal | `modules/state.js`: `getGeminiKey()` lee primero `sessionStorage` | Una credencial introducida únicamente en `sessionStorage` puede desaparecer al finalizar la sesión; no hay persistencia equivalente garantizada. |
| Carpeta autorizada | `modules/disk-backup.js`: base IndexedDB `gordi_disk_backup_db`, store `handles` | El handle y los permisos del sistema operativo no pueden exportarse como si fueran una API key: al restaurar en otro perfil se deberá **volver a seleccionar/autorizar la carpeta**. |
| Fotografías de escaneo | `modules/inbox.js`: `_scanImageBase64` | Se mantiene temporalmente en memoria durante el escaneo; **no hay prueba de almacenamiento duradero del archivo original**. |
| CSV/XLSX importados | `modules/smart-import.js` y `modules/ui.js` | Los registros importados pueden persistir; no se demuestra que el **archivo binario original** quede guardado. |
| Historial y confirmación | `modules/commercial-communications.js` + `modules/leads.js` | Los eventos idempotentes, políticas de contacto, confirmaciones y referencias comerciales están ligados a los registros; el backup debe conservar todos sus campos, incluso los todavía desconocidos por versiones anteriores. |

**Medida preventiva inmediata:** desactivar sincronización de datos de CRM con GitHub y JSONBin hasta cifrar su contenido y auditar las claves incluidas. Si ya se publicó `voltflow-data.json` con credenciales en un repositorio público, examinar y revocar/rotar las claves afectadas, sin olvidar el historial de commits; borrar solo el archivo actual no elimina necesariamente las copias históricas.

## 2. Inventario obligatorio de lo que DEBE conservarse

### A. Núcleo comercial (P0, jamás descartarlo automáticamente)
- Fichas íntegras de **leads y empresas** (`gordi_leads`): identidad canónica/alias (`commercialRefs`), establecimientos, sucursales, contactos, teléfonos, emails, webs, direcciones, sectores, roles, procedencia, fuentes, permisos, oposiciones, notas, etiquetas, puntuación, etapas, archivos vinculados y todos los campos adicionales.
- **Comunicaciones e historial** (`gordi_email_history`): asunto, cuerpo, adjuntos vinculados, versiones de borrador, aprobaciones, estado, método/evidencia de envío, idempotencia, `SENT_CONFIRMED`, `LEGACY_SENT_UNVERIFIED`, respuestas y fechas.
- **Campañas** (`gordi_campaigns`), sus contactos y estadísticas calculadas/recalculables; configuraciones de secuencias de cinco intentos, cancelaciones, bloqueos y exclusiones.
- **Memoria comercial** (`gordi_commercial_memory`), actividades, respuestas pegadas, objeciones, solicitudes de presupuestos, próximas tareas y estados; futuros eventos C2 de cronología, oportunidades, presupuestos y contactos.
- **Plantillas y preferencias de redacción** (`gordi_templates`), objetivos (`gordi_objectives`) y correos personalizados/seguimientos aprobados.
- **Historial de búsqueda** (`gordi_search_history`), búsquedas guardadas (`gordi_saved_searches`), memoria de scraping por sector/CP (`gordi_scrape_memory_*`), seguimiento de cobertura (`gordi_search_coverage`, `gordi_coverage_targets`, `gordi_coverage_events`, `gordi_coverage_daily_plan`, `gordi_coverage_active_mission`) y trabajos ya realizados; estos datos evitan repetir prospecciones.
- **Workflow y auditoría** (`gordi_workflow_audit_log`, `gordi_workflow_restore_points`), listas de exclusión y política legal; su conservación prevalece frente a cualquier optimización de espacio.
- **Historial de chat y memoria del asistente** (`gordi_chat_history`, `gordi_chat_memory`), notas, borradores de ficha (`gordi_lead_form_draft`) y el historial antiguo `voltium_search_history` si existe.

### B. Identidad y personalización de Voltium Madrid (P1)
- Empresa, remitente y firma: `gordi_user_*`, `gordi_sender_*`, logotipo si se almacena localmente y plantillas personales.
- Sectores, filtros y preferencias: `gordi_multi_sector_selection`, `gordi_filters`, metas, búsquedas, campos y modos comerciales.
- Configuraciones de aspecto y flujo (tema, tamaño de letra, tutoriales, preferencias de IA, modo privacidad, modo de selección del proveedor).
- Conexiones no secretas: repositorios y nombres de usuario, IDs de Sheets/JSONBin, métodos de correo, configuración de Gmail/EmailJS y cualquier futuro identificador externo. No reconstruir las conexiones activas de manera insegura: comprobar consentimiento y estado de sus tokens.
- Controles legales y de exclusión siempre como P0, no como «configuración prescindible».

### C. Secretos, claves y tokens (P0 cifrado en exportación)
Incluir **sin perderlos** y como parte del backup completo **cifrado**: `gordi_api_key` (Google), `gordi_hunter_key`, `gordi_apollo_key`, `gordi_claude_key`, `gordi_gemini_key`, `gordi_groq_key`, `gordi_openrouter_key`, `gordi_gh_token`, `gordi_jsonbin_key`, `gordi_gmail_client_secret`, `gordi_gmail_token`, `gordi_sheets_token`, así como nuevos tokens/proveedores y secretos detectados por catálogo o patrón. `gordi_pin` también es dato confidencial y **no es una contraseña de cifrado**. Revisar valores con naturaleza de credencial en `sessionStorage` (Gemini/Groq/OpenRouter), preguntando al usuario si desea guardarlos permanentemente; nunca persistirlos a escondidas si eligió modo temporal.

Los IDs públicos (ej. OAuth client ID, EmailJS public key) requieren clasificación propia; no todas las claves que contienen `key` son secretos, pero deben poder restaurarse. Tokens OAuth caducados se conservan con fecha y deberán reautorizarse; restaurarlos no garantiza que aún funcionen.

**Regla:** en el navegador habitual, conservar configuración y claves como ahora entre actualizaciones. Para cualquier exportación portable, sincronización remota o copia que salga del perfil, usar **cifrado autenticado** y no volcar secretos en texto plano. El uso actual de `localStorage` no protege frente a JavaScript malicioso en el mismo origen: estudiar CSP, XSS y pasarela de secretos como evolución de seguridad, sin perder la comodidad acordada.

### D. Bases de datos y archivos (P0/P1)
- Base IndexedDB `VoltiumCRM`: colecciones `leads`, `emailHistory`, `campaigns`, `searchHistory`, `savedSearches`, almacén `kv` y metadatos de schema/migración útiles. Exportar **contenidos autoritativos reales**, no confiar en que `localStorage` tenga copia idéntica.
- Nuevas stores futuras: incluir automáticamente cualquier almacén de datos comerciales y pasar a un catálogo de esquema versionado, sin descartar nombres desconocidos.
- Documentos, PDF, presupuestos, imágenes, contratos, adjuntos de correos y ficheros de importación **si han sido realmente incorporados al CRM**: guardarlos en un almacén de blobs de IndexedDB/OPFS con ID, SHA256, tipo MIME, tamaño y relación con empresa/contacto/oportunidad; luego exportarlos y restaurarlos junto con sus referencias.
- Si el archivo **solo existe en Descargas u otra carpeta del PC** y nunca fue incorporado al CRM, la página web no puede leerlo libremente: el usuario tendrá que seleccionarlo expresamente. Mostrar en el backup los archivos vinculados que **no están bajo custodia de Voltflow3**, como advertencia de copia incompleta.
- Permisos, pestañas y handles del sistema de archivos no son exportables como credenciales. Tras restaurar, reconectar carpeta de backups y servicios que lo requieran.

### E. Datos recreables o efímeros (P2)
- Cachés de enriquecimiento/geocodificación (`gordi_ecache_*`, `gordi_enrich_cache`, `gordi_geo_cache_*`, `gordi_map_geocode_cache`), límites de rate, estado de tours, banners, logs técnicos y estadísticas temporales. Por defecto separar de P0; permitir una copia «forense completa» si interesa evitar trabajo repetido. **La memoria de prospección y procedencia de resultados no se considera una caché trivial.**
- Versiones estáticas de código/índices públicos (`app.html`, módulos, assets, fuentes de GitHub) deben conservarse **en releases separados, con hash y procedencia**, no mezcladas indiscriminadamente con secretos o datos personales del backup de usuario. El backup debe anotar versión/build y esquema que lo originó.

> Inventario de claves estáticas detectadas: archivo complementario `INVENTARIO_PERSISTENCIA_VOLTFLOW3_C12.json`. Contiene **131 literales/referencias** encontrados y sus ubicaciones; **no** es un inventario absoluto de claves dinámicas ni demuestra que todas existan en un navegador concreto.

## 3. Arquitectura objetivo: almacenamiento navegador + copias recuperables

**Fuente de verdad:** IndexedDB para registros, eventos y archivos; `localStorage` para ajustes pequeños y compatibilidad legacy. Evitar discrepancias con escrituras serializadas e idempotentes, verificación del manifiesto e identidad inmutable. Conservar importación legacy, no borrar claves originales antes de una migración completa verificada.

**Backup externo recomendado:** contenedor `*.voltflowbackup` (o `*.vfbackup`) con `backupSchemaVersion`, `appVersion`, `build`, `createdAt` UTC, origen, inventario de stores/claves, números de registros, esquema de cifrado y sumas SHA256 por sección. El payload **completo cifrado** debe contener P0 y P1, incluidos secretos, estados comerciales, cronología, política de oposición y blobs custodiados. Validar no solo formato JSON sino integridad, consistencia referencial, unicidad y conteos.

**Cifrado:** Web Crypto (`crypto.subtle`), AES-256-GCM con nonce aleatorio único por backup y KDF robusto desde una contraseña maestra **que el usuario conoce** (p. ej. PBKDF2-HMAC-SHA256 con parámetros versionados y calibrados al Celeron; evitar algoritmos/implementaciones propios). Salt único aleatorio. Cifrar también metadatos sensibles cuando sea posible, autenticar manifest y contenido con AEAD. No guardar contraseña ni clave derivada en texto plano, ni subir a GitHub. El usuario debe custodiar la contraseña fuera del navegador; **sin ella, un backup cifrado no puede restaurarse**. Ofrecer opción de recuperación protegida mediante un procedimiento explícito, nunca una contraseña incrustada en el código.

**Backups automáticos:** cuando la app esté abierta, tenga permiso de carpeta y el material de cifrado esté disponible de forma segura. Si no puede incluir secretos por estar bloqueada la bóveda, indicar claramente «backup parcial SIN credenciales» y no mostrar «copia completa». No prometer tareas programadas si Chrome está cerrado. **Nunca** sustituir silenciosamente archivos existentes: nombre ISO UTC con hora, milisegundos e identificador aleatorio; escritura temporal y, cuando la API lo permita, estrategia de finalización verificable, con lectura posterior de integridad. Rotación configurable solo después de verificar nuevas copias; retener varias generaciones y permitir exportación manual a otra unidad.

**Backup manual:** botón prominente «Crear copia completa ahora»; muestra resumen (empresas, personas, emails, secuencias, exclusiones, API keys incluidas cifradas, adjuntos y bytes), exige contraseña para cifrar/descifrar y descarga el archivo incluso sin carpeta preautorizada. Ofrecer «Comprobar copia» sin restaurar.

**Recuperación:** asistente de vista previa que admita `gordi_backup_*.json`, `voltflow_datos_*.json`, `gordi_backup_auto_*.json`, snapshots legacy y el nuevo contenedor cifrado. Debe aceptar un archivo de cualquier versión soportada y ofrecer migración controlada (con reporte de incompatibilidades, nunca eliminación silenciosa de campos). **Por defecto restauración fusionada segura** si se trata de otra versión, y restauración de sustitución solo con confirmación y checkpoint previo comprobado; reconciliar identidades y versiones de eventos sin duplicar ni reiniciar cinco contactos. Nunca habilitar envíos por el hecho de restaurar datos antiguos.

**Proceso atómico recuperable:** leer archivo → verificar cifrado/integridad → validar esquema/relaciones → previsualizar diferencias → guardar copia externa de estado actual → crear base de restauración en área de staging → verificar todas las stores y claves → activar mediante marcador de commit recuperable → recargar y comprobar todo → conservar rollback. `localStorage` e IndexedDB no son atómicos entre sí: diseñar staging, manifiesto y recuperación tras corte a mitad de importación. Recalcular `gordi_indexeddb_ready` a partir de DB real, no importarlo ciegamente.

**Consistencia:** esperar las escrituras pendientes y suspender temporalmente nuevas mutaciones mientras se toma el snapshot, incluyendo otras pestañas del **mismo origen**, mediante Web Locks/BroadcastChannel cuando sea viable; si no es posible garantizar consistencia, bloquear la exportación con mensaje claro. Un backup parcial o fallido nunca debe reportarse como correcto.

## 4. Actualizaciones sin pérdidas

1. Mantener **exactamente el origen HTTPS** actual cuando se actualice la misma aplicación. GitHub Pages almacena por origen (`scheme://host:port`), no por ruta; repositorios de prueba y estable bajo `alfredosalaz-sys.github.io` pueden **compartir** almacenamiento local. Probar con **otro perfil de Chrome** u otro dominio/origen, nunca con el perfil habitual y datos reales.
2. Antes de desplegar una build: ejecutar tests de migración con fixtures de todas las versiones soportadas, hacer backup externo completo cifrado y prueba de lectura; comprobar espacio disponible y estado de permisos.
3. Inicio de la nueva build: detectar formato/versión/schema; si necesita migración, exigir snapshot previo y espacio, ejecutar conversión aditiva sin borrar desconocidos, verificar entidades/events/contactos/secuencias/tokens, entonces activar. Mantener lectura legacy compatible.
4. Conservar alias/correspondencias entre IDs comerciales de versiones previas; no confundir sucursales ni perder historial. Ningún refresh puede reconstruir un CRM vacío por un error de lectura.
5. Si algo falla: modo recuperación **solo lectura** y banner visible; nunca inicializar nuevos datos vacíos encima de los existentes, nunca sobrescribir backup sano con uno vacío. Permitir volver a la build anterior con restauración controlada del esquema si fuera necesaria.
6. Mantener historial de releases de código y manifiestos SHA256 en repositorio privado o artefactos descargables separados. Los datos de usuario jamás en el repositorio público.

## 5. Riesgos que deben bloquear C2 (prioridad)

**P0 — seguridad y conservación:**
- Prohibir cualquier sincronización remota sin filtro completo de secretos **y cifrado antes de transmisión**. `githubPush()` solo elimina el token de GitHub; `jsonbinPush()` no cifra. Revisar también Sheets, Gmail y futuros conectores.
- Proteger automáticamente todas las credenciales antiguas y nuevas en un vault exportable cifrado; conservarlas localmente entre actualizaciones, con consentimiento si están en `sessionStorage`.
- Asegurar que el modo de backup diario produce un archivo **restaurable** por el asistente general, o cambiar el exportador para usar exactamente el nuevo formato soportado.
- Evitar sobrescrituras de copias con el mismo nombre; hacer lectura y validación del archivo escrito.
- Sustituir backups de solo `localStorage` por captura coherente de la base IndexedDB autoritativa y de adjuntos persistidos.
- Restauración íntegra y recuperable; probar interrupción a mitad de operación, falta de espacio, datos corruptos, contraseña errónea y rollback.
- Comprobar cumplimiento de exclusiones/oposiciones y límite de cinco envíos **después de restaurar** (no solo al exportar).

**P1 — experiencia y escalabilidad:**
- Panel de estado: «última copia completa verificada», fecha, volumen, claves protegidas, integridad, carpeta vinculada, copias fallidas/pendientes; nunca «protegido» si solo hay una copia interna.
- Retención generacional, exportación fuera del navegador y recordatorio periódico verificable.
- Gestión de adjuntos (almacenamiento en IndexedDB/OPFS, no referencias huérfanas) y copia de ficheros aportados voluntariamente.
- Prueba real en Celeron N4020 con 8 GB y múltiples miles de leads; uso incremental y límites de RAM durante cifrado, compresión y restore.

## 6. Batería mínima de aceptación obligatoria

| Id | Prueba de pérdida/seguridad | Requisito |
|---|---|---|
| B01 | Exportar backup con todas las clases de P0/P1, incluida cada API key de prueba | Conteos, campos, hashes y presencia: PASS |
| B02 | Inspeccionar externamente el archivo cifrado | Ningún secreto sintético ni dato comercial legible en texto claro |
| B03 | Restaurar en Chrome/perfil completamente vacío | Mismos leads, personas, eventos, secuencias, plantillas, preferencias y secretos; salvo permisos no exportables que se reautorizan |
| B04 | Recuperar una copia antigua de Voltflow2/2.9.2/2.9.4 y `auto_disk_daily` | Compatible, sin datos descartados ni traslape accidental; informar formatos no conocidos |
| B05 | Restaurar una copia con IndexedDB como fuente autoritativa y localStorage deliberadamente obsoleto | Prevalece la información correcta de IndexedDB, no la versión vieja |
| B06 | Hacer dos copias manuales el mismo día y una diaria | Tres archivos independientes y verificables, ninguno sobrescrito |
| B07 | Introducir corte/fallo entre stores de restauración | Aplicación recupera el estado anterior o retoma staging de manera íntegra |
| B08 | Contraseña equivocada, bit alterado, checksum roto, fichero truncado | No modifica datos; error claro y seguro |
| B09 | Escenario de disco lleno, cuota excedida, carpeta sin permisos | Backup falla explícitamente y no se marca como completado |
| B10 | Simular migración desde versión anterior con nuevas claves y campos desconocidos | Conserva desconocidos y crea alias idempotentes sin duplicar |
| B11 | Conservar `gordi_gmail_token`, `gordi_gemini_key`, `gordi_gh_token` y nuevas claves sintéticas | Se restauran al almacén adecuado; credenciales reales nunca en fixtures/logs |
| B12 | Restaurar contra secuencia de cinco envíos y oposición activa | No permite sexto contacto ni reactivar excluidos |
| B13 | Probar preview en GitHub Pages bajo el mismo dominio | No toca `localStorage`/IndexedDB de producción: perfil/origen separado |
| B14 | Intentar Github/JSONBin con datos sintéticos y fetch instrumentado | Ni un secreto ni dato empresarial sin cifrar sale por red |
| B15 | Añadir un PDF/foto y restaurar a otra instalación | Contenido SHA256 idéntico y sus referencias siguen válidas |
| B16 | Actualizar tres builds sucesivas; cerrar/reabrir Chrome | Se preservan todos los datos, preferencias y API keys persistentes |
| B17 | Exportación durante escrituras pendientes y con dos pestañas | Snapshot coherente o bloqueo seguro; no estado intermedio |
| B18 | Rendimiento con miles de leads en Celeron y exportación grande | UI responsiva; progreso y cancelación segura; medir sin inventar cifras |
| B19 | OAuth tokens vencidos/permisos de carpeta trasladados | Avisar y solicitar reautorización, sin borrar configuración |
| B20 | Comparación de backup con inventario real del navegador | Ninguna colección/clave crítica sin cobertura; generar reporte de diferencias |

No basta con «tests PASS» sobre mocks: debe realizarse una **prueba de restauración desde un backup realmente escrito a disco en un perfil limpio**, manteniendo producción intacta. La verificación criptográfica sola no demuestra recuperabilidad funcional.

## 7. Orden de implantación propuesto antes de C2 funcional

- **P0 / etapa S0 — Contención:** identificar/neutralizar sync remota en claro, auditar secretos, crear pruebas negativas. No desactivar a ciegas funcionalidad de backup local actual.
- **S1 — Inventario y contratos:** registrar datos canónicos, secretos, almacenes, binarios, formatos legacy y semántica de migración; incluir desconocidos.
- **S2 — Exportación completa cifrada:** capturar `localStorage` + IndexedDB autoritativa + attachments persistidos, esperar escrituras, manifestar e integridad, no sobrescribir.
- **S3 — Restauración transaccional recuperable:** leer todos los formatos antiguos, staging y rollback, clasificar secrets/permisos, verificar datos recuperados.
- **S4 — Experiencia y automatización:** botón manual, calendario local si permiso, panel de salud y advertencias, test de recuperación física en Celeron y varios builds.

Ejecutar estas etapas en una **nueva copia aislada**, partiendo de C1.2, sin publicar ni avanzar a los módulos C2-C7 hasta aprobar las barreras P0. La implementación de C2 debe usar este contrato desde el primer día; no debe crear otro almacenamiento paralelo incompatible.

## 8. Instrucciones operativas actuales para proteger el trabajo YA hecho

Hasta disponer del sistema nuevo: crear periódicamente **«Backup completo (JSON)»** manual, descargarlo fuera del navegador y guardarlo en una unidad con acceso restringido; comprobar que el archivo existe y tiene tamaño razonable. **Atención: los JSON actuales pueden incluir API keys y datos de clientes SIN cifrar**; no enviarlos por correo, no subirlos a repositorios públicos, no compartirlos con Codex ni adjuntarlos aquí sin retirar secretos. Protegerlos con un contenedor cifrado gestionado fuera del CRM hasta que se implemente el nuevo sistema. No borrar el perfil ni limpiar datos del sitio. Antes de cambiar de versión, guardar copia adicional.

Mantener desactivada la sincronización GitHub/JSONBin de datos comerciales hasta que se revise y se active cifrado extremo a extremo. Si se usó y el destino era accesible públicamente, valorar rotación de credenciales potencialmente comprometidas.

El usuario debe recordar que una copia descargada al **mismo disco físico** no protege frente a avería de ese disco; conservar al menos otra copia en un dispositivo o ubicación independiente, protegido con cifrado.

---
**Dictamen del análisis:** **NECESITA DESARROLLO P0 ANTES DE CONSIDERARSE SEGURO PARA USO INDEFINIDO.** Los sistemas de guardado de C1.2 son aprovechables, pero actualmente no satisfacen todavía el requisito completo de «API keys preservadas, copia externa cifrada, restauración integral de cualquier versión y ausencia de pérdida de datos».
