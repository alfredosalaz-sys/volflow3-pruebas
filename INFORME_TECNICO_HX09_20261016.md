# Informe tecnico HX09

Fecha: 2026-10-16

Base intacta: `Voltflow3-IMPORTACION-HISTORICA-HX08-20261016`.

Entrega aislada: `Voltflow3-IMPORTACION-HISTORICA-HX09-20261016`.

Version conservada: 2.9.4, build 2026.10.15.0300.

## Defecto reproducido

HX08 leia una lista inicial de journals, aplicaba sus eventos mediante el interceptor publico y eliminaba despues cada journal completo. Si otra pestana adquiria un fence durante el bucle, el interceptor podia volver a encolar el evento en el mismo journal que luego era eliminado. La regresion independiente reprodujo `applied: false` y `preserved: false`.

## Correccion localizada

Solo cambia el modulo funcional `modules/write-coordinator.js`:

1. El replay posee y renueva un lock verificable.
2. La adquisicion de un fence comprueba ese lock antes y despues de publicar su lease.
3. Cada evento comprueba lock y fence antes de aplicar.
4. La operacion se ejecuta con el metodo nativo y se verifica contra el almacenamiento efectivo.
5. Se vuelven a comprobar lock y fence despues de aplicar.
6. Solo entonces se reconoce ese identificador concreto y se retira del journal.
7. Nunca se elimina un journal completo usando una lista leida al inicio.
8. Si cambia la exclusividad antes del reconocimiento, el evento permanece duradero aunque el valor ya se hubiera aplicado. La revision cambia para que una restauracion concurrente se cancele de forma segura.

La propiedad exigida queda expresada por evento: aplicado y reconocido, o conservado en journal. Un evento aplicado durante una duda de coordinacion permanece tambien pendiente para sobrevivir a un posible rollback.

## Evidencia

La prueba independiente reproduce el entrelazado exacto dentro de `replayQueued()`. La prueba ampliada usa tres eventos y demuestra reconocimiento parcial y recuperacion posterior. Chrome usa dos pestanas reales, perfil temporal, red externa bloqueada y CPU x4: comprueba un fence readquirido, preservacion del journal, rechazo con `PERSISTENCE_REPLAY_IN_PROGRESS` y replay posterior completo.

No se usaron datos reales, claves reales, APIs externas, GitHub ni el perfil habitual de Chrome.

## Limites

`localStorage` no ofrece transacciones multiclave. La garantia depende de que los escritores de la aplicacion utilicen el coordinador y sus interceptores. Codigo hostil o externo que invoque primitivas nativas capturadas fuera de este protocolo podria eludirlo.

No se probo un Celeron N4020 fisico ni backups reales antiguos autorizados.

## Dictamen

READY para auditoria independiente de HX09. No autoriza todavia recuperacion sobre datos reales ni avance a C2.
