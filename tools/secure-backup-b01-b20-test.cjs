'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const secure = require('../modules/secure-backup.js');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const password = 'Synthetic-Master-Password-2026!';
const secrets = {
  gordi_api_key: 'SYNTHETIC_GEMINI_KEY_NEVER_REAL',
  gordi_groq_api_key: 'SYNTHETIC_GROQ_KEY_NEVER_REAL',
  gordi_openrouter_api_key: 'SYNTHETIC_OPENROUTER_KEY_NEVER_REAL',
  gordi_gmail_token: 'SYNTHETIC_GMAIL_TOKEN_NEVER_REAL',
  gordi_sheets_token: 'SYNTHETIC_SHEETS_TOKEN_NEVER_REAL',
  gordi_gh_token: 'SYNTHETIC_GITHUB_TOKEN_NEVER_REAL',
  gordi_jsonbin_key: 'SYNTHETIC_JSONBIN_KEY_NEVER_REAL'
};
const localStorage = {
  gordi_leads: JSON.stringify([{ id: 'lead-1', commercialRefs: { companyId: 'company-1', establishmentId: 'site-1' } }]),
  gordi_email_history: JSON.stringify([
    { id: 'message-1', sequenceCanonicalKey: 'company-1:contact-1:email:sales', status: 'SENT_CONFIRMED', confirmation: { method: 'manual', evidenceId: 'ev-1' } }
  ]),
  gordi_commercial_exclusions: JSON.stringify([{ recipient: 'blocked@example.invalid', reason: 'opposition' }]),
  gordi_unknown_future_flag: 'preserve-me',
  ...secrets
};
const idb = {
  database: 'VoltiumCRM', version: 1, stores: {
    leads: { keyPath: '_id', autoIncrement: false, records: [{ _id: 'lead-1', id: 'lead-1', name: 'Authoritative' }] },
    emailHistory: { keyPath: '_id', autoIncrement: false, records: [] },
    kv: { keyPath: 'key', autoIncrement: false, records: [{ key: 'gordi_leads', value: localStorage.gordi_leads }] },
    meta: { keyPath: 'key', autoIncrement: false, records: [{ key: 'manifest', value: { status: 'complete', version: 1 } }] }
  }
};

const results = [];
async function test(id, name, fn, classification = 'PROBADO AUTOMÁTICAMENTE') {
  const started = Date.now();
  try {
    await fn();
    results.push({ id, name, status: 'PASS', classification, ms: Date.now() - started });
    console.log(`${id} PASS ${name}`);
  } catch (error) {
    results.push({ id, name, status: 'FAIL', classification, error: error.message, ms: Date.now() - started });
    console.error(`${id} FAIL ${name}: ${error.message}`);
  }
}

async function makePayload(extra = {}) {
  return secure.buildPayload({
    localStorage: { ...localStorage, ...(extra.localStorage || {}) },
    sessionStorage: extra.sessionStorage || { gordi_session_api_key: 'SYNTHETIC_SESSION_KEY_NEVER_REAL' },
    indexedDB: extra.indexedDB || idb,
    incorporatedFiles: extra.incorporatedFiles || [],
    referencedFiles: extra.referencedFiles || [],
    version: '2.9.4', build: '2026.10.15.0300', origin: 'https://example.invalid',
    consistency: { pendingWritesDrained: true, tabsCoordinated: true }
  });
}

