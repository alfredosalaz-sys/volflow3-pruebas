# Auditoría independiente de Voltflow3 C1.1 — 16/10/2026

**Fuente auditada:** archivo enviado `Voltflow3-C1.1-CORRECCION-20261016.rar`, extraído en un directorio aislado. No se ha tocado GitHub, la versión estable ni datos reales. Todas las ejecuciones se hicieron sin llamadas externas, correo ni WhatsApp.

## Dictamen

**NOT READY para dar por cerrada C1.1 y avanzar a C2 sin condiciones.** Las tres correcciones de la auditoría anterior pasan, pero se han reproducido tres problemas adicionales relacionados con identidad persistente e idempotencia. No se recomienda reconstruir el módulo completo: corregir estas invariantes y continuar.

## Verificaciones superadas directamente

- SHA256 manifiesto: **155/155** (`node tools/verify-manifest.cjs`).
- Integridad de versión: **2.9.4 / 2026.10.15.0300**, 23 recursos.
- Pruebas anteriores de auditoría C1.1: **3/3**.
- Contrato C0+C1: **26/26**.
- Regresiones C1.1: **9/9**.
- Rutas comerciales: **8/8**; navegador simulado: **6/6**.
- Seguridad IA y control coste cero: **PASS en mocks**.
- Regresiones históricas: **7/7**; catálogo E1: **33/33**; prospectos prioritarios: **15/15**; E2: **23/23**; E2 adicional: **2/2**; direcciones E2.2: **7/7**; calidad corpus: **199 únicos, cero fusiones falsas**.
- `tools/quality-check.js`: **PASS**.
- Sintaxis Node: **58/58** archivos JS/CJS.

Esto no certifica pruebas físicas en Celeron ni la apertura real de ventanas de WhatsApp/Outlook.

## Hallazgo 1 — Crítico: enriquecimiento posterior reinicia límite de cinco

En `modules/commercial-communications.js`, `deriveIdentities()` crea un `companyId` provisional usando nombre, dirección y **website** (aprox. líneas 77-95). `contactId` y `sequenceKey` dependen del `companyId`. Tras confirmar cinco envíos, agregar la web a la **misma ficha** sin cambiar nombre, dirección, contacto, email ni finalidad cambia todos esos identificadores; `createDraft()` y `confirmSent()` aceptan un sexto envío.

Reproducción `E1` en `C11_REGRESIONES_IDENTIDAD_EVENTO_20261016.cjs`.

**Consecuencia:** enriquecer contactos o reimportar empresas —acción central del CRM— puede reiniciar indebidamente un seguimiento. Diseñar identidades estables e inmutables, o una tabla explícita de alias/equivalencias persistentes validada; preservar las unidades/sucursales distintas y los envíos históricos. Evitar resolverlo eliminando campos del hash sin analizar posibles colisiones de empresas.

## Hallazgo 2 — Alto: clave de secuencia importada tiene prioridad sobre identidad canónica

`sequenceKeyForRecord()` (aprox. líneas 145-149) usa primero `record.sequenceKey` aunque no concuerde con `companyId + contactId + purpose`. Si cinco envíos confirmados importados usan un valor de clave obsoleto, la siguiente creación y confirmación usa la clave calculada nueva y permite un sexto envío.

Reproducción `E2` usando registros reales generados por el módulo y **serializados como datos importados** con clave no canónica.

**Corrección:** resolver/equiparar claves canónicas de forma coherente, con tratamiento seguro de identidades legacy; no confiar en `sequenceId`/`sequenceKey` modificables como autoridad exclusiva; comprobar migraciones y backups no destructivos.

## Hallazgo 3 — Medio: mismo identificador de confirmación admite dos eventos

En `confirmSent()` (aprox. líneas 292-316) la validación comprueba que `confirmationId` no esté vacío, pero no contrasta su unicidad con otras confirmaciones del historial. Dos borradores distintos pueden ser confirmados con la **misma evidencia manual** y contabilizarse como dos envíos. Para el método `provider_verified` la situación equivalente se da con `providerMessageId`.

Reproducción `E3` en el archivo adicional.

**Corrección:** aplicar unicidad de identificadores de evidencia en el ámbito de proveedor/método y cuenta, evitando doble contabilización por reintento o importación. Si se trata de un evento ya registrado, conservar la trazabilidad e impedir el segundo conteo, sin perder mensajes realmente distintos.

## Evidencias y pruebas

El archivo complementario `C11_REGRESIONES_IDENTIDAD_EVENTO_20261016.cjs` contiene pruebas *black-box* contra la API real del módulo. **Resultado actual: 0/3 PASS**. Ejecución en la raíz de la entrega:

```bash
node C11_REGRESIONES_IDENTIDAD_EVENTO_20261016.cjs .
```

Las pruebas deben añadirse al quality gate **sin debilitar los casos originales**. Esperado tras corregir: 3/3 y conservación de todas las pruebas anteriores. Verificar también vía flujos de UI/persistencia (no solo la API aislada).

## Limitaciones del dictamen

- No se ha probado Chrome/WhatsApp real ni el Celeron físico.
- La confirmación manual acredita lo que declara el usuario, **no** un acuse verificable del proveedor.
- El control legal de comunicaciones solo registra verificaciones manuales; no constituye una determinación jurídica automática.
- Este informe no afirma que existan fallos en todas las configuraciones: los tres están reproducidos con entradas sintéticas plausibles y distintos caminos de persistencia.

## Recomendación

Ejecutar **C1.2, corrección pequeña de identidad y evidencia**, en una nueva copia aislada. Una vez 3/3 PASS y regresiones conservadas, avanzar a C2 —memoria comercial e identidades persistentes— con estabilidad del identificador como invariante no negociable. No publicar la versión de prueba ni cambiar `main` durante esta corrección.
