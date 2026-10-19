# Configuracion Funcional De Voltflow 3

Este documento es la fuente de verdad del proyecto. Antes de modificar la herramienta, hay que leerlo y comprobar que el cambio no rompe esta configuracion.

El objetivo es evitar tener que comparar cada vez con `Progama Gordi Version final`.

## Uso Obligatorio Para Futuras Modificaciones

Antes de cambiar codigo, cualquier persona o agente debe:

1. Leer este documento.
2. Identificar que areas toca el cambio.
3. Comprobar las reglas de esas areas.
4. Ejecutar las pruebas minimas aplicables.
5. Decir explicitamente si algo no se ha podido probar.

`Progama Gordi Version final` queda como referencia historica. No debe ser la fuente de verdad diaria. La fuente de verdad es este documento mas las pruebas minimas.

## Principio Principal

La herramienta debe poder subirse a GitHub, actualizarse en la carpeta local del usuario y abrirse en el navegador conservando el trabajo ya hecho.

No se deben perder:

- Leads.
- Seguimiento y pipeline.
- Historial de emails.
- Campanas.
- Busquedas y resultados de scraping.
- Cobertura por codigo postal y sector.
- Memoria comercial.
- API keys.
- Configuracion de usuario.

Nunca usar `localStorage.clear()` ni borrar claves `gordi_*` de forma masiva.

## Origen Del Navegador Y Datos Locales

El navegador guarda los datos por origen exacto. Estas entradas no comparten datos:

```text
file:///C:/.../app.html
https://usuario.github.io/proyecto/app.html
http://localhost:8765/app.html
http://127.0.0.1:8765/app.html
```

Regla obligatoria:

- Si el usuario ya trabaja desde `app.html` local, debe seguir usando esa entrada.
- Si trabaja desde GitHub Pages, debe seguir usando GitHub Pages.
- No presentar un cambio de origen como una actualizacion normal, porque pareceria que se han perdido los datos.

Si una version nueva parece vacia, antes de diagnosticar perdida de datos comprobar:

- URL exacta usada antes.
- URL exacta usada ahora.
- Perfil de navegador.
- Navegador usado.
- Existencia de `gordi_leads` en `localStorage`.

## Entradas Del Proyecto

Entradas validas:

- `app.html`: aplicacion real.
- `index.html`: redireccion minima hacia `app.html?build=<build actual>`.

Reglas:

- `index.html` no debe volver a ser una landing antigua que oculte la app real.
- `index.html` no debe borrar PIN, claves, leads ni configuracion.
- `app.html` debe cargar todos los modulos necesarios en orden.

## Version Y Cache Busting

La version funcional actual usa:

```text
version: 2.9.4
build: 2026.10.15.0300
```

Cada publicacion real debe mantener alineados:

- `window.GORDI_APP_BUILD` en `app.html`.
- `version` y `build` en `version.json`.
- `VOLTFLOW_VERSION` fallback en `modules/init.js`.
- Query string de `styles/main.css`.
- Query string de todos los scripts internos en `app.html`.
- Redireccion de `index.html`.

Ejemplo correcto:

```html
<link rel="stylesheet" href="styles/main.css?v=2026.10.15.0300">
<script src="modules/search.js?v=2026.10.15.0300"></script>
```

Regla obligatoria:

- No dejar assets internos con versiones sueltas antiguas como `?v=7`, `?v=18`, `?v=2`.
- En cada release, todos los assets internos deben usar el mismo build.
- El tour de novedades debe quedar ligado al build real de `app.html`. Si cambia `window.GORDI_APP_BUILD`, el usuario debe ver una vez las novedades de esa publicacion.
- Al publicar cambios visibles, actualizar `version.json` y revisar los pasos/textos de `UPDATE_TOUR_STEPS` en `modules/help-system.js` para explicar lo nuevo.

Los meta tags anti-cache de `app.html` ayudan, pero no sustituyen al cache busting por build.

