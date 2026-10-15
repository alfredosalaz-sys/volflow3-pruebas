'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const searchSource = fs.readFileSync(path.join(root, 'modules', 'search.js'), 'utf8');
const providersSource = fs.readFileSync(path.join(root, 'modules', 'business-providers.js'), 'utf8');

function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    key: index => [...map.keys()][index] || null,
    get length() { return map.size; },
  };
}

function makePlace(overrides = {}) {
  return {
    id: overrides.id || 'place-1',
    displayName: overrides.displayName || 'Clinica Dental Centro',
    formattedAddress: overrides.formattedAddress || 'Calle Mayor 1, Madrid',
    rating: overrides.rating ?? 4.4,
    userRatingCount: overrides.userRatingCount ?? 37,
    websiteURI: overrides.websiteURI || 'https://clinicacentro.example',
    types: overrides.types || ['dentist', 'health'],
    businessStatus: overrides.businessStatus || 'OPERATIONAL',
    location: overrides.location || { lat: () => 40.42, lng: () => -3.7 },
    ...overrides,
  };
}

function createContext(searchByText, options = {}) {
  const logs = [];
  const initialStorage = {
    gordi_api_key: 'AIza_mock_key_for_tests',
    gordi_places_field_mode: options.fieldMode || 'balanced',
  };
  if (options.allowGoogle !== false) {
    initialStorage.gordi_zero_cost_google_places_hard_quota_confirmed = 'true';
    initialStorage.gordi_zero_cost_allow_google_places = 'true';
  }
  const storage = createStorage(initialStorage);
  const sessionStorage = createStorage();
  const elementValues = {
    'plan-radius': { value: String(options.radius || 10) },
    'plan-multi-toggle': { checked: !!options.multi },
  };
  const ctx = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    URL,
    URLSearchParams,
    Date,
    Math,
    JSON,
    AbortController,
    AbortSignal,
    localStorage: storage,
    sessionStorage,
    window: null,
    document: {
      getElementById(id) {
        if (id === 'google-maps-script') return { id };
        return elementValues[id] || null;
      },
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return { style: {}, set id(value) { this._id = value; }, get id() { return this._id; } }; },
      head: { appendChild() {} },
    },
    location: { hash: '', href: 'http://localhost/app.html', origin: 'http://localhost' },
    fetch: options.fetch || (async () => ({ ok: true, json: async () => ({ elements: [] }), text: async () => '' })),
    google: {
      maps: {
        async importLibrary(name) {
          if (name === 'core') return {};
          if (name === 'geocoding') {
            return {
              Geocoder: class {
                geocode(_request, cb) {
                  cb([{ geometry: { location: { lat: () => 40.42, lng: () => -3.7 } } }], 'OK');
                }
              },
            };
          }
          if (name === 'places') return { Place: { searchByText } };
          return {};
        },
      },
    },
    getSegmentQueries(segment) {
      if (segment === 'Dental') return ['clinica dental'];
      if (segment === 'Industrial') return ['nave industrial'];
      return [segment];
    },
    decorateContactQuality(company) { return company; },
    decorateResultExplanation(company) { return company; },
    logEnrich(message, type) { logs.push({ message, type }); },
    recordSearchCoverage() {},
    leads: [],
    radiusCenterCoords: null,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(providersSource, ctx, { filename: 'modules/business-providers.js' });
  const sourceForMode = options.zeroCost === false
    ? searchSource.replace('const ZERO_COST_MODE = true;', 'const ZERO_COST_MODE = false;')
    : searchSource;
  vm.runInContext(sourceForMode, ctx, { filename: 'modules/search.js' });
  ctx.getSegmentQueries = function getMockSegmentQueries(segment) {
    if (segment === 'AdministradoresFincas') return ['administracion de fincas'];
    if (segment === 'Inmobiliarias') return ['inmobiliaria'];
    if (segment === 'Gestorias') return ['gestoria'];
    return ['clinica dental'];
  };
  ctx.__logs = logs;
  return ctx;
}

async function expectStatus(name, searchByText, expectedStatus, extra = {}) {
  const ctx = createContext(searchByText, { ...extra, zeroCost: false });
  try {
    const results = await ctx.fetchPlaces(extra.segment || 'Dental', 'Madrid', extra.maxResults || 20, { forceGooglePlaces: true });
    assert.strictEqual(results.__placesDiagnostics.status, expectedStatus, name);
    return { ctx, results };
  } catch (err) {
    assert.strictEqual(err.placesStatus, expectedStatus, name);
    return { ctx, error: err };
  }
}