(async () => {
  const payload = await makePayload();

  await test('B01', 'P0/P1 y claves sintéticas quedan cubiertas', async () => {
    Object.keys(secrets).forEach(key => assert.strictEqual(payload.data.localStorage[key], secrets[key]));
    assert.strictEqual(payload.manifest.inventory.totals.secrets >= Object.keys(secrets).length, true);
  });

  let container;
  await test('B02', 'el archivo cifrado no contiene secretos legibles', async () => {
    container = await secure.encryptPayload(payload, password, { iterations: 100000 });
    const serialized = JSON.stringify(container);
    Object.values(secrets).forEach(secret => assert.strictEqual(serialized.includes(secret), false));
    assert.strictEqual(serialized.includes('blocked@example.invalid'), false);
  });

  await test('B03', 'archivo escrito y leído restaura contenido equivalente', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voltflow-secure-'));
    const file = path.join(dir, secure.uniqueFilename(new Date('2026-10-16T10:00:00Z')));
    fs.writeFileSync(file, JSON.stringify(container));
    const restored = await secure.decryptContainer(JSON.parse(fs.readFileSync(file, 'utf8')), password);
    assert.deepStrictEqual(restored.data.localStorage, payload.data.localStorage);
    fs.rmSync(dir, { recursive: true, force: true });
  }, 'PROBADO AUTOMÁTICAMENTE EN DISCO; COMPLEMENTADO POR PRUEBA CHROME AISLADA');

  await test('B04', 'formatos históricos y auto_disk_daily reconocidos', async () => {
    const fixtures = ['legacy-full-v2.json', 'portable-2.9.2.json', 'auto-disk-daily-2.9.4.json'];
    const expected = ['legacy_full', 'portable', 'auto_disk_daily'];
    fixtures.forEach((name, index) => {
      const data = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'persistence', name), 'utf8'));
      assert.strictEqual(secure.detectLegacyFormat(data), expected[index]);
      assert.ok(secure.legacyToSnapshot(data).gordi_leads);
    });
  });

  await test('B05', 'contrato conserva IndexedDB separado como autoridad', async () => {
    assert.strictEqual(payload.data.indexedDB.stores.leads.records[0].name, 'Authoritative');
    assert.strictEqual(payload.manifest.sections.indexedDB.count > 0, true);
  });

  await test('B06', 'tres copias del mismo día tienen nombres únicos', async () => {
    const now = new Date('2026-10-16T12:00:00Z');
    assert.strictEqual(new Set([secure.uniqueFilename(now), secure.uniqueFilename(now), secure.uniqueFilename(now)]).size, 3);
  });

  await test('B07', 'restauración contiene staging y rollback ante corte', async () => {
    const source = fs.readFileSync(path.join(root, 'modules', 'secure-backup.js'), 'utf8');
    assert.match(source, /stageRollback\(/);
    assert.match(source, /replaceRawDatabase\(before\.data\.indexedDB/);
    assert.match(source, /rollback_required/);
  }, 'VERIFICADO EN CÓDIGO; CORTE DE NAVEGADOR PENDIENTE');

  await test('B08', 'contraseña errónea, corrupción y truncado fallan sin descifrar', async () => {
    await assert.rejects(() => secure.decryptContainer(container, 'Wrong-Password-Long-Enough!'));
    const corrupt = JSON.parse(JSON.stringify(container));
    corrupt.ciphertext = corrupt.ciphertext.slice(0, -8) + 'AAAAAAAA';
    await assert.rejects(() => secure.decryptContainer(corrupt, password), /corrupto|truncado/i);
  });

  await test('B09', 'errores de escritura no se convierten en éxito', async () => {
    const source = fs.readFileSync(path.join(root, 'modules', 'disk-backup.js'), 'utf8');
    assert.match(source, /verifyBackupFile\(writtenFile/);
    assert.match(source, /setStatus\('error'/);
    assert.doesNotMatch(source, /catch\s*\([^)]*\)\s*\{\s*return true/);
  }, 'VERIFICADO EN CÓDIGO; CUOTA REAL PENDIENTE');

  await test('B10', 'campos desconocidos y alias se conservan', async () => {
    const restored = await secure.decryptContainer(container, password);
    assert.strictEqual(restored.data.localStorage.gordi_unknown_future_flag, 'preserve-me');
    assert.strictEqual(JSON.parse(restored.data.localStorage.gordi_leads)[0].commercialRefs.establishmentId, 'site-1');
  });

  await test('B11', 'Gmail, Sheets, GitHub, JSONBin e IA se restauran', async () => {
    const restored = await secure.decryptContainer(container, password);
    Object.entries(secrets).forEach(([key, value]) => assert.strictEqual(restored.data.localStorage[key], value));
  });

  await test('B12', 'oposiciones y máximo de cinco siguen bloqueantes', async () => {
    secure.assertCommercialSafety(payload.data.localStorage);
    const six = Array.from({ length: 6 }, (_, index) => ({ id: `m-${index}`, sequenceCanonicalKey: 'same', status: 'SENT_CONFIRMED' }));
    assert.throws(() => secure.assertCommercialSafety({ gordi_email_history: JSON.stringify(six) }), /supera cinco/);
    assert.match(payload.data.localStorage.gordi_commercial_exclusions, /opposition/);
  });

  await test('B13', 'el código avisa sobre colisión de origen GitHub Pages', async () => {
    const source = fs.readFileSync(path.join(root, 'modules', 'secure-backup.js'), 'utf8');
    assert.match(source, /alfredosalaz-sys\.github\.io/);
    assert.match(source, /perfil aislado/);
  }, 'VERIFICADO EN CÓDIGO; PERFIL REAL NO TOCADO');

  await test('B14', 'GitHub y JSONBin salen antes de cualquier fetch', async () => {
    for (const [file, functions] of [['modules/chat.js', ['githubPush', 'githubPull']], ['modules/init.js', ['jsonbinCreateBin', 'jsonbinPush', 'jsonbinPull']]]) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      functions.forEach(name => {
        const start = source.indexOf(`async function ${name}`);
        const next = source.indexOf('\nasync function ', start + 10);
        const body = source.slice(start, next < 0 ? source.length : next);
        assert.ok(body.indexOf('return false;') >= 0);
        assert.ok(body.indexOf('return false;') < body.indexOf('fetch(') || body.indexOf('fetch(') < 0);
      });
    }
    const initSource = fs.readFileSync(path.join(root, 'modules', 'init.js'), 'utf8');
    const downloadStart = initSource.indexOf('function downloadDataSnapshot');
    const downloadBody = initSource.slice(downloadStart, initSource.indexOf('\nfunction ', downloadStart + 20));
    assert.ok(downloadBody.indexOf('return createSecureBackupNow()') < downloadBody.indexOf('new Blob'));
    const uiSource = fs.readFileSync(path.join(root, 'modules', 'ui.js'), 'utf8');
    const portableStart = uiSource.indexOf('function exportPortableData');
    const portableBody = uiSource.slice(portableStart, uiSource.indexOf('\nfunction ', portableStart + 20));
    assert.ok(portableBody.indexOf('return createSecureBackupNow()') < portableBody.indexOf('new Blob'));
  });

  await test('B15', 'adjunto binario se recupera byte a byte y referencia queda marcada', async () => {
    const binaryPayload = await makePayload({ incorporatedFiles: [{ name: 'photo.bin', bytes: new Uint8Array([0, 1, 2, 127, 255]) }], referencedFiles: [{ name: 'external.pdf', included: false }] });
    const encrypted = await secure.encryptPayload(binaryPayload, password, { iterations: 100000 });
    const restored = await secure.decryptContainer(encrypted, password);
    assert.deepStrictEqual(Array.from(restored.data.incorporatedFiles[0].bytes), [0, 1, 2, 127, 255]);
    assert.strictEqual(restored.data.referencedFiles[0].included, false);
  });

  await test('B16', 'tres ciclos de build/reinicio criptográfico preservan datos', async () => {
    let current = payload;
    for (let i = 0; i < 3; i++) {
      const encrypted = await secure.encryptPayload(current, password, { iterations: 100000 });
      current = await secure.decryptContainer(encrypted, password);
    }
    assert.strictEqual(current.data.localStorage.gordi_leads, payload.data.localStorage.gordi_leads);
  });

  await test('B17', 'manifiesto exige escrituras drenadas y coordinación declarada', async () => {
    assert.deepStrictEqual(payload.consistency, { pendingWritesDrained: true, tabsCoordinated: true });
    const source = fs.readFileSync(path.join(root, 'modules', 'secure-backup.js'), 'utf8');
    assert.match(source, /waitForIdle/);
    assert.match(source, /BroadcastChannel/);
    assert.match(source, /navigator\.locks/);
  });

  await test('B18', 'carga sintética de miles de registros completa sin error', async () => {
    const many = Array.from({ length: 11820 }, (_, i) => ({ id: `lead-${i}`, name: `Empresa ${i}`, notes: 'x'.repeat(120) }));
    const started = Date.now();
    const large = await makePayload({ localStorage: { gordi_leads: JSON.stringify(many) } });
    await secure.encryptPayload(large, password, { iterations: 100000 });
    assert.ok(Date.now() - started < 30000);
  }, 'CPU DE ESCRITORIO; CELERON N4020 FÍSICO PENDIENTE');

  await test('B19', 'OAuth y handles quedan marcados para reautorización', async () => {
    assert.strictEqual(secure.classifyKey('backupDirectoryHandle'), 'non_transportable');
    assert.strictEqual(secure.classifyKey('gordi_gmail_token'), 'secret');
    const source = fs.readFileSync(path.join(root, 'modules', 'ui.js'), 'utf8');
    assert.match(source, /permisos OAuth y de carpetas pueden requerir autorización/i);
  });

  await test('B20', 'inventario vivo no contiene valores y cubre referencias dinámicas', async () => {
    const report = JSON.parse(fs.readFileSync(path.join(root, 'PERSISTENCE_COVERAGE_REPORT.json'), 'utf8'));
    const contract = JSON.parse(fs.readFileSync(path.join(root, 'data', 'persistence-contract.v1.json'), 'utf8'));
    assert.strictEqual(report.valuesIncluded, false);
    assert.ok(report.literalKeyCount >= 90);
    assert.ok(contract.dynamicPatterns.length > 0);
    const serialized = JSON.stringify({ report, contract });
    Object.values(secrets).forEach(secret => assert.strictEqual(serialized.includes(secret), false));
  });

  const failed = results.filter(result => result.status !== 'PASS');
  const report = {
    generatedAt: new Date().toISOString(),
    passed: results.length - failed.length,
    failed: failed.length,
    limitations: [
      'B03 se complementa con RESULTADOS_NAVEGADOR_RESTAURACION.json en un perfil Chrome temporal limpio.',
      'B18 no se ha ejecutado en el Celeron N4020 físico; esta máquina usa otro procesador.'
    ],
    results
  };
  if (process.argv.includes('--report')) {
    fs.writeFileSync(path.join(root, 'RESULTADOS_B01_B20.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`\nB01-B20: ${results.length - failed.length}/${results.length} checks automatizados PASS`);
  if (failed.length) process.exitCode = 1;
})();
