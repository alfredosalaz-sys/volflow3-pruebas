'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const historical = require('../modules/historical-import.js');
const secure = require('../modules/secure-backup.js');
const commercial = require('../modules/commercial-communications.js');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const fixtures = path.join(root, 'tests', 'fixtures', 'persistence');
const current = JSON.parse(fs.readFileSync(path.join(fixtures, 'historical-rich-current.json'), 'utf8'));
const imported = JSON.parse(fs.readFileSync(path.join(fixtures, 'historical-rich-import.json'), 'utf8'));
const options = { secure, commercial, secretResolutions: { gordi_gemini_key: 'keep_current' } };
const password = 'Synthetic-Historical-Backup-2026!';
const results = [];

async function test(id, name, fn) {
  try {
    await fn();
    results.push({ id, name, status: 'PASS' });
    console.log(`${id} PASS ${name}`);
  } catch (error) {
    results.push({ id, name, status: 'FAIL', error: error.message });
    console.error(`${id} FAIL ${name}: ${error.message}`);
  }
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtures, name), 'utf8'));
}

function confirmed(id, evidence, step) {
  return {
    id, leadId: 'lead-current', companyIdentityAnchor: 'company:actual',
    contactIdentityAnchor: 'contact:a', purpose: 'sales', sequenceStep: step,
    commercialState: 'SENT_CONFIRMED',
    sendConfirmation: {
      method: 'manual_explicit', confirmedBy: 'owner', confirmationId: evidence,
      confirmedAt: `2026-10-${String(step).padStart(2, '0')}T10:00:00.000Z`
    }
  };
}

async function payloadFor(storage) {
  return secure.buildPayload({
    localStorage: storage, sessionStorage: {}, indexedDB: {
      database: 'VoltiumCRM', version: 1, stores: {
        leads: { keyPath: '_id', autoIncrement: false, records: [] },
        emailHistory: { keyPath: '_id', autoIncrement: false, records: [] },
        campaigns: { keyPath: '_id', autoIncrement: false, records: [] },
        searchHistory: { keyPath: '_id', autoIncrement: false, records: [] },
        savedSearches: { keyPath: '_id', autoIncrement: false, records: [] },
        kv: { keyPath: 'key', autoIncrement: false, records: [] },
        meta: { keyPath: 'key', autoIncrement: false, records: [] }
      }
    }, version: '2.9.4', build: '2026.10.15.0300', origin: 'https://example.invalid',
    consistency: { pendingWritesDrained: true, tabsCoordinated: true }
  });
}

