#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const MAX_PARTITION_BYTES = 1024 * 1024;
const MAX_PARTITION_RECORDS = 10000;

function usage() {
  console.log(`Usage:
  node tools/build-business-index.cjs --provider <id> --input <file> --out data/business-indexes --partition <postal|province|locality> [--limit N]
    --province-code <INE-2> --municipality-codes <INE-5,...>
    --sector-ids <id,...> --sector-families <id,...>
    --license-id <id> --attribution-id <id> --source-updated-at <ISO-8601>

Providers:
  diba_gia_csv, madrid_open_data_csv, overture_export_jsonl, foursquare_export_jsonl

Notes:
  - Overture and Foursquare must be exported offline to JSONL/NDJSON first.
  - This tool creates schema v2 browser partitions and updates manifest.json.
  - Geographic, sector and legal metadata are mandatory contract inputs.
  - A partition is rejected above 10,000 records or 1 MiB uncompressed.
  - It does not download paid data or call external APIs.`);
}

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

function listArg(name) {
  return arg(name).split(',').map(value => value.trim()).filter(Boolean);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') { cell += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === ',') { row.push(cell); cell = ''; continue; }
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift()?.map(h => h.trim()) || [];
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
}

function normalizeText(value = '') {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeRow(provider, row) {
  if (provider === 'diba_gia_csv') {
    return {
      externalId: row.id || row.ID || '',
      name: row.nom_comercial || row.rao_social_nom || '',
      legalName: row.rao_social_nom || '',
      address: row.adreca_completa || row['adreca.adreca_completa'] || '',
      postalCode: row.codi_postal || row['adreca.codi_postal'] || '',
      locality: row.nom_municipi || row['adreca.nom_municipi'] || '',
      province: 'Barcelona',
      category: row.descripcio_activitat || row.descripcio_nace || '',
      activity: row.descripcio_activitat || '',
      lat: parseFloat(String(row.localitzacio || row['adreca.localitzacio'] || '').split(',')[0]) || null,
      lng: parseFloat(String(row.localitzacio || row['adreca.localitzacio'] || '').split(',')[1]) || null,
      dateUpdated: row.data_modificacio || '',
      sourceProvider: 'diba_gia',
      license: 'CC BY 4.0',
      attribution: 'Diputacio de Barcelona / ajuntaments titulars',
    };
  }
  if (provider === 'madrid_open_data_csv') {
    return {
      externalId: row.id_local || row.ID_LOCAL || row.id || '',
      name: row.rotulo || row.Rotulo || row.nombre || row.Nombre || '',
      address: row.desc_direccion || row.direccion || row.Direccion || '',
      postalCode: row.cod_postal || row.codigo_postal || row.COD_POSTAL || '',
      locality: 'Madrid',
      province: 'Madrid',
      category: row.desc_actividad || row.actividad || row.Actividad || '',
      activity: row.desc_actividad || row.actividad || '',
      lat: parseFloat(row.latitud || row.latitude || '') || null,
      lng: parseFloat(row.longitud || row.longitude || '') || null,
      dateUpdated: row.fecha_actualizacion || '',
      sourceProvider: 'madrid_open_data_static',
      license: 'CC BY 4.0',
      attribution: 'Ayuntamiento de Madrid',
    };
  }
  if (provider === 'overture_export_jsonl') {
    const names = row.names || {};
    const address = Array.isArray(row.addresses) ? row.addresses[0] || {} : {};
    const websites = Array.isArray(row.websites) ? row.websites : [];
    const emails = Array.isArray(row.emails) ? row.emails : [];
    return {
      externalId: row.id || '',
      name: names.primary || row.primary_name || row.name || '',
      address: address.freeform || '',
      postalCode: address.postcode || '',
      locality: address.locality || '',
      province: address.region || '',
      category: row.taxonomy?.primary || row.basic_category || '',
      activity: row.taxonomy?.primary || '',
      lat: row.geometry?.coordinates?.[1] ?? row.lat ?? null,
      lng: row.geometry?.coordinates?.[0] ?? row.lng ?? null,
      website: websites[0] || '',
      emails,
      dateUpdated: row.update_time || '',
      confidence: row.confidence ?? 0.7,
      sourceProvider: 'overture_places_static',
      license: 'CDLA Permissive 2.0 / source-specific notices',
      attribution: 'Overture Maps Foundation and source contributors',
    };
  }
  if (provider === 'foursquare_export_jsonl') {
    return {
      externalId: row.fsq_place_id || row.id || '',
      name: row.name || '',
      address: row.address || row.address_extended || '',
      postalCode: row.postcode || '',
      locality: row.locality || row.city || '',
      province: row.region || '',
      category: Array.isArray(row.categories) ? row.categories.join(', ') : String(row.categories || ''),
      activity: Array.isArray(row.categories) ? row.categories[0] || '' : '',
      lat: row.latitude ?? row.lat ?? null,
      lng: row.longitude ?? row.lng ?? null,
      website: row.website || '',
      phone: row.tel || row.phone || '',
      dateUpdated: row.date_refreshed || row.updated_at || '',
      sourceProvider: 'foursquare_os_places_static',
      license: 'Apache-2.0 with Foursquare NOTICE',
      attribution: 'Foursquare Labs, Inc.',
    };
  }
  return row;
}

function partitionKey(record, mode) {
  if (mode === 'province') return normalizeText(record.province || 'unknown') || 'unknown';
  if (mode === 'locality') return normalizeText(record.locality || 'unknown') || 'unknown';
  return String(record.postalCode || 'unknown').slice(0, 2) || 'unknown';
}

function main() {
  const provider = arg('provider');
  const input = arg('input');
  const outDir = path.resolve(root, arg('out', 'data/business-indexes'));
  const partition = arg('partition', 'postal');
  const limit = parseInt(arg('limit', '0'), 10) || 0;
  const provinceCode = arg('province-code');
  const municipalityCodes = listArg('municipality-codes');
  const sectorIds = listArg('sector-ids');
  const sectorFamilies = listArg('sector-families');
  const licenseId = arg('license-id');
  const attributionId = arg('attribution-id');
  const sourceUpdatedAt = arg('source-updated-at');
  if (!provider || !input) { usage(); process.exit(2); }
  const metadataValid = /^\d{2}$/.test(provinceCode) && municipalityCodes.length && municipalityCodes.every(code => /^\d{5}$/.test(code)) &&
    sectorIds.length && sectorFamilies.length && licenseId && attributionId && Number.isFinite(Date.parse(sourceUpdatedAt));
  if (!metadataValid) {
    console.error('Missing or invalid schema v2 metadata. See --help usage.');
    process.exit(2);
  }
  const inputPath = path.resolve(process.cwd(), input);
  const raw = fs.readFileSync(inputPath, 'utf8');
  const isJsonl = /\.jsonl$|\.ndjson$/i.test(inputPath);
  const rows = isJsonl
    ? raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
    : parseCsv(raw);
  const records = rows.map(row => normalizeRow(provider, row)).filter(r => r.name || r.legalName);
  const capped = limit > 0 ? records.slice(0, limit) : records;
  const groups = new Map();
  for (const record of capped) {
    const key = partitionKey(record, partition);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  const providerId = capped[0]?.sourceProvider || provider;
  const providerDir = path.join(outDir, providerId);
  ensureDir(providerDir);
  const partitions = [];
  const generatedAt = new Date().toISOString();
  for (const [key, group] of groups) {
    const file = path.join(providerDir, `${partition}-${key}.json`);
    if (group.length > MAX_PARTITION_RECORDS) {
      throw new Error(`Partition ${key} has ${group.length} records; maximum is ${MAX_PARTITION_RECORDS}. Split the input before publishing.`);
    }
    const payload = `${JSON.stringify({ provider: providerId, recordSchemaVersion: 1, generatedAt, records: group }, null, 2)}\n`;
    const bytes = Buffer.byteLength(payload);
    if (bytes > MAX_PARTITION_BYTES) {
      throw new Error(`Partition ${key} has ${bytes} bytes; maximum is ${MAX_PARTITION_BYTES}. Split the input before publishing.`);
    }
    fs.writeFileSync(file, payload);
    partitions.push({
      file: path.relative(root, file).replace(/\\/g, '/'),
      sha256: sha256File(file),
      bytes,
      recordCount: group.length,
      recordSchemaVersion: 1,
      country: 'ES',
      provinceCode,
      municipalityCodes,
      sectorIds,
      sectorFamilies,
      sourceUpdatedAt: new Date(sourceUpdatedAt).toISOString(),
      generatedAt,
      licenseId,
      attributionId,
      [partition === 'postal' ? 'postalPrefix' : partition]: key,
      count: group.length,
    });
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
  if (!manifest || manifest.schemaVersion !== 2) throw new Error('A schema v2 manifest must exist before building partitions.');
  manifest.generatedAt = generatedAt;
  manifest.providers = manifest.providers || {};
  const currentProvider = manifest.providers[providerId] || {};
  manifest.providers[providerId] = { ...currentProvider, enabled: true, licenseId, attributionId, partitions };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Indexed ${capped.length} records into ${partitions.length} partitions for ${providerId}`);
}

main();
