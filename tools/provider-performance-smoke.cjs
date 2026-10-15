'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'modules', 'business-providers.js'), 'utf8');
const ctx = { console, URL, Date, AbortSignal: { timeout: () => undefined } };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'modules/business-providers.js' });

const api = ctx.VoltflowBusinessProviders;
const records = [];
for (let i = 0; i < 600; i++) {
  const id = Math.floor(i / 2);
  records.push(api.normalizeStaticRecord({
    id: `src-${i}`,
    externalId: `ext-${i}`,
    name: `Empresa Industrial ${id}`,
    address: `Calle Prueba ${id}, 28013 Madrid`,
    postalCode: '28013',
    locality: 'Madrid',
    province: 'Madrid',
    category: 'industrial',
    phone: i % 2 ? `910000${String(id).padStart(3, '0')}` : '',
  }, i % 2 ? 'overture_places_static' : 'madrid_open_data_static', { segment: 'Industrial' }));
}

const t0 = Date.now();
const deduped = api.deduplicateMultisource(records, {
  getMergeableSectors(item) {
    return Array.isArray(item.matchedSectors) ? item.matchedSectors : [item.segment].filter(Boolean);
  },
});
const elapsed = Date.now() - t0;

assert.ok(deduped.length <= 320, `dedupe did not collapse expected duplicates: ${deduped.length}`);
assert.ok(elapsed < 3000, `provider dedupe too slow for smoke dataset: ${elapsed}ms`);
console.log(`provider-performance-smoke OK: ${records.length} records -> ${deduped.length} unique in ${elapsed}ms`);
