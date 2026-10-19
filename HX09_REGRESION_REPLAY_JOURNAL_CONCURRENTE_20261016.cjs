'use strict';
// Regression of a legitimate cross-tab interleaving during pending-write replay.
// Usage: node HX09_REGRESION_REPLAY_JOURNAL_CONCURRENTE_20261016.cjs <project-directory>
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || process.cwd());
const source = fs.readFileSync(path.join(root, 'modules', 'write-coordinator.js'), 'utf8');
function scenario(injectForeignFence) {
  const db = new Map();
  const timerCallbacks = [];
  let fenceReads = 0;
  let concurrentFenceCreated = false;
  class Storage {
    getItem(key) {
      if (key === '__voltflow_coord_fence') {
        fenceReads++;
        // 1: coordinator install, 2: replay entry, 3: replay's first data setItem.
        // The second tab acquires a valid lease between replay's initial check
        // and the per-item setItem, as permitted by the current implementation.
        if (injectForeignFence && fenceReads === 3) {
          db.set('__voltflow_coord_fence', JSON.stringify({
            id: 'other-tab-import-001', tabId: 'other-tab',
            label: 'historical-import',
            acquiredAt: new Date().toISOString(), expiresAt: Date.now() + 30000
          }));
          concurrentFenceCreated = true;
        }
      }
      return db.get(String(key)) ?? null;
    }
    setItem(key, value) { db.set(String(key), String(value)); }
    removeItem(key) { db.delete(String(key)); }
    clear() { db.clear(); }
    get length() { return db.size; }
    key(index) { return [...db.keys()][index] ?? null; }
  }
  const storage = new Storage();
  const win = {
    Storage, localStorage: storage, document: {}, navigator: {},
    JSON, Date, Math, Promise, CustomEvent: class {},
    dispatchEvent() {}, addEventListener() {}, showToast() {},
    setTimeout(fn) { timerCallbacks.push(fn); return timerCallbacks.length; },
    setInterval() { return 1; }, clearInterval() {},
  };
  win.globalThis = win;
  vm.runInNewContext(source, win, {filename:'write-coordinator.js'});
  const api = win.VoltflowWriteCoordinator;
  // The pending entry is in THIS tab's own durable journal. This matters
  // because replayQueued deletes the journal keys captured at replay start.
  const ownJournal = api._internals.journalKey;
  const key = 'gordi_lead_saved_during_fence';
  const value = 'IMPORTANT_NEW_LEAD';
  db.set(ownJournal, JSON.stringify([{ id: 'old-pending-001',
    operation: 'set', key, value, createdAt: new Date().toISOString() }]));
  db.set(api.JOURNAL_REGISTRY_KEY, JSON.stringify([ownJournal]));
  const reported = api._internals.replayQueued();
  const applied = storage.getItem(key) === value;
  const preserved = api._internals.journalKeys().some(journalKey => {
    try { return JSON.parse(storage.getItem(journalKey) || '[]').some(e => e.key === key && e.value === value); }
    catch { return false; }
  });
  return {reported, applied, preserved, concurrentFenceCreated};
}
let failures = 0;
const baseline = scenario(false);
try {
  assert.equal(baseline.applied, true);
  console.log('PASS: a pending entry is replayed without a concurrent new fence.');
} catch (e) { failures++; console.error('FAIL baseline:', baseline, e.message); }
const raced = scenario(true);
try {
  assert.equal(raced.concurrentFenceCreated, true);
  assert.equal(raced.applied || raced.preserved, true,
    'Pending write must be applied OR remain in a durable journal; neither is true.');
  console.log('PASS HX09: pending entry survived concurrent re-acquisition of fence.');
} catch(e) {
  failures++;
  console.error('FAIL HX09: a new fence during replay discards a pending entry:', raced);
  console.error(e.message);
}
if (failures) process.exitCode = 1;
