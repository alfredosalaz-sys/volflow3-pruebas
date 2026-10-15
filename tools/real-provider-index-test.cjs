'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'modules', 'business-providers.js'), 'utf8');
const ctx = { console, URL, Date, AbortSignal: { timeout: () => undefined } };
ctx.globalThis = ctx;
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'modules/business-providers.js' });

const api = ctx.VoltflowBusinessProviders;

function readJsonByUrl(url) {
  const normalized = String(url).replace(/^\.\//, '').replace(/\//g, path.sep);
  const file = path.join(root, normalized);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const localFetch = async (url) => ({
  ok: true,
  async json() {
    return readJsonByUrl(url);
  },
});

(async () => {
  const dentalMadrid = await api.searchStaticIndexes({
    segment: 'Dental',
    location: 'Madrid',
    maxResults: 20,
  }, { fetch: localFetch });
  assert.ok(dentalMadrid.records.length >= 5, `expected Madrid dental records, got ${dentalMadrid.records.length}`);
  assert.ok(dentalMadrid.records.every(r => r.provider === 'madrid_open_data_static'));
  assert.ok(dentalMadrid.records.some(r => r.postalCode === '28015'));
  assert.ok(dentalMadrid.records.every(r => r.provenance?.[0]?.provider === 'madrid_open_data_static'));

  const dental28015 = await api.searchStaticIndexes({
    segment: 'Dental',
    location: '28015',
    maxResults: 20,
  }, { fetch: localFetch });
  assert.ok(dental28015.records.length >= 1, 'expected at least one Madrid dental record in 28015');
  assert.ok(dental28015.records.every(r => r.postalCode === '28015'));

  const gestor28015 = await api.searchStaticIndexes({
    segment: 'Gestorias',
    location: '28015',
    maxResults: 20,
  }, { fetch: localFetch });
  assert.ok(gestor28015.records.length >= 1, 'expected at least one Madrid gestoria record in 28015');

  console.log(`real-provider-index-test OK: Madrid Dental=${dentalMadrid.records.length}, 28015 Dental=${dental28015.records.length}, 28015 Gestorias=${gestor28015.records.length}`);
})().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

