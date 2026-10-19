#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyConsultancy, validatePriorities } = require('./validate-prospecting-priorities.cjs');

const root = path.resolve(__dirname, '..');
const priorities = JSON.parse(fs.readFileSync(path.join(root, 'data/prospecting-priorities.v1.json'), 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync(path.join(root, 'data/business-taxonomy.v1.json'), 'utf8'));
const tempRoots = [];
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voltflow-priorities-'));
  tempRoots.push(dir);
  const currentPriorities = clone(priorities);
  const currentTaxonomy = clone(taxonomy);
  if (mutate) mutate(currentPriorities, currentTaxonomy);
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data/prospecting-priorities.v1.json'), `${JSON.stringify(currentPriorities, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'data/business-taxonomy.v1.json'), `${JSON.stringify(currentTaxonomy, null, 2)}\n`);
  return dir;
}

function expectFailure(name, code, mutate) {
  const result = validatePriorities({ root: fixture(mutate) });
  assert.equal(result.ok, false, `${name}: el contrato invalido fue aceptado`);
  assert(result.errors.some(error => error.code === code), `${name}: falta ${code}; recibidos ${result.errors.map(error => error.code).join(', ')}`);
  console.log(`PASS ${name} (${code})`);
}

try {
  const valid = validatePriorities({ root });
  assert.equal(valid.ok, true, valid.errors.map(error => `${error.code}: ${error.message}`).join('\n'));
  assert.deepEqual(valid.checked, { profiles: 5, reusedSectors: 4, phases: 6, metrics: 5 });
  console.log('PASS contrato prioritario valido');

  const cases = [
    ['Gestoria administrativa Lopez', 'accounting-advisory'],
    ['Asesoria fiscal y laboral Centro', 'accounting-advisory'],
    ['Gestoria de fincas Lopez', 'property-management'],
    ['Administracion de comunidades Centro', 'property-management'],
    ['Gestion patrimonial de inmuebles Centro', 'property-management'],
  ];
  for (const [text, expected] of cases) assert.equal(classifyConsultancy(text, priorities), expected, text);
  console.log('PASS desambiguacion gestoria administrativa / administracion de fincas (5 casos)');

  assert.equal(taxonomy.sectors.length, 17, 'No deben crearse sectores duplicados');
  assert.equal(new Set(taxonomy.sectors.map(sector => sector.id)).size, 17);
  console.log('PASS cinco perfiles reutilizan cuatro de 17 sectores E2.2');

  expectFailure('perfil con sector inventado', 'UNKNOWN_SECTOR', data => { data.profiles[0].sectorId = 'invented-sector'; });
  expectFailure('perfil duplicado', 'PROFILE_ID', data => { data.profiles[1].id = data.profiles[0].id; });
  expectFailure('activacion prematura de runtime', 'RUNTIME_ENABLED', data => { data.runtimeEnabled = true; });
  expectFailure('contaminacion por sector solicitado', 'QUERY_CONTAMINATION', data => { data.disambiguation.requestedSectorIsEvidence = true; });
  expectFailure('procedencia de contacto incompleta', 'CONTACT_PROVENANCE', data => { data.contactDataContract.requiredMetadata = data.contactDataContract.requiredMetadata.filter(field => field !== 'sourceId'); });
  expectFailure('metrica comercial ausente', 'METRIC_REQUIRED', data => { data.measurementContract.requiredMetrics = data.measurementContract.requiredMetrics.filter(metric => metric !== 'decisionMakersIdentified'); });
  expectFailure('envio automatico habilitado', 'EMAIL_POLICY', data => { data.emailPolicy.automaticSendingAllowed = true; });
  expectFailure('revision individual deshabilitada', 'EMAIL_POLICY', data => { data.emailPolicy.individualReviewRequired = false; });
  expectFailure('fase E7 sin gate', 'PHASE_ACCEPTANCE', data => { data.phaseAcceptance.E7 = []; });
  expectFailure('enriquecimiento concurrente excesivo', 'PERFORMANCE_POLICY', data => { data.performanceContract.maxConcurrentEnrichment = 3; });
  expectFailure('mapping de fuente sin validar', 'SOURCE_STATUS', data => { data.profiles[0].sourceSearchMappings.overture.status = 'active-unverified'; });
  expectFailure('version de taxonomia incoherente', 'TAXONOMY_VERSION', data => { data.taxonomyVersion = '9.9.9'; });

  console.log('Prospecting priorities contract tests OK: 15/15');
} finally {
  for (const dir of tempRoots) fs.rmSync(dir, { recursive: true, force: true });
}
