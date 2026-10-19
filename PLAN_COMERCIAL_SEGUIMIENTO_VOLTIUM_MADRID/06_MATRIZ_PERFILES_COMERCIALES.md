# Matriz de integración con perfiles comerciales

| Perfil | Rol | Primer enfoque | Seguimientos posibles | CTA apropiada | Datos especialmente útiles |
|---|---|---|---|---|---|
| Administradores de fincas | cliente directo | mantenimiento y resolución de incidencias en comunidades | zonas comunes, rehabilitación, disponibilidad para presupuestos | conocer necesidades/entrar como proveedor | comunidades gestionadas solo si es público, responsable, teléfono/email corporativo |
| Arquitectos técnicos | colaborador/prescriptor | capacidad de ejecución coordinada | presupuesto de obra, apoyo de ejecución, rehabilitación | presentarse como empresa ejecutora | nombre/cargo profesional, estudio, proyectos publicados verificables |
| Arquitectos/estudios | colaborador/prescriptor | colaboración para ejecutar proyectos | reformas integrales, adecuación, rehabilitación | conversación breve sobre colaboración | especialidad publicada, responsable, web/portfolio sin inferir necesidades |
| Inmobiliarias | cliente/prescriptor | puesta a punto de inmuebles para venta/alquiler | reparaciones, adecuación, apoyo a propietarios | valorar inmueble/proveedor de confianza | oficina/sede, contacto, cartera solo si fuente lícita |
| Gestión patrimonial | cliente directo | mantenimiento y adecuación de activos | reforma de cartera, rehabilitación, continuidad | reunión para necesidades recurrentes | rol patrimonial confirmado; evitar confundir patrimonio financiero |

## Reglas comunes

- `commercialRoles` procede del contrato, no se deduce por preferencia del usuario.
- Una empresa puede tener varios perfiles/roles con evidencia separada.
- El mensaje elige un solo rol y objetivo principal por comunicación.
- Una gestoria administrativa permanece `accounting-advisory`.
- Arquitectura general y técnica no se separan solo por CNAE 7111 u OSM `office=architect`.
- Mappings `candidate`, `broad-candidate` o `requires-*` no se activan sin validación E3/E4.

## Correspondencia con secuencia

| Paso | Cliente directo | Colaborador/prescriptor |
|---|---|---|
| 1 | resolver necesidad operativa | capacidad y encaje de colaboración |
| 2 | ventaja práctica distinta | facilidad de coordinación |
| 3 | caso de uso sectorial verificable | tipo de proyecto donde aportar valor |
| 4 | disponibilidad futura/mantenimiento | quedar como empresa ejecutora alternativa |
| 5 | cierre respetuoso | puerta abierta para futuros proyectos |

## Scoring por dimensión

No usar un único score opaco. Mostrar:

- `dataQuality`: completitud, procedencia, actualidad y conflictos.
- `contactability`: canal corporativo y responsable.
- `commercialFit`: sector, rol, geografía y servicio.
- `engagement`: hechos de respuesta/reunión/presupuesto.
- `legalReadiness`: estado legal y exclusión.

`commercialFit` no afirma intención de compra. `engagement` solo aumenta por hechos confirmados. `legalReadiness` actúa como gate, no como incentivo comercial.

