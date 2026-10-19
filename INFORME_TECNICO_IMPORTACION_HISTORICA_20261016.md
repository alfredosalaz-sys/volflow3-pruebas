# Importacion historica segura de Voltflow3

Fecha: 2026-10-16  
Base: Voltflow 3 2.9.4, build 2026.10.15.0300  
Alcance: recuperacion historica y fusion no destructiva. No incluye C2 comercial ni C3-C7.

## Resultado

Se ha incorporado un motor separado de la restauracion completa. Analiza el archivo sin mutar datos, genera una vista previa, exige una copia cifrada del estado actual verificada desde disco y aplica la fusion mediante el staging y rollback ya auditados.

La identidad de empresa y establecimiento prioriza `commercialRefs`, identificadores de origen y unidades fisicas. Nombre, telefono y dominio nunca son prueba suficiente para fusionar. Una colision de identificador conserva la observacion importada con un identificador derivado y trazabilidad, en vez de sobrescribirla.

Las comunicaciones conservan relaciones con el lead canonico. Confirmaciones incompletas, evidencias repetidas y el sexto envio de una secuencia quedan como `LEGACY_SENT_UNVERIFIED`: permanecen visibles, pero no cuentan como enviados. Las oposiciones se unen y nunca se eliminan.

Las credenciales se procesan solo en memoria. Una colision requiere elegir expresamente entre la credencial actual y la importada, siempre con valores ocultos. Importar una clave no activa autorizaciones, proveedores de pago ni permisos de sesion. Los snapshots cloud solo se aceptan como archivos locales aportados por el usuario; no se realiza ninguna descarga ni subida.

## Componentes

- `modules/historical-import.js`: deteccion, adaptadores, identidad, fusion, preview, sincronizacion IDB/localStorage, prueba de seguridad y commit.
- `modules/ui.js`: asistente explicito de recuperacion.
- `app.html`: carga del modulo y acceso `Recuperar datos antiguos`.
- `tools/historical-import-test.cjs`: contratos H01-H20.
- `tools/historical-import-browser-test.cjs`: Chrome aislado, CPU x4, reinicios, perfil limpio y rollback.
- `tests/fixtures/persistence/historical-rich-*.json`: datos exclusivamente sinteticos.

## Garantias verificadas

- Importacion en perfil vacio y sobre datos nuevos.
- Idempotencia al repetir el mismo archivo.
- Conservacion de sucursales, contactos, campos desconocidos y oposiciones.
- Credenciales persistentes dentro del navegador y backup cifrado posterior.
- Correspondencia entre colecciones autoritativas de IndexedDB y snapshot local.
- Rechazo previo de archivo corrupto o incompatible.
- Rollback ante interrupcion simulada.
- Tres reinicios y restauracion en un segundo perfil temporal de Chrome.

## Limites honestos

No se ha usado ningun backup real del usuario. La compatibilidad declarada se limita a los formatos y fixtures indicados en la matriz. No se ha probado en el Celeron N4020 fisico. Handles de carpetas y permisos OAuth deben reautorizarse. Los archivos del PC meramente referenciados no pueden recuperarse si nunca fueron incorporados al CRM.

## Dictamen

READY para auditoria independiente de esta entrega con datos sinteticos. La publicacion sigue condicionada a una prueba fisica en el Celeron y a una prueba autorizada sobre copias de backups reales, trabajando siempre sobre duplicados.
