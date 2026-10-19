# VOLTFLOW3 / VOLTIUM MADRID — ADENDA P0: IMPORTACIÓN REAL DE DATOS HISTÓRICOS

**Fecha:** 2026-10-16. **Naturaleza:** requisito obligatorio para el plan de persistencia, backups y restauración de C2. **Estado:** especificación de desarrollo; no implica que ya exista una migración comprobada.

## 1. Necesidad del propietario

Voltflow3 se utiliza desde hace tiempo y contiene trabajo empresarial real que debe conservarse **íntegramente** al adoptar versiones futuras. El CRM debe recuperar registros del navegador utilizado habitualmente y archivos exportados con ediciones antiguas de Voltflow/Voltflow2/Voltflow3, sin exigir empezar de cero ni destruir datos actuales.

La prioridad P0 se aplica ANTES de iniciar una migración irreversible de C2. Hay que demostrar una restauración real en un perfil de pruebas vacío y una **fusión no destructiva** en uno con datos existentes. Nunca trabajar sobre el perfil real durante el desarrollo o las pruebas.

## 2. Estado del código C1.2 revisado

- `modules/ui.js` contiene `exportFullBackup()`, `restoreBackup()` y reconocimiento de dos familias de exportaciones: `gordi_backup_*.json` con arrays `leads`, `emailHistory`, `campaigns`, etc., y `voltflow_datos_*.json`/snapshots con `gordi_leads` y `_voltflow_version`.
- `modules/init.js` contiene `exportDataSnapshot()`, `exportCurrentDataSnapshot()`, `importDataSnapshot()` e `importDataSnapshotAsync()`; actualmente la importación se realiza principalmente por claves y puede reemplazar colecciones. No constituye una fusión relacional garantizada.
- `modules/storage.js` utiliza IndexedDB **`VoltiumCRM`**, stores `leads`, `emailHistory`, `campaigns`, `searchHistory`, `savedSearches`, `kv`, `meta`; también permite migrar datos antiguos desde `localStorage` sin borrar este último.
- `modules/disk-backup.js` utiliza IndexedDB **`gordi_disk_backup_db`** para el permiso de carpeta y genera el contenedor `backupType: auto_disk_daily`. El restaurador de `modules/ui.js` no demuestra reconocer esa envoltura como entrada independiente.
- También existen claves históricas `gordi_*` y `voltium_*`, entre ellas `voltium_search_history`, así como credenciales, ajustes e historiales comerciales con semántica antigua.

**No se ha inspeccionado la información privada real del Chrome del usuario** ni sus archivos históricos; no afirmar compatibilidad exhaustiva sin probar muestras representativas de formatos reales, previamente saneadas.

## 3. Rutas de recuperación obligatorias

**A. Datos YA existentes en el mismo perfil y origen HTTPS:** detectar sin modificación destructiva `localStorage` e IndexedDB actuales, verificar qué almacenes contienen datos y preservar la fuente más reciente/autoritaria. Mostrar diagnóstico, previsualización y opción de migración segura. No reinicializar por ausencia temporal de una variable ni por un cambio de build.

**B. Backups antiguos:** admitir importación mediante selector de archivo de los formatos citados, `gordi_backup_auto_*.json` y otros formatos que realmente existan en versiones anteriores. Añadir adaptadores versionados y pruebas con fixtures. Nunca adivinar un formato incompatible: señalarlo y conservar el archivo original.

**C. Otros perfiles, equipos, dominios u orígenes:** no afirmar que una página GitHub Pages puede leer datos de otro origen o perfil. Permitir exportar desde la instalación anterior e importar el archivo en la nueva mediante acción explícita. Las versiones que comparten `https://alfredosalaz-sys.github.io` también comparten origen y potencialmente almacenamiento: **el repositorio de pruebas no es un entorno aislado en el Chrome habitual**.

**D. Archivos anexos:** importar y respaldar bytes de documentos y fotografías que realmente estén almacenados en el CRM. Si solo existe una referencia externa o ruta local, declararla como no recuperada y pedir al usuario seleccionar el archivo; no fingir que una ruta es el contenido del documento.

## 4. Qué se debe recuperar

Leads, empresas y sucursales, observaciones de fuentes, contactos (teléfono, email, webs, responsables), identidades comerciales y alias, campañas, búsquedas e índices locales del usuario, cobertura CP/sector, deduplicación, correos y sus versiones, estados legacy, confirmaciones de envío, oposiciones y exclusiones, seguimientos, oportunidades, presupuestos y notas, plantillas, preferencias, parámetros de IA, ajustes de Voltium Madrid, tareas, historial de chat, metadatos de backups y toda clave antigua/nueva catalogada. Incluir **API keys y tokens** dentro del backup **cifrado**, con controles de confidencialidad y caducidad; no filtrarlos por logs, vista previa o sincronización en claro.

**No inventar datos ausentes**, incluidos contactos de empresas y comunicaciones. Un registro histórico de envío ambiguo debe permanecer como `LEGACY_SENT_UNVERIFIED`; un backup no puede convertirlo automáticamente en `SENT_CONFIRMED` ni rehabilitar contactos que se hayan opuesto.

