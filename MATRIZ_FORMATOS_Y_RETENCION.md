# Matriz de formatos y retención

| Formato | Detección | Validación previa | Secretos | Aplicación actual | Estado |
|---|---|---|---|---|---|
| `voltflow-secure-backup` v1 | `format` + `formatVersion` | SHA256 ciphertext, AES-GCM, manifiesto por secciones | Cifrados | Staging, reemplazo transaccional IDB, rollback local/IDB | Probado en Chrome aislado |
| `auto_disk_daily` | `backupType` + `portableSnapshot` | `validateDataSnapshot()` | Puede contener texto claro | Importador histórico explícito | Compatible para restauración simple; fusión pendiente |
| Backup completo 2.x | arrays + `portableSnapshot` | `validateDataSnapshot()` | Puede contener texto claro | Importador histórico | Fusión relacional pendiente |
| Portable 2.9.2/2.9.4 | `_voltflow_version`, `snapshot` o claves `gordi_*` | `validateDataSnapshot()` | Puede contener texto claro | Importador histórico | Fusión relacional pendiente |
| Safety snapshot | objeto `snapshot` | validación de snapshot | Texto claro interno | Recuperación local | No debe subirse ni exportarse en claro |
| Legacy full | arrays `leads`, `emailHistory`, `campaigns` | conversión conservadora | Parcial | Compatibilidad existente | Muestras reales pendientes |

## Reglas de retención

- Campos desconocidos: conservar.
- Datos existentes frente a configuración importada: no sobrescribir automáticamente en una futura fusión.
- `commercialRefs`, alias, oposiciones y evidencias: críticos; nunca degradar.
- Estados `LEGACY_SENT_UNVERIFIED`: no promover a `SENT_CONFIRMED`.
- Marcadores de disponibilidad IndexedDB: descartar y reconstruir.
- Secrets persistentes: restaurar a su almacén persistente solo desde copia cifrada.
- Secrets de sesión: restaurar únicamente a sesión y con consentimiento.
- Handles y permisos: no serializar; pedir autorización de nuevo.
- Referencias de archivos: conservar metadatos y marcar `included:false` si no existen bytes custodiados.