Reglas de rendimiento obligatorias:

- No volver a incrustar logos o imagenes grandes como `data:image` dentro de `app.html`; deben vivir en `assets/`.
- Service Workers y CacheStorage solo deben limpiarse cuando cambia `window.GORDI_APP_BUILD`, no en cada apertura normal.
- Las librerias externas no criticas deben cargar con `defer` o bajo demanda.
- Durante scraping no se debe repintar la lista completa de resultados en cada empresa; usar renders programados/debounce.
- Cobertura debe reutilizar indices temporales para no recalcular todos los leads por cada celda CP/sector.

## Contrato De Catalogo Empresarial V2

La entrega E1 incorpora exclusivamente el contrato y su validacion. No activa fuentes nuevas ni modifica el flujo de busqueda de produccion.

Archivos de referencia:

- `data/business-indexes/manifest.json`: manifiesto `schemaVersion: 2` con version de dataset independiente del build de la aplicacion.
- `data/business-indexes/schema-v2.json`: esquema documental del manifiesto y sus particiones.
- `data/business-taxonomy.v1.json`: familias, sectores estables, alias y valores heredados.
- `data/geography-es.v1.json`: provincias INE 01-52 y municipios disponibles en el catalogo.
- `tools/validate-business-catalog.cjs`: validacion local sin red.

Reglas obligatorias:

- Los identificadores nuevos de sector son ASCII estables; los valores actuales de leads se conservan mediante `legacyValues`.
- La taxonomia solicitada por el usuario no constituye evidencia de clasificacion de una empresa.
- Una particion debe declarar pais, provincia, municipios, sectores, familias, licencia, atribucion, fechas, bytes, numero de registros y SHA256.
- El manifiesto no puede superar 250 KiB; una particion no puede superar 1 MiB ni 10.000 registros.
- Las rutas deben permanecer bajo `data/business-indexes/`; no se admiten rutas absolutas ni traversal.
- No se admiten referencias geograficas, sectoriales, legales o de integridad desconocidas.
- `modules/business-providers.js` mantiene lectura compatible con campos heredados del manifiesto v1 durante la transicion.
- E1 no cambia `gordi_leads`, `saveLeads()`, IndexedDB, claves API ni backups.

Pruebas minimas adicionales:

```powershell
node tools/validate-business-catalog.cjs
node tools/business-catalog-contract-test.cjs
```

## Segmentos Comerciales Prioritarios Para E3-E8

La ampliacion contractual de prospeccion no activa fuentes ni cambia el runtime de E2.2. Su fuente de verdad es `data/prospecting-priorities.v1.json` y debe validarse antes de modificar E3-E8.

Cinco perfiles comerciales reutilizan cuatro sectores existentes, sin crear categorias duplicadas:

- Administradores de fincas y comunidades -> `property-management`, cliente directo.
- Aparejadores y arquitectos tecnicos -> `technical-architects`, colaborador/prescriptor.
- Arquitectos, despachos y estudios -> `architects`, colaborador/prescriptor.
- Inmobiliarias y servicios inmobiliarios -> `real-estate-agencies`, cliente directo/prescriptor.
- Gestion patrimonial y de inmuebles -> `property-management`, cliente directo.

Reglas obligatorias:

- `gestoria administrativa`, asesoria fiscal, laboral o contable pertenecen a `accounting-advisory`; no son administradores de fincas.
- `gestoria de fincas`, administracion de comunidades y gestion de inmuebles pertenecen a `property-management` cuando la fuente aporta esa evidencia especifica.
- El sector solicitado nunca sirve como evidencia de clasificacion.
- Cada telefono, email, web, responsable y cargo descubierto debe conservar fuente, URL, fecha, confianza y estado de verificacion.
- No se inventan contactos ni se infieren correos. La IA no completa datos empresariales desconocidos.
- Los indicadores obligatorios son empresas encontradas, establecimientos unicos, contactos utiles, responsables identificados y correos personalizados preparados.
- Un correo preparado exige revision y aprobacion individual antes de abrir Outlook. El envio automatico permanece prohibido.
- E3-E4 validan mappings contra las releases utilizadas; E5 puede activar el flujo solo tras superar sus gates; E6-E8 conservan trazabilidad, exclusiones y secretos separados.
- Indices locales primero, resultados progresivos y enriquecimiento opcional con concurrencia maxima inicial de uno hasta disponer de medidas en el Celeron N4020.