(async () => {
  {
    const { results } = await expectStatus(
      'API operativa con resultados',
      async () => ({ places: [makePlace()] }),
      'SUCCESS_WITH_RESULTS'
    );
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'Clinica Dental Centro');
    assert.ok(results[0].website);
  }

  {
    const { results } = await expectStatus(
      'API operativa sin resultados',
      async () => ({ places: [] }),
      'SUCCESS_EMPTY'
    );
    assert.strictEqual(results.length, 0);
    assert.ok(results.__placesDiagnostics.successfulSearchResponses > 0);
  }

  await expectStatus('Clave invalida', async () => { throw new Error('InvalidKeyMapError'); }, 'AUTH_ERROR');
  await expectStatus('Restriccion de dominio', async () => { throw new Error('RefererNotAllowedMapError'); }, 'AUTH_ERROR');
  await expectStatus('Facturacion deshabilitada', async () => { throw new Error('BillingNotEnabledMapError'); }, 'BILLING_ERROR');
  await expectStatus('Cuota agotada', async () => { throw new Error('RESOURCE_EXHAUSTED quota exceeded'); }, 'QUOTA_EXCEEDED');

  {
    const { results } = await expectStatus(
      'Error de red',
      async () => { throw new Error('Failed to fetch'); },
      'NETWORK_ERROR'
    );
    assert.strictEqual(results.length, 0);
    assert.ok(results.__placesDiagnostics.failedQueries > 0);
  }

  {
    const { results } = await expectStatus(
      'Campos incompletos',
      async () => ({ places: [makePlace({ id: '', websiteURI: '', rating: undefined, userRatingCount: undefined })] }),
      'SUCCESS_WITH_RESULTS'
    );
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].website, '');
    assert.strictEqual(results[0].ratingCount, 0);
  }

  {
    const { results } = await expectStatus(
      'Sectores solapados y getMergeableSectors',
      async () => ({ places: [makePlace({ displayName: 'Administracion de Fincas Madrid', types: ['real_estate_agency'] })] }),
      'SUCCESS_WITH_RESULTS',
      { segment: 'AdministradoresFincas' }
    );
    assert.ok(results[0].matchedSectors.includes('AdministradoresFincas'));
    assert.deepStrictEqual(ctxGetMergeable(results[0]), results[0].matchedSectors);
  }

  {
    const { results } = await expectStatus(
      'Negocio relevante no excluido por tipo ambiguo',
      async () => ({ places: [makePlace({ displayName: 'Inmobiliaria Motor 12', types: ['real_estate_agency', 'car_repair'] })] }),
      'SUCCESS_WITH_RESULTS',
      { segment: 'Inmobiliarias' }
    );
    assert.strictEqual(results.length, 1);
  }

  {
    let calls = 0;
    const { results } = await expectStatus(
      'Busqueda multisectorial simulada',
      async () => {
        calls++;
        return { places: [makePlace({ id: `multi-${calls}`, displayName: calls % 2 ? 'Gestoria Central' : 'Asesoria Laboral Norte', types: ['accounting'] })] };
      },
      'SUCCESS_WITH_RESULTS',
      { segment: 'Gestorias', multi: true }
    );
    assert.ok(results.length >= 1);
  }

  {
    const ctx = createContext(async () => ({ places: [] }), {
      fetch: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return {
            elements: [
              {
                type: 'node',
                id: 1,
                lat: 40.42,
                lon: -3.7,
                tags: {
                  name: 'Clinica Dental OSM',
                  amenity: 'dentist',
                  website: 'https://dental-osm.example',
                  'addr:city': 'Madrid',
                },
              },
            ],
          };
        },
      }),
      allowGoogle: false,
    });
    const results = await ctx.fetchPlaces('Dental', 'Madrid', 20);
    assert.strictEqual(results.__placesDiagnostics.status, 'SUCCESS_WITH_RESULTS');
    assert.strictEqual(results[0].provider, 'osm_overpass');
    assert.strictEqual(results[0].foundBy, 'OpenStreetMap Overpass');
  }

  {
    const ctx = createContext(async () => ({ places: [] }), {
      allowGoogle: false,
      fetch: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return {
            llicencia: 'https://creativecommons.org/licenses/by/4.0/',
            modificacio: '2026-10-14 00:32:24',
            elements: [{
              id: 'cens-0819230008-868',
              nom_comercial: 'GESTORIA JORBA',
              rao_social_nom: 'GESTORIA ASSESSORIA JORBA SL',
              descripcio_activitat: 'Gestor administratiu',
              descripcio_nace: 'Administrative and support service activities',
              data_modificacio: '2022-06-16 00:00:00',
              adreca: {
                adreca_completa: 'C FONT BARRERA 3, BAIXOS, 08251 SANTPEDOR',
                localitzacio: '41.7838067,1.8387808',
                codi_postal: '08251',
                nom_municipi: 'SANTPEDOR',
              },
            }],
          };
        },
      }),
    });
    const results = await ctx.fetchPlaces('Gestorias', '08251', 20, {
      freeProviderAdapters: [
        { id: 'diba_gia', run: () => ctx.fetchDibaBusinesses('Gestorias', '08251', 20) },
      ],
    });
    assert.strictEqual(results.__placesDiagnostics.status, 'SUCCESS_WITH_RESULTS');
    assert.strictEqual(results[0].provider, 'diba_gia');
    assert.strictEqual(results[0].postalCode, '08251');
    assert.ok(results[0].provenance[0].license.includes('CC BY'));
  }

  {
    let calls = 0;
    const ctx = createContext(async () => ({ places: [] }), {
      allowGoogle: false,
      fetch: async () => {
        calls++;
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ elements: [] }) };
      },
    });
    const madrid = await ctx.fetchDibaBusinesses('Dental', 'Madrid', 20);
    assert.strictEqual(madrid.length, 0);
    assert.strictEqual(madrid.__placesDiagnostics.skippedReason, 'outside_diba_supported_query_shape');
    assert.strictEqual(calls, 0, 'DIBA must not run outside Barcelona geography');
    await ctx.fetchDibaBusinesses('Dental', 'Barcelona', 20);
    assert.strictEqual(calls, 1, 'DIBA runs for a compatible Barcelona query');
  }

  {
    let active = 0;
    let maxActive = 0;
    const starts = [];
    const ctx = createContext(async () => ({ places: [] }), {
      allowGoogle: false,
      fetch: async () => {
        starts.push(Date.now());
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 25));
        active--;
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ elements: [] }) };
      },
    });
    await Promise.all([
      ctx.fetchOverpassBusinesses('Dental', 'Madrid', 5),
      ctx.fetchOverpassBusinesses('Dental', 'Madrid', 5),
    ]);
    assert.strictEqual(maxActive, 1, 'Overpass concurrency limit enforced');
    assert.ok(starts[1] - starts[0] >= 1400, 'Overpass minimum interval enforced');

    const controller = new AbortController();
    const cancelled = ctx.fetchOverpassBusinesses('Dental', 'Madrid', 5, { signal: controller.signal });
    controller.abort();
    await assert.rejects(cancelled, err => err.name === 'AbortError');
  }

  {
    const ctx = createContext(async () => ({ places: [makePlace()] }), {
      fetch: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() { return { elements: [] }; },
      }),
      allowGoogle: false,
    });
    const results = await ctx.fetchPlaces('Dental', 'Madrid', 20);
    assert.strictEqual(results.__placesDiagnostics.status, 'SUCCESS_EMPTY');
    assert.ok(results.__placesDiagnostics.providers.some(p => p.provider === 'google_places' && p.status === 'SKIPPED'));
  }

  {
    const ctx = createContext(async () => ({ places: [] }), {
      fetch: async () => ({
        ok: false,
        status: 429,
        headers: { get: () => '60' },
        async json() { return {}; },
      }),
      allowGoogle: false,
    });
    const results = await ctx.fetchPlaces('Dental', 'Madrid', 20);
    assert.strictEqual(results.__placesDiagnostics.status, 'PARTIAL_WITH_ERRORS');
    assert.ok(results.__placesDiagnostics.providers.some(p => p.provider === 'osm_overpass' && p.status === 'QUOTA_EXCEEDED'));
  }

  {
    let primaryCalls = 0;
    let secondaryCalls = 0;
    const ctx = createContext(async () => ({ places: [] }), { allowGoogle: false });
    const results = await ctx.fetchPlaces('Dental', 'Madrid', 20, {
      freeProviderAdapters: [
        { id: 'osm_overpass', run: async () => { primaryCalls++; const out = []; out.__placesDiagnostics = { status: 'SUCCESS_EMPTY' }; return out; } },
        { id: 'osm_overpass', run: async () => { secondaryCalls++; const out = [makePlace({ id: 'fallback-1', displayName: 'Clinica Fallback' })]; out.__placesDiagnostics = { status: 'SUCCESS_WITH_RESULTS' }; return out; } },
      ],
    });
    assert.strictEqual(primaryCalls, 1, 'Proveedor principal ejecutado');
    assert.strictEqual(secondaryCalls, 1, 'Cambio automatico al segundo proveedor');
    assert.strictEqual(results.length, 1);
  }

  {
    const ctx = createContext(async () => ({ places: [] }), { allowGoogle: false });
    const day = new Date().toISOString().slice(0, 10);
    ctx.localStorage.setItem(`gordi_zero_cost_osm_overpass_day_${day}`, '40');
    ctx.localStorage.setItem(`gordi_zero_cost_diba_gia_day_${day}`, '20');
    ctx.localStorage.setItem(`gordi_zero_cost_static_open_data_day_${day}`, '1000');
    await assert.rejects(
      () => ctx.fetchPlaces('Dental', 'Madrid', 20),
      err => err.zeroCostStatus === 'BLOCKED' && err.providerId === 'all_free_discovery_providers'
    );
  }

  {
    const ctx = createContext(async () => ({ places: [] }), { allowGoogle: false });
    ctx.localStorage.setItem('gordi_hunter_key', 'hunter_mock');
    const company = { name: 'Test', website: 'https://example.com', enrichSource: [], scrapeDiagnostics: [] };
    const enriched = await ctx.enrichFromHunter(company);
    assert.strictEqual(enriched.email, undefined);
    assert.ok(enriched.scrapeDiagnostics.some(x => x.includes('zero-cost:hunter')));
  }

  console.log('places-search-mock-test OK');
})().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

function ctxGetMergeable(item) {
  if (Array.isArray(item.matchedSectors)) return item.matchedSectors.filter(Boolean);
  if (item.sectorRelevance === 'none') return [];
  return [item.sourceSector, item.segment].filter(Boolean);
}