## 5. Interfaz de importación y restauración

Un único asistente «**Recuperar mis datos de Voltflow anterior**» debe ofrecer: «Detectar datos de este navegador» / «Elegir backup anterior» / «Comparar y fusionar» / «Restaurar copia completa»; mostrar fecha, versión, fuente, tipos de datos, recuentos, duplicados, conflictos, secretos incluidos (sin mostrar sus valores) y riesgos; opción **Vista previa sin modificar nada**.

**Por defecto: fusionar sin perder información.** Crear antes una copia externa cifrada y verificable del estado actual; disponer de rollback si hay una excepción, corte o falta de espacio. Sustituir todo solo con advertencia, confirmación explícita y recuperación probada del estado anterior. No borrar datos de versiones viejas por defecto.

No ofrecer “importación completada” sin comparar conteos, identidades, claves, relaciones y hashes de adjuntos. Emitir informe de importación con añadidos, iguales, conflictos, conservados, omitidos y errores; sin secretos ni datos personales innecesarios.

## 6. Reconciliación de identidades e idempotencia

- No deduplicar por nombre, web o teléfono únicamente; respetar empresa jurídica, establecimiento y persona como entidades independientes.
- Conservar `commercialRefs`, equivalencias de IDs históricos, fecha y fuente original.
- Un mismo archivo importado dos veces no duplica contactos, eventos, confirmaciones ni reinicia seguimientos.
- Mantener la regla de hasta cinco envíos verdaderamente confirmados por empresa/contacto/finalidad; la importación no crea permisos comerciales.
- Ante versiones temporales divergentes, reconciliar eventos por ID y procedencia. Cuando hay conflicto no resoluble automáticamente, no sobrescribir: informar y pedir decisión.
- Conservar campos desconocidos para una exportación reversible y migraciones futuras.

## 7. Protecciones técnicas

Copia coherente desde IndexedDB (fuente autoritativa donde corresponda), `localStorage` y los blobs realmente custodiados. No basarse solo en un volcado superficial de `localStorage`. Serializar escrituras, comprobar cuota y manejar pestañas abiertas. Importación en staging con commit recuperable y rollback; verificar posteriormente almacenamiento y ejecución real de la app.

Backups portables cifrados con Web Crypto y contraseña administrada por el usuario; **no** enviar claves o historiales en claro a GitHub/JSONBin ni a otros servicios. Nunca exponerlos en fixtures. Los permisos del selector de carpetas deben reautorizarse donde corresponda.

## 8. Pruebas de aceptación bloqueantes

1. Restaurar una copia real de cada familia legacy soportada en perfil vacío, recuperando todos los datos presentes.
2. Importar en una instalación con trabajo nuevo: conservar ambos conjuntos sin pérdidas; detallar conflictos reales.
3. Importar el mismo archivo dos veces: segunda importación idempotente, cero duplicados.
4. Detectar y conservar datos del navegador tras actualizar build sin reiniciar `localStorage` ni `VoltiumCRM`.
5. Restaurar IndexedDB más nuevo que la copia de `localStorage`: no sobrescribir con la versión obsoleta.
6. Restaurar empresas con varias sucursales, contactos e ID antiguos, conservando `commercialRefs` y relaciones.
7. Mantener eventos antiguos ambiguos y oposiciones; no crear confirmaciones o habilitaciones comerciales ficticias.
8. Restaurar claves API/tokens sintéticos desde backup cifrado: valores idénticos, jamás en texto plano/logs ni red externa.
9. Restaurar un backup diario `auto_disk_daily` y un backup completo clásico; rechazar de forma segura archivos corruptos.
10. Simular corte, falta de espacio, contraseña errónea y conflicto; estado anterior íntegro y restaurable.
11. Verificar adjuntos binarios conservando SHA256; señalar los no incluidos sin ocultarlos.
12. Probar en perfil limpio y origen aislado, en Chrome real, con carga y rendimiento compatibles con el Celeron N4020.
13. Repetir C0+C1.2, E1-E2.2, controles de IA, quality gate, sintaxis, SHA256 y tests de regresión.
14. Verificar que ninguna prueba, backup o importación toque la versión pública ni el perfil personal del usuario.

**No declarar READY si cualquiera de las fuentes históricas declaradas soportadas pierde registros, secretos, estados o relaciones.** Los formatos no disponibles para prueba deben constar expresamente como pendientes, no como aprobados.

## 9. Mandato de ejecución para Codex

Incorporar esta adenda al `PLAN_MAESTRO_PERSISTENCIA_BACKUP_VOLTFLOW3_C2_20261016.md` y al `ENCARGO_CODEX_SEGURIDAD_DATOS_VOLTFLOW3_C2.md` como **requisito P0**. Elaborar primero inventario de formatos y fixtures legacy; después implementar recuperación segura en una copia aislada, con informes de diferencias, pruebas reales en Chrome y rollback. No iniciar C2 de memoria comercial sobre una base que no haya superado el importador histórico.

No subir datos de usuario, API keys ni backups sin cifrar a repositorios. No realizar envíos, cobros ni despliegues. Mantener E3-E8 y la versión estable intactas.