Pruebas minimas adicionales:

```powershell
node tools/validate-prospecting-priorities.cjs
node tools/prospecting-priorities-contract-test.cjs
```

## Tours De Novedades En Cada Actualizacion

Regla permanente:

- Cada actualizacion real debe tener un build nuevo.
- `modules/help-system.js` debe leer `window.GORDI_APP_BUILD` como fuente del build del tour.
- `gordi_professional_update_tour` guarda el ultimo build visto por el usuario.
- Si el build cambia, el tour de novedades se muestra una vez.
- Si el usuario lo termina o lo salta, no vuelve a mostrarse hasta el siguiente build.
- El tour no debe borrar datos ni usar `localStorage.clear()`.
- El tour debe esperar si hay un modal o tutorial principal abierto.
- El tour debe saltar pasos con elementos ocultos o inexistentes.
- Cada tarjeta del tour debe mantener texto breve y ofrecer acceso a un manual detallado cuando el usuario quiera profundizar.
- El manual detallado debe vivir dentro de la app, no depender de internet ni cambiar de origen.

## Service Workers Y CacheStorage

La app no debe depender de Service Worker para funcionar.

Si se limpian caches tecnicas heredadas:

- No tocar `localStorage`.
- No borrar todas las caches del origen sin filtro.
- Limpiar solo caches con nombres propios de la herramienta, por ejemplo `gordi`, `voltium`, `voltflow` o `progama`.

## Claves Persistentes Criticas

Estas claves deben conservarse:

```text
gordi_leads
gordi_email_history
gordi_campaigns
gordi_objectives
gordi_search_history
gordi_saved_searches
gordi_templates
gordi_api_key
gordi_hunter_key
gordi_apollo_key
gordi_claude_key
gordi_gemini_key
gordi_groq_key
gordi_openrouter_key
gordi_user_name
gordi_user_email
gordi_user_company
gordi_user_phone
gordi_user_web
gordi_user_logo
gordi_sender_name
gordi_sender_email
gordi_sheets_id
gordi_sheets_client_id
gordi_sheets_token
gordi_pin
gordi_light_mode
gordi_font_scale
gordi_commercial_memory
gordi_jsonbin_key
gordi_jsonbin_bin
gordi_jsonbin_auto
gordi_gh_token
gordi_gh_user
gordi_gh_repo
gordi_gh_auto
gordi_search_coverage
gordi_coverage_targets
gordi_coverage_daily_plan
gordi_coverage_events
gordi_coverage_view_mode
gordi_coverage_active_mission
gordi_workflow_restore_points
gordi_workflow_audit_log
gordi_coverage_lead_filter
gordi_coverage_update_tour
gordi_professional_update_tour
gordi_manual_state
gordi_map_geocode_cache
gordi_disk_backup_enabled
gordi_disk_backup_last_date
gordi_disk_backup_last_status
gordi_disk_backup_last_file
gordi_disk_backup_last_error
```

Tambien debe conservarse cualquier clave nueva que empiece por `gordi_`, salvo que sea una cache tecnica claramente desechable y el cambio lo documente.

## Backup Automatico En Disco

La herramienta debe proteger los datos fuera del navegador con `modules/disk-backup.js`.

