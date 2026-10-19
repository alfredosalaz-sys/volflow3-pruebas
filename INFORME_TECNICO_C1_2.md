# Voltflow3 C1.2 - Informe tecnico

Fecha: 2026-10-16  
Base inalterada: `Voltflow3-C1.1-CORRECCION-20261016`  
Entrega aislada: `Voltflow3-C1.2-CORRECCION-20261016`  
Version conservada: 2.9.4, build `2026.10.15.0300`

## Dictamen

**READY para auditoria independiente de C1.2.** No constituye autorizacion de publicacion ni de avance automatico a C2.

Las tres regresiones independientes pasan 3/3. La cobertura adicional C1.2 pasa 8/8 y permanecen verdes C0+C1, C1.1, buscador, E1, segmentos, E2.2, IA, seguridad y corpus.

## Problemas corregidos

### Identidad estable ante enriquecimiento

`deriveIdentities()` reutiliza primero las referencias persistentes de `lead.commercialRefs`. Si faltan, crea una ancla estable a partir del identificador CRM, no de web o direccion, y la conserva en la ficha. Empresa y establecimiento disponen de referencias separadas. La reimportacion que conserva esas referencias mantiene el historial incluso si cambia el ID local de la copia.

Cada registro nuevo incluye equivalencias explicitas con procedencia y estado de verificacion. Los registros C1/C1.1 anteriores no se modifican: `sequenceKeyForRecord()` puede resolverlos mediante `leadId`, contacto normalizado y finalidad.

### Autoridad canonica de secuencia

El contador ya no acepta `sequenceKey` ni `sequenceId` almacenados como autoridad cuando existen datos canonicos. Esas claves se conservan para trazabilidad, pero se recalcula la identidad efectiva. El limite de cinco se aplica al crear y confirmar.

El mismo `companyId` asociado a anclas canonicas incompatibles produce `COMMERCIAL_IDENTITY_COLLISION`. Dos sucursales pueden compartir empresa y mantienen `establishmentId` distintos.

### Idempotencia de evidencia

Antes de confirmar se construye una clave de evento:

- Manual: metodo, usuario confirmante e `confirmationId`.
- Proveedor: metodo, proveedor, cuenta y `providerMessageId`.

Una evidencia ya contabilizada genera `COMMERCIAL_CONFIRMATION_EVIDENCE_DUPLICATE`. El segundo registro permanece pendiente y conserva en `confirmationAttempts` la referencia al evento conflictivo. Los mensajes con evidencia realmente independiente siguen permitidos.

## Persistencia y compatibilidad

Las referencias se guardan dentro de la ficha existente y los eventos dentro de `gordi_email_history`; no se crea una clave de almacenamiento, migracion masiva ni borrado. `saveLeads()` se utiliza en la accion comercial para persistir las referencias antes de continuar. Backups y restauracion conservan los campos por serializacion JSON.

No se modificaron buscador, corpus, taxonomia, IndexedDB, claves, controles de coste cero ni version. C2-C7 no se han iniciado.

## Riesgos residuales

- Un registro historico sin `leadId`, identificador empresarial ni equivalencia explicita no puede vincularse automaticamente sin riesgo de fusion incorrecta; requiere revision y equivalencia verificada.
- Una confirmacion manual acredita la declaracion del usuario, no un acuse del proveedor.
- La identidad provisional de fichas excepcionales sin ID debe revisarse antes de fusionarlas con otra empresa.
- Chrome/WhatsApp real y Celeron fisico permanecen fuera de esta correccion y no se declaran probados.

## Recomendacion

Aceptar C1.2 para auditoria independiente. C2 puede apoyarse en estas invariantes solo despues de esa revision y sin convertir automaticamente coincidencias ambiguas en equivalencias.
