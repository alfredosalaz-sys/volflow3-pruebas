'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const historical = require(path.join(root, 'modules', 'historical-import.js'));
const secure = require(path.join(root, 'modules', 'secure-backup.js'));

const clone = value => structuredClone(value);
const payload = (records = []) => ({
  app: { version: '2.9.4', build: '2026.10.15.0300', origin: 'https://example.invalid' },
  data: {
    localStorage: { gordi_leads: '[]' },
    sessionStorage: {},
    indexedDB: {
      database: 'gordi_db',
      version: 1,
      stores: { audit: { keyPath: 'id', autoIncrement: false, records } }
    },
    incorporatedFiles: [],
    referencedFiles: []
  }
});

async function main() {
  let live = payload([{ id: 'before', value: 'preserved' }]);
  let restoreCalled = false;
  const fakeSecure = Object.assign({}, secure, {
    captureBrowserPayload: async () => clone(live),
    restoreBrowserPayload: async () => { restoreCalled = true; throw new Error('restore must not run for a stale plan'); }
  });
  const plan = await historical.analyze(live.data.localStorage, {
    type: 'voltflow-portable', snapshot: { gordi_leads: '[]' }
  }, { secure: fakeSecure, currentPayload: clone(live) });
  assert.equal(plan.analyzedState.scope, 'complete');

  live.data.indexedDB.stores.audit.records.push({ id: 'after-preview', value: 'must survive' });
  const proof = {
    verifiedFromDisk: true,
    currentFingerprint: await historical._internals.currentFingerprint(live, fakeSecure)
  };
  const result = await historical.commit(plan, 'SYNTHETIC_PASSWORD_ONLY', proof, { secure: fakeSecure });
  assert.deepEqual(result, {
    ok: false,
    code: 'IMPORT_PLAN_STALE_REANALYSIS_REQUIRED',
    requiresReanalysis: true
  });
  assert.equal(restoreCalled, false);
  assert.equal(live.data.indexedDB.stores.audit.records.some(row => row.id === 'after-preview'), true);
  console.log('PASS HX05 estado IndexedDB cambiado invalida el plan completo sin restaurar');

  const injected = '<img src=x onerror="globalThis.stolen=true">';
  const malicious = await historical.analyze({}, {
    type: 'voltflow-portable', version: injected, snapshot: { gordi_leads: '[]' }
  }, { secure });
  assert.equal(malicious.sourceVersion, injected);
  const ui = fs.readFileSync(path.join(root, 'modules', 'ui.js'), 'utf8');
  assert.doesNotMatch(ui, /\$\{report\.(?:format|sourceVersion|sourceBuild)/);
  assert.match(ui, /historical-source-summary'\)\.textContent/);
  assert.doesNotMatch(ui, /plaintextSecretKeys\.map|secretConflicts\.map\([^)]*value/);
  console.log('PASS HX06 metadatos externos se muestran como texto y no se exponen secretos');
  console.log('Historical import HX05-HX06 extended: 2/2 PASS');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
