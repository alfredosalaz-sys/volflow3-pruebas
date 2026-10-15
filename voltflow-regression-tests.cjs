'use strict';
// Voltflow3 regression audit: offline-only. Never calls the network.
// Usage: node voltflow-regression-tests.cjs <path-to-Voltflow3-repository-or-delivery-folder>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
function storage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (key) => m.has(key) ? m.get(key) : null,
    setItem: (key, value) => m.set(key, String(value)),
    removeItem: (key) => m.delete(key),
  };
}
function makeContext(initial = {}) {
  const ctx = {
    console, Promise, Date, Math, JSON, URL, URLSearchParams, setTimeout, clearTimeout,
    AbortSignal: { timeout: () => undefined },
    localStorage: storage(initial), sessionStorage: storage(),
    location: { href: 'https://example.invalid/app.html', origin: 'https://example.invalid', hash: '' },
    document: { getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
    fetch() { throw new Error('Network access prohibited during regression audit'); },
    logEnrich() {}, decorateContactQuality() {}, decorateResultExplanation() {},
    getSegmentQueries: () => ['Dental'], showToast() {}, leads: [],
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['modules/business-providers.js', 'modules/search.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}
const cases = [];
function check(name, passed, actual) { cases.push({ name, passed: !!passed, actual }); }
(async () => {
  const ctx = makeContext({
    gordi_zero_cost_google_places_hard_quota_confirmed: 'true',
    gordi_zero_cost_allow_google_places: 'true',
  });
  const api = ctx.VoltflowBusinessProviders;
  const misclassified = api.normalizeStaticRecord({
    name: 'FERRETERIA SOL', category: 'hardware_store', postalCode: '28015',
    address: 'Calle Luna 2, Madrid',
  }, 'madrid_open_data_static', { segment: 'Dental' });
  check('Does not claim a hardware store strongly matches Dental', misclassified.sectorRelevance !== 'strong', misclassified.sectorRelevance);

  const phoneBusinesses = [
    { name: 'Consultorio Uno', phone: '916111111', address: 'Calle Uno 3, Madrid', postalCode: '28015', externalIds: {} },
    { name: 'Consultorio Dos', phone: '916111111', address: 'Calle Dos 7, Madrid', postalCode: '28016', externalIds: {} },
  ];
  const dedupCount = api.deduplicateMultisource(phoneBusinesses).length;
  check('Does not merge distinct companies sharing a phone', dedupCount === 2, dedupCount);

  const domainBusinesses = [
    { name: 'Farmacia Norte', website: 'https://grupo-ejemplo.es', address: 'Calle 1, Madrid', postalCode: '28015', externalIds: {} },
    { name: 'Tienda Sur', website: 'https://grupo-ejemplo.es', address: 'Calle 100, Madrid', postalCode: '28016', externalIds: {} },
  ];
  const domainCount = api.deduplicateMultisource(domainBusinesses).length;
  check('Does not merge distinct companies sharing corporate website', domainCount === 2, domainCount);

  const mockFetch = async (url) => ({ ok: true, async json() {
    return String(url).includes('manifest')
      ? { providers: { madrid_open_data_static: { enabled: true, partitions: [{file: 'test.json', sectors: ['Dental']}] } } }
      : { records: [{name:'Dental Ejemplo', category:'dentist', postalCode:'28015', matchedSectors:['Dental']}] };
  }});
  const spatial = await api.searchStaticIndexes({location:'Sevilla', segment:'Dental', maxResults:20},{fetch:mockFetch});
  check('No Madrid record with missing geography shown in Sevilla', spatial.records.length === 0, spatial.records.length);

  const networkFail = Object.assign([], { __placesDiagnostics: { status: 'NETWORK_ERROR', provider: 'osm_overpass' } });
  const empty = Object.assign([], { __placesDiagnostics: { status: 'SUCCESS_EMPTY', provider: 'static_open_data' } });
  const mixed = await ctx.fetchPlacesZeroCost('Dental', 'Madrid', 10, { freeProviderAdapters: [
    {id: 'osm_overpass', run: async () => networkFail},
    {id: 'static_open_data', run: async () => empty},
  ] });
  check('A failed discovery source must not be reported as confirmed SUCCESS_EMPTY',mixed.__placesDiagnostics?.status !== 'SUCCESS_EMPTY', mixed.__placesDiagnostics?.status);

  const realSearchDedup = ctx.deduplicateResults([
    {name:'Consultorio Uno',phone:'916111111',address:'Calle Uno 3, Madrid',provenance:[{provider:'osm_overpass'}]},
    {name:'Consultorio Dos',phone:'916111111',address:'Calle Dos 7, Madrid',provenance:[{provider:'diba_gia'}]},
  ]);
  check('Real search deduplicator must retain separate businesses',realSearchDedup.length === 2, realSearchDedup.length);

  check('Google Places must remain blocked in strict zero-cost mode',ctx.isZeroCostProviderAllowed('google_places','discovery').ok !== true,'allowed=' + ctx.isZeroCostProviderAllowed('google_places','discovery').ok);
  for (const c of cases) console.log((c.passed?'PASS':'FAIL') + '  ' + c.name + ' (actual: ' + c.actual + ')');
  console.log(`Offline regression verdict: ${cases.filter(c=>c.passed).length}/${cases.length} PASS`);
  if (cases.some(c=>!c.passed)) process.exitCode = 1;
})().catch(e=>{console.error(e);process.exitCode=2});
