(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowSecureBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const FORMAT = 'voltflow-secure-backup';
  const FORMAT_VERSION = 1;
  const KDF_ITERATIONS = 210000;
  const DB_NAME = 'VoltiumCRM';
  const STAGING_DB = 'VoltflowRestoreStaging';
  const INCORPORATED_FILES_KEY = 'gordi_incorporated_files_archive';
  const REFERENCED_FILES_KEY = 'gordi_referenced_files_archive';
  const INTERNAL_KEYS = new Set([
    'gordi_indexeddb_ready',
    '_voltflow_idb_manifest',
    '_voltflow_restore_transaction'
  ]);
  const isInternalKey = key => INTERNAL_KEYS.has(key) || String(key).startsWith('__voltflow_coord_');
  const NON_TRANSPORTABLE_PATTERNS = [
    /file.?system.?handle/i,
    /directory.?handle/i,
    /permission.?handle/i
  ];
  const SECRET_PATTERNS = [
    /(^|[_-])(api[_-]?key|secret|token|password|passwd|authorization)([_-]|$)/i,
    /(^|[_-])(gh|github|gmail|gemini|groq|openrouter|jsonbin|hunter|apollo|cloudflare|mistral)([_-].*)?(key|token|secret)$/i,
    /^gordi_pin$/i
  ];
  const CRITICAL_PATTERNS = [
    /^gordi_(leads|email_history|campaigns|search_history|saved_searches|commercial_memory|commercial_events|commercial_sequences|commercial_exclusions)/,
    /^gordi_(incorporated_files_archive|referenced_files_archive)$/,
    /^voltium_(commercial|company|contact|opportunity|activity)/,
    /(do_not_contact|opposition|exclusion|commercialrefs|sequence|confirmation)/i
  ];
  const RECREATABLE_PATTERNS = [/(^|_)(cache|ecache|tmp|temporary)(_|$)/i, /^_voltflow_last_/];

  function cryptoApi() {
    if (root && root.crypto && root.crypto.subtle) return root.crypto;
    if (typeof require === 'function') return require('node:crypto').webcrypto;
    throw new Error('WebCrypto no está disponible');
  }

  function textEncoder() {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder();
    return new (require('node:util').TextEncoder)();
  }

  function textDecoder() {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder();
    return new (require('node:util').TextDecoder)();
  }

  function bytesToBase64(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function stableClone(value) {
    if (Array.isArray(value)) return value.map(stableClone);
    if (value && typeof value === 'object') {
      return Object.keys(value).sort().reduce((out, key) => {
        out[key] = stableClone(value[key]);
        return out;
      }, {});
    }
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(stableClone(value));
  }

  async function sha256Hex(value) {
    const bytes = typeof value === 'string' ? textEncoder().encode(value) : value;
    const digest = await cryptoApi().subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function classifyKey(key) {
    const name = String(key || '');
    if (isInternalKey(name)) return 'recreatable';
    if (NON_TRANSPORTABLE_PATTERNS.some(pattern => pattern.test(name))) return 'non_transportable';
    if (SECRET_PATTERNS.some(pattern => pattern.test(name))) return 'secret';
    if (CRITICAL_PATTERNS.some(pattern => pattern.test(name))) return 'critical';
    if (RECREATABLE_PATTERNS.some(pattern => pattern.test(name))) return 'recreatable';
    return 'configuration';
  }

  function storageToObject(storage) {
    const result = {};
    if (!storage) return result;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null && !isInternalKey(key)) result[key] = storage.getItem(key);
    }
    return result;
  }

  function inventoryForObject(values, storageName) {
    const classes = { critical: 0, secret: 0, configuration: 0, recreatable: 0, non_transportable: 0 };
    const entries = Object.keys(values || {}).sort().map(key => {
      const classification = classifyKey(key);
      classes[classification] += 1;
      return { storage: storageName, key, classification, bytes: textEncoder().encode(String(values[key] || '')).length };
    });
    return { entries, classes };
  }

  async function encodeBinary(value, seen) {
    if (value === null || value === undefined || typeof value !== 'object') return value;
    if (!seen) seen = new WeakSet();
    if (seen.has(value)) throw new Error('No se puede guardar una referencia circular');
    seen.add(value);
    try {
      if (typeof Blob !== 'undefined' && value instanceof Blob) {
        return { __voltflowBinary: 'blob', type: value.type || '', data: bytesToBase64(await value.arrayBuffer()) };
      }
      if (value instanceof ArrayBuffer) {
        return { __voltflowBinary: 'arraybuffer', data: bytesToBase64(value) };
      }
      if (ArrayBuffer.isView(value)) {
        return { __voltflowBinary: 'typedarray', name: value.constructor.name, data: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
      }
      if (value instanceof Date) return { __voltflowDate: value.toISOString() };
      if (Array.isArray(value)) return Promise.all(value.map(item => encodeBinary(item, seen)));
      const out = {};
      for (const key of Object.keys(value)) out[key] = await encodeBinary(value[key], seen);
      return out;
    } finally {
      seen.delete(value);
    }
  }

  function decodeBinary(value) {
    if (!value || typeof value !== 'object') return value;
    if (value.__voltflowDate) return new Date(value.__voltflowDate);
    if (value.__voltflowBinary) {
      const bytes = base64ToBytes(value.data);
      if (value.__voltflowBinary === 'blob' && typeof Blob !== 'undefined') return new Blob([bytes], { type: value.type || '' });
      if (value.__voltflowBinary === 'arraybuffer') return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      if (value.__voltflowBinary === 'typedarray') {
        const ctor = root[value.name] || Uint8Array;
        return new ctor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      }
    }
    if (Array.isArray(value)) return value.map(decodeBinary);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeBinary(item)]));
  }

  function readArchivedFiles(values, key) {
    const raw = values && values[key];
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? decodeBinary(parsed) : [];
    } catch {
      throw new Error(`Archivo interno de adjuntos corrupto: ${key}`);
    }
  }

  async function buildPayload(input) {
    const createdAt = input.createdAt || new Date().toISOString();
    const encodedIdb = await encodeBinary(input.indexedDB || null);
    const sections = {
      localStorage: input.localStorage || {},
      sessionStorage: input.sessionStorage || {},
      indexedDB: encodedIdb,
      incorporatedFiles: await encodeBinary(input.incorporatedFiles || []),
      referencedFiles: input.referencedFiles || []
    };
    const sectionManifest = {};
    for (const [name, data] of Object.entries(sections)) {
      const serialized = stableStringify(data);
      sectionManifest[name] = {
        sha256: await sha256Hex(serialized),
        bytes: textEncoder().encode(serialized).length,
        count: Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : 0)
      };
    }
    const localInventory = inventoryForObject(sections.localStorage, 'localStorage');
    const sessionInventory = inventoryForObject(sections.sessionStorage, 'sessionStorage');
    return {
      schema: 'voltflow-complete-data',
      schemaVersion: 1,
      app: {
        version: input.version || 'unknown',
        build: input.build || 'unknown',
        origin: input.origin || 'unknown'
      },
      createdAt,
      consistency: input.consistency || { pendingWritesDrained: false, tabsCoordinated: false },
      manifest: {
        sections: sectionManifest,
        inventory: {
          totals: {
            localStorage: localInventory.entries.length,
            sessionStorage: sessionInventory.entries.length,
            secrets: localInventory.classes.secret + sessionInventory.classes.secret
          },
          entries: localInventory.entries.concat(sessionInventory.entries),
          excludedSessionSecrets: input.excludedSessionSecrets || []
        }
      },
      data: sections
    };
  }

  async function validatePayload(payload) {
    const errors = [];
    if (!payload || payload.schema !== 'voltflow-complete-data' || payload.schemaVersion !== 1) {
      errors.push('Esquema de datos no compatible');
      return { ok: false, errors };
    }
    const expected = payload.manifest && payload.manifest.sections;
    if (!expected) errors.push('Falta el manifiesto por secciones');
    for (const [name, data] of Object.entries(payload.data || {})) {
      if (!expected || !expected[name]) {
        errors.push(`Falta la integridad de ${name}`);
        continue;
      }
      const actual = await sha256Hex(stableStringify(data));
      if (actual !== expected[name].sha256) errors.push(`Integridad incorrecta en ${name}`);
    }
    return { ok: errors.length === 0, errors };
  }

  async function deriveKey(password, salt, iterations) {
    if (typeof password !== 'string' || password.length < 12) {
      throw new Error('La contraseña maestra debe tener al menos 12 caracteres');
    }
    const subtle = cryptoApi().subtle;
    const material = await subtle.importKey('raw', textEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encryptPayload(payload, password, options = {}) {
    const validation = await validatePayload(payload);
    if (!validation.ok) throw new Error(validation.errors.join('. '));
    const crypto = cryptoApi();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = options.iterations || KDF_ITERATIONS;
    const key = await deriveKey(password, salt, iterations);
    const plaintext = textEncoder().encode(JSON.stringify(payload));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plaintext));
    return {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      createdAt: payload.createdAt,
      crypto: {
        cipher: 'AES-256-GCM',
        kdf: 'PBKDF2-HMAC-SHA256',
        iterations,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        tagLength: 128
      },
      ciphertext: bytesToBase64(encrypted),
      ciphertextSha256: await sha256Hex(encrypted)
    };
  }

  async function decryptContainer(container, password) {
    if (!container || container.format !== FORMAT || container.formatVersion !== FORMAT_VERSION) {
      throw new Error('Formato de copia cifrada no compatible');
    }
    const encrypted = base64ToBytes(container.ciphertext || '');
    if (await sha256Hex(encrypted) !== container.ciphertextSha256) throw new Error('El archivo está corrupto o truncado');
    const iterations = Number(container.crypto && container.crypto.iterations);
    if (!Number.isSafeInteger(iterations) || iterations < 100000 || iterations > 2000000) throw new Error('Parámetros KDF no válidos');
    const salt = base64ToBytes(container.crypto.salt || '');
    const iv = base64ToBytes(container.crypto.iv || '');
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Parámetros criptográficos no válidos');
    try {
      const key = await deriveKey(password, salt, iterations);
      const plain = await cryptoApi().subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, encrypted);
      const payload = JSON.parse(textDecoder().decode(plain));
      const validation = await validatePayload(payload);
      if (!validation.ok) throw new Error(validation.errors.join('. '));
      payload.data.indexedDB = decodeBinary(payload.data.indexedDB);
      payload.data.incorporatedFiles = decodeBinary(payload.data.incorporatedFiles);
      return payload;
    } catch (error) {
      if (/integridad|esquema|manifiesto/i.test(error.message || '')) throw error;
      throw new Error('Contraseña incorrecta o copia dañada');
    }
  }

  function detectLegacyFormat(value) {
    if (value && value.format === FORMAT) return 'secure_v1';
    if (value && value.backupType === 'auto_disk_daily' && value.portableSnapshot) return 'auto_disk_daily';
    if (value && value.type === 'voltflow-portable') return 'portable';
    if (value && value.portableSnapshot) return 'full_backup_2_9_4';
    if (value && value.snapshot && typeof value.snapshot === 'object') return 'safety_snapshot';
    if (value && (Array.isArray(value.leads) || value.gordi_leads)) return 'legacy_full';
    return 'unknown';
  }

  function legacyToSnapshot(value) {
    const format = detectLegacyFormat(value);
    if (format === 'auto_disk_daily' || format === 'full_backup_2_9_4') return value.portableSnapshot;
    if (format === 'portable') return value.snapshot || value.data || value.portableSnapshot || {};
    if (format === 'safety_snapshot') return value.snapshot;
    if (format === 'legacy_full') {
      if (value.gordi_leads) return value;
      return {
        gordi_leads: JSON.stringify(value.leads || []),
        gordi_email_history: JSON.stringify(value.emailHistory || []),
        gordi_campaigns: JSON.stringify(value.campaigns || []),
        gordi_search_history: JSON.stringify(value.searchHistory || [])
      };
    }
    throw new Error('Formato histórico no reconocido');
  }

  function uniqueFilename(now) {
    const date = now || new Date();
    const stamp = date.toISOString().replace(/[:.]/g, '-');
    const random = bytesToBase64(cryptoApi().getRandomValues(new Uint8Array(6))).replace(/[^a-z0-9]/gi, '').slice(0, 8);
    return `voltflow-completo-${stamp}-${random}.vfbackup`;
  }

  async function readVersion() {
    if (!root.document || typeof fetch !== 'function') return { version: 'unknown', build: 'unknown' };
    try {
      const response = await fetch('version.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const value = await response.json();
      return { version: value.version || 'unknown', build: value.build || 'unknown' };
    } catch {
      return { version: 'unknown', build: 'unknown' };
    }
  }

  async function captureBrowserPayload(options = {}) {
    if (!root.localStorage) throw new Error('Almacenamiento del navegador no disponible');
    const changeMarkerBefore = root.localStorage.getItem('gordi_local_last_modified');
    if (root.VoltflowStorage && typeof root.VoltflowStorage.waitForIdle === 'function') {
      await root.VoltflowStorage.waitForIdle();
    }
    const localValues = storageToObject(root.localStorage);
    if (typeof root.exportCurrentDataSnapshot === 'function') {
      const authoritative = await root.exportCurrentDataSnapshot();
      Object.entries(authoritative || {}).forEach(([key, value]) => {
        if (!isInternalKey(key) && typeof value === 'string') localValues[key] = value;
      });
    }
    const allSession = storageToObject(root.sessionStorage);
    const sessionValues = {};
    const excludedSessionSecrets = [];
    Object.keys(allSession).forEach(key => {
      if (classifyKey(key) === 'secret' && !options.includeSessionSecrets) excludedSessionSecrets.push(key);
      else sessionValues[key] = allSession[key];
    });
    const indexedDB = root.VoltflowStorage && typeof root.VoltflowStorage.exportRawDatabase === 'function'
      ? await root.VoltflowStorage.exportRawDatabase()
      : null;
    const changeMarkerAfter = root.localStorage.getItem('gordi_local_last_modified');
    if (changeMarkerBefore !== changeMarkerAfter) throw new Error('Los datos cambiaron durante la copia; vuelve a intentarlo');
    const version = await readVersion();
    const incorporatedFiles = Object.prototype.hasOwnProperty.call(options, 'incorporatedFiles')
      ? options.incorporatedFiles
      : readArchivedFiles(localValues, INCORPORATED_FILES_KEY);
    const referencedFiles = Object.prototype.hasOwnProperty.call(options, 'referencedFiles')
      ? options.referencedFiles
      : readArchivedFiles(localValues, REFERENCED_FILES_KEY);
    return buildPayload({
      localStorage: localValues,
      sessionStorage: sessionValues,
      indexedDB,
      incorporatedFiles,
      referencedFiles,
      excludedSessionSecrets,
      version: version.version,
      build: version.build,
      origin: root.location ? root.location.origin : 'unknown',
      consistency: { pendingWritesDrained: true, tabsCoordinated: options.tabsCoordinated === true }
    });
  }

  async function createBrowserBackup(password, options = {}) {
    const execute = async () => {
      const coordinated = await coordinateOpenTabs();
      const payload = await captureBrowserPayload(Object.assign({}, options, { tabsCoordinated: coordinated }));
      const container = await encryptPayload(payload, password, options);
      return { container, payload, filename: uniqueFilename() };
    };
    if (root.navigator && root.navigator.locks && typeof root.navigator.locks.request === 'function') {
      return root.navigator.locks.request('voltflow-complete-backup', { mode: 'exclusive', ifAvailable: true }, lock => {
        if (!lock) throw new Error('Otra pestaña está creando o restaurando una copia');
        return execute();
      });
    }
    return execute();
  }

  async function coordinateOpenTabs() {
    if (typeof root.BroadcastChannel !== 'function') return false;
    const id = `backup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = new root.BroadcastChannel('voltflow-persistence');
    const replies = [];
    channel.onmessage = event => {
      if (event.data && event.data.type === 'ready' && event.data.requestId === id) replies.push(event.data);
    };
    channel.postMessage({ type: 'prepare-backup', requestId: id });
    await new Promise(resolve => setTimeout(resolve, 180));
    channel.close();
    if (replies.some(reply => reply.ok === false)) throw new Error('Otra pestaña no pudo finalizar sus escrituras');
    return true;
  }

  if (root.document && typeof root.BroadcastChannel === 'function') {
    const coordinationChannel = new root.BroadcastChannel('voltflow-persistence');
    coordinationChannel.onmessage = async event => {
      if (!event.data || event.data.type !== 'prepare-backup') return;
      try {
        if (root.VoltflowStorage && typeof root.VoltflowStorage.waitForIdle === 'function') await root.VoltflowStorage.waitForIdle();
        coordinationChannel.postMessage({ type: 'ready', requestId: event.data.requestId, ok: true });
      } catch (error) {
        coordinationChannel.postMessage({ type: 'ready', requestId: event.data.requestId, ok: false, error: String(error && error.message || error) });
      }
    };
  }

  function downloadContainer(container, filename) {
    const blob = new Blob([JSON.stringify(container)], { type: 'application/vnd.voltflow.backup+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || uniqueFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return blob.size;
  }

  async function verifyBackupFile(file, password) {
    const container = JSON.parse(await file.text());
    const payload = await decryptContainer(container, password);
    return {
      ok: true,
      createdAt: payload.createdAt,
      version: payload.app.version,
      build: payload.app.build,
      sections: payload.manifest.sections,
      secrets: payload.manifest.inventory.totals.secrets,
      bytes: file.size
    };
  }

  function assertCommercialSafety(localValues) {
    const errors = [];
    for (const [key, raw] of Object.entries(localValues || {})) {
      if (!/(commercial|sequence|email_history|message)/i.test(key) || typeof raw !== 'string') continue;
      let value;
      try { value = JSON.parse(raw); } catch { continue; }
      const rows = Array.isArray(value) ? value : [];
      const counts = new Map();
      rows.forEach(row => {
        if (!row || typeof row !== 'object') return;
        const confirmed = row.status === 'SENT_CONFIRMED' || row.state === 'SENT_CONFIRMED';
        if (!confirmed) return;
        const sequence = row.sequenceCanonicalKey || row.sequenceKey || row.sequenceId;
        if (!sequence) return;
        counts.set(sequence, (counts.get(sequence) || 0) + 1);
      });
      counts.forEach((count, sequence) => {
        if (count > 5) errors.push(`La secuencia ${sequence} supera cinco envíos confirmados`);
      });
    }
    if (errors.length) throw new Error(errors.join('. '));
    return true;
  }

  async function openStagingDB() {
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(STAGING_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('transactions')) request.result.createObjectStore('transactions', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir staging'));
    });
  }

  async function stageRollback(record) {
    const db = await openStagingDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readwrite');
      tx.objectStore('transactions').put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('No se pudo preparar rollback'));
      tx.onabort = () => reject(tx.error || new Error('Staging abortado'));
    });
    db.close();
  }

  async function removeStagedRollback(id) {
    const db = await openStagingDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readwrite');
      tx.objectStore('transactions').delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  function setStorageItem(storage, key, value, coordinationToken) {
    const coordinator = root.VoltflowWriteCoordinator;
    if (storage === root.localStorage && coordinationToken && coordinator?.authorizedSetItem) {
      return coordinator.authorizedSetItem(coordinationToken, storage, key, value);
    }
    return storage.setItem(key, value);
  }

  function removeStorageItem(storage, key, coordinationToken) {
    const coordinator = root.VoltflowWriteCoordinator;
    if (storage === root.localStorage && coordinationToken && coordinator?.authorizedRemoveItem) {
      return coordinator.authorizedRemoveItem(coordinationToken, storage, key);
    }
    return storage.removeItem(key);
  }

  function applyStorageObject(storage, values, includeSecrets, coordinationToken) {
    const previous = storageToObject(storage);
    Object.keys(previous).forEach(key => {
      if ((key.startsWith('gordi_') || key.startsWith('voltium_') || key.startsWith('_voltflow_')) && !isInternalKey(key) && !(key in values)) {
        removeStorageItem(storage, key, coordinationToken);
      }
    });
    Object.entries(values || {}).forEach(([key, value]) => {
      if (isInternalKey(key)) return;
      if (classifyKey(key) === 'secret' && includeSecrets === false) return;
      setStorageItem(storage, key, String(value), coordinationToken);
    });
  }

  async function restoreBrowserPayload(payload, password, options = {}) {
    const validation = await validatePayload(Object.assign({}, payload, {
      data: Object.assign({}, payload.data, {
        indexedDB: await encodeBinary(payload.data.indexedDB),
        incorporatedFiles: await encodeBinary(payload.data.incorporatedFiles)
      })
    }));
    if (!validation.ok) throw new Error(validation.errors.join('. '));
    assertCommercialSafety(payload.data.localStorage);

    const before = await captureBrowserPayload({ includeSessionSecrets: true, tabsCoordinated: false });
    const rollbackContainer = await encryptPayload(before, password);
    const transactionId = `restore-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await stageRollback({ id: transactionId, status: 'prepared', createdAt: new Date().toISOString(), rollbackContainer });
    const coordinationToken = options.coordinationToken || null;
    setStorageItem(root.localStorage, '_voltflow_restore_transaction', JSON.stringify({ id: transactionId, status: 'prepared' }), coordinationToken);

    try {
      if (payload.data.indexedDB && root.VoltflowStorage && typeof root.VoltflowStorage.replaceRawDatabase === 'function') {
        await root.VoltflowStorage.replaceRawDatabase(payload.data.indexedDB, { failAfterWrites: options.failAfterIdb === true, coordinationToken });
      }
      setStorageItem(root.localStorage, '_voltflow_restore_transaction', JSON.stringify({ id: transactionId, status: 'idb_written' }), coordinationToken);
      const restoredLocalStorage = Object.assign({}, payload.data.localStorage || {});
      if ((payload.data.incorporatedFiles || []).length) {
        restoredLocalStorage[INCORPORATED_FILES_KEY] = JSON.stringify(await encodeBinary(payload.data.incorporatedFiles));
      }
      if ((payload.data.referencedFiles || []).length) {
        restoredLocalStorage[REFERENCED_FILES_KEY] = JSON.stringify(await encodeBinary(payload.data.referencedFiles));
      }
      applyStorageObject(root.localStorage, restoredLocalStorage, options.restorePersistentSecrets !== false, coordinationToken);
      if (options.restoreSession === true) applyStorageObject(root.sessionStorage, payload.data.sessionStorage || {}, true);
      if (root.VoltflowStorage && typeof root.VoltflowStorage.waitForIdle === 'function') await root.VoltflowStorage.waitForIdle();
      if (root.VoltflowStorage && typeof root.VoltflowStorage.rebuildReadyMarker === 'function') await root.VoltflowStorage.rebuildReadyMarker({ coordinationToken });
      setStorageItem(root.localStorage, 'gordi_last_verified_restore', JSON.stringify({
        restoredAt: new Date().toISOString(),
        sourceCreatedAt: payload.createdAt,
        build: payload.app.build,
        transactionId
      }), coordinationToken);
      removeStorageItem(root.localStorage, '_voltflow_restore_transaction', coordinationToken);
      await removeStagedRollback(transactionId);
      return { ok: true, transactionId, payload };
    } catch (error) {
      try {
        if (before.data.indexedDB && root.VoltflowStorage && typeof root.VoltflowStorage.replaceRawDatabase === 'function') {
          await root.VoltflowStorage.replaceRawDatabase(before.data.indexedDB, { coordinationToken });
        }
        applyStorageObject(root.localStorage, before.data.localStorage || {}, true, coordinationToken);
        applyStorageObject(root.sessionStorage, before.data.sessionStorage || {}, true);
        if (root.VoltflowStorage && typeof root.VoltflowStorage.rebuildReadyMarker === 'function') await root.VoltflowStorage.rebuildReadyMarker({ coordinationToken });
        removeStorageItem(root.localStorage, '_voltflow_restore_transaction', coordinationToken);
        await removeStagedRollback(transactionId);
      } catch (rollbackError) {
        setStorageItem(root.localStorage, '_voltflow_restore_transaction', JSON.stringify({
          id: transactionId,
          status: 'rollback_required',
          error: String(rollbackError && rollbackError.message || rollbackError)
        }), coordinationToken);
      }
      throw error;
    }
  }

  async function restoreBrowserFile(file, password, options = {}) {
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('El archivo no contiene JSON válido'); }
    const format = detectLegacyFormat(parsed);
    if (format === 'secure_v1') {
      const payload = await decryptContainer(parsed, password);
      return restoreBrowserPayload(payload, password, options);
    }
    if (!options.allowLegacy) throw new Error('La copia histórica requiere revisión y confirmación explícitas');
    const snapshot = legacyToSnapshot(parsed);
    if (typeof root.importDataSnapshotAsync !== 'function') throw new Error('Importador histórico no disponible');
    const validation = typeof root.validateDataSnapshot === 'function' ? root.validateDataSnapshot(snapshot, null) : { ok: true };
    if (!validation.ok) throw new Error((validation.errors || []).join('. '));
    await root.importDataSnapshotAsync(snapshot, true, { reason: `legacy_restore_${format}` });
    if (root.VoltflowStorage && typeof root.VoltflowStorage.rebuildReadyMarker === 'function') await root.VoltflowStorage.rebuildReadyMarker();
    return { ok: true, format, legacy: true };
  }

  function publicInventoryReport(payload) {
    return {
      generatedAt: new Date().toISOString(),
      schema: payload.schema,
      schemaVersion: payload.schemaVersion,
      app: payload.app,
      consistency: payload.consistency,
      totals: payload.manifest.inventory.totals,
      entries: payload.manifest.inventory.entries,
      excludedSessionSecrets: payload.manifest.inventory.excludedSessionSecrets,
      indexedDB: payload.data.indexedDB ? {
        database: payload.data.indexedDB.database,
        version: payload.data.indexedDB.version,
        stores: Object.fromEntries(Object.entries(payload.data.indexedDB.stores || {}).map(([name, store]) => [name, {
          records: Array.isArray(store.records) ? store.records.length : 0
        }]))
      } : null
    };
  }

  async function runStartupDataCheck() {
    if (!root.document || !root.localStorage) return { ok: true, browser: false };
    const version = await readVersion();
    const previousBuild = root.localStorage.getItem('gordi_last_seen_build') || '';
    const restoreMarker = root.localStorage.getItem('_voltflow_restore_transaction');
    const warnings = [];
    if (restoreMarker) warnings.push('Existe una restauración interrumpida. No inicies migraciones y usa la copia cifrada original para recuperar o reintentar.');
    if (root.location && root.location.hostname === 'alfredosalaz-sys.github.io' && !/^\/Voltflow3(?:\/|$)/i.test(root.location.pathname)) {
      warnings.push('Este modo de prueba comparte origen HTTPS con otras rutas de GitHub Pages y podría ver el mismo almacenamiento. Usa un perfil aislado.');
    }
    if (previousBuild && previousBuild !== version.build) {
      root.localStorage.setItem('gordi_last_build_change_check', JSON.stringify({
        checkedAt: new Date().toISOString(),
        from: previousBuild,
        to: version.build,
        destructiveMigrationRun: false,
        indexedDBReady: !!(root.VoltflowStorage && root.VoltflowStorage.isReadySync && root.VoltflowStorage.isReadySync())
      }));
    }
    root.localStorage.setItem('gordi_last_seen_build', version.build);
    if (warnings.length) {
      let banner = root.document.getElementById('secure-storage-warning');
      if (!banner) {
        banner = root.document.createElement('div');
        banner.id = 'secure-storage-warning';
        banner.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:100000;padding:12px 16px;border:1px solid var(--warning);border-radius:8px;background:var(--bg-card,#151922);color:var(--text,#fff);font-size:.82rem;line-height:1.5;box-shadow:0 12px 32px rgba(0,0,0,.35)';
        root.document.body.appendChild(banner);
      }
      banner.textContent = warnings.join(' ');
    }
    return { ok: warnings.length === 0, browser: true, previousBuild, currentBuild: version.build, warnings };
  }

  if (root.document) {
    const start = () => runStartupDataCheck().catch(error => console.error('Data startup check failed:', error));
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else setTimeout(start, 0);
  }

  return {
    FORMAT,
    FORMAT_VERSION,
    KDF_ITERATIONS,
    classifyKey,
    storageToObject,
    inventoryForObject,
    buildPayload,
    validatePayload,
    encryptPayload,
    decryptContainer,
    detectLegacyFormat,
    legacyToSnapshot,
    uniqueFilename,
    captureBrowserPayload,
    createBrowserBackup,
    downloadContainer,
    verifyBackupFile,
    restoreBrowserPayload,
    restoreBrowserFile,
    assertCommercialSafety,
    publicInventoryReport,
    runStartupDataCheck,
    _internals: { sha256Hex, stableStringify, encodeBinary, decodeBinary, bytesToBase64, base64ToBytes }
  };
});
