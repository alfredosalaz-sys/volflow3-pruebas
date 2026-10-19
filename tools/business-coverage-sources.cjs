'use strict';

const SECTORS = Object.freeze([
  {
    id: 'dental', legacy: 'Dental', familyId: 'health-care',
    queries: { madrid: 'DENTAL', barcelona: 'DENTAL' },
    activityPatterns: [/dental/i, /odont/i], namePatterns: [/dental/i, /odont/i],
  },
  {
    id: 'accounting-advisory', legacy: 'Gestorias', familyId: 'professional-services',
    queries: { madrid: 'GESTOR', barcelona: 'GESTOR' },
    activityPatterns: [/gestor/i, /asesor/i, /assessor/i, /fiscal/i, /contab/i], namePatterns: [/gestor/i, /asesor/i, /assessor/i],
  },
  {
    id: 'real-estate-agencies', legacy: 'Inmobiliarias', familyId: 'property-services',
    queries: { madrid: 'INMOBILIARIA', barcelona: 'IMMOBILIÀRIES' },
    activityPatterns: [/inmobili/i, /real estate/i, /immobili/i], namePatterns: [/inmobili/i, /immobili/i],
  },
  {
    id: 'retail', legacy: 'Retail', familyId: 'commerce-hospitality',
    queries: { madrid: 'COMERCIO AL POR MENOR', barcelona: 'COMERÇ' },
    activityPatterns: [/comercio al por menor/i, /comerc al detall/i, /retail/i, /botig/i, /tienda/i], namePatterns: [/tienda/i, /shop/i, /botiga/i],
  },
  {
    id: 'industry', legacy: 'Industrial', familyId: 'industry',
    queries: { madrid: 'INDUSTRIA', barcelona: 'INDÚSTRIA' },
    activityPatterns: [/industri/i, /manufactur/i, /fabricaci/i, /taller/i], namePatterns: [/industrial/i, /fabrica/i, /taller/i],
  },
  {
    id: 'hotels-hospitality', legacy: 'Hoteles', familyId: 'commerce-hospitality',
    queries: { madrid: 'HOTEL', barcelona: 'HOTEL' },
    activityPatterns: [/hotel/i, /hostal/i, /allotjament/i, /alojamiento/i], namePatterns: [/hotel/i, /hostal/i],
  },
  {
    id: 'architects', legacy: 'Arquitectos', familyId: 'professional-services',
    queries: { madrid: 'ARQUITECT', barcelona: 'ARQUITECT' },
    activityPatterns: [/arquitect/i], namePatterns: [/arquitect/i],
  },
  {
    id: 'property-management', legacy: 'AdministradoresFincas', familyId: 'property-services',
    queries: { madrid: 'FINCAS', barcelona: 'FINQUES' },
    activityPatterns: [/administraci[oó].*fincas/i, /administraci[oó].*finques/i, /gesti[oó].*comunit/i], namePatterns: [/fincas/i, /finques/i],
  },
]);

const SOURCES = Object.freeze({
  madrid: {
    id: 'madrid_open_data_activities',
    city: 'Madrid',
    provinceCode: '28',
    municipalityCode: '28079',
    resourceId: '200085-5-censo-locales',
    api: 'https://datos.madrid.es/api/3/action/datastore_search',
    datasetUrl: 'https://datos.madrid.es/egob/catalogo/200085-0-censo-locales',
    licenseId: 'madrid-cc-by-4-0',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Ayuntamiento de Madrid',
    maxPerQuery: 30,
  },
  barcelona: {
    id: 'barcelona_open_data_ground_floor_2024',
    city: 'Barcelona',
    provinceCode: '08',
    municipalityCode: '08019',
    resourceId: '38babeec-5c47-43d3-84e7-b13a4b89004f',
    api: 'https://opendata-ajuntament.barcelona.cat/data/api/action/datastore_search',
    datasetUrl: 'https://opendata-ajuntament.barcelona.cat/data/es/dataset/cens-locals-planta-baixa-act-economica',
    licenseId: 'barcelona-cc-by-4-0',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Ajuntament de Barcelona',
    maxPerQuery: 30,
  },
});

const DEFERRED_SOURCES = Object.freeze([
  { id: 'diba_gia', reason: 'Geographic semantics require review; retained as diagnostic only in E2.' },
  { id: 'overture_places_static', reason: 'Offline pilot belongs to E3.' },
  { id: 'geofabrik_osm_static', reason: 'Offline pilot belongs to E4.' },
]);

function buildQueryUrl(source, sector, limit = source.maxPerQuery) {
  const url = new URL(source.api);
  url.searchParams.set('resource_id', source.resourceId);
  url.searchParams.set('limit', String(Math.min(limit, source.maxPerQuery)));
  url.searchParams.set('q', sector.queries[source.city.toLowerCase()]);
  return url.toString();
}

function rawFileName(sourceKey, sectorId) {
  return `${sourceKey}-${sectorId}.json`;
}

module.exports = { SECTORS, SOURCES, DEFERRED_SOURCES, buildQueryUrl, rawFileName };
