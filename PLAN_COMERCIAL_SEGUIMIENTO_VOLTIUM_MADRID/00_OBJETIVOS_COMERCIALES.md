# Objetivos comerciales de Voltium Madrid

## Proposito

Voltflow3 debe convertir descubrimiento empresarial en actividad comercial trazable para Voltium Madrid. El resultado no es una lista, sino una cadena verificable:

```text
BUSCAR -> IDENTIFICAR CONTACTO -> INVESTIGAR -> CUALIFICAR
       -> REDACTAR -> REVISAR -> PREPARAR EN OUTLOOK
       -> CONFIRMAR ENVIO -> INTERPRETAR RESPUESTA -> SEGUIR -> OPORTUNIDAD
```

Actividad de Voltium Madrid: reformas, obras, rehabilitacion, reparaciones y mantenimiento. Web corporativa declarada: `https://www.voltiummadrid.es`.

## Resultado comercial prioritario

1. Encontrar una empresa o establecimiento dentro de cobertura conocida.
2. Obtener un canal corporativo legitimo, trazable y vigente.
3. Identificar responsable y cargo solo cuando una fuente profesional publica lo permita.
4. Determinar el rol comercial: cliente directo, colaborador o prescriptor.
5. Preparar un mensaje basado exclusivamente en datos verificados y contexto sectorial honesto.
6. Exigir revision humana y condicion legal antes de preparar Outlook.
7. Registrar como enviado solo aquello que el usuario confirme o que una integracion fiable acredite.
8. Mantener historial, siguiente accion, oposiciones y oportunidad sin reiniciar al reimportar.

## Segmentos prioritarios

Se reutilizan los cinco perfiles de `data/prospecting-priorities.v1.json` sobre cuatro sectores E2.2. No se crean categorias nuevas:

| Perfil | Sector canonico | Rol principal | Valor para Voltium |
|---|---|---|---|
| Administradores de fincas/comunidades | `property-management` | cliente directo | mantenimiento, zonas comunes, rehabilitacion |
| Aparejadores/arquitectos tecnicos | `technical-architects` | colaborador/prescriptor | ejecucion, presupuestos y coordinacion de obra |
| Arquitectos/estudios | `architects` | colaborador/prescriptor | ejecucion de proyectos, reformas y rehabilitacion |
| Inmobiliarias | `real-estate-agencies` | cliente/prescriptor | puesta a punto, reparaciones y adecuacion |
| Gestion patrimonial/inmuebles | `property-management` | cliente directo | mantenimiento de carteras y reforma de activos |

Hoteles, oficinas, comercios, centros educativos/deportivos e industria siguen disponibles como segmentos no eliminados.

## Principios de producto

- Un nombre empresarial sin contacto util no es un exito comercial completo.
- Un borrador no es un correo enviado; abrir Outlook tampoco lo es.
- Una respuesta suspende la secuencia de ausencia de respuesta.
- Una oposicion bloquea salidas desde el primer indicio y nunca se desbloquea por IA.
- La IA propone; el usuario revisa, aprueba y decide el envio.
- La calidad del dato y la probabilidad comercial son dimensiones distintas.
- Coste externo obligatorio: 0 EUR. Si no se acredita el proveedor gratuito, la IA queda cerrada.
- Los mappings no validados siguen desactivados.

## Metricas de exito

Se conservan las cinco metricas contractuales: empresas encontradas, establecimientos unicos, contactos utiles, responsables identificados y correos personalizados preparados.

Se agregan: empresas con telefono/email, personalizacion suficiente, condicion legal acreditada, borradores generados/aprobados, envios confirmados, seguimientos, respuestas, oportunidades, solicitudes de presupuesto, presupuestos aceptados y clientes/trabajos logrados.

Las tasas usan denominadores visibles. Datos sinteticos o mocks se etiquetan como pruebas, nunca como resultados comerciales reales.

## Estado actual

| Capacidad | Estado |
|---|---|
| Taxonomia y perfiles prioritarios | PROBADO AUTOMATICAMENTE, runtime desactivado |
| Busqueda/dedupe E2.2 | PROBADO AUTOMATICAMENTE sobre corpus; no nacional en produccion |
| Generacion/edicion IA | OPERATIVA EN CODIGO y probada con mocks |
| Proveedor IA real gratuito para una cuenta concreta | PENDIENTE DE VERIFICACION REAL |
| Historial de emails y pipeline legacy | OPERATIVO EN CODIGO, modelo insuficiente |
| Estado fiable borrador/aprobado/enviado | NO IMPLEMENTADO |
| Secuencia persistente de hasta cinco contactos | PROTOTIPO PARCIAL no fiable |
| Analisis de respuestas pegadas | PROTOTIPO OPERATIVO, clasificacion incompleta |
| Exclusion global persistente | DISEÑADO, no implementado |
| Panel comercial unificado | DISEÑADO, no implementado |

