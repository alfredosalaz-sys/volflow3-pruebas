# Fixtures sinteticos del contrato de catalogo

`valid-source-records.json` contiene establecimientos ficticios sin datos reales ni credenciales.

`tools/business-catalog-contract-test.cjs` copia estos registros a un directorio temporal, construye un catalogo v2 valido y genera variantes corruptas de forma aislada. Ningun fixture se carga desde la aplicacion ni modifica datos del CRM.
