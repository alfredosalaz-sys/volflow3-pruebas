# Voltflow3 C0 + C1 - Informe tecnico

Fecha: 2026-10-15  
Base aislada: `Voltflow3-PLAN-COMERCIAL-SEGUIMIENTO-20261015`  
Entrega: `Voltflow3-C0-C1-ESTADOS-COMERCIALES`  
Version conservada: 2.9.4, build `2026.10.15.0300`

## Dictamen

**READY para revision independiente de C0+C1.** No es una autorizacion de publicacion. No se ha realizado commit, push, merge, despliegue, llamada facturable ni envio real.

Los criterios verificables de C0 y C1 pasan. El rendimiento fisico del Celeron N4020 no se ha probado; Chrome aislado con CPU x4 es una aproximacion y no sustituye esa prueba.

## Defecto reproducido

Los flujos de plantilla, IA y WhatsApp insertaban inmediatamente un registro `Enviado` o `Enviado (IA)` tras ejecutar `mailto:` o `window.open()`. Tambien adelantaban `first_contact_date` y el estado del lead. Los paneles y campañas contaban todos los elementos de `emailHistory`, incluidos borradores, respuestas y registros ambiguos.

La regresion conserva una representacion del comportamiento anterior y demuestra que un registro legacy `Enviado` asociado solo a una apertura no constituye una confirmacion valida.

## C0 implementado

- Contrato ejecutable en `data/commercial-communications.v1.json`.
- Nueve estados y transiciones cerradas.
- Limite contractual de cinco comunicaciones por secuencia.
- IDs estables y separados para empresa, establecimiento y contacto; oportunidad y secuencia quedan opcionales para fases posteriores.
- Confirmacion `manual_explicit` y `provider_verified` con evidencia obligatoria distinta.
- Restricciones bloqueantes para oposicion, canal no verificado, fuente ausente y condicion legal no permitida.
- Compatibilidad con `prospecting-priorities.v1.json` y taxonomia 1.1.0 sin activar mappings.
- Politica legacy no destructiva: `Enviado` y `Enviado (IA)` se leen como `LEGACY_SENT_UNVERIFIED`, conservando el registro original y excluyendolo de contadores confirmados.
- Validador bloqueante, fixtures positivos/negativos y quality gate de GitHub Actions.

## C1 implementado

- Pasarela unica en `modules/commercial-communications.js` para crear, revisar, aprobar, abrir cliente externo, dejar pendiente y confirmar.
- Plantillas, correo IA, respuestas IA y WhatsApp usan la pasarela.
- Copiar contenido crea o reutiliza un borrador; no cambia el lead ni acredita envio.
- Outlook, `mailto:` y WhatsApp quedan en `PENDING_SEND_CONFIRMATION` tras abrirse.
- Un cliente externo bloqueado conserva el borrador aprobado sin registrar una apertura.
- Solo una confirmacion explicita o una evidencia de proveedor valida crea `SENT_CONFIRMED`.
- La confirmacion repetida es idempotente.
- `first_contact_date`, `ttfc_hours`, `Contactado` y la actividad de envio solo se actualizan tras la confirmacion.
- Dashboard, objetivos, copiloto, campañas y contextos de IA que dicen "enviados" consumen exclusivamente historial confirmado.
- Seguimiento e hilo muestran el estado efectivo y ofrecen confirmar manualmente los registros pendientes.
- Las respuestas entrantes nuevas incluyen estado e identidades C1; los registros previos siguen siendo legibles.

## Persistencia y seguridad

No se ha creado una nueva clave `gordi_*`, no se ha modificado IndexedDB y no existe migracion masiva. Los campos C1 viajan dentro de `gordi_email_history`, ya incluido en snapshots, exportaciones y backups. La copia aislada completa constituye el punto de recuperacion previo y el test contractual verifica serializacion/restauracion de datos C1 y legacy.

No se han incluido API keys en contratos, fixtures o informes. Las protecciones de IA de coste cero permanecen intactas y sus pruebas pasan.

## Alcance no implementado

- C2-C7 no se han iniciado.
- No existe todavia orquestacion automatica de cinco contactos, analisis de respuestas, oportunidades ni panel comercial nuevo.
- No existe confirmacion automatica de Outlook/WhatsApp; sin integracion verificable, el usuario confirma manualmente.
- No se afirma que los estados legacy ambiguos representen envios reales.
- No se ha probado el equipo Celeron N4020 fisico.

## Riesgos residuales

- Una aplicacion estatica no puede demostrar por si sola que Outlook o WhatsApp enviaron el mensaje; la confirmacion manual conserva esa limitacion de forma explicita.
- Los datos legacy no cuentan como envios hasta una revision futura; esto puede reducir cifras historicas frente a la interfaz anterior, pero evita afirmar envios sin evidencia.
- Chrome x4 observo tareas largas heredadas: maximo de arranque 537 ms y maximo durante operacion 156 ms. C0+C1 no añade trabajo automatico de arranque significativo, pero este resultado exige mantener la validacion fisica pendiente.
- La condicion legal se registra mediante revision expresa del usuario; no constituye asesoramiento juridico ni una verificacion automatica externa.

## Recomendacion

Aprobar C0+C1 para auditoria independiente. Antes de publicar, repetir el quality gate desde una copia limpia, revisar manualmente un correo y un WhatsApp sin enviarlos y ejecutar el protocolo fisico del Celeron. No avanzar a C2 hasta aceptar expresamente este contrato de estados.
