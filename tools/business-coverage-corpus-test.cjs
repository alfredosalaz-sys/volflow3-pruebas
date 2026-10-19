#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { validateCoverageCorpus } = require('./validate-business-coverage-corpus.cjs');
const { measureCoverage } = require('./business-coverage-quality.cjs');

const projectRoot = path.resolve(__dirname, '..');
const temporary = [];
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));

function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voltflow-e2-'));
  temporary.push(root);
  fs.cpSync(path.join(projectRoot, 'tests/fixtures/business-coverage'), path.join(root, 'tests/fixtures/business-coverage'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data/business-indexes'), { recursive: true });
  fs.copyFileSync(path.join(projectRoot, 'data/business-indexes/manifest.json'), path.join(root, 'data/business-indexes/manifest.json'));
  return root;
}
function corpusFiles(root) {
  const corpusFile = path.join(root, 'tests/fixtures/business-coverage/corpus.v1.json');
  const manifestFile = path.join(root, 'tests/fixtures/business-coverage/corpus-manifest.json');
  return { corpusFile, manifestFile, corpus: JSON.parse(fs.readFileSync(corpusFile)), manifest: JSON.parse(fs.readFileSync(manifestFile)) };
}
function saveCorpus(files) {
  writeJson(files.corpusFile, files.corpus);
  const buffer = fs.readFileSync(files.corpusFile);
  files.manifest.corpus.sha256 = hash(buffer);
  files.manifest.corpus.bytes = buffer.length;
  files.manifest.corpus.observations = files.corpus.observations.length;
  writeJson(files.manifestFile, files.manifest);
}
function expectFailure(name, code, mutate) {
  const root = fixture();
  const files = corpusFiles(root);
  mutate({ root, ...files });
  const result = validateCoverageCorpus({ root });
  assert.equal(result.ok, false, `${name}: corrupt fixture accepted`);
  assert(result.errors.some(error => error.code === code), `${name}: missing ${code}; got ${result.errors.map(error => error.code).join(', ')}`);
  console.log(`PASS ${name} (${code})`);
}

let passes = 0;
function pass(name, callback) { callback(); passes++; console.log(`PASS ${name}`); }

try {
  pass('corpus E2 valido estructuralmente', () => assert.equal(validateCoverageCorpus({ root: projectRoot }).ok, true));
  pass('construccion reproducible sin red', () => {
    const before = hash(fs.readFileSync(path.join(projectRoot, 'tests/fixtures/business-coverage/corpus.v1.json')));
    childProcess.execFileSync(process.execPath, ['tools/build-business-coverage-corpus.cjs'], { cwd: projectRoot, stdio: 'pipe' });
    const after = hash(fs.readFileSync(path.join(projectRoot, 'tests/fixtures/business-coverage/corpus.v1.json')));
    assert.equal(after, before);
  });
  pass('coordenadas normalizadas dentro de Madrid y Barcelona', () => {
    const corpus = corpusFiles(projectRoot).corpus;
    const coordinateCounts = { Madrid: 0, Barcelona: 0 };
    for (const row of corpus.observations) {
      assert.equal(row.lat == null, row.lng == null);
      if (row.lat == null) continue;
      coordinateCounts[row.city]++;
      if (row.city === 'Madrid') assert(row.lat > 40 && row.lat < 41 && row.lng > -4.5 && row.lng < -3);
      if (row.city === 'Barcelona') assert(row.lat > 41 && row.lat < 42 && row.lng > 1.5 && row.lng < 2.5);
    }
    assert(coordinateCounts.Madrid > 0 && coordinateCounts.Barcelona > 0);
  });
  pass('contactos no inventados', () => {
    const corpus = corpusFiles(projectRoot).corpus;
    assert(corpus.observations.every(row => !row.phones.length && !row.websites.length && !row.emails.length));
  });
  pass('DIBA excluida por diagnostico geografico real', () => {
    const corpus = corpusFiles(projectRoot).corpus;
    assert.equal(corpus.dibaDiagnostic.eligibleForBarcelonaCityCorpus, false);
    assert(corpus.dibaDiagnostic.misleadingAddressMunicipalityRows > 0);
    assert(!corpus.observations.some(row => row.sourceId === 'diba_gia'));
  });
  pass('quality gate bloqueante sin fusiones incorrectas', () => {
    const metrics = measureCoverage({ root: projectRoot });
    assert.equal(metrics.identity.falseAutomaticMerges, 0);
    assert.equal(metrics.identity.collapsedBranchGroups, 0);
    assert.equal(metrics.acceptance.ready, true);
  });
  pass('construccion identica en tres zonas horarias', () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
    for (const name of ['build-business-coverage-corpus.cjs', 'business-coverage-sources.cjs']) {
      fs.copyFileSync(path.join(projectRoot, 'tools', name), path.join(root, 'tools', name));
    }
    const hashes = new Set();
    for (const timezone of ['UTC', 'Europe/Madrid', 'America/New_York']) {
      childProcess.execFileSync(process.execPath, ['tools/build-business-coverage-corpus.cjs'], { cwd: root, env: { ...process.env, TZ: timezone }, stdio: 'pipe' });
      hashes.add(hash(fs.readFileSync(path.join(root, 'tests/fixtures/business-coverage/corpus.v1.json'))));
    }
    assert.equal(hashes.size, 1);
  });

  const negativeCases = [
    ['hash del corpus corrupto', 'CORPUS_HASH_MISMATCH', ({ manifestFile, manifest }) => { manifest.corpus.sha256 = '0'.repeat(64); writeJson(manifestFile, manifest); }],
    ['observacion duplicada', 'DUPLICATE_OBSERVATION', files => { files.corpus.observations.push(clone(files.corpus.observations[0])); saveCorpus(files); }],
    ['procedencia ausente', 'PROVENANCE_MISSING', files => { files.corpus.observations[0].provenance = []; saveCorpus(files); }],
    ['codigo municipal invalido', 'GEOGRAPHY_INVALID', files => { files.corpus.observations[0].municipalityCode = '28999'; saveCorpus(files); }],
    ['contacto sin procedencia de campo', 'CONTACT_SOURCE_MISSING', files => { files.corpus.observations[0].phones = ['+34910000000']; saveCorpus(files); }],
    ['positivo sin evidencia', 'CLASSIFICATION_EVIDENCE_MISSING', files => { const row = files.corpus.observations.find(item => item.labels.relevance === 'true'); row.classificationEvidence = []; saveCorpus(files); }],
    ['ambiguo sin doble decision', 'AMBIGUOUS_REVIEW_MISSING', files => { const row = files.corpus.observations.find(item => item.labels.relevance === 'uncertain'); row.labels.reviewDecisions = row.labels.reviewDecisions.slice(0, 1); saveCorpus(files); }],
    ['identificador fiscal prohibido', 'FORBIDDEN_FIELD', files => { files.corpus.observations[0].nif = 'X0000000X'; saveCorpus(files); }],
    ['DIBA marcada como elegible', 'DIBA_SCOPE_UNSAFE', files => { files.corpus.dibaDiagnostic.eligibleForBarcelonaCityCorpus = true; saveCorpus(files); }],
    ['fuente futura adelantada', 'FUTURE_SOURCE_INCLUDED', files => { files.corpus.observations[0].sourceId = 'overture_places_static'; saveCorpus(files); }],
    ['compatibilidad Madrid v1 rota', 'LEGACY_V1_COMPATIBILITY', ({ root }) => { const file = path.join(root, 'data/business-indexes/manifest.json'); const data = JSON.parse(fs.readFileSync(file)); data.providers.madrid_open_data_static.partitions[0].recordSchemaVersion = 2; writeJson(file, data); }],
    ['captura fuente alterada', 'RAW_HASH_MISMATCH', ({ root }) => { const file = path.join(root, 'tests/fixtures/business-coverage/raw/madrid-dental.json'); fs.appendFileSync(file, ' '); }],
    ['limite de filas por peticion rebasado', 'RAW_RECORD_LIMIT', ({ root }) => { const file = path.join(root, 'tests/fixtures/business-coverage/source-manifest.json'); const data = JSON.parse(fs.readFileSync(file)); data.files[0].returnedRecords = 31; writeJson(file, data); }],
    ['politica de coste cero desactivada', 'ZERO_COST_POLICY', ({ root }) => { const file = path.join(root, 'tests/fixtures/business-coverage/source-manifest.json'); const data = JSON.parse(fs.readFileSync(file)); data.zeroCost = false; writeJson(file, data); }],
    ['timestamp futuro', 'FUTURE_TIMESTAMP', ({ root }) => { const file = path.join(root, 'tests/fixtures/business-coverage/source-manifest.json'); const data = JSON.parse(fs.readFileSync(file)); data.reindexedAt = '2999-01-01T00:00:00.000Z'; writeJson(file, data); }],
    ['cronologia incoherente', 'TIMELINE_ORDER', ({ root }) => { const file = path.join(root, 'tests/fixtures/business-coverage/source-manifest.json'); const data = JSON.parse(fs.readFileSync(file)); data.corpusGeneratedAt = '2026-10-15T15:08:52.343Z'; writeJson(file, data); }],
  ];
  for (const [name, code, mutate] of negativeCases) { expectFailure(name, code, mutate); passes++; }
  console.log(`Business coverage corpus tests OK: ${passes}/${passes}`);
} finally {
  for (const root of temporary) fs.rmSync(root, { recursive: true, force: true });
}
