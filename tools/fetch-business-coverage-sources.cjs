#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { SECTORS, SOURCES, DEFERRED_SOURCES, buildQueryUrl, rawFileName } = require('./business-coverage-sources.cjs');

const root = path.resolve(__dirname, '..');
const rawDir = path.join(root, 'tests/fixtures/business-coverage/raw');
const manifestPath = path.join(root, 'tests/fixtures/business-coverage/source-manifest.json');
const args = new Set(process.argv.slice(2));

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validDateTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function assertNotFuture(value, name, now = Date.now()) {
  if (!validDateTime(value)) throw new Error(`Invalid --${name} value`);
  if (Date.parse(value) > now + 60000) throw new Error(`--${name} cannot be in the future`);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Voltflow3-E2-corpus/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const parsed = JSON.parse(text);
    if (parsed.success !== true || !Array.isArray(parsed.result?.records)) throw new Error('Unexpected CKAN response');
    return { text, parsed };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDibaDiagnostic(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Voltflow3-E2-corpus/1.0' }, signal: controller.signal });
    if (!response.ok) throw new Error(`DIBA HTTP ${response.status}`);
    const parsed = await response.json();
    if (!Array.isArray(parsed.elements)) throw new Error('Unexpected DIBA response');
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (!args.has('--refresh') && !args.has('--index-existing')) {
    console.log('No network performed. Use --refresh explicitly to update the bounded public snapshots.');
    return;
  }
  fs.mkdirSync(rawDir, { recursive: true });
  const operationStartedAt = new Date().toISOString();
  const reindexedAt = arg('reindexed-at', operationStartedAt);
  const corpusGeneratedAt = arg('corpus-generated-at', reindexedAt);
  assertNotFuture(reindexedAt, 'reindexed-at');
  assertNotFuture(corpusGeneratedAt, 'corpus-generated-at');
  if (Date.parse(corpusGeneratedAt) < Date.parse(reindexedAt)) throw new Error('--corpus-generated-at cannot precede --reindexed-at');
  let existingManifest = null;
  if (fs.existsSync(manifestPath)) {
    try { existingManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { existingManifest = null; }
  }
  let capture;
  if (args.has('--refresh')) {
    const acquiredAt = arg('acquired-at', operationStartedAt);
    assertNotFuture(acquiredAt, 'acquired-at');
    capture = { acquiredAt, acquiredOn: acquiredAt.slice(0, 10), timeStatus: 'exact' };
  } else if (existingManifest?.capture?.timeStatus === 'exact' && validDateTime(existingManifest.capture.acquiredAt)) {
    capture = existingManifest.capture;
  } else {
    const acquiredOn = arg('acquired-on', existingManifest?.capture?.acquiredOn || String(existingManifest?.retrievedAt || '').slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acquiredOn)) throw new Error('--acquired-on is required for historical snapshots with unknown acquisition time');
    if (acquiredOn > operationStartedAt.slice(0, 10)) throw new Error('--acquired-on cannot be in the future');
    capture = { acquiredAt: null, acquiredOn, timeStatus: 'exact_time_unknown' };
  }
  const files = [];
  for (const [sourceKey, source] of Object.entries(SOURCES)) {
    for (const sector of SECTORS) {
      const url = buildQueryUrl(source, sector);
      const fileName = rawFileName(sourceKey, sector.id);
      const relative = `tests/fixtures/business-coverage/raw/${fileName}`;
      const filePath = path.join(rawDir, fileName);
      let parsed;
      if (args.has('--refresh')) {
        ({ parsed } = await fetchJson(url));
        fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
      } else {
        if (!fs.existsSync(filePath)) throw new Error(`Missing raw snapshot: ${relative}`);
        parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (parsed.success !== true || !Array.isArray(parsed.result?.records)) throw new Error(`Invalid raw snapshot: ${relative}`);
      }
      const buffer = fs.readFileSync(filePath);
      files.push({
        file: relative,
        sha256: sha256(buffer),
        bytes: buffer.length,
        sourceId: source.id,
        resourceId: source.resourceId,
        city: source.city,
        sectorId: sector.id,
        query: sector.queries[sourceKey],
        requestUrl: url,
        returnedRecords: parsed.result.records.length,
        availableRecords: Number.isInteger(parsed.result.total) ? parsed.result.total : null,
        capture,
        reindexedAt,
        licenseId: source.licenseId,
        license: source.license,
        licenseUrl: source.licenseUrl,
        attribution: source.attribution,
      });
      console.log(`${source.city}/${sector.id}: ${parsed.result.records.length} records`);
      if (args.has('--refresh')) await sleep(350);
    }
  }
  const diagnostics = [];
  const dibaFileName = 'diba-geography-diagnostic.json';
  const dibaPath = path.join(rawDir, dibaFileName);
  const dibaUrl = 'https://do.diba.cat/api/dataset/establiments/camp-nom_municipi/BARCELONA/pag-fi/10';
  if (args.has('--refresh')) {
    await sleep(350);
    const parsed = await fetchDibaDiagnostic(dibaUrl);
    fs.writeFileSync(dibaPath, `${JSON.stringify(parsed, null, 2)}\n`);
  }
  if (fs.existsSync(dibaPath)) {
    const buffer = fs.readFileSync(dibaPath);
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (!Array.isArray(parsed.elements)) throw new Error('Invalid DIBA diagnostic snapshot');
    diagnostics.push({
      file: `tests/fixtures/business-coverage/raw/${dibaFileName}`,
      sha256: sha256(buffer),
      bytes: buffer.length,
      sourceId: 'diba_gia',
      purpose: 'geography-scope-diagnostic-only',
      requestUrl: dibaUrl,
      returnedRecords: parsed.elements.length,
      capture,
      reindexedAt,
      licenseId: 'CC-BY-4.0',
      license: parsed.llicencia || 'Creative Commons Attribution 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      includedInScoredCorpus: false,
    });
  }
  const manifest = {
    schemaVersion: 1,
    corpusRelease: 'coverage-pilot-e2.1',
    capture,
    reindexedAt,
    corpusGeneratedAt,
    zeroCost: true,
    authenticatedRequests: 0,
    maxRecordsPerRequest: 30,
    sources: Object.values(SOURCES).map(source => ({
      id: source.id,
      datasetUrl: source.datasetUrl,
      resourceId: source.resourceId,
      licenseId: source.licenseId,
      license: source.license,
      licenseUrl: source.licenseUrl,
      attribution: source.attribution,
    })),
    deferredSources: DEFERRED_SOURCES,
    files,
    diagnostics,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Source snapshots OK: ${files.length} files, ${files.reduce((sum, file) => sum + file.returnedRecords, 0)} bounded records.`);
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exit(1);
});