(async () => {
  await test('H01', 'reconoce solo formatos historicos declarados', async () => {
    const names = ['legacy-full-v2.json', 'portable-2.9.2.json', 'auto-disk-daily-2.9.4.json'];
    const expected = ['legacy_full', 'portable', 'auto_disk_daily'];
    names.forEach((name, index) => assert.strictEqual(historical.detectFormat(readFixture(name), secure), expected[index]));
    assert.strictEqual(historical.detectFormat({ snapshot: { gordi_leads: '[]' } }, secure), 'safety_snapshot');
    assert.strictEqual(historical.detectFormat({ portableSnapshot: { gordi_leads: '[]' } }, secure), 'full_backup_2_9_4');
    assert.strictEqual(historical.detectFormat({ voltflow: { gordi_leads: '[]' } }, secure), 'github_snapshot_file');
    assert.strictEqual(historical.detectFormat({ record: { voltflow: { gordi_leads: '[]' } } }, secure), 'jsonbin_snapshot_file');
    for (const candidate of [
      { snapshot: { gordi_leads: '[]' } },
      { portableSnapshot: { gordi_leads: '[]' } },
      { voltflow: { gordi_leads: '[]' } },
      { record: { voltflow: { gordi_leads: '[]' } } }
    ]) assert.strictEqual((await historical.decodeSource(candidate, '', secure)).localStorage.gordi_leads, '[]');
    assert.strictEqual(historical.detectFormat({ nonsense: true }, secure), 'unknown');
  });

  await test('H02', 'importa una copia antigua en un perfil vacio', async () => {
    const plan = await historical.analyze({}, readFixture('legacy-full-v2.json'), options);
    assert.strictEqual(plan.after.arrays.gordi_leads, 1);
    assert.strictEqual(plan.after.arrays.gordi_email_history, 1);
    assert.deepStrictEqual(JSON.parse(plan.mergedLocalStorage.gordi_objectives), { monthly: 1 });
  });

  let plan;
  await test('H03', 'fusiona sobre datos nuevos sin sustituir colecciones', async () => {
    const currentPayload = await payloadFor(current);
    plan = await historical.analyze(current, imported, { ...options, currentPayload });
    assert.strictEqual(plan.before.arrays.gordi_leads, 1);
    assert.strictEqual(plan.after.arrays.gordi_leads, 3);
    assert.strictEqual(plan.after.arrays.gordi_email_history, 3);
  });

  await test('H04', 'la importacion repetida es idempotente', async () => {
    const second = await historical.analyze(plan.mergedLocalStorage, imported, options);
    assert.strictEqual(second.after.arrays.gordi_leads, plan.after.arrays.gordi_leads);
    assert.strictEqual(second.after.arrays.gordi_email_history, plan.after.arrays.gordi_email_history);
    assert.strictEqual(second.after.arrays.gordi_commercial_exclusions, plan.after.arrays.gordi_commercial_exclusions);
  });

  await test('H05', 'enriquecimiento conserva la identidad canonica', async () => {
    const leads = JSON.parse(plan.mergedLocalStorage.gordi_leads);
    const madrid = leads.find(item => item.commercialRefs?.establishmentIdentityAnchor === 'site:actual:madrid');
    assert.strictEqual(madrid.id, 'lead-current');
    assert.strictEqual(madrid.phone, '910000000');
    assert.deepStrictEqual(madrid.contacts.map(item => item.contactId).sort(), ['contact-a', 'contact-b']);
  });

  await test('H06', 'sucursales y empresas con telefono o dominio compartidos no se fusionan', async () => {
    const leads = JSON.parse(plan.mergedLocalStorage.gordi_leads);
    assert.strictEqual(leads.filter(item => item.phone === '910000000').length, 3);
    assert.strictEqual(new Set(leads.map(item => historical.leadIdentity(item))).size, 3);
  });

  await test('H07', 'relaciones de comunicaciones siguen al id canonico', async () => {
    const history = JSON.parse(plan.mergedLocalStorage.gordi_email_history);
    assert.strictEqual(history.find(item => item.id === 'message-old').leadId, 'lead-current');
  });

  await test('H08', 'confirmaciones legacy incompletas no cuentan como enviadas', async () => {
    const history = JSON.parse(plan.mergedLocalStorage.gordi_email_history);
    const ambiguous = history.find(item => item.id === 'message-ambiguous');
    assert.strictEqual(ambiguous.status, 'LEGACY_SENT_UNVERIFIED');
    assert.strictEqual(commercial.isSentConfirmed(ambiguous), false);
    assert.strictEqual(ambiguous.legacyOriginalStatus, 'SENT_CONFIRMED');
  });

  await test('H09', 'una evidencia no confirma dos comunicaciones', async () => {
    const source = { type: 'voltflow-portable', snapshot: {
      gordi_email_history: JSON.stringify([confirmed('duplicate-evidence', 'evidence-current', 2)])
    } };
    const duplicate = await historical.analyze(current, source, options);
    const row = JSON.parse(duplicate.mergedLocalStorage.gordi_email_history).find(item => item.id === 'duplicate-evidence');
    assert.strictEqual(row.status, 'LEGACY_SENT_UNVERIFIED');
    assert.strictEqual(row.historicalImport.reason, 'duplicate_confirmation_evidence');
  });

  await test('H10', 'el maximo de cinco confirmadas se mantiene por secuencia', async () => {
    const base = { ...current, gordi_email_history: JSON.stringify([1, 2, 3, 4, 5].map(n => confirmed(`m${n}`, `ev${n}`, n))) };
    const source = { type: 'voltflow-portable', snapshot: { gordi_email_history: JSON.stringify([confirmed('m6', 'ev6', 6)]) } };
    const limited = await historical.analyze(base, source, options);
    const history = JSON.parse(limited.mergedLocalStorage.gordi_email_history);
    assert.strictEqual(history.filter(commercial.isSentConfirmed).length, 5);
    assert.strictEqual(history.find(item => item.id === 'm6').historicalImport.reason, 'sequence_limit_reached');
  });

  await test('H11', 'oposiciones se unen y nunca se eliminan', async () => {
    const exclusions = JSON.parse(plan.mergedLocalStorage.gordi_commercial_exclusions);
    assert.deepStrictEqual(exclusions.map(item => item.id).sort(), ['exclude-1', 'exclude-2']);
  });

  await test('H12', 'colisiones de credenciales exigen decision y permanecen ocultas', async () => {
    const unresolved = await historical.analyze(current, imported, { secure, commercial, secretResolutions: {} });
    assert.strictEqual(unresolved.requiresResolution, true);
    assert.strictEqual(unresolved.mergedLocalStorage.gordi_gemini_key, 'SYNTHETIC_CURRENT_KEY');
    const serialized = JSON.stringify(historical.publicReport(unresolved));
    assert.strictEqual(serialized.includes('SYNTHETIC_CURRENT_KEY'), false);
    assert.strictEqual(serialized.includes('SYNTHETIC_IMPORTED_KEY'), false);
  });

  await test('H13', 'una credencial importada no habilita permisos ni coste', async () => {
    assert.strictEqual(plan.mergedLocalStorage.gordi_zero_cost_ai_gemini_authorized, 'false');
    assert.ok(plan.blockedPermissions.includes('gordi_zero_cost_ai_gemini_authorized'));
  });

  await test('H14', 'campos desconocidos quedan preservados sin sobrescribir actuales', async () => {
    assert.strictEqual(plan.mergedLocalStorage.gordi_unknown_current, 'preserve-current');
    assert.strictEqual(plan.mergedLocalStorage.gordi_unknown_imported, 'preserve-imported');
    assert.ok(JSON.parse(plan.mergedLocalStorage.gordi_historical_unknown_payloads)[0].fields.legacyExtension.retain);
  });

  await test('H15', 'archivos corruptos o incompatibles se rechazan antes de mutar', async () => {
    await assert.rejects(() => historical.analyze(current, { format: 'voltflow-secure-backup', formatVersion: 1, ciphertext: 'bad' }, options));
    await assert.rejects(() => historical.analyze(current, { foo: 'bar' }, options), /UNSUPPORTED/);
  });

  await test('H16', 'IndexedDB y localStorage se preparan con el mismo contenido', async () => {
    const payload = await payloadFor(current);
    const synced = historical.syncRawDatabase(payload.data.indexedDB, plan.mergedLocalStorage);
    assert.strictEqual(synced.stores.leads.records.length, plan.after.arrays.gordi_leads);
    assert.strictEqual(synced.stores.emailHistory.records.length, plan.after.arrays.gordi_email_history);
    assert.strictEqual(synced.stores.leads.records.some(item => item._id === 'lead-current'), true);
  });

  await test('H17', 'la copia de seguridad debe corresponder exactamente al estado actual', async () => {
    const payload = await payloadFor(current);
    const container = await secure.encryptPayload(payload, password, { iterations: 100000 });
    const file = { name: 'current.vfbackup', text: async () => JSON.stringify(container) };
    const proof = await historical.verifySafetyBackupFile(file, password, { secure, currentPayload: payload });
    assert.strictEqual(proof.verifiedFromDisk, true);
    const other = await payloadFor({ ...current, gordi_unknown_current: 'changed' });
    await assert.rejects(() => historical.verifySafetyBackupFile(file, password, { secure, currentPayload: other }), /DOES_NOT_MATCH/);
  });

  await test('H18', 'commit exige copia verificada y valida contenido posterior', async () => {
    const before = await payloadFor(current);
    const fp = await secure._internals.sha256Hex(secure._internals.stableStringify(before.data.localStorage));
    await assert.rejects(() => historical.commit(plan, password, null, { secure, currentPayload: before }), /REQUIRED/);
    let installed = before;
    const mockSecure = Object.assign({}, secure, {
      restoreBrowserPayload: async payload => { installed = payload; return { transactionId: 'synthetic-transaction' }; },
      captureBrowserPayload: async () => installed
    });
    const result = await historical.commit(plan, password, { verifiedFromDisk: true, currentFingerprint: fp }, { secure: mockSecure, currentPayload: before });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(JSON.parse(installed.data.localStorage.gordi_leads).length, 3);
  });

  await test('H19', 'un corte durante commit se propaga sin declarar exito', async () => {
    const before = await payloadFor(current);
    const fp = await secure._internals.sha256Hex(secure._internals.stableStringify(before.data.localStorage));
    const mockSecure = Object.assign({}, secure, {
      restoreBrowserPayload: async () => { throw new Error('synthetic rollback completed'); },
      captureBrowserPayload: async () => before
    });
    await assert.rejects(() => historical.commit(plan, password, { verifiedFromDisk: true, currentFingerprint: fp }, { secure: mockSecure, currentPayload: before }), /rollback/);
  });

  await test('H20', 'backup cifrado posterior conserva byte a byte el estado fusionado', async () => {
    const payload = await payloadFor(plan.mergedLocalStorage);
    const container = await secure.encryptPayload(payload, password, { iterations: 100000 });
    const restored = await secure.decryptContainer(JSON.parse(JSON.stringify(container)), password);
    assert.deepStrictEqual(restored.data.localStorage, plan.mergedLocalStorage);
    assert.deepStrictEqual(restored.data.indexedDB, payload.data.indexedDB);
  });

  const passed = results.filter(item => item.status === 'PASS').length;
  console.log(`\nHistorical import: ${passed}/${results.length} PASS`);
  if (passed !== results.length) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