- El navegador no puede escribir en disco sin permiso del usuario.
- En Chrome/Edge se debe usar File System Access API: el usuario elige una carpeta una vez desde Configuracion.
- La app debe guardar el permiso de carpeta en IndexedDB, no en `localStorage`.
- Mientras la app este abierta, debe comprobar una vez al dia si existe `gordi_backup_auto_YYYY-MM-DD.json`.
- Si el backup del dia no existe y hay permiso de escritura, debe crearlo automaticamente.
- El backup debe incluir el formato restaurable actual: `leads`, `emailHistory`, `campaigns`, `objectives`, `templates`, `portableSnapshot` e `integrity`.
- `portableSnapshot` debe salir de `exportDataSnapshot()` para incluir leads, API keys, cobertura, scraping, campañas, historial, configuracion y cualquier clave `gordi_*` no excluida.
- `exportDataSnapshot()` tambien debe incluir claves historicas `voltium_*` si existieran.
- Si el permiso falta o el navegador no soporta escritura a carpeta, la app debe mostrar estado claro en Configuracion y no borrar datos.

## Recuperacion De Datos

`modules/init.js` es la autoridad para:

- `VOLTFLOW_DATA_KEYS`.
- `exportDataSnapshot()`.
- `loadAllData()`.
- `tryAutoMigrate()`.
- rescates criticos.
- diagnostico de carga.

Reglas:

- Si se crea una nueva clave persistente, anadirla a `VOLTFLOW_DATA_KEYS`.
- Si se cambia la estructura de leads, mantener compatibilidad en `normalizeLoadedLead()`.
- Si se cambia la estructura de cobertura, mantener compatibilidad con datos anteriores.
- Antes de una operacion peligrosa, crear snapshot si existe `createSafetySnapshot()`.

Prueba minima:

1. Simular `localStorage` con `gordi_leads` y API keys.
2. Ejecutar `loadAllData()`.
3. Confirmar que `leads.length > 0`.
4. Confirmar que los inputs de API keys reciben sus valores.

## Scraping Individual

Flujo funcional:

1. El usuario elige sector en `plan-segment`.
2. El usuario escribe CP/zona en `plan-location`.
3. `searchBusinesses()` decide si es busqueda individual o multisector.
4. En modo individual llama a `searchBusinessesSingle()`.
5. `searchBusinessesSingle()` llama a `fetchPlaces()`.
6. `fetchPlaces()` usa Google Maps/Places.
7. Los resultados se normalizan con `normalizeSearchCompany()`.
8. Se guardan temporalmente en `tempSearchResults`.
9. Se renderizan con `renderSearchCards()` y `renderSearchTable()`.
10. El usuario puede pulsar `Volcar`.
11. `quickImportOne()` o `importSelectedSearch()` crean leads con `buildLeadFromSearchCompany()`.
12. `saveLeads()` guarda en `gordi_leads`.

Reglas:

- `quickImportOne()` debe seguir existiendo.
- `importSelectedSearch()` debe seguir existiendo.
- `buildLeadFromSearchCompany()` debe seguir existiendo.
- `saveLeads()` debe seguir escribiendo `gordi_leads`.
- El boton `Volcar` debe llamar a `quickImportOne(index)`.
- El volcado no debe exigir email si hay una ruta alternativa visible para importar, salvo decision funcional explicita.

## Scraping Multisector

Flujo funcional:

1. El usuario activa modo multisector.
2. Selecciona dos o mas sectores.
3. `searchBusinesses()` llama a `searchBusinessesMultiSector(sectors, location)`.
4. Cada sector llama a `searchSectorPlacesOnly()`.
5. `searchSectorPlacesOnly()` llama a `fetchPlaces(segment, location, maxRes, { multiSector: true })`.
6. Los resultados se deduplican y fusionan con `mergeMultiSectorResults()`.
7. El resultado final queda en `tempSearchResults`.
8. Se renderiza el panel multisector.
9. Se permite crear campana o volcar leads.

Reglas:

