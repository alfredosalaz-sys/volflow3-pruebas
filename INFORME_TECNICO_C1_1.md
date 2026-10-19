# Voltflow3 C1.1 - Informe tecnico

Fecha: 2026-10-16  
Base inalterada: `Voltflow3-C0-C1-ESTADOS-COMERCIALES`  
Entrega aislada: `Voltflow3-C1.1-CORRECCION-20261016`  
Version conservada: 2.9.4, build `2026.10.15.0300`

## Dictamen

**READY para auditoria independiente de C1.1.** No constituye autorizacion de publicacion. No se ha realizado commit, push, merge, despliegue, envio real ni llamada facturable.

Los tres defectos reproducidos por la auditoria pasan 3/3. Los contratos C0+C1, sus rutas y el navegador simulado conservan 26/26, 8/8 y 6/6. La comprobacion visible del popup de WhatsApp en Chrome real queda pendiente por una incidencia del arnes CDP descrita en Resultados.

## Correcciones

### Autorizacion por destinatario

`checkCommercialRestrictions()` exige coincidencia exacta de canal, destino normalizado, `contactId`, finalidad y `sourceId`. Los permisos antiguos que solo indicaban `verified` no se convierten automaticamente: requieren revision expresa. Las nuevas revisiones se agregan como autorizaciones independientes y no destruyen las anteriores.

### Limite real de secuencia

La secuencia canonica se calcula con `companyId + contactId + purpose`. El valor editable `sequenceId` deja de ser una via para reiniciar el contador. El maximo de cinco confirmados se verifica tanto al crear como al confirmar, cubriendo borradores precreados, reintentos y reimportaciones. Contactos y finalidades diferentes conservan secuencias independientes.

### Evidencia estricta

`isSentConfirmed()` solo acepta objetos completos:

- Manual: `confirmedBy`, `confirmationId` y `confirmedAt` valido.
- Proveedor: `provider`, `providerMessageId` y `verifiedAt` valido.

Los registros defectuosos permanecen intactos, quedan fuera de las metricas y muestran que la evidencia es incompleta. Se corrigio ademas la persistencia de `verifiedAt` para confirmaciones de proveedor validas.

### Rutas reales

Plantillas, correo IA y WhatsApp usan la finalidad `b2b_prospecting`; las respuestas usan `commercial_reply`. Todas pasan por `prepareCommercialMessageAndOpen()`. WhatsApp reserva `about:blank` sincronicamente antes de esperar permisos o persistencia y solo navega esa ventana despues de superar los controles.

## Compatibilidad

No se ha modificado `gordi_leads`, IndexedDB, backups, taxonomia, buscador, corpus, claves ni controles de coste cero. Los historiales legacy no se reescriben ni se contabilizan como confirmados. C2-C7 permanecen fuera de alcance.

## Riesgos pendientes

- Una SPA estatica no puede verificar por si sola un envio desde Outlook o WhatsApp; sigue siendo necesaria confirmacion manual explicita.
- La comprobacion visual del comportamiento de popup depende de politicas y extensiones del navegador. Debe repetirse manualmente en un perfil aislado antes de publicar.
- El estado juridico de una comunicacion es una declaracion revisada por el usuario, no asesoramiento ni validacion legal automatica.

## Recomendacion

Aceptar C1.1 para auditoria independiente. No avanzar a C2 ni publicar hasta completar la revision independiente y la prueba manual de popup en Chrome aislado.
