#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateCatalog } = require('./validate-business-catalog.cjs');
const businessProviders = require('../modules/business-providers.js');

const projectRoot = path.resolve(__dirname, '..');
const taxonomyTemplate = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/business-taxonomy.v1.json'), 'utf8'));
const geographyTemplate = JSON.parse(fs.readFileSync(path.join(projectRoot, 'data/geography-es.v1.json'), 'utf8'));
const recordsTemplate = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/business-catalog/valid-source-records.json'), 'utf8'));
const tempRoots = [];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function createFixture(mutate) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voltflow-catalog-v2-'));
  tempRoots.push(root);
  const taxonomy = clone(taxonomyTemplate);
  const geography = clone(geographyTemplate);
  const payload = clone(recordsTemplate);
  const partitionRelative = 'data/business-indexes/synthetic_static/province-28.json';
  const partitionPath = path.join(root, partitionRelative);
  writeJson(path.join(root, 'data/business-taxonomy.v1.json'), taxonomy);
  writeJson(path.join(root, 'data/geography-es.v1.json'), geography);
  writeJson(partitionPath, payload);
  writeJson(path.join(root, 'version.json'), { version: '2.9.4', build: '2026.10.15.0300' });
  const manifest = {
    schemaVersion: 2,
    datasetRelease: 'synthetic-e1-1',
    generatedAt: '2026-10-15T00:00:00.000Z',
    schema: { file: 'data/business-indexes/schema-v2.json', version: '2.0.0' },
    taxonomyVersion: taxonomy.taxonomyVersion,
    geographyVersion: '1.0.0',
    taxonomy: { file: 'data/business-taxonomy.v1.json', version: taxonomy.taxonomyVersion },
    geography: { file: 'data/geography-es.v1.json', version: '1.0.0' },
    limits: { maxManifestBytes: 256000, maxPartitionBytes: 1048576, maxPartitionRecords: 10000 },
    licenses: {
      'synthetic-test-only': { name: 'Synthetic test data', url: 'about:blank', status: 'test_only' },
    },
    attributions: {
      'synthetic-test-only': { text: 'Voltflow synthetic fixture', status: 'test_only' },
    },
    providers: {
      synthetic_static: {
        enabled: true,
        licenseId: 'synthetic-test-only',
        attributionId: 'synthetic-test-only',
        partitions: [{
          file: partitionRelative,
          sha256: hashFile(partitionPath),
          bytes: fs.statSync(partitionPath).size,
          recordCount: payload.records.length,
          recordSchemaVersion: 2,
          country: 'ES',
          provinceCode: '28',
          municipalityCodes: ['28079'],
          sectorIds: ['dental', 'offices'],
          sectorFamilies: ['health-care', 'professional-services'],
          sourceUpdatedAt: '2026-10-15T00:00:00.000Z',
          generatedAt: '2026-10-15T00:00:00.000Z',
          licenseId: 'synthetic-test-only',
          attributionId: 'synthetic-test-only',
        }],
      },
    },
  };
  const context = { root, manifest, taxonomy, geography, payload, partitionPath, partitionRelative };
  fs.copyFileSync(path.join(projectRoot, 'data/business-indexes/schema-v2.json'), path.join(root, 'data/business-indexes/schema-v2.json'));
  if (mutate) mutate(context);
  writeJson(path.join(root, 'data/business-taxonomy.v1.json'), taxonomy);
  writeJson(path.join(root, 'data/geography-es.v1.json'), geography);
  writeJson(partitionPath, payload);
  if (!context.skipIntegrityRefresh) {
    const partition = manifest.providers.synthetic_static.partitions[0];
    partition.sha256 = hashFile(partitionPath);
    partition.bytes = fs.statSync(partitionPath).size;
    partition.recordCount = payload.records.length;
  }
  writeJson(path.join(root, 'data/business-indexes/manifest.json'), manifest);
  return context;
}

function validate(context) {
  return validateCatalog({ root: context.root });
}

