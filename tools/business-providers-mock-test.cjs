'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'modules', 'business-providers.js'), 'utf8');

const ctx = { console, URL, Date, AbortSignal: { timeout: () => undefined }, fetch: async () => { throw new Error('network disabled in test'); } };
ctx.globalThis = ctx;
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'modules/business-providers.js' });

const api = ctx.VoltflowBusinessProviders;
assert.ok(api, 'provider module exported');

const diba = api.normalizeDibaElement({
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
}, { segment: 'Gestorias' });

assert.strictEqual(diba.name, 'GESTORIA JORBA');
assert.strictEqual(diba.postalCode, '08251');
assert.strictEqual(diba.provider, 'diba_gia');
assert.strictEqual(diba.sectorRelevance, 'strong');
assert.ok(diba.provenance[0].license.includes('CC BY'));

const overture = api.normalizeStaticRecord({
  externalId: 'ov-1',
  name: 'Gestoria Jorba',
  address: 'C Font Barrera 3, 08251 Santpedor',
  postalCode: '08251',
  locality: 'Santpedor',
  category: 'tax_advisor',
  website: 'https://gestoriajorba.example',
}, 'overture_places_static', { segment: 'Gestorias' });

const merged = api.deduplicateMultisource([diba, overture], {
  getMergeableSectors(item) {
    return Array.isArray(item.matchedSectors) ? item.matchedSectors : [item.segment].filter(Boolean);
  },
});

assert.strictEqual(merged.length, 1, 'DIBA + Overture duplicate merged');
assert.ok(merged[0].provenance.length >= 2, 'provenance preserved');
assert.ok(merged[0].matchedSectors.includes('Gestorias'), 'B2B sector preserved');
assert.ok(merged[0].branches.length >= 2, 'source branch snapshots preserved');

const sameStreetDifferentNumbers = api.deduplicateMultisource([
  api.normalizeStaticRecord({
    id: 'mad-dental-1',
    name: 'Clinica Dental Centro',
    address: 'Calle Mayor 10, 28013 Madrid',
    postalCode: '28013',
    locality: 'Madrid',
    province: 'Madrid',
    category: 'dental',
  }, 'madrid_open_data_static', { segment: 'Dental' }),
  api.normalizeStaticRecord({
    id: 'ov-dental-2',
    name: 'Clinica Dental Centro Especialidades',
    address: 'Calle Mayor 12, 28013 Madrid',
    postalCode: '28013',
    locality: 'Madrid',
    province: 'Madrid',
    category: 'dental',
  }, 'overture_places_static', { segment: 'Dental' }),
], {
  getMergeableSectors(item) {
    return Array.isArray(item.matchedSectors) ? item.matchedSectors : [item.segment].filter(Boolean);
  },
});
assert.strictEqual(sameStreetDifferentNumbers.length, 2, 'different street numbers must not merge');

const genericNamesDifferentAddresses = api.deduplicateMultisource([
  api.normalizeStaticRecord({
    id: 'mad-gestoria-1',
    name: 'Gestoria',
    address: 'Calle Alcala 35, 28014 Madrid',
    postalCode: '28014',
    locality: 'Madrid',
    province: 'Madrid',
    category: 'gestoria',
  }, 'madrid_open_data_static', { segment: 'Gestorias' }),
  api.normalizeStaticRecord({
    id: 'ov-gestoria-2',
    name: 'Gestoria',
    address: 'Calle Ferraz 74, 28008 Madrid',
    postalCode: '28008',
    locality: 'Madrid',
    province: 'Madrid',
    category: 'gestoria',
  }, 'overture_places_static', { segment: 'Gestorias' }),
], {
  getMergeableSectors(item) {
    return Array.isArray(item.matchedSectors) ? item.matchedSectors : [item.segment].filter(Boolean);
  },
});
assert.strictEqual(genericNamesDifferentAddresses.length, 2, 'generic names in different addresses must not merge');

(async () => {
  const fetchCalls = [];
  const mockFetch = async (url) => {
    fetchCalls.push(url);
    if (String(url).endsWith('manifest.json')) {
      return {
        ok: true,
        async json() {
          return {
            version: 'test',
            providers: {
              madrid_open_data_static: {
                enabled: true,
                partitions: [{ file: 'madrid-28.json', postalPrefix: '28', count: 1 }],
              },
            },
          };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return {
          records: [{
            id: 'mad-1',
            name: 'Estudio Arquitectura Centro',
            address: 'Calle Mayor 1, 28013 Madrid',
            postalCode: '28013',
            locality: 'Madrid',
            province: 'Madrid',
            category: 'arquitectura',
          }],
        };
      },
    };
  };
  const result = await api.searchStaticIndexes({
    segment: 'Arquitectos',
    location: '28013',
    maxResults: 5,
  }, { fetch: mockFetch });
  assert.strictEqual(result.records.length, 1);
  assert.strictEqual(result.records[0].provider, 'madrid_open_data_static');
  assert.strictEqual(fetchCalls.length, 2);
  console.log('business-providers-mock-test OK');
})().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
