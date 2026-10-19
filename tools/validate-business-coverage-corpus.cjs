#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_CORPUS_BYTES = 1024 * 1024;
const EXPECTED_CITIES = new Map([['Madrid', ['28', '28079']], ['Barcelona', ['08', '08019']]]);
const FORBIDDEN_KEYS = /^(?:nif|cif|taxId|referenciaCadastral|cadastralReference|apiKey|token|password|secret)$/i;
const SECRET_VALUES = [/\bAIza[\w-]{20,}\b/, /\bgsk_[\w-]{16,}\b/, /\b(?:sk|ghp|github_pat)_[\w-]{16,}\b/];

function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function dateTime(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function calendarDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }

function validateCoverageCorpus(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const fixtureRoot = path.join(root, 'tests/fixtures/business-coverage');
  const errors = [];
  const warnings = [];
  const checked = { sources: 0, rawFiles: 0, observations: 0, cities: 0, sectors: 0, branchGroups: 0 };
  const fail = (code, location, message) => errors.push({ code, location, message });
  const warn = (code, location, message) => warnings.push({ code, location, message });
  const readJson = (file, location) => {
    if (!fs.existsSync(file)) { fail('FILE_MISSING', location, file); return null; }
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { fail('JSON_INVALID', location, error.message); return null; }
  };
  const scanForbidden = (value, location, seen = new Set()) => {
    if (typeof value === 'string') {
      if (SECRET_VALUES.some(pattern => pattern.test(value))) fail('SECRET_VALUE', location, 'Credential-like value found.');
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.test(key)) fail('FORBIDDEN_FIELD', `${location}.${key}`, 'Sensitive or excluded identifier found.');
      scanForbidden(child, `${location}.${key}`, seen);
    }
  };

  const sourceManifestPath = path.join(fixtureRoot, 'source-manifest.json');
  const corpusManifestPath = path.join(fixtureRoot, 'corpus-manifest.json');
  const corpusPath = path.join(fixtureRoot, 'corpus.v1.json');
  const sourceManifest = readJson(sourceManifestPath, 'sourceManifest');
  const corpusManifest = readJson(corpusManifestPath, 'corpusManifest');
  const corpus = readJson(corpusPath, 'corpus');
  if (!sourceManifest || !corpusManifest || !corpus) return { ok: false, errors, warnings, checked };

  scanForbidden(sourceManifest, 'sourceManifest');
  scanForbidden(corpus, 'corpus');
  if (sourceManifest.schemaVersion !== 1 || corpus.schemaVersion !== 1 || corpusManifest.schemaVersion !== 1) fail('SCHEMA_VERSION', 'root', 'E2 requires schemaVersion 1 for its evaluation artifacts.');
  const now = Date.now();
  const capture = sourceManifest.capture;
  if (!object(capture) || !calendarDate(capture.acquiredOn) || !['exact', 'exact_time_unknown'].includes(capture.timeStatus)) fail('CAPTURE_TIME_INVALID', 'sourceManifest.capture', 'Capture date and time status are required.');
  if (capture?.timeStatus === 'exact' && !dateTime(capture.acquiredAt)) fail('CAPTURE_TIME_INVALID', 'sourceManifest.capture.acquiredAt', 'Exact captures require an ISO instant.');
  if (capture?.timeStatus === 'exact_time_unknown' && capture.acquiredAt !== null) fail('CAPTURE_TIME_INVALID', 'sourceManifest.capture.acquiredAt', 'Unknown historical times must be null.');
  if (dateTime(capture?.acquiredAt) && Date.parse(capture.acquiredAt) > now + 60000) fail('FUTURE_TIMESTAMP', 'sourceManifest.capture.acquiredAt', 'Capture time cannot be in the future.');
  if (!dateTime(sourceManifest.reindexedAt) || !dateTime(sourceManifest.corpusGeneratedAt) || !dateTime(corpus.generatedAt)) fail('DATE_INVALID', 'root', 'Reindex and generation dates must be valid.');
  if (Date.parse(sourceManifest.reindexedAt) > now + 60000 || Date.parse(sourceManifest.corpusGeneratedAt) > now + 60000) fail('FUTURE_TIMESTAMP', 'sourceManifest', 'Reindex and generation times cannot be in the future.');
  if (Date.parse(sourceManifest.corpusGeneratedAt) < Date.parse(sourceManifest.reindexedAt)) fail('TIMELINE_ORDER', 'sourceManifest', 'Corpus generation cannot precede reindexing.');
  if (corpus.generatedAt !== sourceManifest.corpusGeneratedAt || corpus.sourceTimeline?.reindexedAt !== sourceManifest.reindexedAt) fail('TIMELINE_MISMATCH', 'corpus.sourceTimeline', 'Corpus timeline must match the source manifest.');
  if (sourceManifest.zeroCost !== true || sourceManifest.authenticatedRequests !== 0) fail('ZERO_COST_POLICY', 'sourceManifest', 'Snapshots must be unauthenticated and zero cost.');
  if (sourceManifest.maxRecordsPerRequest > 30) fail('REQUEST_LIMIT', 'sourceManifest.maxRecordsPerRequest', 'E2 permits at most 30 rows per bounded request.');
  if (!Array.isArray(sourceManifest.sources) || sourceManifest.sources.length !== 2) fail('SOURCE_COUNT', 'sourceManifest.sources', 'Exactly Madrid and Barcelona scored sources are expected.');
  checked.sources = sourceManifest.sources?.length || 0;

  const sourceIds = new Set();
  for (const [index, source] of (sourceManifest.sources || []).entries()) {
    if (!source.id || sourceIds.has(source.id)) fail('SOURCE_ID', `sources[${index}]`, 'Missing or duplicate source id.');
    sourceIds.add(source.id);
    if (source.license !== 'CC BY 4.0' || !String(source.licenseUrl || '').startsWith('https://creativecommons.org/licenses/by/4.0')) fail('LICENSE_UNRESOLVED', `sources[${index}]`, 'Only the documented CC BY 4.0 snapshots are accepted.');
    if (!String(source.datasetUrl || '').startsWith('https://')) fail('SOURCE_URL', `sources[${index}]`, 'Official HTTPS dataset URL required.');
  }

  for (const [index, descriptor] of (sourceManifest.files || []).entries()) {
    const location = `sourceManifest.files[${index}]`;
    const file = path.resolve(root, descriptor.file || '');
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) { fail('RAW_FILE_MISSING', location, descriptor.file); continue; }
    const buffer = fs.readFileSync(file);
    if (hash(buffer) !== descriptor.sha256) fail('RAW_HASH_MISMATCH', location, descriptor.file);
    if (buffer.length !== descriptor.bytes) fail('RAW_SIZE_MISMATCH', location, descriptor.file);
    if (descriptor.returnedRecords > 30) fail('RAW_RECORD_LIMIT', location, String(descriptor.returnedRecords));
    if (!sourceIds.has(descriptor.sourceId) || descriptor.reindexedAt !== sourceManifest.reindexedAt || JSON.stringify(descriptor.capture) !== JSON.stringify(capture)) fail('RAW_PROVENANCE', location, 'Invalid capture/reindex provenance.');
    checked.rawFiles++;
  }
  if (checked.rawFiles !== 16) fail('RAW_FILE_COUNT', 'sourceManifest.files', `Expected 16, got ${checked.rawFiles}.`);

  const corpusBuffer = fs.readFileSync(corpusPath);
  if (corpusBuffer.length > MAX_CORPUS_BYTES || corpusBuffer.length > corpusManifest.limits?.maxCorpusBytes) fail('CORPUS_TOO_LARGE', 'corpus', String(corpusBuffer.length));
  if (hash(corpusBuffer) !== corpusManifest.corpus?.sha256) fail('CORPUS_HASH_MISMATCH', 'corpusManifest.corpus.sha256', 'Corpus hash mismatch.');
  if (corpusBuffer.length !== corpusManifest.corpus?.bytes) fail('CORPUS_SIZE_MISMATCH', 'corpusManifest.corpus.bytes', 'Corpus size mismatch.');
  if (corpus.purpose?.includes('not a production index') !== true) fail('PURPOSE_MISSING', 'corpus.purpose', 'Corpus must be explicitly excluded from production.');
  if (corpus.labelPolicy?.querySectorIsEvidence !== false) fail('QUERY_CONTAMINATION', 'corpus.labelPolicy', 'Query sector cannot be evidence.');
  if (!Array.isArray(corpus.observations)) fail('OBSERVATIONS_INVALID', 'corpus.observations', 'Array required.');
  checked.observations = corpus.observations?.length || 0;
  if (checked.observations !== corpusManifest.corpus?.observations) fail('OBSERVATION_COUNT', 'corpusManifest', 'Observation count mismatch.');

  const ids = new Set();
  const sectors = new Set();
  const cityCounts = new Map();
  const rolesByCity = new Map();
  const branchMembers = new Map();
  for (const [index, row] of (corpus.observations || []).entries()) {
    const location = `observations[${index}]`;
    if (!row.observationId || ids.has(row.observationId)) fail('DUPLICATE_OBSERVATION', location, row.observationId || 'missing');
    ids.add(row.observationId);
    const expected = EXPECTED_CITIES.get(row.city);
    if (!expected) fail('CITY_INVALID', location, row.city);
    else if (row.provinceCode !== expected[0] || row.municipalityCode !== expected[1]) fail('GEOGRAPHY_INVALID', location, `${row.provinceCode}/${row.municipalityCode}`);
    if (!row.name || !row.address || !row.sourceId || !row.sourceRecordId || row.entityKind !== 'establishment') fail('RECORD_REQUIRED', location, 'Identity, address and establishment unit are required.');
    if ((row.lat == null) !== (row.lng == null)) fail('COORDINATES_INCOMPLETE', location, 'Latitude and longitude must be present together.');
    if (row.lat != null && (row.lat < 35 || row.lat > 44.5 || row.lng < -10 || row.lng > 5)) fail('COORDINATES_INVALID', location, `${row.lat}/${row.lng}`);
    if (!sourceIds.has(row.sourceId)) fail('UNKNOWN_SOURCE', location, row.sourceId);
    if (!Array.isArray(row.provenance) || row.provenance.length < 1) fail('PROVENANCE_MISSING', location, 'At least one provenance entry is required.');
    for (const provenance of row.provenance || []) {
      const acquisitionValid = provenance.acquisitionTimeStatus === 'exact'
        ? dateTime(provenance.acquiredAt)
        : provenance.acquisitionTimeStatus === 'exact_time_unknown' && provenance.acquiredAt === null && calendarDate(provenance.acquiredOn);
      if (!provenance.sourceId || !provenance.sourceRecordId || !acquisitionValid || !dateTime(provenance.indexedAt) || !provenance.licenseId || !provenance.attribution) fail('PROVENANCE_INVALID', location, 'Incomplete temporal or source provenance.');
    }
    for (const field of ['phones', 'websites', 'emails']) {
      if (!Array.isArray(row[field])) fail('CONTACT_FIELD_INVALID', `${location}.${field}`, 'Array required.');
      if (row[field]?.length && !row.fieldSources?.[field]) fail('CONTACT_SOURCE_MISSING', `${location}.${field}`, 'Contact values need field provenance.');
    }
    if (!['true', 'false', 'uncertain'].includes(row.labels?.relevance)) fail('LABEL_INVALID', location, row.labels?.relevance);
    if (row.labels?.relevance === 'true') {
      if (!row.classificationEvidence?.length) fail('CLASSIFICATION_EVIDENCE_MISSING', location, 'Positive labels require source evidence.');
      if (row.classificationEvidence?.some(item => item.type === 'query_sector')) fail('QUERY_CONTAMINATION', location, 'Query sector used as evidence.');
    }
    if (row.labels?.relevance === 'uncertain' && (!Array.isArray(row.labels.reviewDecisions) || row.labels.reviewDecisions.length < 2)) fail('AMBIGUOUS_REVIEW_MISSING', location, 'Uncertain rows require two rule decisions.');
    if (row.labels?.geographyCorrect !== true || row.labels?.provenanceOk !== true) fail('QUALITY_LABEL_INVALID', location, 'Scored rows require verified geography and provenance.');
    cityCounts.set(row.city, (cityCounts.get(row.city) || 0) + 1);
    if (!rolesByCity.has(row.city)) rolesByCity.set(row.city, new Set());
    rolesByCity.get(row.city).add(row.samplingRole);
    sectors.add(row.querySectorId);
    if (row.labels?.branchGroup) {
      if (!branchMembers.has(row.labels.branchGroup)) branchMembers.set(row.labels.branchGroup, new Set());
      branchMembers.get(row.labels.branchGroup).add(row.labels.sameEstablishmentGroup);
    }
  }
  for (const city of EXPECTED_CITIES.keys()) {
    const count = cityCounts.get(city) || 0;
    if (count < 100 || count > 250) fail('CITY_SAMPLE_LIMIT', city, String(count));
    if (!rolesByCity.get(city)?.has('cross-sector-negative')) fail('NEGATIVE_CONTROL_MISSING', city, 'Cross-sector controls required.');
  }
  checked.cities = cityCounts.size;
  checked.sectors = sectors.size;
  checked.branchGroups = branchMembers.size;
  if (sectors.size !== 8) fail('SECTOR_COVERAGE', 'corpus.sectors', String(sectors.size));
  if (!branchMembers.size) fail('BRANCH_CASES_MISSING', 'corpus', 'At least one branch group is required.');
  for (const [group, members] of branchMembers) if (members.size < 2) fail('BRANCH_GROUP_INVALID', group, 'A branch group needs distinct establishments.');
  if (corpus.dibaDiagnostic?.eligibleForBarcelonaCityCorpus !== false || corpus.dibaDiagnostic?.decision !== 'diagnostic_only_not_in_scored_corpus') fail('DIBA_SCOPE_UNSAFE', 'corpus.dibaDiagnostic', 'DIBA must remain diagnostic-only after the observed mismatch.');
  if ((corpus.dibaDiagnostic?.misleadingAddressMunicipalityRows || 0) < 1) fail('DIBA_DIAGNOSTIC_EMPTY', 'corpus.dibaDiagnostic', 'Expected observed geographic mismatch.');
  if ((corpus.observations || []).some(row => row.sourceId === 'diba_gia' || /overture|geofabrik|osm/i.test(row.sourceId))) fail('FUTURE_SOURCE_INCLUDED', 'corpus.observations', 'E3/E4 sources cannot enter E2.');

  const legacyManifest = readJson(path.join(root, 'data/business-indexes/manifest.json'), 'legacyManifest');
  const madridPartitions = legacyManifest?.providers?.madrid_open_data_static?.partitions || [];
  if (!madridPartitions.length || madridPartitions.some(partition => partition.recordSchemaVersion !== 1)) fail('LEGACY_V1_COMPATIBILITY', 'legacyManifest', 'Madrid recordSchemaVersion 1 must remain supported and unchanged.');
  if (warnings.length) warn('SUMMARY', 'warnings', `${warnings.length} warnings.`);
  return { ok: errors.length === 0, errors, warnings, checked };
}

if (require.main === module) {
  const rootArg = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
  const result = validateCoverageCorpus({ root: rootArg });
  for (const warning of result.warnings) console.warn(`WARN ${warning.code} ${warning.location}: ${warning.message}`);
  for (const error of result.errors) console.error(`ERROR ${error.code} ${error.location}: ${error.message}`);
  if (!result.ok) process.exitCode = 1;
  else console.log(`E2 corpus validation OK: ${result.checked.observations} observations, ${result.checked.rawFiles} snapshots, ${result.checked.cities} cities, ${result.checked.sectors} sectors, ${result.checked.branchGroups} branch groups.`);
}

module.exports = { validateCoverageCorpus, MAX_CORPUS_BYTES };