- `searchBusinessesMultiSector()` debe seguir existiendo.
- `searchSectorPlacesOnly()` debe seguir existiendo.
- El modo multisector no debe saltarse `fetchPlaces()`.
- El modo multisector debe registrar errores por sector sin detener toda la busqueda si un sector falla.
- Si hay resultados, deben aparecer en `tempSearchResults`.

## Google Maps Y Places

Dependencias criticas:

- `gordi_api_key` debe existir para Google Maps/Places.
- La API key debe tener acceso a Maps JavaScript API y Places API.
- `waitForGoogleMaps()` debe completarse antes de `fetchPlaces()`.
- `google.maps.importLibrary('places')` debe estar disponible.

Si el scraping real falla pero las pruebas simuladas pasan, revisar:

- API key.
- Restricciones de dominio/origen.
- Cuota de Google.
- Activacion de Places API New.
- Consola del navegador.
- Mensajes del pipeline de enriquecimiento.

## Leads Y Pipeline

Flujo funcional:

1. Los leads viven en el array global `leads`.
2. `saveLeads()` persiste `leads` en `gordi_leads`.
3. `renderLeads()` muestra Gestion de Leads.
4. `renderKanban()` muestra Pipeline.
5. Cambios de estado desde detalle o pipeline deben actualizar el lead.
6. Los cambios deben persistirse con `saveLeads()`.

Reglas:

- No duplicar una funcion de guardado paralela que no use `gordi_leads`.
- No cambiar nombres de estados sin actualizar mapeos del pipeline.
- No romper `updateLeadStatusViaPipeline()`.
- No romper `saveLeadDetail()`.

## Cobertura

Cobertura debe integrarse con scraping y leads.

Claves criticas:

```text
gordi_search_coverage
gordi_coverage_targets
gordi_coverage_daily_plan
gordi_coverage_events
gordi_coverage_view_mode
gordi_coverage_active_mission
gordi_coverage_lead_filter
```

Reglas:

- Una busqueda individual debe poder registrar cobertura con CP/zona, sector, estado y resultados.
- Una busqueda multisector debe registrar cobertura por cada sector.
- Desde Cobertura debe poder abrirse el filtro real de leads por CP/sector/mision.
- El filtro de Cobertura en leads debe poder quitarse sin romper otros filtros.
- Cobertura no debe borrar historial de scraping.

## Mapa

El mapa debe poder mostrar:

- Leads por direccion.
- Chinchetas de cobertura por CP/zona.
- Estados visuales de cobertura.

Reglas:

- Conservar `lat` y `lng` al volcar leads desde scraping si existen.
- Conservar `gordi_map_geocode_cache`.
- No romper el modo de mapa de leads al anadir modo cobertura.

## Publicacion En GitHub

Antes de subir una version:

1. Confirmar que `app.html`, `index.html`, `version.json` e `init.js` tienen el mismo build/version.
2. Confirmar que todos los scripts y CSS internos tienen el mismo `?v=<build>`.
3. Confirmar que `index.html` redirige al build actual.
4. Confirmar que no se ha anadido `localStorage.clear()`.
5. Confirmar que no se borran claves `gordi_*`.
6. Confirmar que `README.md` no obliga a cambiar de origen.

## Pruebas Minimas Antes De Dar Una Version Por Buena

Ejecutar sintaxis:

```powershell
node --check modules/init.js
node --check modules/search.js
node --check modules/leads.js
node --check modules/coverage.js
node --check modules/inbox.js
```

Comprobar carga de archivos:

- `app.html` responde/carga.
- `modules/init.js` responde/carga.
- `modules/search.js` responde/carga.
- `modules/leads.js` responde/carga.
- `modules/coverage.js` responde/carga.
- `styles/main.css` responde/carga.

Comprobar recuperacion:

- `loadAllData()` carga leads simulados.
- API keys simuladas aparecen en inputs.
- `gordi_search_coverage` no se pierde.

