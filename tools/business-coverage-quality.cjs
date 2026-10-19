#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const providers = require('../modules/business-providers.js');
const { validateCoverageCorpus } = require('./validate-business-coverage-corpus.cjs');

function percent(value, total) { return total ? Number((value * 100 / total).toFixed(2)) : 0; }
function countBy(rows, keyFn) {
  const result = {};
  for (const row of rows) { const key = keyFn(row); result[key] = (result[key] || 0) + 1; }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function measureCoverage(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const validation = validateCoverageCorpus({ root });
  if (!validation.ok) throw new Error(`Corpus validation failed:\n${validation.errors.map(item => `${item.code} ${item.location}`).join('\n')}`);
  const file = path.join(root, 'tests/fixtures/business-coverage/corpus.v1.json');
  const corpus = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = corpus.observations;
  const uniqueSourceRecords = new Set(rows.map(row => `${row.sourceId}:${row.establishmentId}`));
  const contactCounts = {
    phone: rows.filter(row => row.phones.length).length,
    website: rows.filter(row => row.websites.length).length,
    email: rows.filter(row => row.emails.length).length,
  };
  const incomplete = rows.filter(row => !row.legalName || !row.postalCode || row.lat == null || row.lng == null || (!row.phones.length && !row.websites.length && !row.emails.length));
  const dedupeInput = rows.map(row => ({
    id: row.observationId,
    name: row.name,
    address: row.address,
    postalCode: row.postalCode,
    locality: row.city,
    province: row.provinceCode,
    lat: row.lat,
    lng: row.lng,
    phone: row.phones[0] || '',
    phones: row.phones,
    website: row.websites[0] || '',
    email: row.emails[0] || '',
    emails: row.emails,
    provider: row.sourceId,
    externalIds: { [row.sourceId]: row.establishmentId },
    matchedSectors: row.canonicalSectorIds,
    provenance: [{
      observationId: row.observationId,
      sameEstablishmentGroup: row.labels.sameEstablishmentGroup,
      branchGroup: row.labels.branchGroup,
      sourceId: row.sourceId,
    }],
  }));
  const deduped = providers.deduplicateMultisource(dedupeInput, { getMergeableSectors: row => row.matchedSectors || [] });
  let falseAutomaticMerges = 0;
  const falseMergeDetails = [];
  const remainingGroups = new Map();
  const branchOutputs = new Map();
  for (const output of deduped) {
    const groups = new Set((output.provenance || []).map(item => item.sameEstablishmentGroup).filter(Boolean));
    if (groups.size > 1) {
      falseAutomaticMerges++;
      falseMergeDetails.push({
        outputId: output.id,
        name: output.name,
        address: output.address,
        establishmentGroups: [...groups],
        observations: (output.provenance || []).map(item => item.observationId).filter(Boolean),
      });
    }
    for (const group of groups) remainingGroups.set(group, (remainingGroups.get(group) || 0) + 1);
    for (const item of output.provenance || []) {
      if (!item.branchGroup) continue;
      if (!branchOutputs.has(item.branchGroup)) branchOutputs.set(item.branchGroup, new Set());
      branchOutputs.get(item.branchGroup).add(output.id);
    }
  }
  const residualDuplicateGroups = [...remainingGroups.values()].filter(count => count > 1).length;
  let collapsedBranchGroups = 0;
  const expectedBranches = new Map();
  for (const row of rows.filter(row => row.labels.branchGroup)) {
    if (!expectedBranches.has(row.labels.branchGroup)) expectedBranches.set(row.labels.branchGroup, new Set());
    expectedBranches.get(row.labels.branchGroup).add(row.labels.sameEstablishmentGroup);
  }
  for (const [group, establishments] of expectedBranches) {
    if ((branchOutputs.get(group)?.size || 0) < establishments.size) collapsedBranchGroups++;
  }
  const geographyErrors = rows.filter(row => row.labels.geographyCorrect !== true).length;
  const provenanceErrors = rows.filter(row => row.labels.provenanceOk !== true || !row.provenance?.length).length;
  const classified = rows.filter(row => row.labels.relevance !== 'uncertain');
  const metrics = {
    schemaVersion: 1,
    corpusRelease: corpus.corpusRelease,
    measuredAt: corpus.generatedAt,
    methodology: 'Deterministic measurements over the committed bounded E2 corpus; no external requests.',
    caveat: 'Relevance labels are source-evidence rules, not an independent human ground truth. Precision of the future search engine is not measured in E2.',
    totals: {
      observations: rows.length,
      uniqueSourceEstablishments: uniqueSourceRecords.size,
      deduplicatedOutputs: deduped.length,
      cities: new Set(rows.map(row => row.city)).size,
      sectors: new Set(rows.map(row => row.querySectorId)).size,
    },
    distribution: {
      byCity: countBy(rows, row => row.city),
      byCityAndSector: countBy(rows, row => `${row.city}/${row.querySectorId}`),
      bySource: countBy(rows, row => row.sourceId),
      relevance: countBy(rows, row => row.labels.relevance),
      samplingRole: countBy(rows, row => row.samplingRole),
    },
    sourceEvidenceLabelBalance: {
      classifiedRows: classified.length,
      positive: classified.filter(row => row.labels.relevance === 'true').length,
      negative: classified.filter(row => row.labels.relevance === 'false').length,
      uncertain: rows.filter(row => row.labels.relevance === 'uncertain').length,
      positivePercentOfClassified: percent(classified.filter(row => row.labels.relevance === 'true').length, classified.length),
    },
    identity: {
      repeatedObservations: rows.length - uniqueSourceRecords.size,
      falseAutomaticMerges,
      falseMergeDetails,
      residualDuplicateGroups,
      branchGroups: expectedBranches.size,
      collapsedBranchGroups,
    },
    geography: {
      errors: geographyErrors,
      verifiedPercent: percent(rows.length - geographyErrors, rows.length),
      dibaDiagnostic: corpus.dibaDiagnostic,
    },
    contacts: {
      phoneRecords: contactCounts.phone,
      phonePercent: percent(contactCounts.phone, rows.length),
      websiteRecords: contactCounts.website,
      websitePercent: percent(contactCounts.website, rows.length),
      emailRecords: contactCounts.email,
      emailPercent: percent(contactCounts.email, rows.length),
      note: 'The selected official resources do not publish these contact fields; no values were invented or enriched.',
    },
    completeness: { incompleteRecords: incomplete.length, incompletePercent: percent(incomplete.length, rows.length) },
    provenance: { errors: provenanceErrors, verifiedPercent: percent(rows.length - provenanceErrors, rows.length) },
    budgets: { corpusBytes: fs.statSync(file).size, maxCorpusBytes: 1024 * 1024, withinLimit: fs.statSync(file).size <= 1024 * 1024 },
    acceptance: {
      falseAutomaticMergesZero: falseAutomaticMerges === 0,
      collapsedBranchGroupsZero: collapsedBranchGroups === 0,
      geographyErrorsZero: geographyErrors === 0,
      provenanceComplete: provenanceErrors === 0,
      memoryBudgetMet: fs.statSync(file).size <= 1024 * 1024,
      minimumCitySampleMet: [...new Set(rows.map(row => row.city))].every(city => rows.filter(row => row.city === city).length >= 100),
    },
  };
  metrics.acceptance.ready = Object.values(metrics.acceptance).every(Boolean);
  const output = path.join(root, 'tests/fixtures/business-coverage/quality-metrics.json');
  fs.writeFileSync(output, `${JSON.stringify(metrics, null, 2)}\n`);
  if (!metrics.acceptance.ready && options.enforce !== false) throw new Error(`E2 quality gates failed: ${JSON.stringify(metrics.acceptance)}`);
  return metrics;
}

if (require.main === module) {
  const reportOnly = process.argv.includes('--report-only');
  const rootArg = process.argv.slice(2).find(argument => !argument.startsWith('--'));
  const metrics = measureCoverage({ root: rootArg, enforce: !reportOnly });
  console.log(`E2 quality measured: observations=${metrics.totals.observations}, unique=${metrics.totals.uniqueSourceEstablishments}, falseMerges=${metrics.identity.falseAutomaticMerges}, residualDuplicates=${metrics.identity.residualDuplicateGroups}, collapsedBranches=${metrics.identity.collapsedBranchGroups}.`);
  if (!metrics.acceptance.ready && reportOnly) console.log('E2 quality report: NOT READY (known acceptance finding retained).');
}

module.exports = { measureCoverage };
