# Resultados de pruebas

## Importacion historica

- H01-H20: 20/20 PASS.
- Chrome aislado: 6 etapas PASS con CPU throttling x4.
- Etapas Chrome: fusion, tres reinicios, restauracion en perfil vacio y rollback.
- Red externa: bloqueada mediante CDP.
- Datos y claves: exclusivamente sinteticos.

## Regresiones conservadas

- B01-B20 backup cifrado: 20/20 PASS.
- Buscador historico independiente: 7/7 PASS.
- C0+C1: 26/26 PASS.
- Rutas comerciales: 8/8 PASS.
- Navegador comercial simulado: 6/6 PASS.
- C1.1 independiente: 3/3 PASS; ampliado: 9/9 PASS.
- C1.2 independiente: 3/3 PASS; ampliado: 8/8 PASS.
- E1: 33/33 PASS.
- Segmentos prioritarios: 15/15 PASS.
- E2.1: 23/23 PASS.
- E2: 2/2 PASS.
- E2.2 direcciones: 7/7 PASS.
- Corpus: 236 observaciones, 199 establecimientos, 0 fusiones falsas, 0 duplicados residuales y 0 sucursales colapsadas.
- IA coste cero, personalizacion y seguridad: PASS.
- `quality-check.js`: PASS.

El archivo `RESULTADOS_NAVEGADOR_IMPORTACION_HISTORICA.json` contiene la evidencia estructurada sin secretos. No se ha realizado prueba fisica en un Celeron N4020 ni prueba con datos reales del usuario.