Comprobar scraping local simulado:

- `searchBusinessesSingle()` deja resultados en `tempSearchResults`.
- `searchBusinessesMultiSector()` deja resultados en `tempSearchResults`.
- `quickImportOne()` crea un lead.
- `saveLeads()` escribe `gordi_leads`.

Comprobar botones:

- Las funciones llamadas por `onclick` deben existir en los modulos cargados.
- Comparar contra la version funcional solo si aparece una diferencia nueva real.

## Cambios Que Requieren Especial Cuidado

Revisar este documento antes de tocar:

- `app.html`.
- `index.html`.
- `version.json`.
- `modules/init.js`.
- `modules/search.js`.
- `modules/leads.js`.
- `modules/coverage.js`.
- `modules/inbox.js`.
- `styles/main.css`.

Tambien revisar con cuidado cualquier cambio que:

- Modifique funciones llamadas desde `onclick` en `app.html`.
- Cambie el orden de scripts de `app.html`.
- Anada o quite claves `gordi_*`.
- Cambie el origen recomendado de apertura.
- Introduzca dependencias de servidor.
- Toque Google Maps, Places, scraping, proxies o enriquecimiento.

Si el cambio afecta a una de estas areas, repetir las pruebas minimas:

- Persistencia.
- Scraping individual.
- Multisector.
- Volcado a leads.
- Pipeline.
- Cobertura.
- Mapa.
- Cache/version.

## Regla De Sinceridad Tecnica

No declarar solucionado un problema de scraping real solo por pasar pruebas simuladas.

Las pruebas simuladas validan la logica interna. El scraping real depende tambien de:

- Google API key.
- Cuota.
- Restricciones de origen.
- Red.
- Proxies CORS.
- Webs externas.

Si no se ha probado contra Google/web real, decirlo explicitamente.

## Corpus Piloto E2.2

- `tests/fixtures/business-coverage/` contiene exclusivamente datos de evaluacion; la SPA no los carga.
- Las capturas oficiales estan acotadas a 30 registros por consulta y se reconstruyen sin red con `node tools/build-business-coverage-corpus.cjs`.
- La actualizacion de capturas requiere la opcion explicita `--refresh`; las validaciones y pruebas normales no usan red.
- Madrid y Barcelona se identifican con los codigos INE `28079` y `08019`.
- El indice de Madrid usado por produccion conserva `recordSchemaVersion: 1`.
- DIBA permanece como diagnostico excluido del corpus puntuado debido a la discrepancia observada entre `adreca.nom_municipi` y `rel_municipi`.
- El corpus no contiene NIF, referencias catastrales, credenciales ni contactos inventados.
- La deduplicacion bloquea fusiones cuando existen unidades fisicas explicitas incompatibles; no contiene excepciones por identificador concreto.
- Las fechas civiles de Barcelona se canonicalizan de forma independiente de la zona horaria.
- El momento exacto de las capturas historicas se declara desconocido; reindexacion y generacion se registran por separado.
- `business-coverage-quality.cjs` es bloqueante y exige cero fusiones incorrectas y cero grupos de locales colapsados.
- Las unidades abreviadas del último segmento, ordinales, puertas y variantes de bajo se canonicalizan por planta y puerta.
- Equivalencias inequívocas como `1DR` y `1º D` pueden deduplicarse; derecha/izquierda y puertas distintas bloquean la fusión aunque compartan contacto.
- La identidad externa oficial exactamente coincidente conserva prioridad sobre diferencias de formato de dirección.

## Contrato C0-C1 De Comunicaciones Comerciales

