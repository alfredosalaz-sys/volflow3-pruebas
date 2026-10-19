(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.VoltflowWriteCoordinator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const FENCE_KEY = '__voltflow_coord_fence';
  const REVISION_KEY = '__voltflow_coord_revision';
  const JOURNAL_REGISTRY_KEY = '__voltflow_coord_journals';
  const REPLAY_LOCK_KEY = '__voltflow_coord_replay';
  const CHANNEL_NAME = 'voltflow-write-coordination-v1';
  const LEASE_MS = 30000;
  const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const journalKey = `__voltflow_coord_journal_${tabId}`;
  const queued = [];
  let sequence = 0;
  let installed = false;
  let nativeSet = null;
  let nativeRemove = null;
  let nativeClear = null;
  let heartbeat = null;
  let channel = null;

  const now = () => Date.now();
  const parse = value => { try { return JSON.parse(value); } catch { return null; } };
  const isInternalKey = key => String(key).startsWith('__voltflow_coord_');

  function showStatus(message, isError = false) {
    try { root.showToast?.(message); } catch {}
    try {
      if (!root.document?.createElement || !root.document.body) return;
      let element = root.document.getElementById('voltflow-write-coordinator-status');
      if (!element) {
        element = root.document.createElement('div');
        element.id = 'voltflow-write-coordinator-status';
        element.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:100000;max-width:420px;padding:10px 12px;border-radius:6px;background:#111827;color:#fff;border:1px solid #64748b;font:13px/1.4 sans-serif';
        root.document.body.appendChild(element);
      }
      element.textContent = message;
      element.dataset.state = isError ? 'error' : 'pending';
    } catch {}
  }

  function clearStatus() {
    try { root.document?.getElementById('voltflow-write-coordinator-status')?.remove(); } catch {}
  }

  function local() { return root && root.localStorage; }
  function getFence() {
    const storage = local();
    if (!storage) return null;
    const value = parse(storage.getItem(FENCE_KEY));
    return value && value.id && Number(value.expiresAt) > now() ? value : null;
  }

  function revision() { return local()?.getItem(REVISION_KEY) || '0'; }
  const fenceRecord = token => ({ id: token.id, tabId: token.tabId, label: token.label, acquiredAt: token.acquiredAt, expiresAt: now() + LEASE_MS });
  function bumpRevision(reason) {
    const storage = local();
    if (!storage || !nativeSet) return '0';
    const value = `${now()}-${tabId}-${++sequence}-${reason || 'write'}`;
    nativeSet.call(storage, REVISION_KEY, value);
    try { channel?.postMessage({ type: 'revision', tabId, value }); } catch {}
    return value;
  }

  function readJournal(key) {
    const raw = local()?.getItem(key);
    if (!raw) return [];
    const parsed = parse(raw);
    if (!Array.isArray(parsed)) throw new Error('PERSISTENCE_PENDING_JOURNAL_CORRUPT');
    return parsed;
  }

  function journalKeys() {
    const keys = new Set();
    const registered = parse(local()?.getItem(JOURNAL_REGISTRY_KEY));
    if (Array.isArray(registered)) registered.forEach(key => typeof key === 'string' && keys.add(key));
    if (typeof local()?.length === 'number' && typeof local()?.key === 'function') {
      for (let index = 0; index < local().length; index++) {
        const key = local().key(index);
        if (key?.startsWith('__voltflow_coord_journal_')) keys.add(key);
      }
    }
    return [...keys];
  }

  function getReplayLock() {
    const value = parse(local()?.getItem(REPLAY_LOCK_KEY));
    return value?.id && Number(value.expiresAt) > now() ? value : null;
  }

  function acknowledgeJournalEvent(key, eventId) {
    const current = readJournal(key);
    if (!current.some(item => item?.id === eventId)) return false;
    const remaining = current.filter(item => item?.id !== eventId);
    if (remaining.length) nativeSet.call(local(), key, JSON.stringify(remaining));
    else nativeRemove.call(local(), key);
    if (readJournal(key).some(item => item?.id === eventId)) {
      throw new Error('PERSISTENCE_PENDING_ACK_VERIFY_FAILED');
    }
    if (!local()?.getItem(key)) {
      const registered = parse(local()?.getItem(JOURNAL_REGISTRY_KEY));
      if (Array.isArray(registered)) {
        const next = registered.filter(registeredKey => registeredKey !== key);
        if (next.length) nativeSet.call(local(), JOURNAL_REGISTRY_KEY, JSON.stringify(next));
        else nativeRemove.call(local(), JOURNAL_REGISTRY_KEY);
      }
    }
    return true;
  }

  function queueMutation(operation, key, value) {
    if (operation === 'clear') {
      showStatus('No se pudo guardar durante la restauracion. Reintenta cuando termine.', true);
      const error = new Error('PERSISTENCE_CLEAR_BLOCKED_RETRY_REQUIRED');
      error.code = 'PERSISTENCE_CLEAR_BLOCKED_RETRY_REQUIRED';
      throw error;
    }
    const item = {
      id: `${now()}-${tabId}-${++sequence}`,
      operation,
      key: key == null ? null : String(key),
      value: value == null ? null : String(value),
      createdAt: new Date().toISOString()
    };
    try {
      const registry = journalKeys();
      if (!registry.includes(journalKey)) registry.push(journalKey);
      nativeSet.call(local(), JOURNAL_REGISTRY_KEY, JSON.stringify(registry));
      const journal = readJournal(journalKey);
      journal.push(item);
      nativeSet.call(local(), journalKey, JSON.stringify(journal));
      if (!journalKeys().includes(journalKey) || !readJournal(journalKey).some(entry => entry?.id === item.id)) {
        throw new Error('PERSISTENCE_PENDING_JOURNAL_VERIFY_FAILED');
      }
    } catch (cause) {
      showStatus('El guardado fue rechazado: no pudo protegerse para reintento.', true);
      const error = new Error('PERSISTENCE_PENDING_WRITE_REJECTED');
      error.code = 'PERSISTENCE_PENDING_WRITE_REJECTED';
      error.cause = cause;
      throw error;
    }
    queued.push(item);
    bumpRevision('queued');
    showStatus('Guardado protegido y pendiente mientras termina la restauracion.');
    try {
      root.dispatchEvent(new CustomEvent('voltflow:write-queued', { detail: { operation, key: key == null ? null : String(key) } }));
    } catch {}
  }

  function replayQueued() {
    if (getFence()) return 0;
    if (getReplayLock()) return 0;
    const replayId = `${tabId}-${now()}-${++sequence}`;
    nativeSet.call(local(), REPLAY_LOCK_KEY, JSON.stringify({ id: replayId, expiresAt: now() + 10000 }));
    if (getReplayLock()?.id !== replayId) return 0;
    let replayed = 0;
    let mutated = false;
    const appliedIds = new Set();
    try {
      // A fence can appear between the first check and ownership of the replay lock.
      if (getFence()) return 0;
      const keys = journalKeys();
      const entries = [];
      keys.forEach(key => readJournal(key).forEach(item => entries.push({ journalKey: key, item })));
      entries.sort((a, b) => String(a.item.createdAt).localeCompare(String(b.item.createdAt)) || String(a.item.id).localeCompare(String(b.item.id)));
      for (const { journalKey: sourceJournal, item } of entries) {
        // Never pass a replay through the public interceptor. A newly acquired
        // fence must leave this exact event durable for a later replay.
        if (getReplayLock()?.id !== replayId || getFence()) break;
        nativeSet.call(local(), REPLAY_LOCK_KEY, JSON.stringify({ id: replayId, expiresAt: now() + 10000 }));
        if (getReplayLock()?.id !== replayId || getFence()) break;
        if (item.operation === 'set') nativeSet.call(local(), item.key, item.value);
        else if (item.operation === 'remove') nativeRemove.call(local(), item.key);
        else throw new Error('PERSISTENCE_PENDING_OPERATION_INVALID');
        mutated = true;
        const applied = item.operation === 'set'
          ? local()?.getItem(item.key) === String(item.value)
          : local()?.getItem(item.key) === null;
        if (!applied) throw new Error('PERSISTENCE_PENDING_APPLY_VERIFY_FAILED');
        // If exclusivity changed after the mutation, keep the event. A restore
        // may roll this value back, and the durable journal must then retry it.
        if (getReplayLock()?.id !== replayId || getFence()) break;
        if (!acknowledgeJournalEvent(sourceJournal, item.id)) {
          throw new Error('PERSISTENCE_PENDING_EVENT_NOT_FOUND');
        }
        appliedIds.add(item.id);
        replayed++;
      }
      for (let index = queued.length - 1; index >= 0; index--) {
        if (appliedIds.has(queued[index]?.id)) queued.splice(index, 1);
      }
      if (mutated) bumpRevision('replayed');
      if (replayed) showStatus('Guardado pendiente aplicado correctamente.');
      if (getFence() || journalKeys().length) {
        showStatus('El guardado sigue protegido y se aplicara cuando termine la operacion exclusiva.');
      } else {
        root.setTimeout?.(clearStatus, 2500);
      }
      return replayed;
    } catch (error) {
      showStatus('Hay un guardado pendiente que no pudo aplicarse. No cierres la aplicacion y reintenta.', true);
      try { root.dispatchEvent(new CustomEvent('voltflow:write-replay-failed', { detail: { code: error.code || error.message } })); } catch {}
      return 0;
    } finally {
      if (parse(local()?.getItem(REPLAY_LOCK_KEY))?.id === replayId) nativeRemove.call(local(), REPLAY_LOCK_KEY);
    }
  }

  function install() {
    if (installed || !root || !root.Storage || !local()) return false;
    nativeSet = root.Storage.prototype.setItem;
    nativeRemove = root.Storage.prototype.removeItem;
    nativeClear = root.Storage.prototype.clear;
    root.Storage.prototype.setItem = function (key, value) {
      const strKey = String(key);
      if (this !== local() || isInternalKey(strKey)) return nativeSet.call(this, strKey, String(value));
      if (getFence()) { queueMutation('set', strKey, value); return undefined; }
      const result = nativeSet.call(this, strKey, String(value));
      bumpRevision('set');
      return result;
    };
    root.Storage.prototype.removeItem = function (key) {
      const strKey = String(key);
      if (this !== local() || isInternalKey(strKey)) return nativeRemove.call(this, strKey);
      if (getFence()) { queueMutation('remove', strKey, null); return undefined; }
      const result = nativeRemove.call(this, strKey);
      bumpRevision('remove');
      return result;
    };
    root.Storage.prototype.clear = function () {
      if (this !== local()) return nativeClear.call(this);
      if (getFence()) return queueMutation('clear', null, null);
      const result = nativeClear.call(this);
      bumpRevision('clear');
      return result;
    };
    if (typeof root.BroadcastChannel === 'function') {
      channel = new root.BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = event => {
        if (event.data?.type === 'released') replayQueued();
      };
    }
    root.addEventListener?.('storage', event => {
      if (event.key === FENCE_KEY && !event.newValue) replayQueued();
      else if (getFence() && !isInternalKey(event.key)) bumpRevision('external-storage-event');
    });
    installed = true;
    if (!getFence()) root.setTimeout?.(replayQueued, 0);
    return true;
  }

  async function acquireExclusive(label) {
    install();
    const storage = local();
    if (!storage || !nativeSet) throw new Error('WRITE_COORDINATOR_UNAVAILABLE');
    let releaseWebLock = null;
    let webLockTask = null;
    if (root.navigator?.locks?.request) {
      let resolveAcquired;
      const acquired = new Promise(resolve => { resolveAcquired = resolve; });
      webLockTask = root.navigator.locks.request('voltflow-persistence-write', { mode: 'exclusive', ifAvailable: true }, lock => {
        if (!lock) { resolveAcquired(false); return undefined; }
        resolveAcquired(true);
        return new Promise(resolve => { releaseWebLock = resolve; });
      });
      if (!(await acquired)) throw new Error('PERSISTENCE_WRITE_ALREADY_LOCKED');
    }
    if (getReplayLock()) {
      releaseWebLock?.();
      await webLockTask;
      throw new Error('PERSISTENCE_REPLAY_IN_PROGRESS');
    }
    const active = getFence();
    if (active) {
      releaseWebLock?.();
      await webLockTask;
      throw new Error('PERSISTENCE_WRITE_ALREADY_LOCKED');
    }
    const token = {
      id: `op-${now()}-${Math.random().toString(36).slice(2, 12)}`,
      tabId,
      label: String(label || 'exclusive-write'),
      acquiredAt: new Date().toISOString(),
      releaseWebLock,
      webLockTask
    };
    nativeSet.call(storage, FENCE_KEY, JSON.stringify(fenceRecord(token)));
    if (getFence()?.id !== token.id) {
      releaseWebLock?.();
      await webLockTask;
      throw new Error('PERSISTENCE_WRITE_LOCK_RACE');
    }
    // Close the fallback localStorage race when Web Locks are unavailable.
    // If replay won after our first check, relinquish this fence without
    // touching its journals; the caller can retry after replay completes.
    if (getReplayLock()) {
      if (getFence()?.id === token.id) nativeRemove.call(storage, FENCE_KEY);
      releaseWebLock?.();
      await webLockTask;
      throw new Error('PERSISTENCE_REPLAY_IN_PROGRESS');
    }
    token.baselineRevision = revision();
    heartbeat = root.setInterval?.(() => {
      if (getFence()?.id === token.id) {
        nativeSet.call(storage, FENCE_KEY, JSON.stringify(fenceRecord(token)));
      }
    }, Math.floor(LEASE_MS / 3));
    try { channel?.postMessage({ type: 'acquired', id: token.id, tabId, label: token.label }); } catch {}
    return token;
  }

  function assertOwner(token) {
    if (!token?.id || getFence()?.id !== token.id) throw new Error('PERSISTENCE_WRITE_LOCK_NOT_OWNED');
  }

  function authorizedSetItem(token, storage, key, value) {
    assertOwner(token);
    return nativeSet.call(storage, String(key), String(value));
  }

  function authorizedRemoveItem(token, storage, key) {
    assertOwner(token);
    return nativeRemove.call(storage, String(key));
  }

  function hasContention(token) {
    assertOwner(token);
    return revision() !== token.baselineRevision;
  }

  async function waitForWritable(token) {
    const fence = getFence();
    if (!fence || (token?.id && fence.id === token.id)) return;
    bumpRevision('idb-writer-waiting');
    while (getFence()) await new Promise(resolve => root.setTimeout(resolve, 25));
  }

  function release(token) {
    assertOwner(token);
    if (heartbeat) { root.clearInterval?.(heartbeat); heartbeat = null; }
    nativeRemove.call(local(), FENCE_KEY);
    try { channel?.postMessage({ type: 'released', id: token.id, tabId }); } catch {}
    const replayed = replayQueued();
    token.releaseWebLock?.();
    return replayed;
  }

  install();
  return {
    FENCE_KEY, REVISION_KEY, JOURNAL_REGISTRY_KEY, install, acquireExclusive, authorizedSetItem, authorizedRemoveItem,
    hasContention, waitForWritable, release, getFence, revision,
    _internals: { replayQueued, queued, isInternalKey, journalKeys, journalKey, acknowledgeJournalEvent, getReplayLock }
  };
});