function expectFailure(name, expectedCode, mutate) {
  const context = createFixture(mutate);
  const result = validate(context);
  assert.equal(result.ok, false, `${name}: el fixture corrupto fue aceptado`);
  assert(result.errors.some(error => error.code === expectedCode), `${name}: falta ${expectedCode}; obtenidos ${result.errors.map(error => error.code).join(', ')}`);
  return { name, expectedCode, errors: result.errors.length };
}

const results = [];
try {
  const valid = createFixture();
  const validResult = validate(valid);
  assert.equal(validResult.ok, true, validResult.errors.map(error => `${error.code}: ${error.message}`).join('\n'));
  assert.deepEqual(validResult.checked, { partitions: 1, records: 2, providers: 1, sectors: 17, provinces: 52, municipalities: 3 });
  results.push({ name: 'catalogo v2 valido', status: 'PASS' });
  assert.equal(businessProviders.getManifestSchemaVersion({}), 1);
  assert.equal(businessProviders.getManifestSchemaVersion({ schemaVersion: 2 }), 2);
  assert.equal(businessProviders.getPartitionRecordCount({ count: 7 }), 7);
  assert.equal(businessProviders.getPartitionRecordCount({ count: 7, recordCount: 8 }), 8);
  assert.deepEqual(businessProviders.getPartitionLegacySectors({ sectors: ['Dental'] }), ['Dental']);
  assert.deepEqual(businessProviders.getPartitionLegacySectors({ legacySectors: ['Retail'] }), ['Retail']);
  results.push({ name: 'compatibilidad de lectura v1 y v2', status: 'PASS' });

  const malformed = createFixture();
  fs.writeFileSync(path.join(malformed.root, 'data/business-indexes/manifest.json'), '{ invalid json');
  const malformedResult = validate(malformed);
  assert(malformedResult.errors.some(error => error.code === 'JSON_INVALID'));
  results.push({ name: 'manifiesto JSON corrupto', status: 'PASS' });

  const cases = [
    expectFailure('referencia de taxonomia inexistente', 'FILE_MISSING', ({ manifest }) => { manifest.taxonomy.file = 'data/missing-taxonomy.json'; }),
    expectFailure('referencia de esquema inexistente', 'FILE_MISSING', ({ manifest }) => { manifest.schema.file = 'data/business-indexes/missing-schema.json'; }),
    expectFailure('version de esquema invalida', 'SCHEMA_VERSION', ({ manifest }) => { manifest.schemaVersion = 1; }),
    expectFailure('version de taxonomia incoherente', 'VERSION_MISMATCH', ({ manifest }) => { manifest.taxonomy.version = '99.0.0'; }),
    expectFailure('particion inexistente', 'FILE_MISSING', ({ manifest }) => { manifest.providers.synthetic_static.partitions[0].file = 'data/business-indexes/synthetic_static/missing.json'; }),
    expectFailure('path traversal', 'PATH_UNSAFE', ({ manifest }) => { manifest.providers.synthetic_static.partitions[0].file = '../outside.json'; }),
    expectFailure('codigo provincial invalido', 'UNKNOWN_PROVINCE', ({ manifest }) => { manifest.providers.synthetic_static.partitions[0].provinceCode = '99'; }),
    expectFailure('municipio inexistente', 'UNKNOWN_MUNICIPALITY', ({ manifest }) => { manifest.providers.synthetic_static.partitions[0].municipalityCodes = ['28999']; }),
    expectFailure('municipio incoherente con provincia', 'MUNICIPALITY_PROVINCE_MISMATCH', ({ manifest }) => { manifest.providers.synthetic_static.partitions[0].provinceCode = '08'; }),
    expectFailure('sector inexistente', 'UNKNOWN_SECTOR', ({ manifest }) => { manifest.providers.synthetic_static.partitions[0].sectorIds.push('sector-inexistente'); }),
    expectFailure('familia sectorial incoherente', 'SECTOR_FAMILY_MISMATCH', ({ manifest }) => { manifest.providers.synthetic_static.partitions[0].sectorFamilies = ['health-care']; }),
    expectFailure('familia duplicada', 'DUPLICATE_ID', ({ taxonomy }) => { taxonomy.families.push(clone(taxonomy.families[0])); }),
    expectFailure('provincia duplicada', 'DUPLICATE_ID', ({ geography }) => { geography.provinces.push(clone(geography.provinces[0])); }),
    expectFailure('sector heredado duplicado', 'DUPLICATE_LEGACY_VALUE', ({ taxonomy }) => { taxonomy.sectors[1].legacyValues.push('Oficinas'); }),
    expectFailure('redirect ciclico', 'REDIRECT_CYCLE', ({ taxonomy }) => { taxonomy.redirects = { 'old-a': 'old-b', 'old-b': 'old-a' }; }),
    expectFailure('hash incoherente', 'HASH_MISMATCH', context => { context.skipIntegrityRefresh = true; context.manifest.providers.synthetic_static.partitions[0].sha256 = '0'.repeat(64); }),
    expectFailure('tamano incoherente', 'SIZE_MISMATCH', context => { context.skipIntegrityRefresh = true; context.manifest.providers.synthetic_static.partitions[0].bytes += 1; }),
    expectFailure('conteo incoherente', 'RECORD_COUNT_MISMATCH', context => { context.skipIntegrityRefresh = true; context.manifest.providers.synthetic_static.partitions[0].recordCount += 1; }),
    expectFailure('registro duplicado', 'DUPLICATE_SOURCE_RECORD', ({ payload }) => { payload.records.push(clone(payload.records[0])); }),
    expectFailure('particion duplicada', 'DUPLICATE_PARTITION', ({ manifest }) => { manifest.providers.synthetic_static.partitions.push(clone(manifest.providers.synthetic_static.partitions[0])); }),
    expectFailure('identidad de origen incompleta', 'SOURCE_IDENTITY_MISSING', ({ payload }) => { delete payload.records[0].sourceId; delete payload.records[0].sourceRecordId; }),
    expectFailure('geografia de registro incoherente', 'RECORD_MUNICIPALITY_MISMATCH', ({ payload }) => { payload.records[0].municipalityCode = '08019'; }),
    expectFailure('sector de registro incoherente', 'RECORD_SECTOR_MISMATCH', ({ payload }) => { payload.records[0].sectorIds = ['retail']; }),
    expectFailure('contaminacion por sector solicitado', 'QUERY_CONTAMINATION_FIELD', ({ payload }) => { payload.records[0].requestedSector = 'Dental'; }),
    expectFailure('limite de bytes', 'PARTITION_SIZE_INVALID', ({ manifest }) => { manifest.limits.maxPartitionBytes = 10; }),
    expectFailure('limite de registros', 'RECORD_COUNT_INVALID', context => {
      context.skipIntegrityRefresh = true;
      context.manifest.providers.synthetic_static.partitions[0].recordCount = 10001;
    }),
    expectFailure('licencia inexistente', 'UNKNOWN_LICENSE', ({ manifest }) => { manifest.providers.synthetic_static.partitions[0].licenseId = 'missing-license'; }),
    expectFailure('atribucion inexistente', 'UNKNOWN_ATTRIBUTION', ({ manifest }) => { manifest.providers.synthetic_static.partitions[0].attributionId = 'missing-attribution'; }),
    expectFailure('secreto incrustado', 'SECRET_FIELD', ({ payload }) => { payload.records[0].apiKey = 'not-allowed-in-catalog'; }),
    expectFailure('datasetRelease igual al build', 'DATASET_RELEASE_EQUALS_BUILD', ({ manifest }) => { manifest.datasetRelease = '2026.10.15.0300'; }),
  ];
  results.push(...cases.map(test => ({ name: test.name, status: 'PASS', expected: test.expectedCode })));

  for (const result of results) console.log(`PASS ${result.name}${result.expected ? ` (${result.expected})` : ''}`);
  console.log(`Business catalog contract tests OK: ${results.length}/${results.length}`);
} finally {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
}
