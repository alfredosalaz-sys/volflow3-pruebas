(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowHistoricalImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const CONTRACT_VERSION = 1;
  const ARRAY_KEYS = new Set([
    'gordi_leads', 'gordi_email_history', 'gordi_campaigns',
    'gordi_search_history', 'gordi_saved_searches',
    'gordi_commercial_exclusions', 'gordi_do_not_contact',
    'gordi_commercial_events', 'gordi_commercial_sequences'
  ]);
  const OBJECT_KEYS = new Set(['gordi_objectives', 'gordi_templates', 'gordi_commercial_memory']);
  const QUARANTINE_KEY = 'gordi_historical_indexeddb_quarantine';
  const COLLECTION_STORES = Object.freeze({
    gordi_leads: 'leads',
    gordi_email_history: 'emailHistory',
    gordi_campaigns: 'campaigns',
    gordi_search_history: 'searchHistory',
    gordi_saved_searches: 'savedSearches'
  });
  const VOLATILE_STATE_KEYS = new Set([
    'gordi_last_external_backup_created', 'gordi_last_external_backup_verified',
    'gordi_last_verified_restore', 'gordi_last_historical_import_report',
    'gordi_last_seen_build', 'gordi_last_build_change_check',
    '_voltflow_restore_transaction', '_voltflow_idb_manifest'
  ]);
  const SECRET_RE = /(^|[_-])(api[_-]?key|secret|token|password|passwd|authorization)([_-]|$)|^gordi_pin$/i;
  const PERMISSION_RE = /(enabled|approved|authorized|authorization|billing|paid|provider_permission|session_approval)/i;
  const EXCLUSION_RE = /(do_not_contact|opposition|exclusion)/i;

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function fingerprint(value) {
    const text = typeof value === 'string' ? value : stable(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function normalize(value) {
    return String(value == null ? '' : value).trim().toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  }

  function parseStored(value, fallback) {
    if (value == null || value === '') return clone(fallback);
    if (typeof value !== 'string') return clone(value);
    try { return JSON.parse(value); } catch { return clone(fallback); }
  }

  function parseKnown(value, key, expected) {
    if (value === undefined || value === null || value === '') return expected === 'array' ? [] : {};
    let parsed = value;
    if (typeof value === 'string') {
      try { parsed = JSON.parse(value); } catch (error) {
        throw new Error(`HISTORICAL_COLLECTION_CORRUPT:${key}:${error.message}`);
      }
    }
    if (expected === 'array' && !Array.isArray(parsed)) throw new Error(`HISTORICAL_COLLECTION_TYPE_INVALID:${key}:array`);
    if (expected === 'object' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
      throw new Error(`HISTORICAL_COLLECTION_TYPE_INVALID:${key}:object`);
    }
    return clone(parsed);
  }

  function validateStorageCollections(storage) {
    Object.entries(storage || {}).forEach(([key, value]) => {
      if (ARRAY_KEYS.has(key) || key === 'gordi_leads' || EXCLUSION_RE.test(key)) parseKnown(value, key, 'array');
      else if (OBJECT_KEYS.has(key)) parseKnown(value, key, 'object');
    });
    return true;
  }

  function validateRawDatabase(raw) {
    if (raw == null) return true;
    if (!raw || typeof raw !== 'object' || !raw.stores || typeof raw.stores !== 'object') {
      throw new Error('HISTORICAL_INDEXEDDB_CORRUPT:missing_stores');
    }
    Object.entries(raw.stores).forEach(([name, store]) => {
      if (!store || typeof store !== 'object' || !Array.isArray(store.records)) {
        throw new Error(`HISTORICAL_INDEXEDDB_STORE_CORRUPT:${name}`);
      }
    });
    return true;
  }

  function collectionRecords(raw, storeName) {
    const records = raw && raw.stores && raw.stores[storeName] && raw.stores[storeName].records;
    if (!Array.isArray(records)) return null;
    return records.map(record => {
      const item = clone(record);
      if (item && item._id != null) {
        if (item.id == null) item.id = item._id;
        delete item._id;
      }
      return item;
    });
  }

  function materializePayloadStorage(payload) {
    const storage = clone(payload?.data?.localStorage || {});
    const raw = payload?.data?.indexedDB || null;
    validateRawDatabase(raw);
    const kvRows = raw?.stores?.kv?.records;
    if (Array.isArray(kvRows)) kvRows.forEach(row => {
      if (row && typeof row.key === 'string' && row.value !== undefined) storage[row.key] = String(row.value);
    });
    const idbReady = storage.gordi_indexeddb_ready === 'true';
    Object.entries(COLLECTION_STORES).forEach(([key, storeName]) => {
      const records = collectionRecords(raw, storeName);
      if (records && (records.length > 0 || storage[key] === undefined || idbReady)) storage[key] = JSON.stringify(records);
    });
    validateStorageCollections(storage);
    if (payload?.data?.incorporatedFiles != null && !Array.isArray(payload.data.incorporatedFiles)) {
      throw new Error('HISTORICAL_INCORPORATED_FILES_CORRUPT');
    }
    if (payload?.data?.referencedFiles != null && !Array.isArray(payload.data.referencedFiles)) {
      throw new Error('HISTORICAL_REFERENCED_FILES_CORRUPT');
    }
    return storage;
  }

  function isSecretKey(key, secure) {
    if (secure && typeof secure.classifyKey === 'function') return secure.classifyKey(key) === 'secret';
    return SECRET_RE.test(String(key));
  }

  function detectFormat(value, secure) {
    if (secure && typeof secure.detectLegacyFormat === 'function') {
      const detected = secure.detectLegacyFormat(value);
      if (detected !== 'unknown') return detected;
    }
    if (value && value.voltflow && typeof value.voltflow === 'object') return 'github_snapshot_file';
    if (value && value.record && value.record.voltflow && typeof value.record.voltflow === 'object') return 'jsonbin_snapshot_file';
    if (value && value.format === 'voltflow-secure-backup') return 'secure_v1';
    if (value && value.backupType === 'auto_disk_daily' && value.portableSnapshot) return 'auto_disk_daily';
    if (value && value.type === 'voltflow-portable') return 'portable';
    if (value && value.portableSnapshot) return 'full_backup_2_9_4';
    if (value && value.snapshot && typeof value.snapshot === 'object') return 'safety_snapshot';
    if (value && (Array.isArray(value.leads) || value.gordi_leads !== undefined)) return 'legacy_full';
    return 'unknown';
  }

  function legacySnapshot(value, format, secure) {
    let snapshot;
    if (format === 'github_snapshot_file') snapshot = value.voltflow;
    else if (format === 'jsonbin_snapshot_file') snapshot = value.record.voltflow;
    else if (format === 'legacy_full' && value.gordi_leads === undefined) snapshot = {
      gordi_leads: JSON.stringify(value.leads || []),
      gordi_email_history: JSON.stringify(value.emailHistory || []),
      gordi_campaigns: JSON.stringify(value.campaigns || []),
      gordi_search_history: JSON.stringify(value.searchHistory || []),
      gordi_saved_searches: JSON.stringify(value.savedSearches || []),
      gordi_objectives: JSON.stringify(value.objectives || {}),
      gordi_templates: JSON.stringify(value.templates || {}),
      gordi_commercial_memory: JSON.stringify(value.commercialMemory || {})
    };
    else if (secure && typeof secure.legacyToSnapshot === 'function') snapshot = secure.legacyToSnapshot(value);
    else if (format === 'auto_disk_daily' || format === 'full_backup_2_9_4') snapshot = value.portableSnapshot;
    else if (format === 'portable') snapshot = value.snapshot || value.data || value.portableSnapshot || {};
    else if (format === 'safety_snapshot') snapshot = value.snapshot;
    else if (format === 'legacy_full') snapshot = value.gordi_leads !== undefined ? value : {
      gordi_leads: JSON.stringify(value.leads || []),
      gordi_email_history: JSON.stringify(value.emailHistory || []),
      gordi_campaigns: JSON.stringify(value.campaigns || []),
      gordi_search_history: JSON.stringify(value.searchHistory || []),
      gordi_objectives: JSON.stringify(value.objectives || {}),
      gordi_templates: JSON.stringify(value.templates || {})
    };
    else throw new Error('HISTORICAL_FORMAT_UNSUPPORTED');
    const out = {};
    Object.entries(snapshot || {}).forEach(([key, item]) => {
      if (!key.startsWith('_') && (key.startsWith('gordi_') || key.startsWith('voltium_'))) {
        out[key] = typeof item === 'string' ? item : JSON.stringify(item);
      }
    });
    const knownTop = new Set(['version', 'date', 'createdAt', 'appVersion', 'build', 'backupType', 'type', 'portableSnapshot', 'snapshot', 'data', 'voltflow', 'record', 'leads', 'emailHistory', 'campaigns', 'searchHistory', 'objectives', 'templates']);
    const unknown = Object.fromEntries(Object.entries(value || {}).filter(([key]) => !knownTop.has(key) && !key.startsWith('gordi_') && !key.startsWith('_')));
    if (Object.keys(unknown).length) {
      out.gordi_historical_unknown_payloads = JSON.stringify([{ sourceFormat: format, sourceFingerprint: fingerprint(value), fields: unknown }]);
    }
    return out;
  }

  async function decodeSource(value, password, secure) {
    const format = detectFormat(value, secure);
    if (format === 'unknown') throw new Error('HISTORICAL_FORMAT_UNSUPPORTED');
    if (format === 'secure_v1') {
      if (!secure || typeof secure.decryptContainer !== 'function') throw new Error('SECURE_BACKUP_MODULE_REQUIRED');
      const payload = await secure.decryptContainer(value, password || '');
      return { format, version: payload.app && payload.app.version, build: payload.app && payload.app.build, localStorage: materializePayloadStorage(payload), payload };
    }
    const localStorage = legacySnapshot(value, format, secure);
    validateStorageCollections(localStorage);
    return {
      format,
      version: value._voltflow_version || value.appVersion || value.version || 'unknown',
      build: value.build || 'unknown',
      localStorage,
      sourceFingerprint: fingerprint(value),
      plaintextSecrets: Object.keys(localStorage).filter(key => isSecretKey(key, secure))
    };
  }

  function leadIdentity(lead) {
    const refs = lead && lead.commercialRefs && typeof lead.commercialRefs === 'object' ? lead.commercialRefs : {};
    const company = refs.companyIdentityAnchor || refs.companyId || lead.companyId || lead.legalEntityId;
    const establishment = refs.establishmentIdentityAnchor || refs.establishmentId || lead.establishmentId || lead.branchId;
    if (company && establishment) return `ce:${normalize(company)}|${normalize(establishment)}`;
    const provider = lead && (lead.provider || lead.source || (lead.discovery && lead.discovery.provider));
    const sourceId = lead && (lead.sourceId || lead.placeId || (lead.discovery && (lead.discovery.sourceId || lead.discovery.id)));
    if (provider && sourceId) return `src:${normalize(provider)}|${normalize(sourceId)}`;
    return null;
  }

  function materialLeadConflict(a, b) {
    const ai = leadIdentity(a);
    const bi = leadIdentity(b);
    if (ai && bi) return ai !== bi;
    const fields = ['company', 'name', 'address', 'postalCode', 'city'];
    const compared = fields.filter(key => a && b && a[key] && b[key]);
    return compared.length >= 2 && compared.filter(key => normalize(a[key]) !== normalize(b[key])).length >= 2;
  }

  function mergeObjects(current, incoming, conflicts, path) {
    if (current === undefined || current === null || current === '') return clone(incoming);
    if (incoming === undefined || incoming === null || incoming === '') return clone(current);
    if (stable(current) === stable(incoming)) return clone(current);
    if (Array.isArray(current) && Array.isArray(incoming)) {
      const result = current.map(clone);
      const seen = new Set(result.map(item => fingerprint(item)));
      incoming.forEach(item => {
        const itemId = item && typeof item === 'object' && (item.id || item.contactId || item.eventId || item._id);
        const existing = itemId && result.find(candidate => candidate && String(candidate.id || candidate.contactId || candidate.eventId || candidate._id) === String(itemId));
        if (existing) {
          const merged = mergeObjects(existing, item, conflicts, `${path}[${itemId}]`);
          Object.keys(existing).forEach(key => delete existing[key]);
          Object.assign(existing, merged);
        } else if (!seen.has(fingerprint(item))) {
          result.push(clone(item));
          seen.add(fingerprint(item));
        }
      });
      return result;
    }
    if (typeof current === 'object' && typeof incoming === 'object') {
      const out = clone(current);
      Object.keys(incoming).forEach(key => { out[key] = mergeObjects(current[key], incoming[key], conflicts, `${path}.${key}`); });
      return out;
    }
    conflicts.push({ path, currentFingerprint: fingerprint(current), importedFingerprint: fingerprint(incoming), resolution: 'keep_current' });
    return clone(current);
  }

  function mergeLeads(current, incoming, conflicts) {
    const out = current.map(clone);
    const idMap = {};
    incoming.forEach((raw, index) => {
      const item = clone(raw);
      const oldId = item.id != null ? String(item.id) : '';
      const identity = leadIdentity(item);
      const derivedId = oldId || `historical-${fingerprint(['complete-record', item])}`;
      if (!item.id) {
        item.id = derivedId;
        item.historicalIdentity = Object.assign({}, item.historicalIdentity, {
          derivedFromCompleteRecord: true,
          sourceFingerprint: fingerprint(raw)
        });
      }
      let targetIndex = identity ? out.findIndex(candidate => leadIdentity(candidate) === identity) : -1;
      if (targetIndex < 0) targetIndex = out.findIndex(candidate => String(candidate.id) === derivedId);
      if (targetIndex >= 0 && materialLeadConflict(out[targetIndex], item)) {
        const newId = `${oldId || 'historical-lead'}~import-${fingerprint([identity, item, index])}`;
        item.id = newId;
        item.historicalIdentity = { importedId: oldId || null, sourceFingerprint: fingerprint(raw), collisionPreserved: true };
        out.push(item);
        if (oldId) idMap[oldId] = newId;
        conflicts.push({ path: `gordi_leads[${oldId || index}]`, resolution: 'preserve_as_distinct', importedId: newId });
        return;
      }
      if (targetIndex >= 0) {
        out[targetIndex] = mergeObjects(out[targetIndex], item, conflicts, `gordi_leads[${oldId || index}]`);
        if (oldId) idMap[oldId] = String(out[targetIndex].id || oldId);
        return;
      }
      out.push(item);
      if (oldId) idMap[oldId] = String(item.id);
    });
    return { items: out, idMap };
  }

  function confirmation(record) {
    return record && (record.sendConfirmation || record.confirmation);
  }

  function validConfirmed(record, commercial) {
    if (commercial && typeof commercial.isSentConfirmed === 'function') return commercial.isSentConfirmed(record);
    const c = confirmation(record);
    const method = c && (c.method || c.type);
    const id = c && (c.confirmationId || c.evidenceId || c.providerMessageId);
    return (record && (record.commercialState === 'SENT_CONFIRMED' || record.status === 'SENT_CONFIRMED' || record.state === 'SENT_CONFIRMED')) && !!method && !!id && !!c.confirmedAt;
  }

  function evidenceKey(record, commercial) {
    const c = confirmation(record) || {};
    if (commercial && typeof commercial.confirmationEvidenceKey === 'function') return commercial.confirmationEvidenceKey(c);
    const method = c.method || c.type;
    const id = c.confirmationId || c.evidenceId || c.providerMessageId;
    return method && id ? `${method}:${id}` : null;
  }

  function sequenceKey(record, commercial) {
    if (commercial && typeof commercial.sequenceKeyForRecord === 'function') return commercial.sequenceKeyForRecord(record);
    return record.sequenceCanonicalKey || record.sequenceKey || record.sequenceId || null;
  }

  function quarantineConfirmation(item, reason) {
    item.legacyOriginalStatus = item.commercialState || item.status || item.state || null;
    item.commercialState = 'LEGACY_SENT_UNVERIFIED';
    item.status = 'LEGACY_SENT_UNVERIFIED';
    if ('state' in item) item.state = 'LEGACY_SENT_UNVERIFIED';
    item.historicalImport = Object.assign({}, item.historicalImport, { countedAsSent: false, reason });
  }

  function mergeCommunications(current, incoming, idMap, conflicts, commercial) {
    const out = current.map(clone);
    const byId = new Map(out.filter(item => item && item.id != null).map((item, index) => [String(item.id), index]));
    const evidence = new Set(out.filter(item => validConfirmed(item, commercial)).map(item => evidenceKey(item, commercial)).filter(Boolean));
    const sequenceCounts = new Map();
    out.filter(item => validConfirmed(item, commercial)).forEach(item => {
      const key = sequenceKey(item, commercial);
      if (key) sequenceCounts.set(key, (sequenceCounts.get(key) || 0) + 1);
    });
    incoming.forEach((raw, index) => {
      const item = clone(raw);
      if (item.leadId != null && idMap[String(item.leadId)]) item.leadId = idMap[String(item.leadId)];
      const importedFingerprint = fingerprint(item);
      const id = item.id != null ? String(item.id) : `historical-message-${fingerprint(item)}`;
      item.id = id;
      const existingIndex = byId.get(id);
      if (existingIndex !== undefined) {
        if (stable(out[existingIndex]) === stable(item)) return;
        if (out[existingIndex].historicalImport?.sourceFingerprint === importedFingerprint) return;
        const branchedId = `${id}~import-${fingerprint(item)}`;
        if (byId.has(branchedId)) return;
        item.id = branchedId;
        conflicts.push({ path: `gordi_email_history[${id}]`, resolution: 'preserve_event_variant', importedId: branchedId });
      }
      item.historicalImport = Object.assign({}, item.historicalImport, { sourceFingerprint: importedFingerprint });
      if ((item.commercialState === 'SENT_CONFIRMED' || item.status === 'SENT_CONFIRMED' || item.state === 'SENT_CONFIRMED') && !validConfirmed(item, commercial)) {
        quarantineConfirmation(item, 'incomplete_historical_confirmation');
      } else if (validConfirmed(item, commercial)) {
        const ev = evidenceKey(item, commercial);
        const seq = sequenceKey(item, commercial);
        if (!ev || evidence.has(ev)) quarantineConfirmation(item, ev ? 'duplicate_confirmation_evidence' : 'missing_confirmation_evidence');
        else if (seq && (sequenceCounts.get(seq) || 0) >= 5) quarantineConfirmation(item, 'sequence_limit_reached');
        else {
          evidence.add(ev);
          if (seq) sequenceCounts.set(seq, (sequenceCounts.get(seq) || 0) + 1);
        }
      }
      out.push(item);
      byId.set(String(item.id), out.length - 1);
    });
    return out;
  }

  function mergeGenericArray(current, incoming, key, conflicts) {
    const out = current.map(clone);
    const byId = new Map();
    out.forEach((item, index) => {
      const id = item && (item.id || item._id || item.key || item.campaignId || item.searchId);
      if (id != null) byId.set(String(id), index);
    });
    incoming.forEach(item => {
      const id = item && (item.id || item._id || item.key || item.campaignId || item.searchId);
      if (id != null && byId.has(String(id))) {
        const at = byId.get(String(id));
        out[at] = mergeObjects(out[at], item, conflicts, `${key}[${id}]`);
      } else if (!out.some(existing => stable(existing) === stable(item))) {
        out.push(clone(item));
        if (id != null) byId.set(String(id), out.length - 1);
      }
    });
    return out;
  }

  function mergeSnapshots(currentStorage, incomingStorage, options) {
    const secure = options && options.secure;
    const commercial = options && options.commercial;
    const resolutions = (options && options.secretResolutions) || {};
    const merged = clone(currentStorage || {});
    const conflicts = [];
    const secretConflicts = [];
    const blockedPermissions = [];
    validateStorageCollections(merged);
    validateStorageCollections(incomingStorage);
    const currentLeads = parseKnown(merged.gordi_leads, 'gordi_leads', 'array');
    const incomingLeads = parseKnown(incomingStorage.gordi_leads, 'gordi_leads', 'array');
    const leadResult = mergeLeads(Array.isArray(currentLeads) ? currentLeads : [], Array.isArray(incomingLeads) ? incomingLeads : [], conflicts);
    if (incomingStorage.gordi_leads !== undefined) merged.gordi_leads = JSON.stringify(leadResult.items);

    Object.entries(incomingStorage || {}).forEach(([key, raw]) => {
      if (key === 'gordi_leads') return;
      if (PERMISSION_RE.test(key) && !isSecretKey(key, secure)) {
        if (merged[key] === undefined) merged[key] = /^(false|0|disabled)?$/i.test(String(raw)) ? String(raw) : 'false';
        if (String(raw) !== String(merged[key])) blockedPermissions.push(key);
        return;
      }
      if (isSecretKey(key, secure)) {
        if (merged[key] === undefined) merged[key] = String(raw);
        else if (String(merged[key]) !== String(raw)) {
          const choice = resolutions[key];
          if (choice === 'use_imported') merged[key] = String(raw);
          else secretConflicts.push({ key, current: 'configured', imported: 'configured', resolution: choice || 'requires_explicit_choice' });
        }
        return;
      }
      if (key === 'gordi_email_history') {
        const current = parseKnown(merged[key], key, 'array');
        const incoming = parseKnown(raw, key, 'array');
        merged[key] = JSON.stringify(mergeCommunications(Array.isArray(current) ? current : [], Array.isArray(incoming) ? incoming : [], leadResult.idMap, conflicts, commercial));
        return;
      }
      if (ARRAY_KEYS.has(key) || EXCLUSION_RE.test(key)) {
        const current = parseKnown(merged[key], key, 'array');
        const incoming = parseKnown(raw, key, 'array');
        if (Array.isArray(current) && Array.isArray(incoming)) merged[key] = JSON.stringify(mergeGenericArray(current, incoming, key, conflicts));
        else if (merged[key] === undefined) merged[key] = String(raw);
        return;
      }
      if (merged[key] === undefined) merged[key] = String(raw);
      else if (String(merged[key]) !== String(raw)) {
        const currentParsed = parseStored(merged[key], null);
        const incomingParsed = parseStored(raw, null);
        if (currentParsed && incomingParsed && typeof currentParsed === 'object' && typeof incomingParsed === 'object') {
          merged[key] = JSON.stringify(mergeObjects(currentParsed, incomingParsed, conflicts, key));
        } else conflicts.push({ path: key, currentFingerprint: fingerprint(merged[key]), importedFingerprint: fingerprint(raw), resolution: 'keep_current' });
      }
    });
    return { merged, conflicts, secretConflicts, blockedPermissions, idMap: leadResult.idMap };
  }

  function summarize(storage, secure) {
    const arrays = {};
    Object.keys(storage || {}).forEach(key => {
      if (ARRAY_KEYS.has(key) || key === 'gordi_leads') {
        const value = parseKnown(storage[key], key, 'array');
        arrays[key] = Array.isArray(value) ? value.length : 0;
      }
    });
    return {
      keys: Object.keys(storage || {}).length,
      secrets: Object.keys(storage || {}).filter(key => isSecretKey(key, secure)).length,
      arrays
    };
  }

  async function analyze(currentStorage, sourceValue, options = {}) {
    const decoded = await decodeSource(sourceValue, options.sourcePassword, options.secure);
    const result = mergeSnapshots(currentStorage || {}, decoded.localStorage, options);
    const unresolved = result.secretConflicts.filter(item => item.resolution === 'requires_explicit_choice');
    const analyzedPayload = options.currentPayload || {
      data: { localStorage: currentStorage || {}, indexedDB: null, incorporatedFiles: [], referencedFiles: [] }
    };
    return {
      contractVersion: CONTRACT_VERSION,
      analyzedState: {
        scope: options.currentPayload ? 'complete' : 'localStorage_legacy',
        fingerprint: await currentFingerprint(analyzedPayload, options.secure)
      },
      format: decoded.format,
      sourceVersion: decoded.version,
      sourceBuild: decoded.build,
      sourceFingerprint: decoded.sourceFingerprint || fingerprint(sourceValue),
      plaintextSecrets: (decoded.plaintextSecrets || []).map(key => ({ key, warning: 'plaintext_source_local_only' })),
      before: summarize(currentStorage, options.secure),
      incoming: summarize(decoded.localStorage, options.secure),
      after: summarize(result.merged, options.secure),
      conflicts: result.conflicts,
      secretConflicts: result.secretConflicts,
      blockedPermissions: result.blockedPermissions,
      requiresResolution: unresolved.length > 0,
      mergedLocalStorage: result.merged,
      sourcePayload: decoded.payload || null,
      sourceSections: decoded.payload ? {
        indexedDBStores: Object.fromEntries(Object.entries(decoded.payload.data.indexedDB?.stores || {}).map(([name, store]) => [name, store.records.length])),
        incorporatedFiles: decoded.payload.data.incorporatedFiles?.length || 0,
        referencedFiles: decoded.payload.data.referencedFiles?.length || 0
      } : { indexedDBStores: {}, incorporatedFiles: 0, referencedFiles: 0 }
    };
  }

  function syncRawDatabase(raw, storage) {
    if (!raw || !raw.stores) return raw;
    const copy = clone(raw);
    const map = {
      gordi_leads: 'leads', gordi_email_history: 'emailHistory', gordi_campaigns: 'campaigns',
      gordi_search_history: 'searchHistory', gordi_saved_searches: 'savedSearches'
    };
    Object.entries(map).forEach(([key, storeName]) => {
      if (!copy.stores[storeName] || storage[key] === undefined) return;
      const items = parseKnown(storage[key], key, 'array');
      copy.stores[storeName].records = (Array.isArray(items) ? items : []).map((item, index) => Object.assign({}, clone(item), {
        _id: String((item && (item.id || item._id)) || `${storeName}_${index}`)
      }));
    });
    if (copy.stores.kv) {
      const collectionKeys = new Set(Object.keys(map));
      const rows = Array.isArray(copy.stores.kv.records) ? copy.stores.kv.records.filter(row => row && !collectionKeys.has(row.key)) : [];
      Object.entries(storage).forEach(([key, value]) => {
        if (!collectionKeys.has(key) && (key.startsWith('gordi_') || key.startsWith('voltium_'))) {
          const existing = rows.find(row => row.key === key);
          if (existing) existing.value = value;
          else rows.push({ key, value, updatedAt: new Date().toISOString() });
        }
      });
      copy.stores.kv.records = rows;
    }
    return copy;
  }

  function recordIdentity(record, keyPath) {
    if (record && typeof keyPath === 'string' && record[keyPath] != null) return `key:${String(record[keyPath])}`;
    if (record && (record.id != null || record._id != null || record.key != null)) {
      return `id:${String(record.id ?? record._id ?? record.key)}`;
    }
    return `content:${fingerprint(record)}`;
  }

  function mergeStoreRecords(currentRecords, incomingRecords, storeName, keyPath, conflicts) {
    const out = (currentRecords || []).map(clone);
    const index = new Map(out.map((record, position) => [recordIdentity(record, keyPath), position]));
    (incomingRecords || []).forEach(record => {
      const identity = recordIdentity(record, keyPath);
      if (!index.has(identity)) {
        out.push(clone(record));
        index.set(identity, out.length - 1);
        return;
      }
      const existing = out[index.get(identity)];
      if (stable(existing) === stable(record)) return;
      const variant = clone(record);
      const suffix = `~import-${fingerprint(record)}`;
      if (typeof keyPath === 'string' && variant && variant[keyPath] != null) variant[keyPath] = `${variant[keyPath]}${suffix}`;
      else if (variant && variant._id != null) variant._id = `${variant._id}${suffix}`;
      else if (variant && variant.id != null) variant.id = `${variant.id}${suffix}`;
      else variant.__historicalRecordId = `record${suffix}`;
      const variantIdentity = recordIdentity(variant, keyPath);
      if (!index.has(variantIdentity)) {
        out.push(variant);
        index.set(variantIdentity, out.length - 1);
      }
      conflicts.push({ path: `indexedDB.${storeName}[${identity}]`, resolution: 'preserve_record_variant', importedFingerprint: fingerprint(record) });
    });
    return out;
  }

  function mergeRawDatabases(currentRaw, incomingRaw, storage, conflicts) {
    validateRawDatabase(currentRaw);
    validateRawDatabase(incomingRaw);
    const raw = clone(currentRaw || incomingRaw);
    const quarantinedStores = [];
    if (!raw) return { raw: null, quarantinedStores };
    raw.stores = raw.stores || {};
    const collectionStoreNames = new Set(Object.values(COLLECTION_STORES));
    Object.entries(incomingRaw?.stores || {}).forEach(([storeName, incomingStore]) => {
      if (collectionStoreNames.has(storeName) || storeName === 'kv' || storeName === 'meta') return;
      const currentStore = raw.stores[storeName];
      if (!currentStore) {
        quarantinedStores.push({
          storeName,
          keyPath: incomingStore.keyPath ?? null,
          autoIncrement: incomingStore.autoIncrement === true,
          records: clone(incomingStore.records),
          reason: 'store_not_available_in_current_schema'
        });
        return;
      }
      currentStore.records = mergeStoreRecords(currentStore.records, incomingStore.records, storeName, currentStore.keyPath, conflicts);
    });
    return { raw: syncRawDatabase(raw, storage), quarantinedStores };
  }

  async function mergeExactList(current, incoming, secure) {
    const out = (current || []).map(clone);
    const canonical = async item => {
      if (secure?._internals?.encodeBinary) return secure._internals.stableStringify(await secure._internals.encodeBinary(item));
      return stable(item);
    };
    const seen = new Set();
    for (const item of out) seen.add(await canonical(item));
    for (const item of (incoming || [])) {
      const key = await canonical(item);
      if (!seen.has(key)) { out.push(clone(item)); seen.add(key); }
    }
    return out;
  }

  async function normalizedPersistentState(payload, secure) {
    const localStorage = Object.fromEntries(Object.entries(payload?.data?.localStorage || {})
      .filter(([key]) => !VOLATILE_STATE_KEYS.has(key))
      .sort(([a], [b]) => a.localeCompare(b)));
    const sourceRaw = payload?.data?.indexedDB;
    const stores = {};
    let idbRecordCount = 0;
    Object.entries(sourceRaw?.stores || {}).sort(([a], [b]) => a.localeCompare(b)).forEach(([name, store]) => {
      const records = (store.records || []).map(record => {
        const copy = clone(record);
        if (name === 'kv' && copy && typeof copy === 'object') delete copy.updatedAt;
        return copy;
      }).sort((a, b) => stable(a).localeCompare(stable(b)));
      idbRecordCount += records.length;
      stores[name] = { keyPath: store.keyPath ?? null, autoIncrement: store.autoIncrement === true, records };
    });
    const incorporatedFiles = secure?._internals?.encodeBinary
      ? await secure._internals.encodeBinary(payload?.data?.incorporatedFiles || [])
      : clone(payload?.data?.incorporatedFiles || []);
    const referencedFiles = clone(payload?.data?.referencedFiles || []);
    return {
      localStorage,
      indexedDB: sourceRaw ? { database: sourceRaw.database, version: sourceRaw.version, stores } : null,
      incorporatedFiles,
      referencedFiles
    };
  }

  async function currentFingerprint(payload, secure) {
    const normalized = await normalizedPersistentState(payload, secure);
    if (!secure || !secure._internals) return fingerprint(normalized);
    return secure._internals.sha256Hex(secure._internals.stableStringify(normalized));
  }

  function hasAuxiliaryPersistentContent(payload) {
    const stores = payload?.data?.indexedDB?.stores || {};
    const records = Object.values(stores).reduce((sum, store) => sum + (Array.isArray(store?.records) ? store.records.length : 0), 0);
    return records > 0 || (payload?.data?.incorporatedFiles || []).length > 0 || (payload?.data?.referencedFiles || []).length > 0;
  }

  async function verifySafetyBackupFile(file, password, options = {}) {
    const secure = options.secure;
    if (!secure) throw new Error('SECURE_BACKUP_MODULE_REQUIRED');
    const parsed = JSON.parse(await file.text());
    const backupPayload = await secure.decryptContainer(parsed, password);
    const currentPayload = options.currentPayload || await secure.captureBrowserPayload({ includeSessionSecrets: true, tabsCoordinated: false });
    const backupFp = await currentFingerprint(backupPayload, secure);
    const currentFp = await currentFingerprint(currentPayload, secure);
    if (backupFp !== currentFp) throw new Error('SAFETY_BACKUP_DOES_NOT_MATCH_CURRENT_STATE');
    return { verifiedFromDisk: true, currentFingerprint: currentFp, filename: file.name || 'verified-backup', verifiedAt: new Date().toISOString() };
  }

  async function commit(plan, password, safetyProof, options = {}) {
    const secure = options.secure;
    if (!secure) throw new Error('SECURE_BACKUP_MODULE_REQUIRED');
    if (!plan || plan.requiresResolution) throw new Error('IMPORT_CONFLICTS_REQUIRE_RESOLUTION');
    if (!safetyProof || safetyProof.verifiedFromDisk !== true) throw new Error('VERIFIED_EXTERNAL_SAFETY_BACKUP_REQUIRED');
    const coordinator = options.coordinator || root?.VoltflowWriteCoordinator || null;
    const coordinationToken = coordinator?.acquireExclusive
      ? await coordinator.acquireExclusive('historical-import')
      : null;
    try {
    const current = coordinationToken
      ? await secure.captureBrowserPayload({ includeSessionSecrets: true, tabsCoordinated: true })
      : options.currentPayload || await secure.captureBrowserPayload({ includeSessionSecrets: true, tabsCoordinated: false });
    const fp = await currentFingerprint(current, secure);
    if (!plan.analyzedState?.fingerprint) throw new Error('IMPORT_PLAN_STATE_BINDING_REQUIRED');
    if (plan.analyzedState.scope !== 'complete' && hasAuxiliaryPersistentContent(current)) {
      return {
        ok: false,
        code: 'IMPORT_PLAN_COMPLETE_STATE_REANALYSIS_REQUIRED',
        requiresReanalysis: true
      };
    }
    const analyzedCurrent = plan.analyzedState.scope === 'complete'
      ? fp
      : await currentFingerprint({
        data: { localStorage: current.data.localStorage || {}, indexedDB: null, incorporatedFiles: [], referencedFiles: [] }
      }, secure);
    if (analyzedCurrent !== plan.analyzedState.fingerprint) {
      return {
        ok: false,
        code: 'IMPORT_PLAN_STALE_REANALYSIS_REQUIRED',
        requiresReanalysis: true
      };
    }
    if (fp !== safetyProof.currentFingerprint) {
      const legacyLocalFingerprint = await secure._internals.sha256Hex(secure._internals.stableStringify(current.data.localStorage || {}));
      const emptyAuxiliaryLegacyProof = !hasAuxiliaryPersistentContent(current) && safetyProof.currentFingerprint === legacyLocalFingerprint;
      if (!emptyAuxiliaryLegacyProof) throw new Error('CURRENT_DATA_CHANGED_AFTER_SAFETY_BACKUP');
    }
    const finalStorage = clone(plan.mergedLocalStorage);
    const incorporatedFiles = await mergeExactList(current.data.incorporatedFiles || [], plan.sourcePayload?.data?.incorporatedFiles || [], secure);
    const referencedFiles = await mergeExactList(current.data.referencedFiles || [], plan.sourcePayload?.data?.referencedFiles || [], secure);
    if (incorporatedFiles.length) finalStorage.gordi_incorporated_files_archive = JSON.stringify(await secure._internals.encodeBinary(incorporatedFiles));
    if (referencedFiles.length) finalStorage.gordi_referenced_files_archive = JSON.stringify(await secure._internals.encodeBinary(referencedFiles));
    const rawMerge = mergeRawDatabases(current.data.indexedDB, plan.sourcePayload?.data?.indexedDB || null, finalStorage, plan.conflicts || []);
    if (rawMerge.quarantinedStores.length) {
      const existing = finalStorage[QUARANTINE_KEY]
        ? parseKnown(finalStorage[QUARANTINE_KEY], QUARANTINE_KEY, 'array') : [];
      finalStorage[QUARANTINE_KEY] = JSON.stringify(await mergeExactList(existing, rawMerge.quarantinedStores, secure));
    }
    const mergedRaw = syncRawDatabase(rawMerge.raw, finalStorage);
    const payload = await secure.buildPayload({
      localStorage: finalStorage,
      sessionStorage: current.data.sessionStorage || {},
      indexedDB: mergedRaw,
      incorporatedFiles,
      referencedFiles,
      version: current.app.version,
      build: current.app.build,
      origin: current.app.origin,
      consistency: { pendingWritesDrained: true, tabsCoordinated: true }
    });
    const capturedBeforeRestore = await secure.captureBrowserPayload({ includeSessionSecrets: true, tabsCoordinated: !!coordinationToken });
    const immediatelyBeforeRestore = capturedBeforeRestore?.data ? capturedBeforeRestore : options.currentPayload;
    if (!immediatelyBeforeRestore?.data) throw new Error('PRE_RESTORE_LIVE_STATE_REQUIRED');
    const immediatelyBeforeFingerprint = await currentFingerprint(immediatelyBeforeRestore, secure);
    if (immediatelyBeforeFingerprint !== fp || (coordinationToken && coordinator.hasContention(coordinationToken))) {
      return { ok: false, code: 'CONCURRENT_WRITE_DETECTED_IMPORT_ABORTED', requiresReanalysis: true };
    }
    const restoreOptions = {
      restoreSession: false,
      restorePersistentSecrets: true,
      failAfterIdb: options.failAfterIdb === true,
      coordinationToken
    };
    const restored = await secure.restoreBrowserPayload(payload, password, restoreOptions);
    if (coordinationToken && root?.setTimeout) await new Promise(resolve => root.setTimeout(resolve, 50));
    if (coordinationToken && coordinator.hasContention(coordinationToken)) {
      await secure.restoreBrowserPayload(current, password, { restoreSession: false, restorePersistentSecrets: true, coordinationToken });
      return { ok: false, code: 'CONCURRENT_WRITE_ROLLED_BACK', requiresReanalysis: true };
    }
    const after = await secure.captureBrowserPayload({ includeSessionSecrets: true, tabsCoordinated: false });
    const expectedFp = await currentFingerprint(payload, secure);
    const afterFp = await currentFingerprint(after, secure);
    if (afterFp !== expectedFp) {
      await secure.restoreBrowserPayload(current, password, { restoreSession: false, restorePersistentSecrets: true, coordinationToken });
      throw new Error('POST_IMPORT_COMPLETE_STATE_MISMATCH_ROLLED_BACK');
    }
    return {
      ok: true,
      transactionId: restored.transactionId,
      sourceFingerprint: plan.sourceFingerprint,
      after: plan.after,
      recoveredSections: {
        indexedDBStores: Object.fromEntries(Object.entries(payload.data.indexedDB?.stores || {}).map(([name, store]) => [name, store.records.length])),
        incorporatedFiles: incorporatedFiles.length,
        referencedFiles: referencedFiles.length,
        quarantinedStores: rawMerge.quarantinedStores.map(item => item.storeName)
      }
    };
    } finally {
      if (coordinationToken && coordinator?.getFence()?.id === coordinationToken.id) coordinator.release(coordinationToken);
    }
  }

  function publicReport(plan) {
    return {
      generatedAt: new Date().toISOString(), contractVersion: plan.contractVersion,
      analyzedState: { scope: plan.analyzedState?.scope || 'unknown', fingerprint: plan.analyzedState?.fingerprint || null },
      format: plan.format, sourceVersion: plan.sourceVersion, sourceBuild: plan.sourceBuild,
      sourceFingerprint: plan.sourceFingerprint, before: plan.before, incoming: plan.incoming, after: plan.after,
      conflicts: plan.conflicts, secretConflicts: plan.secretConflicts.map(item => ({ key: item.key, resolution: item.resolution })),
      blockedPermissions: plan.blockedPermissions, plaintextSecretKeys: plan.plaintextSecrets.map(item => item.key),
      sourceSections: plan.sourceSections,
      containsSecretValues: false
    };
  }

  return {
    CONTRACT_VERSION, detectFormat, decodeSource, leadIdentity, mergeSnapshots, analyze,
    syncRawDatabase, mergeRawDatabases, verifySafetyBackupFile, commit, publicReport,
    _internals: { stable, fingerprint, parseStored, parseKnown, validConfirmed, evidenceKey, sequenceKey, materialLeadConflict, normalizedPersistentState, currentFingerprint, hasAuxiliaryPersistentContent }
  };
});
