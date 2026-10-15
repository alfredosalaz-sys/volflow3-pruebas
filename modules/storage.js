// ============ STORAGE / INDEXEDDB ============
// IndexedDB is used as an optional, verified large-data backend. Existing
// localStorage data is never deleted by this module.
(function () {
  const DB_NAME = 'VoltiumCRM';
  const DB_VERSION = 1;
  const META_STORE = 'meta';
  const KV_STORE = 'kv';
  const COLLECTIONS = {
    gordi_leads: { store: 'leads', id: 'id', global: 'leads' },
    gordi_email_history: { store: 'emailHistory', id: 'id', global: 'emailHistory' },
    gordi_campaigns: { store: 'campaigns', id: 'id', global: 'campaigns' },
    gordi_search_history: { store: 'searchHistory', id: 'id', global: 'searchHistoryList' },
    gordi_saved_searches: { store: 'savedSearches', id: 'id' }
  };
  const KV_KEYS = new Set([
    'gordi_objectives',
    'gordi_templates',
    'gordi_commercial_memory'
  ]);
  const LARGE_KEY_RE = /^gordi_(leads|email_history|campaigns|search_history|saved_searches|objectives|templates|commercial_memory|scrape_memory_|ecache_)/;
  const SNAPSHOT_EXCLUDED_KEYS = new Set([
    'gordi_safety_snapshots',
    'gordi_last_safety_snapshot',
    'gordi_critical_rescue_snapshots',
    'gordi_intentional_empty_leads_at',
    'gordi_auto_backup'
  ]);
  let dbPromise = null;
  let readyCache = null;
  const pendingWrites = new Map();
  const authoritativeQueues = new Map();
  const writeStatus = {
    pending: 0,
    last: null,
    errors: []
  };
  let nativeSetItemRef = null;

  function requestToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function emitPersistenceStatus(status) {
    writeStatus.last = { ...status, at: new Date().toISOString() };
    try {
      window.dispatchEvent(new CustomEvent('voltflow:persistence', { detail: writeStatus.last }));
    } catch {}
  }

  function recordWriteError(key, err, raw) {
    const entry = {
      date: new Date().toISOString(),
      key,
      message: err && err.message ? err.message : String(err)
    };
    writeStatus.errors.unshift(entry);
    writeStatus.errors = writeStatus.errors.slice(0, 12);
    let recoveryDurable = false;
    try {
      const current = safeParse(localStorage.getItem('_voltflow_pending_write_recovery'), []);
      const filtered = Array.isArray(current) ? current.filter(item => item && item.key !== key) : [];
      filtered.unshift({
        ...entry,
        raw,
        storage: 'indexeddb',
        status: 'failed_pending_recovery'
      });
      (nativeSetItemRef || Storage.prototype.setItem).call(localStorage, '_voltflow_pending_write_recovery', JSON.stringify(filtered.slice(0, 20)));
      (nativeSetItemRef || Storage.prototype.setItem).call(localStorage, '_voltflow_last_idb_write_error', JSON.stringify(entry));
      recoveryDurable = true;
    } catch {}
    emitPersistenceStatus({ state: 'failed', key, message: entry.message, recoveryDurable });
  }

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE, { keyPath: 'key' });
        ['leads', 'emailHistory', 'campaigns', 'searchHistory', 'savedSearches'].forEach(name => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: '_id' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
    });
    return dbPromise;
  }

  function stableId(item, index, prefix) {
    const raw = item && (item.id ?? item._id ?? item.email ?? item.company ?? item.name);
    return String(raw || `${prefix}_${index}`);
  }

  function normalizeRecord(item, index, key) {
    const copy = item && typeof item === 'object' ? { ...item } : { value: item };
    copy._id = stableId(copy, index, key);
    return copy;
  }

  function canonicalStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalStringify(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function checksumItems(items) {
    let hash = 2166136261;
    let bytes = 0;
    const texts = (items || []).map(item => canonicalStringify(item)).sort();
    for (const text of texts) {
      bytes += text.length;
      for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    }
    return { count: (items || []).length, bytes, hash: hash >>> 0 };
  }

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    } catch {
      return fallback;
    }
  }

  function parseMigrationArray(key) {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return [];
    let parsed;
    try {
      parsed = JSON.parse(raw);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    } catch (err) {
      throw new Error(`${key} contiene JSON corrupto y no se migrara automaticamente`);
    }
    if (!Array.isArray(parsed)) throw new Error(`${key} no es una lista valida`);
    return parsed;
  }

  async function getMeta(key) {
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readonly');
    const item = await requestToPromise(tx.objectStore(META_STORE).get(key));
    return item ? item.value : null;
  }

  async function setMeta(key, value) {
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put({ key, value, updatedAt: new Date().toISOString() });
    await txDone(tx);
  }

  async function isReady() {
    if (readyCache !== null) return readyCache;
    try {
      const manifest = await getMeta('manifest');
      readyCache = !!manifest && manifest.status === 'complete' && manifest.version === DB_VERSION;
      return readyCache;
    } catch {
      readyCache = false;
      return false;
    }
  }

  function isReadySync() {
    return localStorage.getItem('gordi_indexeddb_ready') === 'true';
  }

  async function saveCollection(storeName, items) {
    const db = await openDB();
    const records = (Array.isArray(items) ? items : []).map((item, index) => normalizeRecord(item, index, storeName));
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    try {
      store.clear();
      records.forEach(record => store.put(record));
    } catch (err) {
      try { tx.abort(); } catch {}
      throw err;
    }
    await txDone(tx);
    await setMeta(`checksum:${storeName}`, checksumItems(records));
    return records.length;
  }

  async function saveCollectionIncremental(storeName, items) {
    const db = await openDB();
    const records = (Array.isArray(items) ? items : []).map((item, index) => normalizeRecord(item, index, storeName));
    const currentRows = await getAllRaw(storeName);
    const current = new Map(currentRows.map(row => [String(row._id), row]));
    const nextIds = new Set(records.map(row => String(row._id)));
    const puts = [];
    const deletes = [];
    for (const record of records) {
      const prev = current.get(String(record._id));
      if (!prev || canonicalStringify(prev) !== canonicalStringify(record)) puts.push(record);
    }
    for (const id of current.keys()) {
      if (!nextIds.has(id)) deletes.push(id);
    }
    if (!puts.length && !deletes.length) {
      await setMeta(`checksum:${storeName}`, checksumItems(records));
      return { count: records.length, puts: 0, deletes: 0, unchanged: currentRows.length };
    }
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    try {
      puts.forEach(record => store.put(record));
      deletes.forEach(id => store.delete(id));
    } catch (err) {
      try { tx.abort(); } catch {}
      throw err;
    }
    await txDone(tx);
    await setMeta(`checksum:${storeName}`, checksumItems(records));
    return { count: records.length, puts: puts.length, deletes: deletes.length, unchanged: Math.max(0, records.length - puts.length) };
  }

  async function saveKeyValue(key, value) {
    const db = await openDB();
    const tx = db.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).put({ key, value, updatedAt: new Date().toISOString() });
    await txDone(tx);
  }

  async function saveLocalStorageKey(key, raw) {
    if (COLLECTIONS[key]) {
      const items = safeParse(raw, []);
      if (!Array.isArray(items)) throw new Error(`${key} no es una lista`);
      return saveCollectionIncremental(COLLECTIONS[key].store, items);
    }
    if (KV_KEYS.has(key) || key.startsWith('gordi_scrape_memory_') || key.startsWith('gordi_ecache_')) {
      return saveKeyValue(key, raw);
    }
    return null;
  }

  function serializeValue(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  function setCompatLocalStorage(key, raw) {
    try {
      (nativeSetItemRef || Storage.prototype.setItem).call(localStorage, key, raw);
    } catch (err) {
      try {
        (nativeSetItemRef || Storage.prototype.setItem).call(localStorage, '_voltflow_last_local_compat_error', JSON.stringify({
          date: new Date().toISOString(),
          key,
          message: err && err.message ? err.message : String(err)
        }));
      } catch {}
    }
  }

  function updateManifestAfterWrite(key) {
    setMeta('lastWrite', { key, at: new Date().toISOString(), tab: window.__voltflowTabId || null }).catch(() => {});
  }

  function persistCriticalData(key, value, options = {}) {
    const raw = serializeValue(value);
    const label = options.label || key;
    if (!LARGE_KEY_RE.test(key) && !KV_KEYS.has(key)) {
      try {
        localStorage.setItem(key, raw);
        return Promise.resolve({ ok: true, key, storage: 'localStorage' });
      } catch (err) {
        return Promise.reject(err);
      }
    }

    const previous = authoritativeQueues.get(key) || Promise.resolve();
    const run = previous.catch(() => {}).then(async () => {
      writeStatus.pending++;
      emitPersistenceStatus({ state: 'pending', key, label, pending: writeStatus.pending });
      try {
        const ready = await isReady();
        if (ready) {
          await saveLocalStorageKey(key, raw);
          updateManifestAfterWrite(key);
          setCompatLocalStorage(key, raw);
          emitPersistenceStatus({ state: 'confirmed', key, label, pending: Math.max(0, writeStatus.pending - 1) });
          return { ok: true, key, storage: 'indexeddb' };
        }
        if (isReadySync()) {
          throw new Error('IndexedDB esta marcado como fuente autoritativa pero no esta disponible');
        }
        localStorage.setItem(key, raw);
        emitPersistenceStatus({ state: 'confirmed', key, label, pending: Math.max(0, writeStatus.pending - 1) });
        return { ok: true, key, storage: 'localStorage' };
      } catch (err) {
        recordWriteError(key, err, raw);
        throw err;
      } finally {
        writeStatus.pending = Math.max(0, writeStatus.pending - 1);
      }
    });
    const tracked = run.finally(() => {
      if (authoritativeQueues.get(key) === tracked) authoritativeQueues.delete(key);
    });
    authoritativeQueues.set(key, tracked);
    return run;
  }

  async function waitForIdle() {
    await Promise.all([...authoritativeQueues.values()].map(p => p.catch(err => { throw err; })));
    return getPersistenceStatus();
  }

  function getPersistenceStatus() {
    return {
      pending: writeStatus.pending,
      queuedKeys: [...authoritativeQueues.keys()],
      last: writeStatus.last,
      errors: writeStatus.errors.slice()
    };
  }

  function enqueueKeyWrite(key, raw) {
    if (!isReadySync() || !LARGE_KEY_RE.test(key)) return;
    pendingWrites.set(key, raw);
    clearTimeout(enqueueKeyWrite.timer);
    enqueueKeyWrite.timer = setTimeout(async () => {
      const batch = [...pendingWrites.entries()];
      pendingWrites.clear();
      for (const [itemKey, itemRaw] of batch) {
        try {
          await saveLocalStorageKey(itemKey, itemRaw);
        } catch (err) {
          try {
            localStorage.setItem('_voltflow_last_idb_write_error', JSON.stringify({
              date: new Date().toISOString(),
              key: itemKey,
              message: err && err.message ? err.message : String(err)
            }));
          } catch {}
        }
      }
    }, 250);
  }

  function installLocalStorageMirror() {
    if (localStorage.__voltflowStorageWrapped) return;
    const nativeSetItem = Storage.prototype.setItem;
    nativeSetItemRef = nativeSetItem;
    Storage.prototype.setItem = function (key, value) {
      const strKey = String(key);
      const strValue = String(value);
      try {
        const result = nativeSetItem.call(this, strKey, strValue);
        if (this === localStorage) enqueueKeyWrite(strKey, strValue);
        return result;
      } catch (err) {
        if (this === localStorage && isReadySync() && LARGE_KEY_RE.test(strKey)) {
          enqueueKeyWrite(strKey, strValue);
          try {
            nativeSetItem.call(this, '_voltflow_last_storage_quota_error', JSON.stringify({
              date: new Date().toISOString(),
              key: strKey,
              message: err && err.message ? err.message : String(err)
            }));
          } catch {}
          return undefined;
        }
        throw err;
      }
    };
    Object.defineProperty(localStorage, '__voltflowStorageWrapped', { value: true });
  }

  async function getAll(storeName) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const rows = await requestToPromise(tx.objectStore(storeName).getAll());
    return rows.map(({ _id, ...item }) => item);
  }

  async function getAllRaw(storeName) {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    return requestToPromise(tx.objectStore(storeName).getAll());
  }

  async function getKV(key, fallbackRaw = null) {
    const db = await openDB();
    const tx = db.transaction(KV_STORE, 'readonly');
    const row = await requestToPromise(tx.objectStore(KV_STORE).get(key));
    return row ? row.value : fallbackRaw;
  }

  async function getAllKV() {
    const db = await openDB();
    const tx = db.transaction(KV_STORE, 'readonly');
    return requestToPromise(tx.objectStore(KV_STORE).getAll());
  }

  async function loadAll() {
    if (!(await isReady())) return null;
    const [leadsData, emailsData, campaignsData, searchHistoryData, savedSearchesRaw, objectivesRaw, templatesRaw, memoryRaw] = await Promise.all([
      getAll('leads'),
      getAll('emailHistory'),
      getAll('campaigns'),
      getAll('searchHistory'),
      getAll('savedSearches'),
      getKV('gordi_objectives', null),
      getKV('gordi_templates', null),
      getKV('gordi_commercial_memory', null)
    ]);
    return {
      leads: leadsData,
      emailHistory: emailsData,
      campaigns: campaignsData,
      searchHistoryList: searchHistoryData,
      savedSearches: savedSearchesRaw,
      objectives: safeParse(objectivesRaw, null),
      templates: safeParse(templatesRaw, null),
      commercialMemory: safeParse(memoryRaw, null)
    };
  }

  async function verifyMigration(expected) {
    const actual = {};
    for (const cfg of Object.values(COLLECTIONS)) {
      const rows = await getAllRaw(cfg.store);
      actual[cfg.store] = checksumItems(rows);
    }
    const mismatches = [];
    Object.keys(expected).forEach(store => {
      if (!actual[store] || actual[store].count !== expected[store].count || actual[store].hash !== expected[store].hash) {
        mismatches.push(store);
      }
    });
    return { ok: mismatches.length === 0, expected, actual, mismatches };
  }

  async function migrateFromLocalStorage(options = {}) {
    const startedAt = new Date().toISOString();
    const expected = {};
    const parsed = {};
    for (const [key, cfg] of Object.entries(COLLECTIONS)) {
      const items = parseMigrationArray(key);
      parsed[cfg.store] = items;
      expected[cfg.store] = checksumItems(parsed[cfg.store].map((item, index) => normalizeRecord(item, index, cfg.store)));
    }

    const db = await openDB();
    await setMeta('migration', { status: 'running', startedAt, version: DB_VERSION, expected });
    const tx = db.transaction([META_STORE, KV_STORE, ...Object.values(COLLECTIONS).map(cfg => cfg.store)], 'readwrite');
    Object.values(COLLECTIONS).forEach(cfg => tx.objectStore(cfg.store).clear());
    Object.entries(parsed).forEach(([storeName, items]) => {
      const store = tx.objectStore(storeName);
      items.forEach((item, index) => store.put(normalizeRecord(item, index, storeName)));
    });
    KV_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw !== null) tx.objectStore(KV_STORE).put({ key, value: raw, updatedAt: startedAt });
    });
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('gordi_scrape_memory_') || key.startsWith('gordi_ecache_'))) {
        tx.objectStore(KV_STORE).put({ key, value: localStorage.getItem(key), updatedAt: startedAt });
      }
    }
    tx.objectStore(META_STORE).put({ key: 'migration', value: { status: 'written', startedAt, version: DB_VERSION, expected } });
    await txDone(tx);

    const verification = await verifyMigration(expected);
    if (!verification.ok) {
      await setMeta('migration', { status: 'failed', startedAt, finishedAt: new Date().toISOString(), version: DB_VERSION, verification });
      throw new Error(`Migracion IndexedDB incompleta: ${verification.mismatches.join(', ')}`);
    }
    const manifest = {
      status: 'complete',
      version: DB_VERSION,
      migratedAt: new Date().toISOString(),
      source: options.source || 'localStorage',
      expected,
      verification
    };
    await setMeta('manifest', manifest);
    await setMeta('migration', { status: 'complete', startedAt, finishedAt: manifest.migratedAt, version: DB_VERSION });
    readyCache = true;
    localStorage.setItem('gordi_indexeddb_ready', 'true');
    localStorage.setItem('_voltflow_idb_manifest', JSON.stringify({
      version: DB_VERSION,
      migratedAt: manifest.migratedAt,
      counts: Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, value.count]))
    }));
    installLocalStorageMirror();
    return manifest;
  }

  async function exportSnapshot() {
    await waitForIdle();
    const data = await loadAll();
    if (!data) return null;
    const snapshot = {
      _voltflow_storage: 'indexeddb',
      _voltflow_storage_version: DB_VERSION,
      _exported: new Date().toISOString()
    };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || SNAPSHOT_EXCLUDED_KEYS.has(key)) continue;
        if (key.startsWith('gordi_') || key.startsWith('voltium_')) {
          snapshot[key] = localStorage.getItem(key);
        }
      }
    } catch {}
    try {
      const kvRows = await getAllKV();
      kvRows.forEach(row => {
        if (row && row.key && !SNAPSHOT_EXCLUDED_KEYS.has(row.key)) snapshot[row.key] = row.value;
      });
    } catch {}
    Object.assign(snapshot, {
      gordi_leads: JSON.stringify(data.leads || []),
      gordi_email_history: JSON.stringify(data.emailHistory || []),
      gordi_campaigns: JSON.stringify(data.campaigns || []),
      gordi_search_history: JSON.stringify(data.searchHistoryList || []),
      gordi_saved_searches: JSON.stringify(data.savedSearches || []),
      gordi_objectives: JSON.stringify(data.objectives || {}),
      gordi_templates: JSON.stringify(data.templates || {}),
      gordi_commercial_memory: JSON.stringify(data.commercialMemory || {})
    });
    return snapshot;
  }

  async function recoverInterruptedMigration() {
    const migration = await getMeta('migration');
    const manifest = await getMeta('manifest');
    if (isReadySync() && (!manifest || manifest.status !== 'complete' || manifest.version !== DB_VERSION)) {
      readyCache = false;
      localStorage.setItem('gordi_indexeddb_ready', 'false');
      return { recovered: false, reason: 'manifest_incomplete', migration, manifest };
    }
    if (migration && migration.status && migration.status !== 'complete') {
      readyCache = false;
      localStorage.setItem('gordi_indexeddb_ready', 'false');
      return { recovered: false, reason: 'migration_incomplete', migration };
    }
    return { recovered: true };
  }

  installLocalStorageMirror();

  window.VoltflowStorage = {
    DB_NAME,
    DB_VERSION,
    openDB,
    isReady,
    isReadySync,
    loadAll,
    migrateFromLocalStorage,
    verifyMigration,
    saveCollection,
    saveCollectionIncremental,
    persistCriticalData,
    waitForIdle,
    getPersistenceStatus,
    saveLocalStorageKey,
    exportSnapshot,
    recoverInterruptedMigration,
    installLocalStorageMirror,
    _checksumItems: checksumItems
  };
})();
