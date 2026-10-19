# Voltflow3 — Auditoría independiente de importación histórica

**Fecha:** 16 de octubre de 2026  
**Paquete auditado:** `Voltflow3-IMPORTACION-HISTORICA-SEGURA-20261016.rar`  
**Estado:** **NOT READY** para importar datos reales ni desplegar.

## Alcance y evidencias

Se extrajeron 203 archivos ordinarios del RAR, incluidos los 202 declarados en `MANIFEST_SHA256.txt`. En una copia temporal se ejecutaron las pruebas reales del proyecto sin acceso a cuentas, datos de usuario, red ni GitHub.

- `node tools/verify-manifest.cjs`: **202/202 PASS**.
- `node tools/historical-import-test.cjs`: **H01-H20 20/20 PASS**.
- `node tools/secure-backup-b01-b20-test.cjs`: **B01-B20 20/20 PASS**.
- `node tools/commercial-communications-c12-test.cjs`: **8/8 PASS**.
- `node tools/ai-security-test.cjs`: **PASS**.
- `node tools/quality-check.js`: **PASS**.
- `node tools/check-release-integrity.cjs`: **2.9.4 / 2026.10.15.0300 PASS**.

Las verificaciones anteriores acreditan que las pruebas entregadas pasan, pero no demuestran ausencia de pérdida en formatos y combinaciones no cubiertos. Se añadieron cuatro casos sintéticos independientes (`VOLTFLOW_HISTORICA_REGRESIONES_INDEPENDIENTES_20261016.cjs`): **0/4 PASS** con el código recibido.

## H-01 — Pérdida silenciosa de IndexedDB y archivos al fusionar backups cifrados

**Gravedad: crítica.**

`modules/historical-import.js`:
- `decodeSource()` (aprox. línea 124) devuelve el `payload` cifrado descifrado, pero la fusión en `analyze()` (aprox. 380) solo llama a `mergeSnapshots(currentStorage, decoded.localStorage, ...)`.
- `commit()` (aprox. 441) construye el resultado reutilizando `current.data.indexedDB` e `current.data.incorporatedFiles`; no combina las secciones homólogas del backup importado.

**Reproducción:** backup cifrado válido con un lead y un mensaje solo en IndexedDB, un registro en un store auxiliar y un archivo incorporado. La restauración simulada devuelve `ok:true`, mientras el resultado queda con **0 leads, 0 mensajes, 0 registros auxiliares y 0 archivos** procedentes de ese backup. Los datos originales siguen en el archivo de entrada, pero no se importan.

**Corrección exigida:** fusionar todo el payload (colecciones IndexedDB, claves de localStorage, stores desconocidos, archivos incorporados y referencias), con prioridad de las fuentes autoritativas, preservación de relaciones e idempotencia. Prohibir `ok:true` si una sección con datos válidos quedó ignorada; informar exactamente qué partes son incompatibles y permitir cancelar.

## H-02 — La copia de seguridad previa no verifica IndexedDB

**Gravedad: crítica.**

`modules/historical-import.js`: `currentFingerprint()` (aprox. 433) calcula una huella **solo de `payload.data.localStorage`**. `verifySafetyBackupFile()` y `commit()` usan esa huella para declarar que la copia de seguridad coincide con el estado actual.

**Reproducción:** un backup con lead `first` solo en IndexedDB y el estado actual con lead `second` solo en IndexedDB, ambos con el mismo localStorage. `verifySafetyBackupFile()` devuelve `verifiedFromDisk:true` incorrectamente.

**Corrección exigida:** comparar una huella canónica de todo el estado persistente crítico (IndexedDB completo, localStorage, documentos incorporados y demás secciones respaldadas). Aplicar la misma comprobación al validar la copia, justo antes del commit y al verificar después. Evitar discrepancias por timestamps volátiles mediante normalización explícita y probada; no ignorar silenciosamente stores.

## H-03 — Importación repetida de lead sin identificador genera duplicados

**Gravedad: alta.**

`modules/historical-import.js`: `mergeLeads()` (aprox. 194-223). Cuando el registro de origen no tiene `id` ni anclas fuertes, se le genera un ID `historical-${fingerprint(...)}` al insertarlo, pero en la siguiente importación no se busca un registro existente por esa identidad sintética.

**Reproducción:** primera importación = 1 lead; segunda del mismo archivo = 2 leads, **ambos con el mismo ID generado**.

**Corrección exigida:** conservar identidad estable derivada del origen y evitar importar de nuevo el mismo registro/observación sin fusionar empresas distintas por nombre, correo, teléfono o dominio. Tratar las ambigüedades como conflictos revisables, no como deduplicación agresiva.

## H-04 — Colección histórica corrupta interpretada como vacía

**Gravedad: alta.**

`modules/historical-import.js`: `parseStored()` (aprox. línea 39) devuelve el fallback tras cualquier error de `JSON.parse`, y `mergeSnapshots()` (aprox. 300) puede usar esa colección vacía sin avisar.

**Reproducción:** `{type:'voltflow-portable',snapshot:{gordi_leads:'[{'}}` se acepta y el análisis informa de **0 leads**, sin indicar que la colección está corrupta.

**Corrección exigida:** validación estricta de colecciones y objetos conocidos; rechazar la importación o poner en cuarentena el campo corrupto, sin mutación ni falsa declaración de importación íntegra. El usuario debe poder ver las secciones descartadas, y las incompatibles deben bloquear `READY`.

## Criterios de aceptación de la corrección

1. Pasar los cuatro casos independientes HX01-HX04 con sus aserciones originales; añadirlos al quality gate.
2. Conservar los 20 contratos históricos y B01-B20, así como regresiones de E1-E2.2 y C0-C1.2.
3. Para backups cifrados, comparar ANTES/DESPUÉS contenido real de IndexedDB, localStorage, adjuntos y referencias; no solo recuentos.
4. Simular corrupción, interrupción en el commit y rollback, probando además restauración en perfil vacío sin datos reales.
5. Conservar conflictos de API keys, oposiciones, límites de contacto y revisión humana.
6. No cambiar ni utilizar el Chrome habitual, no tocar GitHub, no hacer envíos, no usar APIs facturables.
7. Mantener prueba física en Celeron N4020 y prueba con **copias autorizadas de backups reales antiguos** como gates independientes pendientes.

**Dictamen:** La infraestructura cifrada constituye un avance válido, pero esta entrega no debe tratarse como importador histórico fiable hasta resolver H-01 a H-04 y demostrar la fusión de todas las secciones persistentes.
