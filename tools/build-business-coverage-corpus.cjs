#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { SECTORS, SOURCES, DEFERRED_SOURCES, rawFileName } = require('./business-coverage-sources.cjs');

const root = path.resolve(__dirname, '..');
const fixtureRoot = path.join(root, 'tests/fixtures/business-coverage');
const rawDir = path.join(fixtureRoot, 'raw');
const sourceManifestPath = path.join(fixtureRoot, 'source-manifest.json');
const corpusPath = path.join(fixtureRoot, 'corpus.v1.json');
const corpusManifestPath = path.join(fixtureRoot, 'corpus-manifest.json');
const MAX_CORPUS_BYTES = 1024 * 1024;
const MAX_OBSERVATIONS_PER_CITY = 250;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function normalizeText(value = '') {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseMadridDate(value = '') {
  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z` : null;
}

function parseBarcelonaDate(value = '') {
  const text = String(value || '').trim();
  if (!text) return null;
  const civil = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (civil) return `${civil[1]}-${civil[2]}-${civil[3]}T${civil[4]}:${civil[5]}:${civil[6]}.000Z`;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function buildMadridAddress(row) {
  const street = [row.clase_vial_acceso || row.clase_vial_edificio, row.desc_vial_acceso || row.desc_vial_edificio].filter(Boolean).join(' ');
  const number = String(row.num_acceso || row.num_edificio || '').replace(/^0+/, '') || '';
  const unit = String(row.id_local_agrupado || '').trim()
    || (row.secuencial_local_PC ? `local ${String(row.secuencial_local_PC).replace(/^0+/, '') || '0'}` : '');
  return [street, number, unit, 'Madrid'].filter(Boolean).join(', ');
}

function utm30ToWgs84(eastingValue, northingValue) {
  if (eastingValue == null || northingValue == null || String(eastingValue).trim() === '' || String(northingValue).trim() === '') return { lat: null, lng: null };
  const easting = Number(eastingValue);
  const northing = Number(northingValue);
  if (!Number.isFinite(easting) || !Number.isFinite(northing) || easting <= 0 || northing <= 0) return { lat: null, lng: null };
  const a = 6378137;
  const eccSquared = 0.00669438;
  const k0 = 0.9996;
  const eccPrimeSquared = eccSquared / (1 - eccSquared);
  const x = easting - 500000;
  const m = northing / k0;
  const mu = m / (a * (1 - eccSquared / 4 - 3 * eccSquared ** 2 / 64 - 5 * eccSquared ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const n1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1) ** 2);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = eccPrimeSquared * Math.cos(phi1) ** 2;
  const r1 = a * (1 - eccSquared) / (1 - eccSquared * Math.sin(phi1) ** 2) ** 1.5;
  const d = x / (n1 * k0);
  const lat = phi1 - (n1 * Math.tan(phi1) / r1) * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * eccPrimeSquared) * d ** 4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * eccPrimeSquared - 3 * c1 ** 2) * d ** 6 / 720);
  const lng = (-3 * Math.PI / 180) + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * eccPrimeSquared + 24 * t1 ** 2) * d ** 5 / 120) / Math.cos(phi1);
  return { lat: Number((lat * 180 / Math.PI).toFixed(8)), lng: Number((lng * 180 / Math.PI).toFixed(8)) };
}

function buildBarcelonaAddress(row) {
  const start = row.Num_Policia_Inicial == null ? '' : String(row.Num_Policia_Inicial);
  const end = row.Num_Policia_Final == null || String(row.Num_Policia_Final) === start ? '' : String(row.Num_Policia_Final);
  const number = [start, end].filter(Boolean).join('-');
  return [row.Nom_Via, number, row.Planta, row.Porta, 'Barcelona'].filter(value => value != null && String(value).trim()).join(', ');
}

function normalizeMadrid(row, source) {
  const sourceRecordId = `${row.id_local || row._id}:${row.id_epigrafe || 'activity'}`;
  const coordinates = utm30ToWgs84(row.coordenada_x_local, row.coordenada_y_local);
  return {
    sourceId: source.id,
    sourceRecordId,
    establishmentId: String(row.id_local || row._id || ''),
    sourceUpdatedAt: parseMadridDate(row.fx_carga),
    entityKind: 'establishment',
    name: String(row.rotulo || '').trim(),
    legalName: '',
    rawCategory: [row.desc_seccion, row.desc_division, row.desc_epigrafe].filter(Boolean).join(' | '),
    activity: String(row.desc_epigrafe || row.desc_division || '').trim(),
    address: buildMadridAddress(row),
    postalCode: '',
    municipalityCode: source.municipalityCode,
    provinceCode: source.provinceCode,
    lat: coordinates.lat,
    lng: coordinates.lng,
    phones: [],
    websites: [],
    emails: [],
    fieldSources: {
      name: source.id, activity: source.id, address: source.id,
      municipalityCode: 'ine-2026', provinceCode: 'ine-2026',
    },
  };
}

function normalizeBarcelona(row, source) {
  return {
    sourceId: source.id,
    sourceRecordId: String(row.ID_Global || row._id || ''),
    establishmentId: String(row.ID_Global || row._id || ''),
    sourceUpdatedAt: parseBarcelonaDate(row.Data_Revisio),
    entityKind: 'establishment',
    name: String(row.Nom_Local || '').trim(),
    legalName: '',
    rawCategory: [row.Nom_Principal_Activitat, row.Nom_Sector_Activitat, row.Nom_Grup_Activitat, row.Nom_Activitat].filter(Boolean).join(' | '),
    activity: String(row.Nom_Activitat || row.Nom_Grup_Activitat || '').trim(),
    address: buildBarcelonaAddress(row),
    postalCode: '',
    municipalityCode: source.municipalityCode,
    provinceCode: source.provinceCode,
    lat: Number.isFinite(Number(row.Latitud)) ? Number(row.Latitud) : null,
    lng: Number.isFinite(Number(row.Longitud)) ? Number(row.Longitud) : null,
    phones: [],
    websites: [],
    emails: [],
    fieldSources: {
      name: source.id, activity: source.id, address: source.id, coordinates: source.id,
      municipalityCode: 'ine-2026', provinceCode: 'ine-2026',
    },
  };
}

function classify(record, sector) {
  const activityText = `${record.rawCategory} ${record.activity}`;
  const activityMatch = sector.activityPatterns.some(pattern => pattern.test(activityText));
  const nameMatch = sector.namePatterns.some(pattern => pattern.test(record.name));
  const activityDecision = activityMatch ? 'true' : 'uncertain';
  const nameDecision = nameMatch ? 'true' : 'uncertain';
  if (activityMatch) {
    return {
      relevance: 'true',
      reviewStatus: 'reviewed-from-official-activity',
      reviewDecisions: [
        { reviewerId: 'official-activity-rule-v1', decision: activityDecision },
        { reviewerId: 'name-corroboration-rule-v1', decision: nameDecision },
      ],
      reasons: ['official_activity_matches_sector'],
    };
  }
  if (nameMatch) {
    return {
      relevance: 'true',
      reviewStatus: 'reviewed-from-official-name',
      reviewDecisions: [
        { reviewerId: 'official-activity-rule-v1', decision: activityDecision },
        { reviewerId: 'name-corroboration-rule-v1', decision: nameDecision },
      ],
      reasons: ['official_name_matches_sector'],
    };
  }
  return {
    relevance: 'uncertain',
    reviewStatus: 'double-reviewed-pending',
    reviewDecisions: [
      { reviewerId: 'official-activity-rule-v1', decision: 'uncertain' },
      { reviewerId: 'name-corroboration-rule-v1', decision: 'uncertain' },
    ],
    reasons: ['query_hit_without_sector_evidence_in_official_activity_or_name'],
  };
}

function usefulName(record) {
  const normalized = normalizeText(record.name);
  return normalized && !['sn', 'sense nom', 'sin nombre'].includes(normalized);
}

function observationFrom(record, source, sector, label, role, sequence, timeline) {
  const sameEstablishmentGroup = `${source.id}:${record.establishmentId}`;
  return {
    observationId: `${source.city.toLowerCase()}:${sector.id}:${record.sourceRecordId}:${role}:${sequence}`,
    queryId: `${source.city.toLowerCase()}:${sector.id}`,
    city: source.city,
    country: 'ES',
    provinceCode: source.provinceCode,
    municipalityCode: source.municipalityCode,
    querySectorId: sector.id,
    querySectorLegacy: sector.legacy,
    sectorFamilyId: sector.familyId,
    samplingRole: role,
    ...record,
    normalizedName: normalizeText(record.name),
    canonicalSectorIds: label.relevance === 'true' ? [sector.id] : [],
    classificationEvidence: label.relevance === 'true' ? [{
      type: label.reasons.includes('official_activity_matches_sector') ? 'official_activity' : 'official_commercial_name',
      value: label.reasons.includes('official_activity_matches_sector') ? record.activity : record.name,
      sourceId: source.id,
    }] : [],
    labels: {
      relevance: label.relevance,
      geographyCorrect: true,
      provenanceOk: true,
      identityLevel: 'source-record',
      sameEstablishmentGroup,
      branchGroup: null,
      reviewStatus: label.reviewStatus,
      reviewDecisions: label.reviewDecisions,
      reasons: label.reasons,
      conflicts: [],
    },
    provenance: [{
      sourceId: source.id,
      sourceRecordId: record.sourceRecordId,
      sourceUpdatedAt: record.sourceUpdatedAt,
      resourceId: source.resourceId,
      datasetUrl: source.datasetUrl,
      acquiredAt: timeline.capture.acquiredAt,
      acquiredOn: timeline.capture.acquiredOn,
      acquisitionTimeStatus: timeline.capture.timeStatus,
      indexedAt: timeline.reindexedAt,
      licenseId: source.licenseId,
      license: source.license,
      attribution: source.attribution,
    }],
  };
}

function addCrossSectorNegatives(observations, source, sectorPools, timeline) {
  for (let index = 0; index < SECTORS.length; index++) {
    const target = SECTORS[index];
    const donor = SECTORS[(index + 3) % SECTORS.length];
    const donorRows = sectorPools.get(donor.id)?.filter(entry => entry.label.relevance === 'true') || [];
    for (const [offset, entry] of donorRows.slice(0, 2).entries()) {
      const negative = {
        relevance: 'false',
        reviewStatus: 'double-reviewed-negative-control',
        reviewDecisions: [
          { reviewerId: 'official-activity-rule-v1', decision: 'false' },
          { reviewerId: 'cross-sector-control-v1', decision: 'false' },
        ],
        reasons: [`official_activity_matches_${donor.id}_not_${target.id}`],
      };
      observations.push(observationFrom(entry.record, source, target, negative, 'cross-sector-negative', offset, timeline));
    }
  }
}

function assignBranchGroups(observations) {
  const byCityAndName = new Map();
  for (const observation of observations) {
    if (!observation.normalizedName || observation.normalizedName.length < 5) continue;
    const key = `${observation.city}|${observation.normalizedName}`;
    if (!byCityAndName.has(key)) byCityAndName.set(key, []);
    byCityAndName.get(key).push(observation);
  }
  let groups = 0;
  for (const [key, rows] of byCityAndName) {
    const establishments = new Set(rows.map(row => row.labels.sameEstablishmentGroup));
    const addresses = new Set(rows.map(row => normalizeText(row.address)));
    if (establishments.size < 2 || addresses.size < 2) continue;
    const groupId = `branch:${sha256(Buffer.from(key)).slice(0, 16)}`;
    for (const row of rows) row.labels.branchGroup = groupId;
    groups++;
  }
  return groups;
}

function readSourceManifest() {
  const manifest = JSON.parse(fs.readFileSync(sourceManifestPath, 'utf8'));
  const byFile = new Map(manifest.files.map(file => [file.file.replace(/\\/g, '/'), file]));
  for (const descriptor of manifest.files) {
    const filePath = path.join(root, descriptor.file);
    const buffer = fs.readFileSync(filePath);
    if (sha256(buffer) !== descriptor.sha256 || buffer.length !== descriptor.bytes) throw new Error(`Raw source integrity failure: ${descriptor.file}`);
  }
  return { manifest, byFile };
}

function dibaDiagnostic() {
  const file = path.join(rawDir, 'diba-geography-diagnostic.json');
  if (!fs.existsSync(file)) return { available: false, reason: 'snapshot_missing' };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = Array.isArray(data.elements) ? data.elements : [];
  const mismatches = rows.filter(row => row.adreca?.nom_municipi === 'BARCELONA' && row.rel_municipi !== '08019');
  return {
    available: true,
    sourceId: 'diba_gia',
    records: rows.length,
    license: data.llicencia || '',
    sourceUpdatedAt: data.modificacio || '',
    distinctAuthorityMunicipalities: [...new Set(rows.map(row => row.rel_municipi).filter(Boolean))].sort(),
    misleadingAddressMunicipalityRows: mismatches.length,
    eligibleForBarcelonaCityCorpus: mismatches.length === 0 && rows.every(row => row.rel_municipi === '08019'),
    decision: 'diagnostic_only_not_in_scored_corpus',
  };
}

function main() {
  const { manifest: sourceManifest } = readSourceManifest();
  const timeline = {
    capture: sourceManifest.capture,
    reindexedAt: sourceManifest.reindexedAt,
    generatedAt: sourceManifest.corpusGeneratedAt,
  };
  const observations = [];
  const sourceStats = [];
  for (const [sourceKey, source] of Object.entries(SOURCES)) {
    const sectorPools = new Map();
    for (const sector of SECTORS) {
      const fileName = rawFileName(sourceKey, sector.id);
      const raw = JSON.parse(fs.readFileSync(path.join(rawDir, fileName), 'utf8'));
      const rows = raw.result.records;
      const pool = rows
        .map(row => sourceKey === 'madrid' ? normalizeMadrid(row, source) : normalizeBarcelona(row, source))
        .filter(record => record.sourceRecordId && usefulName(record) && record.address)
        .map(record => ({ record, label: classify(record, sector) }));
      sectorPools.set(sector.id, pool);
      const selected = [
        ...pool.filter(entry => entry.label.relevance === 'true').slice(0, 16),
        ...pool.filter(entry => entry.label.relevance === 'uncertain').slice(0, 3),
        ...pool.filter(entry => entry.label.relevance === 'false').slice(0, 3),
      ];
      selected.forEach((entry, index) => observations.push(observationFrom(entry.record, source, sector, entry.label, 'source-query', index, timeline)));
      sourceStats.push({ sourceId: source.id, city: source.city, sectorId: sector.id, rawRows: rows.length, eligibleRows: pool.length, selectedRows: selected.length });
    }
    addCrossSectorNegatives(observations, source, sectorPools, timeline);
  }

  const branchGroups = assignBranchGroups(observations);
  const byCity = Object.values(SOURCES).map(source => ({ city: source.city, observations: observations.filter(row => row.city === source.city).length }));
  for (const city of byCity) {
    if (city.observations < 100) throw new Error(`${city.city} has only ${city.observations} observations; E2 requires at least 100.`);
    if (city.observations > MAX_OBSERVATIONS_PER_CITY) throw new Error(`${city.city} exceeds the E2 memory budget.`);
  }

  const corpus = {
    schemaVersion: 1,
    corpusRelease: sourceManifest.corpusRelease,
    generatedAt: timeline.generatedAt,
    sourceTimeline: timeline,
    purpose: 'Evaluation corpus only. It is not a production index and is never loaded by the SPA.',
    unit: 'establishment-observation',
    labelPolicy: {
      querySectorIsEvidence: false,
      strongEvidence: 'official source activity/category',
      ambiguousEvidence: 'retained as uncertain with two independent rule decisions',
      automaticLegalEntityInference: false,
    },
    cities: byCity,
    sectors: SECTORS.map(({ id, legacy, familyId }) => ({ id, legacy, familyId })),
    sources: sourceManifest.sources,
    deferredSources: DEFERRED_SOURCES,
    sourceStats,
    dibaDiagnostic: dibaDiagnostic(),
    branchGroups,
    observations,
  };
  const corpusBuffer = Buffer.from(`${JSON.stringify(corpus, null, 2)}\n`);
  if (corpusBuffer.length > MAX_CORPUS_BYTES) throw new Error(`Corpus ${corpusBuffer.length} bytes exceeds ${MAX_CORPUS_BYTES}.`);
  fs.writeFileSync(corpusPath, corpusBuffer);
  const manifest = {
    schemaVersion: 1,
    corpusRelease: corpus.corpusRelease,
    generatedAt: corpus.generatedAt,
    corpus: {
      file: 'tests/fixtures/business-coverage/corpus.v1.json',
      sha256: sha256(corpusBuffer),
      bytes: corpusBuffer.length,
      observations: observations.length,
      cities: byCity,
      branchGroups,
    },
    sourceManifest: {
      file: 'tests/fixtures/business-coverage/source-manifest.json',
      sha256: sha256(fs.readFileSync(sourceManifestPath)),
    },
    limits: { maxCorpusBytes: MAX_CORPUS_BYTES, maxObservationsPerCity: MAX_OBSERVATIONS_PER_CITY },
  };
  fs.writeFileSync(corpusManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`E2 corpus OK: ${observations.length} observations, ${byCity.map(item => `${item.city}=${item.observations}`).join(', ')}, branches=${branchGroups}, bytes=${corpusBuffer.length}.`);
}

main();
