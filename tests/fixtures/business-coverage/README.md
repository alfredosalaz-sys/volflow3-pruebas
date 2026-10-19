# Corpus piloto de cobertura E2.2

## Alcance

Este directorio es un fixture de evaluacion. No es un indice de produccion y ningun modulo de la SPA lo carga. La unidad es una observacion de establecimiento, no una empresa juridica.

El corpus cubre Madrid (`28079`) y Barcelona (`08019`) en ocho sectores: dental, asesoramiento contable, inmobiliarias, comercio minorista, industria, hoteles, arquitectura y administracion de fincas.

## Fuentes

| Fuente | Recurso | Licencia aplicada | Uso E2 |
|---|---|---|---|
| Ayuntamiento de Madrid, censo de locales y actividades | `200085-5-censo-locales` | CC BY 4.0 | Corpus puntuado |
| Ajuntament de Barcelona, censo de actividades economicas en planta baja 2024 | `38babeec-5c47-43d3-84e7-b13a4b89004f` | CC BY 4.0 | Corpus puntuado |
| Diputacio de Barcelona, GIA | API `establiments` | CC BY 4.0 indicada por la respuesta | Diagnostico geografico, excluido |
| INE, relacion de municipios 2026 | Codigos `28079` y `08019` | Referencia geografica oficial | Validacion de codigos |

Las capturas se realizaron el `2026-10-15`, sin autenticacion y con un maximo de 30 filas por consulta. La hora exacta original no quedo registrada y se declara como desconocida; no se sustituye por una hora estimada. `source-manifest.json` separa captura, reindexacion y generacion del corpus, ademas de conservar URL, hash, licencia y atribucion.

## Reproduccion

La ruta normal no usa red:

```powershell
node tools/fetch-business-coverage-sources.cjs --index-existing --acquired-on 2026-10-15 --reindexed-at <ISO_REAL> --corpus-generated-at <ISO_REAL_POSTERIOR>
node tools/build-business-coverage-corpus.cjs
node tools/validate-business-coverage-corpus.cjs
node tools/business-coverage-corpus-test.cjs
node tools/business-coverage-quality.cjs
```

Una actualizacion de capturas requiere ejecutar deliberadamente `--refresh`. No debe usarse para una validacion ordinaria y cambia hashes y fecha de adquisicion.

## Etiquetado

- El sector solicitado nunca es evidencia.
- Un positivo exige coincidencia en actividad/categoria oficial o en el nombre comercial publicado por la fuente.
- Un registro sin evidencia suficiente queda `uncertain`.
- Los negativos son controles cruzados cuya actividad oficial corresponde a otro sector.
- Cada registro ambiguo conserva dos decisiones de reglas independientes; no se presentan como revision humana.
- La precision humana independiente queda pendiente de la auditoria posterior.

## Datos excluidos

No se copian NIF/CIF, referencias catastrales ni identificadores personales. Las fuentes seleccionadas no proporcionan telefono, web o correo en estos recursos; los arrays se conservan vacios y no se inventan valores.

## Correcciones E2.1

El deduplicador impide ahora la fusion automatica cuando ambas direcciones contienen unidades fisicas explicitas incompatibles. La regla es general y cubre local, puerta, planta, escalera, portal, bloque y codigos de unidad aislados. El corpus produce cero fusiones incorrectas y cero grupos de locales colapsados.

Las fechas civiles sin zona de Barcelona se canonicalizan sin depender de la zona horaria del equipo. El corpus tiene el mismo SHA256 en UTC, Europe/Madrid y America/New_York.

## Corrección E2.2

La identidad física reconoce unidades abreviadas también en el último segmento, pisos ordinales, letras de puerta y variantes de bajo derecha/izquierda. Los componentes se canonicalizan para distinguir unidades incompatibles sin impedir equivalencias inequívocas. Las siete regresiones independientes de direcciones forman parte del quality gate.

La consulta diagnostica de DIBA devuelve diez filas cuyo `adreca.nom_municipi` es Barcelona pero cuyos codigos de municipio de autoridad (`rel_municipi`) pertenecen a otros municipios. Por ello DIBA no entra en el corpus puntuado hasta aclarar la semantica del endpoint.
