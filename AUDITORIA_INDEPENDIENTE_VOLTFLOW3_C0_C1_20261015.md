# Auditoría independiente — Voltflow3 C0+C1 (15 de octubre de 2026)

## Dictamen

**NOT READY para aprobar C0+C1 sin correcciones.** El paquete es técnicamente consistente, pero tres casos límite comprobados violan propiedades anunciadas del contrato de comunicaciones. No se recomienda publicarlo ni construir C2 sobre estas garantías sin cerrarlas.

El análisis se realizó sobre el RAR `Voltflow3-C0-C1-ESTADOS-COMERCIALES.rar` facilitado por el usuario. Se extrajo en entorno local aislado. No se realizaron llamadas externas, envío de mensajes, cambios en GitHub ni modificaciones del CRM original.

## Pruebas que pasan

| Control | Resultado independiente |
|---|---|
| Estados/contratos comerciales | 26/26 PASS |
| Regresiones comerciales | 8/8 PASS |
| Navegador simulado | 6/6 PASS |
| Integridad SHA256 | 148/148 PASS |
| Release | 2.9.4, build 2026.10.15.0300, PASS |
| Puerta IA de coste cero | PASS en simulación |
| Personalización de email / seguridad IA | PASS en simulación |
| Pruebas y calidad del corpus empresarial E2 | PASS; 236 observaciones, 199 establecimientos, cero fusiones falsas detectadas |
| Contratos E1 y de segmentos prioritarios | 33/33 y 15/15 PASS |
| Regresiones históricas del buscador | 7/7 PASS |
| Pruebas de direcciones E2.2 | 7/7 PASS |
| quality-check.js | PASS |
| Sintaxis comprobada | 54 archivos JS/CJS examinados; cero errores (contaje según patrón del auditor) |

No se certifica el funcionamiento real de Outlook/WhatsApp ni el rendimiento físico en el Celeron N4020. La comparación por SHA256 contra la carpeta anterior no fue posible porque esa carpeta no se aportó en este turno; sí se confirmó el manifiesto interno.

## Hallazgo 1 (alto): autorización asociada al canal, no al destinatario

`modules/commercial-communications.js`: `checkCommercialRestrictions(input)` recibe `channel` y examina `policy.channels[channel].verified` y `.sourceId`, pero **no coteja** el objetivo `input.target` con `channelPolicy.target`. Además, `ensureCommercialPermission(lead,channel,target)` llama al validador sin transmitirle `target`.

**Reproducción**: con canal email verificado para `oficina@empresa.test`, la misma autorización permite preparar y abrir otro correo dirigido a `direccion-diferente@otra-empresa.test`. Prueba directa del flujo en navegador simulado: `opened = 1`, `commercialState = PENDING_SEND_CONFIRMATION`.

**Corrección**: verificar destino normalizado y vincular autorización al identificador de contacto/canal/destino y finalidad. Si el destino difiere, devolver bloqueo y exigir nueva comprobación documentada; no sobrescribir en silencio la autorización original. Añadir prueba funcional real en simulación de integración.

## Hallazgo 2 (medio-alto): máximo cinco contactos no aplicado a la secuencia completa

`modules/commercial-communications.js`: `createDraft` solo valida `sequenceStep <= MAX_CONFIRMED_CONTACTS`, no cuenta los registros confirmados del mismo `sequenceId` y destino. `confirmSent` tampoco valida el límite acumulado.

**Reproducción**: seis borradores diferentes con el mismo `sequenceId` y `sequenceStep=1` pueden revisarse, aprobarse y confirmarse; el historial contiene **6** `SENT_CONFIRMED` para la secuencia cuyo contrato declara máximo cinco.

**Corrección**: definir claramente clave única de secuencia (empresa + persona + finalidad) y contar envíos confirmados reales, sin contar borradores. Bloquear la preparación/envío/confirmación de una sexta comunicación promocional donde aplique el límite, incluyendo reimportaciones; preservar trazabilidad de respuestas transaccionales distintas si legalmente proceden. Tests de seis envíos diferentes, dos contactos y secuencias separadas.

## Hallazgo 3 (medio-alto): conteo acepta evidencia vacía o incompleta

`modules/commercial-communications.js`: `isSentConfirmed()` devuelve verdadero cuando el estado es `SENT_CONFIRMED` y `sendConfirmation` es *truthy*, incluso `{}`, `{method:'manual_explicit'}`, un objeto de proveedor sin ID, o un string.

**Reproducción**: los cuatro registros anteriores son tratados como envíos confirmados por `getConfirmedHistory`. Puede sesgar contadores al importar/restaurar datos incompletos o mal formados.

**Corrección**: validar estructura, método, marcas temporales y campos obligatorios de acuerdo con `data/commercial-communications.v1.json`; conservar los registros defectuosos en cuarentena o estado no verificado sin destruir el origen. Tests con confirmación manual correcta, proveedor correcto, tipos incorrectos y fechas inválidas.

## Riesgos pendientes, no reproducidos como fallos concluyentes

- Apertura de WhatsApp mediante `window.open` después de operaciones `await` y confirmaciones: podría perder la activación transitoria del usuario y provocar bloqueos del popup en navegadores reales. Los mocks no prueban ese comportamiento.
- Los estados de envío manual siguen dependiendo de la declaración del usuario; sin integración externa no puede verificarse técnicamente Outlook o WhatsApp.
- Tareas largas heredadas de hasta 537 ms con CPU x4 en Chrome según Codex; aún no existe medición sobre el Celeron físico.
- Los mocks de IA gratuita y legalidad no equivalen a acreditación de cuotas de proveedor ni autorización legal para prospección comercial.

## Próximos criterios de aceptación

1. Corregir los tres fallos sin rehacer C0+C1 ni alterar los datos existentes.
2. Ejecutar `node C01_PRUEBAS_INDEPENDIENTES_20261015.cjs <raiz-del-proyecto>`; resultado esperado **3/3 PASS**.
3. Repetir los 26+8+6 tests comerciales y todos los controles históricos, asegurando que no se han debilitado las aserciones.
4. Comprobar la ruta real del destinatario cambiado, el límite acumulado y las restauraciones con confirmación incompleta.
5. Mantener los datos legacy accesibles sin contarlos como enviados; conservar aprobación humana y bloqueos de coste cero.
6. Regenerar manifiestos y presentar diff exacto, sin push, merge, deploy ni envío.

**Conclusión:** base prometedora, pero aún no debe certificarse que cualquier email contado tiene evidencia válida, que un canal aprobado autoriza solo el destinatario correcto ni que el límite de cinco contactos sea efectivo.
