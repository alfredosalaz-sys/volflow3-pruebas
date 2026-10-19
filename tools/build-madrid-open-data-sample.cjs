#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const RESOURCE_ID = '200085-1-censo-locales';
const API_URL = 'https://datos.madrid.es/api/3/action/datastore_search';
const DEFAULT_TERMS = [
  ['Dental', 'dental', /dent/i],
  ['Gestorias', 'gestoria', /gestor/i],
  ['Inmobiliarias', 'inmobiliaria', /inmobili/i],
];

function arg(name, fallback = '') {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cleanNumber(value = '') {
  return String(value || '').replace(/^0+/, '') || String(value || '').trim();
}

function buildAddress(row) {
  const street = [row.clase_vial_acceso || row.clase_vial_edificio, row.desc_vial_acceso || row.desc_vial_edificio]
    .filter(Boolean)
    .join(' ');
  const number = cleanNumber(row.num_acceso || row.num_edificio || '');
  const extra = row.cal_acceso || row.cal_edificio || '';
  return [street, [number, extra].filter(Boolean).join(''), row.cod_postal, 'Madrid']
    .filter(Boolean)
    .join(', ');
}

function utm30ToWgs84(easting, northing) {
  const x = Number(easting);
  const y = Number(northing);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return { lat: null, lng: null };
  const a = 6378137.0;
  const eccSquared = 0.00669438002290;
  const k0 = 0.9996;
  const eccPrimeSquared = eccSquared / (1 - eccSquared);
  const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
  const xAdj = x - 500000.0;
  const m = y / k0;
  const mu = m / (a * (1 - eccSquared / 4 - 3 * eccSquared * eccSquared / 64 - 5 * eccSquared ** 3 / 256));
  const phi1Rad = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1Rad) ** 2);
  const t1 = Math.tan(phi1Rad) ** 2;
  const c1 = eccPrimeSquared * Math.cos(phi1Rad) ** 2;
  const r1 = a * (1 - eccSquared) / ((1 - eccSquared * Math.sin(phi1Rad) ** 2) ** 1.5);
  const d = xAdj / (n1 * k0);
  const latRad = phi1Rad - (n1 * Math.tan(phi1Rad) / r1) * (
    d * d / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * eccPrimeSquared) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * eccPrimeSquared - 3 * c1 * c1) * d ** 6 / 720
  );
  const lonOrigin = -3;
  const lng = lonOrigin + (
    d
    - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * eccPrimeSquared + 24 * t1 * t1) * d ** 5 / 120
  ) / Math.cos(phi1Rad) * 180 / Math.PI;
  const lat = latRad * 180 / Math.PI;
  return { lat: Number(lat.toFixed(7)), lng: Number(lng.toFixed(7)) };
}

function normalizeRow(row, segment, queryTerm) {
  const coords = utm30ToWgs84(row.coordenada_x_local, row.coordenada_y_local);
  const name = row.rotulo || '';
  return {
    id: `madrid:${row.id_local || row._id}:${normalizeText(name).slice(0, 48)}`,
    externalId: row.id_local || String(row._id || ''),
    externalIds: { madrid_open_data_static: row.id_local || String(row._id || '') },
    name,
    address: buildAddress(row),
    postalCode: row.cod_postal || '',
    locality: 'Madrid',
    province: 'Madrid',
    district: row.desc_distrito_local || '',
    neighborhood: row.desc_barrio_local || '',
    lat: coords.lat,
    lng: coords.lng,
    category: queryTerm,
    activity: queryTerm,
    classifications: [row.desc_situacion_local, row.desc_tipo_acceso_local].filter(Boolean),
    matchedSectors: [segment],
    sourceSector: segment,
    segment,
    dateUpdated: row.fx_carga || '',
    sourceProvider: 'madrid_open_data_static',
    license: 'CC BY 4.0',
    attribution: 'Ayuntamiento de Madrid',
    confidence: row.desc_situacion_local === 'Abierto' ? 0.72 : 0.55,
    reviewStatus: row.desc_situacion_local === 'Abierto' ? 'open_local' : 'review_required',
    provenance: [{
      provider: 'madrid_open_data_static',
      externalId: row.id_local || String(row._id || ''),
      fields: ['name', 'address', 'postalCode', 'coordinates', 'openingStatus'],
      license: 'CC BY 4.0',
      resourceId: RESOURCE_ID,
    }],
    signals: [`Fuente: Ayuntamiento de Madrid Censo de Locales (${row.desc_situacion_local || 'estado no indicado'})`],
    phones: [],
    emails: [],
    website: '',
  };
}

async function fetchTerm(segment, term, match, limit) {
  const url = new URL(API_URL);
  url.searchParams.set('resource_id', RESOURCE_ID);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('q', term);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Madrid Open Data HTTP ${res.status}`);
  const json = await res.json();
  const records = json?.result?.records || [];
  return records
    .filter(row => row.rotulo && row.cod_postal && row.desc_situacion_local === 'Abierto')
    .filter(row => match.test(String(row.rotulo || '')))
    .map(row => normalizeRow(row, segment, term));
}

async function main() {
  const outDir = path.resolve(root, arg('out', 'data/business-indexes'));
  const limit = Math.max(1, Math.min(parseInt(arg('limit', '10'), 10) || 10, 25));
  const providerDir = path.join(outDir, 'madrid_open_data_static');
  fs.mkdirSync(providerDir, { recursive: true });

  const all = [];
  const stats = {};
  for (const [segment, term, match] of DEFAULT_TERMS) {
    const rows = await fetchTerm(segment, term, match, limit);
    stats[segment] = rows.length;
    all.push(...rows);
  }

  const seen = new Set();
  const records = all.filter(record => {
    const key = `${record.externalId}|${record.name}|${record.postalCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const file = path.join(providerDir, 'postal-28.json');
  fs.writeFileSync(file, JSON.stringify({
    provider: 'madrid_open_data_static',
    generatedAt: new Date().toISOString(),
    source: {
      name: 'Ayuntamiento de Madrid - Censo de locales',
      resourceId: RESOURCE_ID,
      api: API_URL,
      license: 'CC BY 4.0',
    },
    stats,
    records,
  }, null, 2));

  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.generatedAt = new Date().toISOString();
  manifest.providers = manifest.providers || {};
  manifest.providers.madrid_open_data_static = {
    enabled: true,
    status: 'sample_index_generated',
    sourceResourceId: RESOURCE_ID,
    partitions: [{
      file: 'data/business-indexes/madrid_open_data_static/postal-28.json',
      postalPrefix: '28',
      locality: 'Madrid',
      province: 'Madrid',
      sectors: DEFAULT_TERMS.map(([segment]) => segment),
      count: records.length,
      sha256: sha256File(file),
    }],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Madrid Open Data sample index OK: ${records.length} records`, stats);
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