- `data/commercial-communications.v1.json` define los estados y transiciones ejecutables de borrador, apertura externa, confirmacion e historico legacy.
- `modules/commercial-communications.js` debe cargarse despues de `modules/init.js` y antes de los modulos que abren correo o WhatsApp.
- Abrir `mailto:`, Outlook, WhatsApp o cualquier ventana externa deja la comunicacion en `PENDING_SEND_CONFIRMATION`; nunca acredita el envio ni la lectura.
- Solo `SENT_CONFIRMED`, acompañado de `manual_explicit` o `provider_verified` con su procedencia obligatoria, cuenta en estadisticas y campañas.
- La confirmacion manual debe ser una accion expresa del usuario y es idempotente.
- Los estados legacy `Enviado` y `Enviado (IA)` se conservan sin reescritura como `LEGACY_SENT_UNVERIFIED` a efectos de lectura; no se cuentan como envios confirmados.
- Copiar un correo, revisarlo o aprobarlo no cambia el lead a `Contactado`.
- La oposicion, `doNotContact` y una condicion habilitante no validada bloquean la preparacion para envio. La procedencia del canal debe registrarse.
- La secuencia contractual admite como maximo cinco comunicaciones confirmadas y distingue empresa, establecimiento y contacto mediante IDs estables.
- `gordi_email_history` conserva los nuevos campos dentro del almacenamiento y los backups existentes; no se añade una migracion destructiva ni una clave de almacenamiento nueva.
- Validacion: `node tools/validate-commercial-communications.cjs`.
- Pruebas: `commercial-communications-contract-test.cjs`, `commercial-communications-regression-test.cjs` y `commercial-communications-browser-mock-test.cjs`.

## Correccion C1.1

- La autorizacion comercial se vincula a canal, destinatario normalizado, contacto, finalidad y fuente. Una autorizacion antigua incompleta exige revision explicita y no se reutiliza silenciosamente.
- Cambiar de email, telefono, WhatsApp, contacto o finalidad exige una autorizacion independiente. Las autorizaciones anteriores se conservan en `channels.<canal>.authorizations`.
- La clave canonica de secuencia se deriva de empresa, contacto y finalidad. Un `sequenceId` alternativo o una reimportacion no permite superar cinco comunicaciones confirmadas.
- El limite se comprueba al crear borradores y de nuevo al confirmar; solo cuentan confirmaciones validas.
- `SENT_CONFIRMED` exige evidencia completa y tipada. Los registros malformados se conservan, se muestran como no verificados y no alimentan contadores.
- WhatsApp reserva una ventana vacia durante la activacion del usuario, antes de las operaciones asincronas. Si el navegador bloquea la reserva, no se registra apertura ni envio.
- Validacion independiente: `node C01_PRUEBAS_INDEPENDIENTES_20261015.cjs .`.
- Regresiones C1.1: `node tools/commercial-communications-c11-test.cjs .`.

## Correccion C1.2

- La primera operacion comercial asigna y conserva `commercialRefs.companyId`, `companyIdentityAnchor`, `establishmentId` y `establishmentIdentityAnchor` en la ficha. Enriquecer web, direccion u otros campos no recalcula esos identificadores.
- Cada comunicacion conserva `identityEquivalences` verificables. Los registros C1/C1.1 sin ese bloque se resuelven de forma compatible mediante `leadId`, `companyId`, canal y destino normalizado; no se reescriben.
- `sequenceKey` y `sequenceId` almacenados son informativos. El limite se calcula desde la identidad canonica de empresa, contacto y finalidad.
- Una colision del mismo `companyId` entre anclas canonicas distintas bloquea la operacion. Los establecimientos mantienen identificadores separados aunque compartan empresa.
- La evidencia manual es unica por metodo, usuario confirmante e `confirmationId`. La evidencia de proveedor es unica por metodo, proveedor, cuenta y `providerMessageId`.
- Un intento de reutilizar evidencia queda trazado en `confirmationAttempts` como rechazado, permanece pendiente y no suma un envio.
- Validacion independiente: `node C11_REGRESIONES_IDENTIDAD_EVENTO_20261016.cjs .`.
- Regresiones C1.2: `node tools/commercial-communications-c12-test.cjs .`.

