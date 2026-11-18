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
    'gordi_commercial_memory',
    'gordi_conflict_drafts'
  ]);
  const RECOVERY_SNAPSHOT_PREFIX = '_voltflow_recovery_snapshot:';
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
  const appliedCollectionRevisions = new Map();
  const appliedCollectionBaselines = new Map();
  const writeStatus = {
    pending: 0,
    last: null,
    errors: []
  };
  let nativeSetItemRef = null;

  function coordinator() { return window.VoltflowWriteCoordinator || null; }
  async function awaitWritePermission(options = {}) {
    if (coordinator()?.waitForWritable) await coordinator().waitForWritable(options.coordinationToken || null);
  }
  function setCoordinatedLocal(key, value, options = {}) {
    const token = options.coordinationToken || null;
    if (token && coordinator()?.authorizedSetItem) return coordinator().authorizedSetItem(token, localStorage, key, value);
    return localStorage.setItem(key, value);
  }
  function removeCoordinatedLocal(key, options = {}) {
    const token = options.coordinationToken || null;
    if (token && coordinator()?.authorizedRemoveItem) return coordinator().authorizedRemoveItem(token, localStorage, key);
    return localStorage.removeItem(key);
  }

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

  async function recordWriteError(key, err, raw) {
    const entry = {
      operationId: `${key}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
      date: new Date().toISOString(),
      key,
      message: err && err.message ? err.message : String(err),
      code: err?.code || null,
      expectedRevision: Number.isFinite(err?.expectedRevision) ? err.expectedRevision : null,
      actualRevision: Number.isFinite(err?.actualRevision) ? err.actualRevision : null,
      conflicts: Array.isArray(err?.conflicts) ? [...err.conflicts] : []
    };
    writeStatus.errors.unshift(entry);
    writeStatus.errors = writeStatus.errors.slice(0, 12);
    let recoveryDurable = false;
    try {
      const recoveryEntry = {
        ...entry,
        raw,
        storage: 'indexeddb',
        status: 'failed_pending_recovery'
      };
      const db = await openDB();
      const tx = db.transaction(KV_STORE, 'readwrite');
      const store = tx.objectStore(KV_STORE);
      const recoveryKey = '_voltflow_pending_write_recovery_v1';
      const row = await requestToPromise(store.get(recoveryKey));
      const current = safeParse(row?.value, {});
      const next = { ...(current && typeof current === 'object' ? current : {}), [entry.operationId]: recoveryEntry };
      const ordered = Object.values(next).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 20);
      const compact = Object.fromEntries(ordered.map(item => [item.operationId, item]));
      store.put({ key: recoveryKey, value: JSON.stringify(compact), updatedAt: entry.date });
      await txDone(tx);
      (nativeSetItemRef || Storage.prototype.setItem).call(localStorage, '_voltflow_pending_write_recovery', JSON.stringify(ordered));
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
      req.onerror = () => {
        dbPromise = null;
        reject(req.error || new Error('No se pudo abrir IndexedDB'));
      };
      req.onblocked = () => { dbPromise = null; };
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

  function collectionKeyForStore(storeName) {
    return Object.entries(COLLECTIONS).find(([, cfg]) => cfg.store === storeName)?.[0] || null;
  }

  function denormalizeRecord(item) {
    if (!item || typeof item !== 'object') return item ?? null;
    const { _id, ...copy } = item;
    return copy;
  }

  function mergeStaleFullCollection(baselineItems, desiredItems, authoritativeItems, storeName, options = {}) {
    const normalizeMap = items => new Map((items || []).map((item, index) => {
      const record = normalizeRecord(item, index, storeName);
      return [String(record._id), record];
    }));
    const baseline = normalizeMap(baselineItems);
    const desired = normalizeMap(desiredItems);
    const authoritative = normalizeMap(authoritativeItems);
    const merged = new Map();
    const conflicts = [];
    const allowedDeletes = new Set((options.allowedDeletes || []).map(String));
    const ids = new Set([...baseline.keys(), ...desired.keys(), ...authoritative.keys()]);
    const equal = (left, right) => left == null || right == null
      ? left == null && right == null
      : canonicalStringify(left) === canonicalStringify(right);
    const mergeValue = (before, wanted, current) => {
      if (equal(wanted, current)) return { ok: true, value: wanted };
      if (equal(before, wanted)) return { ok: true, value: current };
      if (equal(before, current)) return { ok: true, value: wanted };
      const allObjects = [before, wanted, current].every(value => value && typeof value === 'object' && !Array.isArray(value));
      if (!allObjects) return { ok: false };
      const value = {};
      const keys = new Set([...Object.keys(before), ...Object.keys(wanted), ...Object.keys(current)]);
      for (const key of keys) {
        const merged = mergeValue(before[key], wanted[key], current[key]);
        if (!merged.ok) return { ok: false };
        if (merged.value !== undefined) value[key] = merged.value;
      }
      return { ok: true, value };
    };
    for (const id of ids) {
      const before = baseline.get(id) || null;
      const wanted = desired.get(id) || null;
      const current = authoritative.get(id) || null;
      const callerChanged = !equal(before, wanted);
      const authorityChanged = !equal(before, current);
      if (!callerChanged) {
        if (current) merged.set(id, current);
        continue;
      }
      // A full payload is not deletion intent by itself. Legacy callers and a
      // stale tab may simply not know a record added or loaded elsewhere.
      if (before && !wanted && current && !allowedDeletes.has(id)) {
        merged.set(id, current);
        continue;
      }
      if (!authorityChanged || equal(wanted, current)) {
        if (wanted) merged.set(id, wanted);
        continue;
      }
      if (before && wanted && current) {
        const fieldMerge = mergeValue(before, wanted, current);
        if (fieldMerge.ok) {
          merged.set(id, fieldMerge.value);
          continue;
        }
      }
      // A record unknown to the caller was added concurrently. Its absence in
      // the stale full payload is not interpreted as a deletion.
      if (!before && !wanted && current) {
        merged.set(id, current);
        continue;
      }
      conflicts.push(id);
      if (current) merged.set(id, current);
    }
    return { ok: conflicts.length === 0, conflicts, records: [...merged.values()] };
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
    // A negative result is not permanent: another tab may complete migration.
    if (readyCache === true) return true;
    try {
      const manifest = await getMeta('manifest');
      readyCache = !!manifest && manifest.status === 'complete' && manifest.version === DB_VERSION;
      return readyCache;
    } catch {
      // Un fallo temporal no cambia la autoridad persistida de la instalacion.
      readyCache = isReadySync() ? null : false;
      return false;
    }
  }

  function collectionsEqual(left, right, storeName) {
    const normalized = items => (items || []).map((item, index) => normalizeRecord(item, index, storeName))
      .sort((a, b) => String(a._id).localeCompare(String(b._id)));
    return canonicalStringify(normalized(left)) === canonicalStringify(normalized(right));
  }

  function valueContainsAuthoritative(candidate, authoritative) {
    if (Array.isArray(authoritative)) {
      return Array.isArray(candidate) && canonicalStringify(candidate) === canonicalStringify(authoritative);
    }
    if (authoritative && typeof authoritative === 'object') {
      if (!candidate || typeof candidate !== 'object') return false;
      return Object.keys(authoritative).every(key => valueContainsAuthoritative(candidate[key], authoritative[key]));
    }
    return canonicalStringify(candidate) === canonicalStringify(authoritative);
  }

  function baselineCoversAuthoritative(baselineItems, authoritativeItems, storeName) {
    const map = items => new Map((items || []).map((item, index) => {
      const normalized = normalizeRecord(item, index, storeName);
      return [String(normalized._id), normalized];
    }));
    const baseline = map(baselineItems);
    const authoritative = map(authoritativeItems);
    if (baseline.size !== authoritative.size) return false;
    return [...authoritative].every(([id, item]) => baseline.has(id) && valueContainsAuthoritative(baseline.get(id), item));
  }

  async function captureCollectionContext(key) {
    const cfg = COLLECTIONS[key];
    if (!cfg) throw new Error(`Coleccion no compatible: ${key}`);
    const db = await openDB();
    const tx = db.transaction([cfg.store, META_STORE], 'readonly');
    const [rows, revisionRow] = await Promise.all([
      requestToPromise(tx.objectStore(cfg.store).getAll()),
      requestToPromise(tx.objectStore(META_STORE).get(`revision:${cfg.store}`))
    ]);
    await txDone(tx);
    return {
      key,
      revision: Number(revisionRow?.value?.revision || 0),
      items: rows.map(denormalizeRecord),
      checksum: checksumItems(rows)
    };
  }

  function isReadySync() {
    return localStorage.getItem('gordi_indexeddb_ready') === 'true';
  }

  function hasIndexedDbAuthorityEvidence() {
    if (isReadySync()) return true;
    try {
      const manifest = safeParse(localStorage.getItem('_voltflow_idb_manifest'), null);
      return !!(manifest && Number(manifest.version) === DB_VERSION);
    } catch { return false; }
  }

  async function resolveDataAuthority() {
    const declaredIndexedDb = hasIndexedDbAuthorityEvidence();
    try {
      const manifest = await getMeta('manifest');
      const migration = await getMeta('migration');
      const complete = !!(manifest && manifest.status === 'complete' && manifest.version === DB_VERSION &&
        (!migration || migration.status === 'complete'));
      if (complete) {
        readyCache = true;
        return { source: 'indexeddb', status: 'available', version: DB_VERSION, manifest };
      }
      const interrupted = !!(
        manifest && Number(manifest.version) === DB_VERSION && manifest.status === 'pending-verification' &&
        migration && Number(migration.version) === DB_VERSION && ['written', 'verifying'].includes(migration.status)
      );
      if (interrupted) {
        return { source: 'indexeddb', status: 'migration-pending', version: DB_VERSION, manifest, migration };
      }
      if (manifest || migration) {
        return { source: 'indexeddb', status: 'migration-inconsistent', version: DB_VERSION, manifest, migration };
      }
      if (declaredIndexedDb) {
        return { source: 'indexeddb', status: 'invalid-manifest', version: DB_VERSION, manifest };
      }
      return { source: 'localStorage', status: 'legacy-confirmed', version: 1, manifest: null };
    } catch (error) {
      readyCache = declaredIndexedDb ? null : readyCache;
      return {
        source: declaredIndexedDb ? 'indexeddb' : 'unknown',
        status: 'unavailable',
        version: declaredIndexedDb ? DB_VERSION : null,
        error: String(error?.message || error)
      };
    }
  }

  async function replaceCollectionTransactional(storeName, items, options = {}) {
    await awaitWritePermission(options);
    const db = await openDB();
    let records = (Array.isArray(items) ? items : []).map((item, index) => normalizeRecord(item, index, storeName));
    const tx = db.transaction([storeName, META_STORE], 'readwrite');
    const done = txDone(tx);
    const store = tx.objectStore(storeName);
    const meta = tx.objectStore(META_STORE);
    const revisionKey = `revision:${storeName}`;
    const [currentRows, previousRevision] = await Promise.all([
      requestToPromise(store.getAll()),
      requestToPromise(meta.get(revisionKey))
    ]);
    const previous = Number(previousRevision?.value?.revision || 0);
    const expectedRevision = options.expectedRevision == null ? previous : Number(options.expectedRevision);
    let mergedStaleWrite = false;
    if (!Number.isFinite(expectedRevision)) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw new Error('PERSISTENCE_EXPECTED_REVISION_INVALID');
    }
    const mustMerge = expectedRevision !== previous || options.forceBaselineMerge === true;
    if (mustMerge) {
      const merge = mergeStaleFullCollection(options.baselineItems || [], records, currentRows, storeName, options);
      if (!merge.ok) {
        try { tx.abort(); } catch {}
        await done.catch(() => {});
        const error = new Error(`PERSISTENCE_VERSION_CONFLICT:${storeName}:${merge.conflicts.join(',')}`);
        error.code = 'PERSISTENCE_VERSION_CONFLICT';
        error.storeName = storeName;
        error.expectedRevision = expectedRevision;
        error.actualRevision = previous;
        error.conflicts = merge.conflicts;
        error.recoverableValue = records.map(denormalizeRecord);
        throw error;
      }
      records = merge.records;
      mergedStaleWrite = true;
    }
    // Collection replacement is non-destructive by default. Omitting a row
    // may mean that the caller has a stale or partial view; only a typed delete
    // operation may remove an existing authoritative record.
    const allowedDeletes = new Set((options.allowedDeletes || []).map(String));
    const desiredIds = new Set(records.map(row => String(row._id)));
    for (const row of currentRows) {
      const id = String(row._id);
      if (!desiredIds.has(id) && !allowedDeletes.has(id)) {
        records.push(row);
        desiredIds.add(id);
      }
    }
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
    const changedAt = new Date().toISOString();
    const revision = puts.length || deletes.length ? previous + 1 : previous;
    const ids = [...new Set([...puts.map(row => String(row._id)), ...deletes])];
    try {
      puts.forEach(record => store.put(record));
      deletes.forEach(id => store.delete(id));
      meta.put({
        key: `checksum:${storeName}`,
        value: checksumItems(records),
        updatedAt: changedAt
      });
      if (ids.length) {
        meta.put({
          key: revisionKey,
          value: { revision, changedAt, ids, mode: options.mode || 'full-collection' },
          updatedAt: changedAt
        });
        meta.put({
          key: 'lastWrite',
          value: { key: options.collectionKey || collectionKeyForStore(storeName), at: changedAt, tab: window.__voltflowTabId || null },
          updatedAt: changedAt
        });
      }
    } catch (err) {
      try { tx.abort(); } catch {}
      throw err;
    }
    await done;
    const key = options.collectionKey || collectionKeyForStore(storeName);
    const compat = ids.length && key
      ? patchCompatCollection(key, [], [], revision, { fullRefresh: true, ids })
      : null;
    return {
      count: records.length,
      puts: puts.length,
      deletes: deletes.length,
      unchanged: Math.max(0, records.length - puts.length),
      revision,
      ids,
      mode: options.mode || 'full-collection',
      mergedStaleWrite,
      compat
    };
  }

  async function saveCollection(storeName, items, options = {}) {
    const result = await replaceCollectionTransactional(storeName, items, { ...options, mode: 'full-replace' });
    return result.count;
  }

  async function saveCollectionIncremental(storeName, items, options = {}) {
    return replaceCollectionTransactional(storeName, items, { ...options, mode: 'full-collection' });
  }

  async function saveKeyValue(key, value, options = {}) {
    await awaitWritePermission(options);
    const db = await openDB();
    const tx = db.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).put({ key, value, updatedAt: new Date().toISOString() });
    await txDone(tx);
  }

  async function saveLocalStorageKey(key, raw, options = {}) {
    if (COLLECTIONS[key]) {
      const items = safeParse(raw, []);
      if (!Array.isArray(items)) throw new Error(`${key} no es una lista`);
      return saveCollectionIncremental(COLLECTIONS[key].store, items, { ...options, collectionKey: key });
    }
    if (KV_KEYS.has(key) || key.startsWith('gordi_scrape_memory_') || key.startsWith('gordi_ecache_')) {
      return saveKeyValue(key, raw, options);
    }
    return null;
  }

  function serializeValue(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  function setCompatLocalStorage(key, raw, options = {}) {
    try {
      if (options.coordinationToken && window.VoltflowWriteCoordinator?.authorizedSetItem) {
        window.VoltflowWriteCoordinator.authorizedSetItem(options.coordinationToken, localStorage, key, raw);
      } else {
        (nativeSetItemRef || Storage.prototype.setItem).call(localStorage, key, raw);
      }
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

    // Capture the caller's authoritative baseline before waiting behind another
    // writer. The same revision is checked inside the write transaction.
    const stateCollection = COLLECTIONS[key] ? window.VoltflowStateAccess?.getCollection?.(key) : null;
    const hasStateBaseline = Array.isArray(stateCollection);
    const stateBaseline = hasStateBaseline ? structuredClone(stateCollection) : null;
    const knownRevision = COLLECTIONS[key] && options.expectedRevision == null
      ? appliedCollectionRevisions.get(key)
      : options.expectedRevision;
    const desiredCollection = COLLECTIONS[key] ? safeParse(raw, []) : null;
    const explicitBaseline = Array.isArray(options.baselineItems) ? options.baselineItems : null;
    const appliedBaseline = appliedCollectionBaselines.get(key);
    const stateRepresentsPriorView = hasStateBaseline && Array.isArray(desiredCollection) &&
      !collectionsEqual(stateBaseline, desiredCollection, COLLECTIONS[key].store);
    const hasKnownBaseline = COLLECTIONS[key] && (
      explicitBaseline !== null || Array.isArray(appliedBaseline) || hasStateBaseline
    );
    const knownBaseline = !COLLECTIONS[key]
      ? null
      : explicitBaseline !== null
        ? explicitBaseline
        : stateRepresentsPriorView
          ? stateBaseline
          : Array.isArray(appliedBaseline)
            ? appliedBaseline
            : stateBaseline;
    // The records and revision are captured in one readonly transaction even
    // when this tab knows a revision. A current revision does not prove that
    // its in-memory collection is current (sleeping/lost-notification tabs).
    const contextPromise = COLLECTIONS[key] ? captureCollectionContext(key) : null;
    const previous = authoritativeQueues.get(key) || Promise.resolve();
    const run = previous.catch(() => {}).then(async () => {
      writeStatus.pending++;
      emitPersistenceStatus({ state: 'pending', key, label, pending: writeStatus.pending });
      try {
        const ready = await isReady();
        if (ready) {
          const captured = contextPromise ? await contextPromise : null;
          const expectedRevision = COLLECTIONS[key]
            ? Number(knownRevision == null ? captured.revision : knownRevision)
            : null;
          const baselineItems = COLLECTIONS[key]
            ? structuredClone(hasKnownBaseline ? knownBaseline : captured.items)
            : null;
          const baselineOnlyAddsLocalDefaults = COLLECTIONS[key] && captured && expectedRevision === captured.revision &&
            baselineCoversAuthoritative(baselineItems, captured.items, COLLECTIONS[key].store);
          const effectiveBaseline = baselineOnlyAddsLocalDefaults ? captured.items : baselineItems;
          const forceBaselineMerge = COLLECTIONS[key] && captured
            ? !collectionsEqual(effectiveBaseline, captured.items, COLLECTIONS[key].store)
            : false;
          const declaredDeletes = new Set((options.allowedDeletes || []).map(String));
          const writeResult = await saveLocalStorageKey(key, raw, {
            ...options,
            expectedRevision,
            baselineItems: effectiveBaseline,
            forceBaselineMerge,
            allowedDeletes: [...declaredDeletes]
          });
          if (COLLECTIONS[key] && !writeResult.mergedStaleWrite) {
            appliedCollectionRevisions.set(key, writeResult.revision);
            appliedCollectionBaselines.set(key, safeParse(raw, []).map(item => structuredClone(item)));
          }
          if (!COLLECTIONS[key]) updateManifestAfterWrite(key);
          setCompatLocalStorage(key, raw, options);
          emitPersistenceStatus({ state: 'confirmed', key, label, pending: Math.max(0, writeStatus.pending - 1) });
          return { ok: true, key, storage: 'indexeddb', ...(writeResult && typeof writeResult === 'object' ? writeResult : {}) };
        }
        if (isReadySync()) {
          throw new Error('IndexedDB esta marcado como fuente autoritativa pero no esta disponible');
        }
        await setCoordinatedLocal(key, raw, options);
        emitPersistenceStatus({ state: 'confirmed', key, label, pending: Math.max(0, writeStatus.pending - 1) });
        return { ok: true, key, storage: 'localStorage' };
      } catch (err) {
        await recordWriteError(key, err, raw);
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

  function enqueueKeyWrite(key, raw, previousRaw = null) {
    if (!isReadySync() || !LARGE_KEY_RE.test(key)) return;
    const existing = pendingWrites.get(key);
    pendingWrites.set(key, { raw, previousRaw: existing?.previousRaw ?? previousRaw });
    clearTimeout(enqueueKeyWrite.timer);
    enqueueKeyWrite.timer = setTimeout(async () => {
      const batch = [...pendingWrites.entries()];
      pendingWrites.clear();
      for (const [itemKey, pending] of batch) {
        try {
          const baselineItems = COLLECTIONS[itemKey] ? safeParse(pending.previousRaw, []) : undefined;
          await persistCriticalData(itemKey, pending.raw, {
            label: `compatibilidad ${itemKey}`,
            baselineItems: Array.isArray(baselineItems) ? baselineItems : undefined
          });
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
        const previousValue = this === localStorage ? this.getItem(strKey) : null;
        const result = nativeSetItem.call(this, strKey, strValue);
        if (this === localStorage) enqueueKeyWrite(strKey, strValue, previousValue);
        return result;
      } catch (err) {
        if (this === localStorage && isReadySync() && LARGE_KEY_RE.test(strKey)) {
          enqueueKeyWrite(strKey, strValue, this.getItem(strKey));
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
    const state = await readConsistentSnapshotState();
    if (!state) return null;
    return { ...state.data, _voltflowAuthority: state.authority };
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
    const tx = db.transaction([META_STORE, KV_STORE, ...Object.values(COLLECTIONS).map(cfg => cfg.store)], 'readwrite');
    const done = txDone(tx);
    const meta = tx.objectStore(META_STORE);
    const [existingManifest, existingMigration, ...revisionRows] = await Promise.all([
      requestToPromise(meta.get('manifest')),
      requestToPromise(meta.get('migration')),
      ...Object.values(COLLECTIONS).map(cfg => requestToPromise(meta.get(`revision:${cfg.store}`)))
    ]);
    if (existingManifest?.value?.status === 'complete' && existingManifest.value.version === DB_VERSION) {
      await done;
      readyCache = true;
      localStorage.setItem('gordi_indexeddb_ready', 'true');
      return { ...existingManifest.value, alreadyAuthoritative: true, skippedLegacyOverwrite: true };
    }
    if (existingMigration?.value?.status && !['complete', 'failed'].includes(existingMigration.value.status)) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      const recovery = await recoverInterruptedMigration();
      if (recovery.recovered) return { ...recovery.manifest, recoveredInterruptedMigration: true, alreadyAuthoritative: true };
      const error = new Error('MIGRATION_ALREADY_IN_PROGRESS_OR_INCOMPLETE');
      error.code = 'MIGRATION_ALREADY_IN_PROGRESS_OR_INCOMPLETE';
      throw error;
    }
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
    const pendingManifest = {
      status: 'pending-verification',
      version: DB_VERSION,
      migratedAt: startedAt,
      source: options.source || 'localStorage',
      expected
    };
    meta.put({ key: 'migration', value: { status: 'written', startedAt, version: DB_VERSION, expected }, updatedAt: startedAt });
    meta.put({ key: 'manifest', value: pendingManifest, updatedAt: startedAt });
    Object.values(COLLECTIONS).forEach((cfg, index) => {
      const revision = Number(revisionRows[index]?.value?.revision || 0) + 1;
      meta.put({
        key: `revision:${cfg.store}`,
        value: { revision, changedAt: startedAt, ids: [], mode: 'legacy-migration', fullRefresh: true },
        updatedAt: startedAt
      });
      meta.put({ key: `checksum:${cfg.store}`, value: expected[cfg.store], updatedAt: startedAt });
    });
    await done;

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
    for (const [key, cfg] of Object.entries(COLLECTIONS)) {
      const revision = await readCollectionRevision(key);
      appliedCollectionRevisions.set(key, revision);
      appliedCollectionBaselines.set(key, (parsed[cfg.store] || []).map(item => structuredClone(item)));
      patchCompatCollection(key, [], [], revision, { fullRefresh: true });
    }
    return manifest;
  }

  async function readConsistentSnapshotState() {
    if (!(await isReady())) return null;
    const db = await openDB();
    const storeNames = [META_STORE, KV_STORE, ...new Set(Object.values(COLLECTIONS).map(cfg => cfg.store))];
    const tx = db.transaction(storeNames, 'readonly');
    const requests = Object.fromEntries(storeNames.map(storeName => [storeName, requestToPromise(tx.objectStore(storeName).getAll())]));
    const entries = await Promise.all(Object.entries(requests).map(async ([storeName, request]) => [storeName, await request]));
    await txDone(tx);
    const stores = Object.fromEntries(entries);
    const meta = Object.fromEntries((stores[META_STORE] || []).map(row => [row.key, row.value]));
    const kv = Object.fromEntries((stores[KV_STORE] || [])
      .filter(row => row?.key && !String(row.key).startsWith(RECOVERY_SNAPSHOT_PREFIX))
      .map(row => [row.key, row.value]));
    const collection = storeName => (stores[storeName] || []).map(denormalizeRecord);
    const revisions = {};
    const counts = {};
    const checksums = {};
    for (const [key, cfg] of Object.entries(COLLECTIONS)) {
      const rows = stores[cfg.store] || [];
      revisions[key] = Number(meta[`revision:${cfg.store}`]?.revision || 0);
      counts[key] = rows.length;
      checksums[key] = checksumItems(rows);
    }
    return {
      data: {
        leads: collection('leads'),
        emailHistory: collection('emailHistory'),
        campaigns: collection('campaigns'),
        searchHistoryList: collection('searchHistory'),
        savedSearches: collection('savedSearches'),
        objectives: safeParse(kv.gordi_objectives, null),
        templates: safeParse(kv.gordi_templates, null),
        commercialMemory: safeParse(kv.gordi_commercial_memory, null)
      },
      kv,
      authority: {
        source: 'indexeddb', database: DB_NAME, version: DB_VERSION,
        capturedAt: new Date().toISOString(),
        manifestStatus: meta.manifest?.status || null,
        migrationStatus: meta.migration?.status || null,
        revisions, counts, checksums
      }
    };
  }

  async function readSnapshotAuthority() {
    if (!(await isReady())) return null;
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readonly');
    const rows = await requestToPromise(tx.objectStore(META_STORE).getAll());
    await txDone(tx);
    const meta = Object.fromEntries(rows.map(row => [row.key, row.value]));
    return {
      source: 'indexeddb', database: DB_NAME, version: DB_VERSION,
      manifestStatus: meta.manifest?.status || null,
      migrationStatus: meta.migration?.status || null,
      revisions: Object.fromEntries(Object.entries(COLLECTIONS).map(([key, cfg]) => [key, Number(meta[`revision:${cfg.store}`]?.revision || 0)]))
    };
  }

  async function readCollectionRevision(key) {
    const cfg = COLLECTIONS[key];
    if (!cfg || !(await isReady())) return 0;
    const row = await getMeta(`revision:${cfg.store}`);
    return Number(row?.revision || 0);
  }

  async function exportSnapshot() {
    await waitForIdle();
    const state = await readConsistentSnapshotState();
    if (!state) return null;
    const { data, kv, authority } = state;
    const snapshot = {
      _voltflow_storage: 'indexeddb',
      _voltflow_storage_version: DB_VERSION,
      _voltflow_authority: authority,
      _exported: authority.capturedAt
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
    Object.entries(kv).forEach(([key, value]) => {
      if (!SNAPSHOT_EXCLUDED_KEYS.has(key)) snapshot[key] = value;
    });
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

  async function loadCollectionRecords(key, ids) {
    const cfg = COLLECTIONS[key];
    if (!cfg) throw new Error(`Coleccion no compatible: ${key}`);
    if (!(await isReady())) return null;
    const uniqueIds = [...new Set((ids || []).map(String))];
    const db = await openDB();
    const tx = db.transaction(cfg.store, 'readonly');
    const store = tx.objectStore(cfg.store);
    const rows = await Promise.all(uniqueIds.map(id => requestToPromise(store.get(id))));
    await txDone(tx);
    return Object.fromEntries(uniqueIds.map((id, index) => [id, rows[index] ? denormalizeRecord(rows[index]) : null]));
  }

  function patchCompatCollection(key, puts, deletes, revision, options = {}) {
    const started = performance.now();
    try {
      const marker = JSON.stringify({
        revision,
        at: new Date().toISOString(),
        puts: puts.map(row => String(row.id ?? row._id)),
        deletes,
        fullRefresh: options.fullRefresh === true,
        changedCount: Array.isArray(options.ids) ? options.ids.length : puts.length + deletes.length
      });
      (nativeSetItemRef || Storage.prototype.setItem).call(localStorage, `_voltflow_collection_revision:${key}`, marker);
      (nativeSetItemRef || Storage.prototype.setItem).call(localStorage, `_voltflow_compat_stale:${key}`, marker);
      return { ok: true, stale: true, mode: 'authoritative-revision-marker', durationMs: performance.now() - started };
    } catch (error) {
      try {
        (nativeSetItemRef || Storage.prototype.setItem).call(localStorage, `_voltflow_compat_stale:${key}`, JSON.stringify({
          at: new Date().toISOString(), reason: String(error?.message || error)
        }));
      } catch {}
      return { ok: false, stale: true, durationMs: performance.now() - started, reason: String(error?.message || error) };
    }
  }

  async function persistCollectionPatch(key, patch = {}, options = {}) {
    const cfg = COLLECTIONS[key];
    if (!cfg) throw new Error(`Coleccion no compatible: ${key}`);
    const started = performance.now();
    await awaitWritePermission(options);
    const permissionAt = performance.now();
    if (!(await isReady())) throw new Error('PERSISTENCE_INCREMENTAL_REQUIRES_INDEXEDDB');
    const puts = (Array.isArray(patch.puts) ? patch.puts : []).map((item, index) => normalizeRecord(item, index, key));
    const deletes = [...new Set((patch.deletes || []).map(String))];
    const expected = patch.expected && typeof patch.expected === 'object' ? patch.expected : {};
    const ids = [...new Set([...puts.map(item => String(item._id)), ...deletes])];
    if (!ids.length) return { ok: true, key, storage: 'indexeddb', puts: 0, deletes: 0, timings: { totalMs: performance.now() - started } };

    const db = await openDB();
    const tx = db.transaction([cfg.store, META_STORE], 'readwrite');
    const store = tx.objectStore(cfg.store);
    const meta = tx.objectStore(META_STORE);
    const currentRows = await Promise.all(ids.map(id => requestToPromise(store.get(id))));
    const readAt = performance.now();
    const desired = new Map(puts.map(item => [String(item._id), denormalizeRecord(item)]));
    const conflicts = [];
    ids.forEach((id, index) => {
      const current = currentRows[index] ? denormalizeRecord(currentRows[index]) : null;
      const before = Object.hasOwn(expected, id) ? expected[id] : null;
      const wanted = desired.has(id) ? desired.get(id) : null;
      if (canonicalStringify(current) !== canonicalStringify(before) && canonicalStringify(current) !== canonicalStringify(wanted)) conflicts.push(id);
    });
    if (conflicts.length) {
      try { tx.abort(); } catch {}
      const error = new Error(`PERSISTENCE_VERSION_CONFLICT:${conflicts.join(',')}`);
      error.code = 'PERSISTENCE_VERSION_CONFLICT';
      error.conflicts = conflicts;
      throw error;
    }
    const revisionKey = `revision:${cfg.store}`;
    let revision;
    try {
      puts.forEach(record => store.put(record));
      deletes.forEach(id => store.delete(id));
      const previousRevision = await requestToPromise(meta.get(revisionKey));
      revision = Number(previousRevision?.value?.revision || 0) + 1;
      const changedAt = new Date().toISOString();
      meta.put({ key: revisionKey, value: { revision, changedAt, ids, mode: 'record-patch' }, updatedAt: changedAt });
      meta.put({ key: `checksum:${cfg.store}`, value: { status: 'stale_after_verified_patch', revision, changedAt }, updatedAt: changedAt });
      await txDone(tx);
    } catch (error) {
      try { tx.abort(); } catch {}
      throw error;
    }
    const transactionAt = performance.now();
    const compat = patchCompatCollection(key, puts.map(denormalizeRecord), deletes, revision);
    const mirrorAt = performance.now();
    const verified = await loadCollectionRecords(key, ids);
    const verificationConflicts = ids.filter(id => canonicalStringify(verified[id]) !== canonicalStringify(desired.has(id) ? desired.get(id) : null));
    if (verificationConflicts.length) {
      const error = new Error(`PERSISTENCE_WRITE_VERIFICATION_FAILED:${verificationConflicts.join(',')}`);
      error.code = 'PERSISTENCE_WRITE_VERIFICATION_FAILED';
      throw error;
    }
    const target = window.VoltflowStateAccess?.getCollection?.(key);
    const desiredRows = puts.map(denormalizeRecord);
    const desiredById = new Map(desiredRows.map((item, index) => [stableId(item, index, key), item]));
    let stateReflectsPatch = options.stateReflectsPatch === true;
    if (!window.__gordiBootReady && Array.isArray(target) && !stateReflectsPatch) {
      const changed = new Set(ids);
      for (let index = target.length - 1; index >= 0; index--) {
        if (changed.has(stableId(target[index], index, key))) target.splice(index, 1);
      }
      desiredRows.forEach(item => target.push(structuredClone(item)));
      stateReflectsPatch = true;
    }
    if (stateReflectsPatch) {
      appliedCollectionRevisions.set(key, revision);
      // Do not clone/reindex the complete collection after a record patch.
      // The next full write captures an authoritative baseline transactionally.
      appliedCollectionBaselines.delete(key);
    }
    updateManifestAfterWrite(key);
    const finished = performance.now();
    emitPersistenceStatus({ state: 'confirmed', key, label: options.label || key, mode: 'record-patch', revision });
    return {
      ok: true, key, storage: 'indexeddb', mode: 'record-patch', revision,
      puts: puts.length, deletes: deletes.length, compat,
      timings: {
        permissionMs: permissionAt - started,
        readMs: readAt - permissionAt,
        transactionMs: transactionAt - readAt,
        mirrorMs: mirrorAt - transactionAt,
        verificationMs: finished - mirrorAt,
        totalMs: finished - started
      }
    };
  }

  function parseSnapshotCollection(snapshot, key) {
    if (!Object.hasOwn(snapshot || {}, key)) throw new Error(`RESTORE_COLLECTION_MISSING:${key}`);
    const raw = snapshot[key];
    let parsed = raw;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); }
      catch { throw new Error(`RESTORE_COLLECTION_CORRUPT:${key}`); }
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); }
        catch { throw new Error(`RESTORE_COLLECTION_CORRUPT:${key}`); }
      }
    }
    if (!Array.isArray(parsed)) throw new Error(`RESTORE_COLLECTION_INVALID:${key}`);
    return parsed;
  }

  async function replaceCriticalSnapshot(snapshot, options = {}) {
    await awaitWritePermission(options);
    if (!(await isReady())) throw new Error('RESTORE_REQUIRES_INDEXEDDB_AUTHORITY');
    const authority = await resolveDataAuthority();
    if (authority.source !== 'indexeddb' || authority.status !== 'available') {
      throw new Error('RESTORE_AUTHORITY_UNAVAILABLE');
    }
    const prepared = Object.fromEntries(Object.entries(COLLECTIONS).map(([key, cfg]) => [
      key,
      parseSnapshotCollection(snapshot, key).map((item, index) => normalizeRecord(item, index, cfg.store))
    ]));
    const db = await openDB();
    const storeNames = [META_STORE, KV_STORE, ...new Set(Object.values(COLLECTIONS).map(cfg => cfg.store))];
    const tx = db.transaction(storeNames, 'readwrite');
    const done = txDone(tx);
    const meta = tx.objectStore(META_STORE);
    const revisionEntries = Object.entries(COLLECTIONS);
    const revisionRows = await Promise.all(revisionEntries.map(([, cfg]) => requestToPromise(meta.get(`revision:${cfg.store}`))));
    const expected = options.expectedRevisions && typeof options.expectedRevisions === 'object'
      ? options.expectedRevisions
      : null;
    const conflicts = revisionEntries
      .map(([key], index) => ({ key, current: Number(revisionRows[index]?.value?.revision || 0) }))
      .filter(item => expected && Number(expected[item.key] || 0) !== item.current);
    if (conflicts.length) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      const error = new Error(`RESTORE_VERSION_CONFLICT:${conflicts.map(item => item.key).join(',')}`);
      error.code = 'RESTORE_VERSION_CONFLICT';
      error.conflicts = conflicts;
      throw error;
    }
    const changedAt = new Date().toISOString();
    const revisions = {};
    try {
      revisionEntries.forEach(([key, cfg], index) => {
        const store = tx.objectStore(cfg.store);
        store.clear();
        prepared[key].forEach(record => store.put(record));
        const revision = Number(revisionRows[index]?.value?.revision || 0) + 1;
        revisions[key] = revision;
        meta.put({
          key: `revision:${cfg.store}`,
          value: { revision, changedAt, ids: [], mode: 'atomic-snapshot-restore', fullRefresh: true },
          updatedAt: changedAt
        });
        meta.put({ key: `checksum:${cfg.store}`, value: checksumItems(prepared[key]), updatedAt: changedAt });
      });
      KV_KEYS.forEach(key => {
        if (!Object.hasOwn(snapshot, key)) return;
        const raw = typeof snapshot[key] === 'string' ? snapshot[key] : JSON.stringify(snapshot[key]);
        tx.objectStore(KV_STORE).put({ key, value: raw, updatedAt: changedAt });
      });
      meta.put({
        key: 'lastRestore',
        value: { at: changedAt, reason: options.reason || 'snapshot', source: snapshot._voltflow_authority?.source || 'unknown', revisions },
        updatedAt: changedAt
      });
      if (options.failBeforeCommit) throw new Error('RESTORE_INTERRUPTION_SIMULATED');
    } catch (error) {
      try { tx.abort(); } catch {}
      await done.catch(() => {});
      throw error;
    }
    await done;
    for (const [key] of revisionEntries) {
      const restoredItems = prepared[key].map(denormalizeRecord);
      const raw = JSON.stringify(restoredItems);
      appliedCollectionRevisions.set(key, revisions[key]);
      appliedCollectionBaselines.set(key, restoredItems.map(item => structuredClone(item)));
      setCompatLocalStorage(key, raw, options);
      patchCompatCollection(key, [], [], revisions[key], { fullRefresh: true });
    }
    KV_KEYS.forEach(key => {
      if (!Object.hasOwn(snapshot, key)) return;
      setCompatLocalStorage(key, typeof snapshot[key] === 'string' ? snapshot[key] : JSON.stringify(snapshot[key]), options);
    });
    emitPersistenceStatus({ state: 'confirmed', key: '*', label: options.reason || 'restauracion', mode: 'atomic-snapshot-restore', revisions });
    return { ok: true, mode: 'atomic-snapshot-restore', revisions, changedAt };
  }

  async function loadCriticalValue(key, fallback = null) {
    if (!(await isReady())) return fallback;
    if (COLLECTIONS[key]) return getAll(COLLECTIONS[key].store);
    if (KV_KEYS.has(key) || key.startsWith('gordi_scrape_memory_') || key.startsWith('gordi_ecache_')) {
      return safeParse(await getKV(key, null), fallback);
    }
    return fallback;
  }

  async function exportRawDatabase() {
    await waitForIdle();
    const db = await openDB();
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, 'readonly');
    const stores = {};
    await Promise.all(storeNames.map(async storeName => {
      const store = tx.objectStore(storeName);
      stores[storeName] = {
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        records: await requestToPromise(store.getAll())
      };
    }));
    await txDone(tx);
    return {
      database: DB_NAME,
      version: db.version,
      exportedAt: new Date().toISOString(),
      stores
    };
  }

  async function replaceRawDatabase(raw, options = {}) {
    await awaitWritePermission(options);
    if (!raw || raw.database !== DB_NAME || !raw.stores || typeof raw.stores !== 'object') {
      throw new Error('Backup IndexedDB incompatible');
    }
    const db = await openDB();
    const available = new Set(Array.from(db.objectStoreNames));
    const requested = Object.keys(raw.stores);
    const missing = requested.filter(name => !available.has(name));
    if (missing.length) throw new Error(`Stores IndexedDB no disponibles: ${missing.join(', ')}`);

    const tx = db.transaction(requested, 'readwrite');
    requested.forEach(storeName => {
      const store = tx.objectStore(storeName);
      store.clear();
      const records = Array.isArray(raw.stores[storeName].records) ? raw.stores[storeName].records : [];
      records.forEach(record => store.put(record));
    });
    if (options.failAfterWrites) {
      tx.abort();
      throw new Error('Interrupción de restauración simulada');
    }
    await txDone(tx);
    readyCache = null;
    return exportRawDatabase();
  }

  async function rebuildReadyMarker(options = {}) {
    const manifest = await getMeta('manifest');
    const migration = await getMeta('migration');
    const ready = !!(manifest && manifest.status === 'complete' && manifest.version === DB_VERSION &&
      (!migration || migration.status === 'complete'));
    readyCache = ready;
    setCoordinatedLocal('gordi_indexeddb_ready', ready ? 'true' : 'false', options);
    if (ready) {
      setCoordinatedLocal('_voltflow_idb_manifest', JSON.stringify({
        version: DB_VERSION,
        migratedAt: manifest.migratedAt || null,
        counts: Object.fromEntries(Object.entries(manifest.expected || {}).map(([key, value]) => [key, value.count || 0]))
      }), options);
    } else {
      removeCoordinatedLocal('_voltflow_idb_manifest', options);
    }
    return ready;
  }

  async function recoverInterruptedMigration() {
    const migration = await getMeta('migration');
    const manifest = await getMeta('manifest');
    const resumable = !!(migration && ['written', 'verifying'].includes(migration.status) &&
      manifest?.status === 'pending-verification' && Number(manifest.version) === DB_VERSION);
    if (isReadySync() && (!manifest || manifest.status !== 'complete' || manifest.version !== DB_VERSION) && !resumable) {
      readyCache = false;
      localStorage.setItem('gordi_indexeddb_ready', 'false');
      return { recovered: false, reason: 'manifest_incomplete', migration, manifest };
    }
    if (resumable) {
      const expected = manifest.expected || migration.expected;
      if (!expected || typeof expected !== 'object') {
        readyCache = null;
        return { recovered: false, reason: 'migration_expected_missing', migration, manifest };
      }
      const verification = await verifyMigration(expected);
      if (!verification.ok) {
        readyCache = null;
        return { recovered: false, reason: 'migration_verification_failed', migration, manifest, verification };
      }
      const finishedAt = new Date().toISOString();
      const db = await openDB();
      const tx = db.transaction(META_STORE, 'readwrite');
      const meta = tx.objectStore(META_STORE);
      const completedManifest = { ...manifest, status: 'complete', verifiedAt: finishedAt, verification };
      meta.put({ key: 'manifest', value: completedManifest, updatedAt: finishedAt });
      meta.put({ key: 'migration', value: { ...migration, status: 'complete', finishedAt, verification }, updatedAt: finishedAt });
      await txDone(tx);
      readyCache = true;
      localStorage.setItem('gordi_indexeddb_ready', 'true');
      localStorage.setItem('_voltflow_idb_manifest', JSON.stringify({
        version: DB_VERSION,
        migratedAt: completedManifest.migratedAt || finishedAt,
        counts: Object.fromEntries(Object.entries(expected).map(([key, value]) => [key, value.count || 0]))
      }));
      return { recovered: true, reason: 'migration_verified_and_completed', migration: { ...migration, status: 'complete' }, manifest: completedManifest };
    }
    if (migration && migration.status && migration.status !== 'complete') {
      readyCache = null;
      return { recovered: false, reason: 'migration_incomplete_ambiguous', migration, manifest };
    }
    return { recovered: true };
  }

  async function loadConflictDrafts() {
    if (!(await isReady())) return [];
    const raw = await getKV('gordi_conflict_drafts', '{}');
    const parsed = safeParse(raw, {});
    return Object.values(parsed && typeof parsed === 'object' ? parsed : {}).filter(Boolean);
  }

  async function persistConflictDraft(draft) {
    if (!draft?.id) throw new Error('CONFLICT_DRAFT_ID_REQUIRED');
    await awaitWritePermission({});
    const db = await openDB();
    const tx = db.transaction(KV_STORE, 'readwrite');
    const store = tx.objectStore(KV_STORE);
    const row = await requestToPromise(store.get('gordi_conflict_drafts'));
    const current = safeParse(row?.value, {});
    const draftId = String(draft.draftId || `lead:${draft.id}`);
    const previous = current?.[draftId] || null;
    const differsFromAuthority = canonicalStringify(draft.value ?? null) !== canonicalStringify(draft.authoritative ?? null);
    const automaticEmptyRefresh = draft.status === 'cross-tab-edit-pending-review' && draft.value == null;
    const identity = value => canonicalStringify({
      companyId: value?.commercialRefs?.companyId || null,
      establishmentId: value?.commercialRefs?.establishmentId || null,
      contactId: value?.commercialRefs?.contactId || null
    });
    const previousHasIdentityConflict = !!previous && identity(previous.value) !== identity(previous.authoritative);
    const incomingHasIdentityConflict = identity(draft.value) !== identity(draft.authoritative);
    const version = { ...draft, draftId, updatedAt: new Date().toISOString() };
    const versions = [...(Array.isArray(previous?.versions) ? previous.versions : previous ? [{
      value: previous.value, authoritative: previous.authoritative, status: previous.status,
      createdAt: previous.createdAt, updatedAt: previous.updatedAt
    }] : []), version].slice(-12);
    const selected = previous && (!differsFromAuthority || automaticEmptyRefresh || (previousHasIdentityConflict && !incomingHasIdentityConflict))
      ? { ...previous, versions, updatedAt: version.updatedAt }
      : { ...version, versions };
    const next = { ...(current && typeof current === 'object' ? current : {}), [draftId]: selected };
    store.put({ key: 'gordi_conflict_drafts', value: JSON.stringify(next), updatedAt: new Date().toISOString() });
    await txDone(tx);
    const verified = safeParse(await getKV('gordi_conflict_drafts', '{}'), {});
    if (!verified[draftId]) throw new Error('CONFLICT_DRAFT_PERSISTENCE_NOT_CONFIRMED');
    return verified[draftId];
  }

  async function deleteConflictDraft(id) {
    if (!id || !(await isReady())) return false;
    const db = await openDB();
    const tx = db.transaction(KV_STORE, 'readwrite');
    const store = tx.objectStore(KV_STORE);
    const row = await requestToPromise(store.get('gordi_conflict_drafts'));
    const current = safeParse(row?.value, {});
    let changed = false;
    for (const key of Object.keys(current || {})) {
      if (key === String(id) || key === `lead:${id}` || String(current[key]?.id) === String(id)) {
        delete current[key]; changed = true;
      }
    }
    if (changed) store.put({ key: 'gordi_conflict_drafts', value: JSON.stringify(current), updatedAt: new Date().toISOString() });
    await txDone(tx);
    return changed;
  }

  async function hydrateConflictDrafts() {
    if (window.__voltflowConflictDraftHydration) return window.__voltflowConflictDraftHydration;
    window.__voltflowConflictDraftHydration = (async () => {
      const rows = await loadConflictDrafts();
      const map = window.__voltflowRejectedLeadDrafts ||= new Map();
      rows.forEach(draft => map.set(String(draft.id), draft));
      return rows;
    })().catch(error => {
      window.__voltflowConflictDraftHydration = null;
      throw error;
    });
    return window.__voltflowConflictDraftHydration;
  }

  async function storeRecoverySnapshot(item) {
    if (!item?.id || !item?.snapshot || !item?.integrity?.sha256) throw new Error('RECOVERY_SNAPSHOT_INVALID');
    const authority = await resolveDataAuthority();
    if (authority.source !== 'indexeddb' || authority.status !== 'available') throw new Error('RECOVERY_SNAPSHOT_REQUIRES_INDEXEDDB_AUTHORITY');
    const key = `${RECOVERY_SNAPSHOT_PREFIX}${item.id}`;
    const db = await openDB();
    const tx = db.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).put({ key, value: item, updatedAt: new Date().toISOString() });
    await txDone(tx);
    const verified = await getKV(key, null);
    if (!verified?.snapshot || verified.integrity?.sha256 !== item.integrity.sha256) throw new Error('RECOVERY_SNAPSHOT_PERSISTENCE_NOT_CONFIRMED');
    return { id: item.id, key, integrity: verified.integrity, summary: verified.summary, authority: verified.authority };
  }

  async function loadRecoverySnapshot(id) {
    if (!id) return null;
    return getKV(`${RECOVERY_SNAPSHOT_PREFIX}${id}`, null);
  }

  async function deleteRecoverySnapshot(id) {
    if (!id) return false;
    const db = await openDB();
    const tx = db.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).delete(`${RECOVERY_SNAPSHOT_PREFIX}${id}`);
    await txDone(tx);
    return true;
  }

  function installCollectionRevisionListener() {
    if (window.__voltflowCollectionRevisionListener) return;
    window.__voltflowCollectionRevisionListener = true;
    let reconcilePromise = Promise.resolve();
    const stateCollection = key => window.VoltflowStateAccess?.getCollection?.(key) || null;
    const markerFor = key => {
      try { return safeParse(localStorage.getItem(`_voltflow_collection_revision:${key}`), null); }
      catch { return null; }
    };
    async function reconcileCollection(key, marker = null, trigger = 'storage') {
      const cfg = COLLECTIONS[key];
      const target = stateCollection(key);
      if (!cfg || !Array.isArray(target)) return { skipped: 'state-not-ready' };
      const revision = await readCollectionRevision(key);
      const lastApplied = Number(appliedCollectionRevisions.get(key) || 0);
      if (!revision || revision <= lastApplied) return { skipped: 'already-current', revision };
      const markerRevision = Number(marker?.revision || 0);
      let ids;
      let current;
      if (markerRevision === revision && marker?.fullRefresh !== true) {
        ids = [...new Set([...(marker.puts || []), ...(marker.deletes || [])].map(String))];
        current = await loadCollectionRecords(key, ids);
      } else {
        const authoritativeRows = await getAll(cfg.store);
        const authoritativeIds = authoritativeRows.map((row, index) => stableId(row, index, key));
        const localIds = target.map((row, index) => stableId(row, index, key));
        ids = [...new Set([...authoritativeIds, ...localIds].map(String))];
        const byId = new Map(authoritativeRows.map((row, index) => [stableId(row, index, key), row]));
        current = Object.fromEntries(ids.map(id => [id, byId.get(id) || null]));
      }
      if (revision <= Number(appliedCollectionRevisions.get(key) || 0)) return { skipped: 'superseded', revision };
      const effectiveMarker = { ...(marker || {}), revision, trigger, fullRefresh: markerRevision !== revision };
      if (key === 'gordi_leads' && typeof window.reconcileAuthoritativeLeadRefresh === 'function') {
        await window.reconcileAuthoritativeLeadRefresh(current, ids, effectiveMarker);
      } else {
        const changed = new Set(ids);
        for (let index = target.length - 1; index >= 0; index--) {
          if (changed.has(stableId(target[index], index, key))) target.splice(index, 1);
        }
        ids.forEach(id => { if (current[id]) target.push(structuredClone(current[id])); });
      }
      appliedCollectionRevisions.set(key, revision);
      appliedCollectionBaselines.set(key, target.map(item => structuredClone(item)));
      window.dispatchEvent(new CustomEvent('voltflow:authoritative-refresh', { detail: { key, ids, revision, trigger } }));
      return { ok: true, key, ids, revision, trigger };
    }
    function queueReconcile(task) {
      reconcilePromise = reconcilePromise.catch(() => {}).then(task);
      return reconcilePromise;
    }
    async function reconcileAll(trigger = 'lifecycle') {
      for (const key of Object.keys(COLLECTIONS)) {
        if (!Array.isArray(stateCollection(key))) continue;
        await reconcileCollection(key, markerFor(key), trigger);
      }
    }
    window.addEventListener('storage', event => {
      const prefix = '_voltflow_collection_revision:';
      if (!event.key?.startsWith(prefix) || !event.newValue) return;
      const key = event.key.slice(prefix.length);
      if (!COLLECTIONS[key]) return;
      const marker = safeParse(event.newValue, null);
      queueReconcile(() => reconcileCollection(key, marker, 'storage')).catch(error => {
        emitPersistenceStatus({ state: 'refresh-failed', key, message: String(error?.message || error) });
      });
    });
    const lifecycleReconcile = trigger => {
      queueReconcile(() => reconcileAll(trigger)).catch(error => {
        emitPersistenceStatus({ state: 'refresh-failed', key: '*', message: String(error?.message || error) });
      });
    };
    window.addEventListener('focus', () => lifecycleReconcile('focus'));
    window.addEventListener('pageshow', () => lifecycleReconcile('pageshow'));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lifecycleReconcile('visible'); });
    window.VoltflowCollectionSync = Object.freeze({
      reconcileAll: trigger => queueReconcile(() => reconcileAll(trigger || 'manual')),
      reconcileCollection: (key, marker, trigger) => queueReconcile(() => reconcileCollection(key, marker, trigger || 'manual')),
      markCurrent: async revisions => {
        for (const key of Object.keys(COLLECTIONS)) {
          const revision = revisions && Object.hasOwn(revisions, key)
            ? Number(revisions[key] || 0)
            : await readCollectionRevision(key);
          appliedCollectionRevisions.set(key, revision);
          const target = stateCollection(key);
          if (Array.isArray(target)) appliedCollectionBaselines.set(key, target.map(item => structuredClone(item)));
        }
      },
      revisions: () => Object.fromEntries(appliedCollectionRevisions),
      baselines: () => Object.fromEntries([...appliedCollectionBaselines].map(([key, value]) => [key, structuredClone(value)]))
    });
  }

  installLocalStorageMirror();
  installCollectionRevisionListener();
  if (isReadySync()) hydrateConflictDrafts().catch(() => {});

  window.VoltflowStorage = {
    DB_NAME,
    DB_VERSION,
    openDB,
    isReady,
    isReadySync,
    resolveDataAuthority,
    hasIndexedDbAuthorityEvidence,
    loadAll,
    loadCriticalValue,
    migrateFromLocalStorage,
    verifyMigration,
    saveCollection,
    saveCollectionIncremental,
    loadCollectionRecords,
    persistCollectionPatch,
    replaceCriticalSnapshot,
    persistCriticalData,
    waitForIdle,
    getPersistenceStatus,
    saveLocalStorageKey,
    readConsistentSnapshotState,
    readSnapshotAuthority,
    readCollectionRevision,
    captureCollectionContext,
    exportSnapshot,
    exportRawDatabase,
    replaceRawDatabase,
    rebuildReadyMarker,
    recoverInterruptedMigration,
    loadConflictDrafts,
    persistConflictDraft,
    deleteConflictDraft,
    hydrateConflictDrafts,
    storeRecoverySnapshot,
    loadRecoverySnapshot,
    deleteRecoverySnapshot,
    installLocalStorageMirror,
    _checksumItems: checksumItems
  };
})();
