# Matriz de formatos historicos

| Formato | Deteccion | Contenido probado | Tratamiento | Estado |
|---|---|---|---|---|
| `voltflow-secure-backup` v1 | `format` + `formatVersion` | Snapshot, IndexedDB, secretos y adjuntos incorporados | Descifrado AES-GCM, integridad y fusion | PROBADO AUTOMATICAMENTE |
| `voltflow-portable` 2.9.2 | `type` + `snapshot` | Leads, claves, oposiciones y campos desconocidos | Fusion conservadora | PROBADO AUTOMATICAMENTE |
| Backup completo v2 | Arrays `leads`, `emailHistory`, `campaigns` | Colecciones y extension desconocida | Conversion a snapshot y fusion | PROBADO AUTOMATICAMENTE |
| Full backup 2.9.4 | `portableSnapshot` | Claves portatiles | Fusion conservadora | PROBADO AUTOMATICAMENTE |
| `auto_disk_daily` 2.9.4 | `backupType` + `portableSnapshot` | Datos y secretos sinteticos | Fusion conservadora | PROBADO AUTOMATICAMENTE |
| Safety snapshot | Objeto `snapshot` | Snapshot local | Fusion conservadora | PROBADO AUTOMATICAMENTE |
| Snapshot GitHub aportado como archivo | Objeto `voltflow` | Snapshot local sintetico | Sin red; fusion como archivo | PROBADO AUTOMATICAMENTE |
| Respuesta JSONBin aportada como archivo | `record.voltflow` | Snapshot local sintetico | Sin red; fusion como archivo | PROBADO AUTOMATICAMENTE |

No se declara compatibilidad con archivos binarios, estructuras cloud distintas, backups truncados ni versiones cuyo esquema no pueda detectarse. Esos archivos se rechazan antes de modificar el navegador.

En `secure_v1`, la compatibilidad incluye contenido exclusivo de IndexedDB, stores auxiliares, archivos incorporados y referencias. Stores ausentes del schema instalado se preservan en cuarentena y no se presentan falsamente como activos.

Los formatos historicos en texto claro pueden contener credenciales. El asistente muestra el aviso, no revela valores, no transmite el archivo y recomienda crear inmediatamente una nueva copia cifrada.
