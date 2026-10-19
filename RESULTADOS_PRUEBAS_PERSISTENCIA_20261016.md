# Resultados de pruebas

## Nuevas pruebas

- B01-B20: **20/20 PASS**. Evidencia detallada en `RESULTADOS_B01_B20.json`.
- Chrome aislado x4: **PASS** en seis etapas: creación, lectura desde disco, restauración en perfil limpio, rollback por corte simulado y tres reinicios. Evidencia en `RESULTADOS_NAVEGADOR_RESTAURACION.json`.
- Binarios: recuperación byte a byte PASS; referencias externas permanecen `included:false`.
- Cifrado: ningún secreto sintético aparece en el contenedor JSON.
- Cloud: GitHub y JSONBin no alcanzan `fetch` para push/pull de snapshots.

## Regresiones

- Regresiones del buscador: 7/7.
- Catálogo E1: 33/33.
- Segmentos prioritarios: 15/15.
- Comunicaciones C0+C1: 26/26.
- Rutas comerciales: 8/8.
- Navegador simulado comercial: 6/6.
- C1.1: 3/3 independiente y 9/9 ampliadas.
- C1.2: 3/3 independiente y 8/8 ampliadas.
- E2.1: 23/23 contratos y 2/2 independientes.
- E2.2 direcciones: 7/7.
- IA coste cero, personalización y seguridad: PASS.
- Corpus: 236 observaciones, 199 establecimientos, cero fusiones falsas, duplicados residuales o sucursales colapsadas.
- Quality check: PASS.
- Sintaxis: 59 JS/CJS PASS.
- Total de comandos de regresión existentes ejecutados: 26/26 PASS.

## Rendimiento medido

- Prueba Node de 11.820 leads: construcción y cifrado bajo el umbral contractual de 30 s; el último registro detallado está en `RESULTADOS_B01_B20.json`.
- Chrome con CPU throttling x4, fixture pequeño: creación cifrada ~132 ms y restauración ~218 ms en la ejecución registrada.
- Equipo de ejecución: Intel Core i9-11900KF.
- Celeron N4020 físico: **PENDIENTE DE PRUEBA REAL**. No se extrapola cumplimiento.

## Limitación bloqueante

No se ha aprobado la fusión histórica relacional sobre una instalación con trabajo nuevo. El dictamen global es NOT READY aunque las pruebas implementadas pasen.

