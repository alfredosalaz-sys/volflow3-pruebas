# Voltflow3 — Auditoría independiente acotada HX08 (2026-10-16)

## Alcance y dictamen

**Dictamen: HX08 resuelve el escenario original de cola volátil; pendiente de resolver HX09 antes de recuperar datos reales en un entorno multipestaña.** La revisión se hizo sobre el RAR `Voltflow3-IMPORTACION-HISTORICA-HX08-20261016.rar`, extraído en un entorno aislado, sin datos del usuario, claves reales ni llamadas a servicios externos. No hubo despliegue, commits ni cambios en GitHub.

## Comprobaciones realizadas

- `node tools/verify-manifest.cjs`: **236/236 SHA256 válidos**.
- Integridad de versión: **2.9.4**, build **2026.10.15.0300**.
- Sintaxis Node `--check` de módulos y herramientas en los directorios `modules/` y `tools/`: **correcta**.
- Los **38 comandos `run: node`** actualmente declarados en `.github/workflows/quality-gate.yml`: **38/38 PASS**, ejecutados localmente. Esta cifra no incluye pruebas visuales de Chrome ni comandos del workflow que no comienzan por `run: node`.
- `HX08_REGRESION_COLA_VOLATIL_20261016.cjs`: **PASS**.
- `tools/write-coordinator-hx08-test.cjs`: **2/2 PASS**.
- `HX07_CARRERA_ESCRITURA_CONCURRENTE_20261016.cjs`: **PASS** (el importador devuelve cancelación por escritura concurrente).
- `tools/historical-import-test.cjs`: **20/20 PASS**.
- `tools/secure-backup-b01-b20-test.cjs`: **20/20 PASS**.

Las pruebas del navegador real descritas en el paquete son resultados de Codex; **no se repitieron aquí en el Celeron N4020 ni se validó una importación con backups reales antiguos**.

## HX09 — Riesgo nuevo de pérdida de una escritura pendiente durante el replay

**Severidad: alta en el flujo de recuperación multipestaña.** Reproducido con el módulo auténtico `modules/write-coordinator.js` y una intercalación simulada de escritura por otra pestaña. No se ha reproducido visualmente en Chrome real.

### Causa técnica

En `modules/write-coordinator.js`:

1. `replayQueued()` comprueba una vez si hay un fence activo (líneas 128–129), adquiere un lock separado de replay (130–134) y lee los eventos del journal existente (137–140).
2. Si otra pestaña adquiere un **nuevo fence** tras esa comprobación y antes de ejecutar cada escritura, `local().setItem(...)` (142) entra en el interceptor de `Storage.prototype.setItem` (167–173), que llama a `queueMutation(...)` al observar el nuevo fence.
3. Si el evento procedía del **journal de la misma pestaña que realiza el replay**, `queueMutation` lo vuelve a escribir en ese mismo journal, pero el proceso borra posteriormente las claves de journal presentes en el conjunto inicial (`keys.forEach(...remove...)`, línea 147) y su registro (148).
4. Resultado observable en la simulación: `replayQueued()` devuelve `1` aunque **el lead no se aplica ni permanece protegido en ningún journal**.

El lock `__voltflow_coord_replay` no es el mismo que `voltflow-persistence-write` y no impide que se adquiera otro fence de importación durante el replay. No basta con comprobar el fence al inicio.

### Reproducción entregada

Archivo: `HX09_REGRESION_REPLAY_JOURNAL_CONCURRENTE_20261016.cjs`.

Ejecutar desde una terminal con Node.js:

```powershell
node HX09_REGRESION_REPLAY_JOURNAL_CONCURRENTE_20261016.cjs "C:\Users\NOSTROMO\Downloads\Voltflow3-IMPORTACION-HISTORICA-HX08-20261016"
```

Prueba A: journal pendiente sin segundo fence, **PASS**. Prueba B: el segundo fence aparece justo al reproducirse un evento del journal propio, **FAIL** sobre la entrega recibida (`reported: 1, applied: false, preserved: false`). La inyección en el test representa la escritura concurrente de otra pestaña; es una **simulación determinista del entrelazado**, no un ensayo de Chrome con dos pestañas.

### Criterio de corrección limitado

- Sincronizar la adquisición de un fence nuevo y el replay: utilizar un protocolo único de exclusión al que se sometan los dos, o un diseño transaccional que no pueda borrar eventos aún no aplicados.
- Verificar la propiedad esencial por evento: **aplicado o pendiente duraderamente**, nunca ninguno de los dos.
- No borrar un journal completo con una lista antigua si se le añadieron registros durante el replay. Borrar/reconocer solo eventos aplicados bajo coordinación válida.
- Conservar recuperación tras pestaña cerrada, expiración del lease, cuota agotada y rechazo explícito de un guardado no persistible.
- Añadir esta prueba y una equivalente real con dos pestañas y re-adquisición de fence al quality gate; no debilitar HX01–HX08 ni B01–B20/H01–H20.
- Evitar reconstrucciones generales o cambios al buscador, IA, leads, contratos o backups.

## Recomendación operativa

**No usar todavía HX08 para importar backups reales históricos en el Chrome habitual.** Para ensayos aislados, mantener una sola pestaña de Voltflow en el perfil de pruebas y no abrir una segunda importación mientras se estén aplicando escrituras pendientes. No garantiza seguridad absoluta, pero reduce el escenario específico detectado.

Tras resolver HX09, efectuar un único cierre de esta fase: prueba sobre **copias autorizadas de backups antiguos** en perfil vacío de Chrome; revisión de leads, comunicaciones, adjuntos y API keys; prueba física Celeron N4020; y procedimiento de rollback comprobado. Si pasan, avanzar a C2 sin alargar artificialmente la fase.

## Límites del dictamen

No se ha examinado ningún dato real del usuario ni verificado que los backups antiguos reales estén cubiertos por todos los formatos. Las pruebas automáticas y la simulación de concurrencia no sustituyen la validación del navegador y del equipo físico. Los hashes verifican integridad interna de esta entrega; no demuestran por sí mismos ausencia de defectos funcionales.
