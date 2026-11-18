(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) root.VoltflowPersistenceRecovery = api.createBrowserManager(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const RETRYABLE = new Set([
    'PERSISTENCE_WRITE_ALREADY_LOCKED', 'PERSISTENCE_WRITE_LOCK_RACE',
    'PERSISTENCE_REPLAY_IN_PROGRESS', 'COMMERCIAL_MEMORY_LOCK_TIMEOUT'
  ]);
  const MISSING = Object.freeze({ missing: true });

  function codeOf(error) {
    const text = String(error?.code || error?.message || error || 'PERSISTENCE_UNKNOWN_ERROR');
    return [...RETRYABLE].find(code => text.includes(code))
      || (/quota/i.test(text) ? 'PERSISTENCE_QUOTA_EXCEEDED'
        : (/version|conflict|stale|obsolete/i.test(text) ? 'PERSISTENCE_VERSION_CONFLICT'
          : (/abort|indexeddb|storage|transaction/i.test(text) ? 'PERSISTENCE_STORAGE_ERROR' : 'PERSISTENCE_WRITE_FAILED')));
  }

  function classify(error) {
    const code = codeOf(error);
    if (RETRYABLE.has(code)) return {
      code, kind: 'temporary-lock', retryable: true,
      title: 'No se han guardado los cambios.',
      message: 'Otra operacion esta modificando los datos. Comprueba la informacion antes de volver a intentarlo.'
    };
    if (code === 'PERSISTENCE_VERSION_CONFLICT') return {
      code, kind: 'conflict', retryable: false,
      title: 'Los datos han cambiado en otra operacion.',
      message: 'Revisa la version actual antes de guardar de nuevo.'
    };
    if (code === 'PERSISTENCE_QUOTA_EXCEEDED') return {
      code, kind: 'storage-full', retryable: false,
      title: 'No se han guardado los cambios.',
      message: 'El navegador no dispone de espacio suficiente. Crea una copia y libera espacio antes de continuar.'
    };
    return {
      code, kind: 'definitive', retryable: false,
      title: 'No se han guardado los cambios.',
      message: 'El almacenamiento ha rechazado la operacion. Conserva la pantalla abierta y revisa el diagnostico.'
    };
  }

  function canonical(value) {
    if (value === MISSING) return '[[missing]]';
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  const equal = (left, right) => canonical(left) === canonical(right);
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);

  function mergeValue(base, intended, current, path, conflicts) {
    if (equal(intended, base)) return current;
    if (equal(current, base) || equal(current, intended)) return intended;
    if (plain(base) && plain(intended) && plain(current)) {
      const output = {};
      const keys = new Set([...Object.keys(base), ...Object.keys(intended), ...Object.keys(current)]);
      for (const key of keys) {
        const merged = mergeValue(
          Object.hasOwn(base, key) ? base[key] : MISSING,
          Object.hasOwn(intended, key) ? intended[key] : MISSING,
          Object.hasOwn(current, key) ? current[key] : MISSING,
          path.concat(key), conflicts
        );
        if (merged !== MISSING) output[key] = merged;
      }
      return output;
    }
    conflicts.push(path.join('.'));
    return current;
  }

  function mergeCollectionsById(baseline, intended, authoritative, idField = 'id') {
    const base = new Map((baseline || []).filter(Boolean).map(item => [String(item[idField]), item]));
    const wanted = new Map((intended || []).filter(Boolean).map(item => [String(item[idField]), item]));
    const current = new Map((authoritative || []).filter(Boolean).map(item => [String(item[idField]), item]));
    const order = [];
    for (const item of intended || []) if (item?.[idField] != null) order.push(String(item[idField]));
    for (const item of authoritative || []) if (item?.[idField] != null && !order.includes(String(item[idField]))) order.push(String(item[idField]));
    const output = new Map();
    const conflicts = [];
    for (const id of new Set([...base.keys(), ...wanted.keys(), ...current.keys()])) {
      const before = base.has(id) ? base.get(id) : MISSING;
      const desired = wanted.has(id) ? wanted.get(id) : MISSING;
      const actual = current.has(id) ? current.get(id) : MISSING;
      const merged = mergeValue(before, desired, actual, [id], conflicts);
      if (merged !== MISSING) output.set(id, merged);
    }
    return { ok: conflicts.length === 0, value: order.filter(id => output.has(id)).map(id => output.get(id)), conflicts };
  }
  function collectionsEqualById(left, right, idField = 'id') {
    const normalize = rows => (rows || []).map(item => [String(item?.[idField]), item]).sort((a, b) => a[0].localeCompare(b[0]));
    return equal(normalize(left), normalize(right));
  }

  function createManager(environment = {}) {
    const operations = new Map();
    const active = new Map();
    const visualPending = new Map();
    const notify = environment.notify || (() => {});
    const emit = environment.emit || (() => {});
    const persistFailure = environment.persistFailure || (() => {});
    const clearFailure = environment.clearFailure || (() => {});

    function status(id) { return operations.get(id) || null; }
    function dismiss(id) { operations.delete(id); notify(null); }
    function fail(spec, error) {
      const classification = classify(error);
      const record = {
        id: spec.id, label: spec.label || 'datos', classification,
        error: String(error?.message || error), createdAt: new Date().toISOString(),
        retry: classification.retryable ? spec.retry : null,
        review: spec.review || null
      };
      operations.set(spec.id, record);
      persistFailure(record);
      notify(record);
      emit('failed', record);
      return record;
    }
    async function run(spec) {
      if (!spec?.id || typeof spec.execute !== 'function') throw new Error('PERSISTENCE_OPERATION_INVALID');
      if (active.has(spec.id)) return active.get(spec.id);
      const task = (async () => {
        try {
          const result = await spec.execute();
          operations.delete(spec.id);
          clearFailure(spec.id);
          notify(null);
          emit('confirmed', { id: spec.id, label: spec.label, result });
          return result;
        } catch (error) {
          fail(spec, error);
          throw error;
        } finally { active.delete(spec.id); }
      })();
      active.set(spec.id, task);
      return task;
    }
    async function retry(id) {
      const operation = operations.get(id);
      if (!operation?.retry) throw new Error('PERSISTENCE_RETRY_REVIEW_REQUIRED');
      if (active.has(id)) return active.get(id);
      const task = (async () => {
        try {
          const result = await operation.retry();
          operations.delete(id);
          clearFailure(id);
          notify(null);
          emit('confirmed', { id, label: operation.label, result, retried: true });
          return result;
        } catch (error) {
          fail({ ...operation, retry: operation.retry }, error);
          throw error;
        } finally { active.delete(id); }
      })();
      active.set(id, task);
      return task;
    }
    function beginPending(label) {
      const token = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      visualPending.set(token, String(label || 'datos'));
      return token;
    }
    function endPending(token) { visualPending.delete(token); }
    return {
      run, retry, fail, status, dismiss, beginPending, endPending,
      hasPending: () => visualPending.size > 0 || active.size > 0,
      hasActive: () => active.size > 0,
      pending: () => [...operations.values()]
    };
  }

  function createBrowserManager(browser) {
    let panel = null;
    function render(record) {
      if (!browser.document?.body) return;
      if (!record) { panel?.remove(); panel = null; return; }
      panel?.remove();
      panel = browser.document.createElement('section');
      panel.id = 'voltflow-persistence-recovery';
      panel.setAttribute('role', 'alert');
      panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:100001;width:min(430px,calc(100vw - 32px));padding:14px;background:#201717;color:#fff;border:1px solid #ef4444;border-radius:6px;box-shadow:0 12px 30px rgba(0,0,0,.35);font:14px/1.45 sans-serif';
      const title = browser.document.createElement('strong'); title.textContent = record.classification.title;
      const operation = browser.document.createElement('p'); operation.textContent = `Operacion: ${record.label}. La informacion de esta pantalla permanece sin guardar.`;
      const message = browser.document.createElement('p'); message.textContent = record.classification.message;
      const actions = browser.document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
      if (record.retry) {
        const retryButton = browser.document.createElement('button'); retryButton.type = 'button'; retryButton.textContent = 'Comprobar y reintentar';
        retryButton.onclick = async () => { retryButton.disabled = true; try { await manager.retry(record.id); browser.showToast?.('Cambios guardados despues de comprobar la version actual.'); } catch {} finally { retryButton.disabled = false; } };
        actions.append(retryButton);
      }
      const reviewButton = browser.document.createElement('button'); reviewButton.type = 'button'; reviewButton.textContent = 'Revisar cambios';
      reviewButton.onclick = () => { try { record.review?.(); } finally { browser.dispatchEvent(new CustomEvent('voltflow:persistence-review-requested', { detail: { id: record.id, label: record.label } })); } };
      actions.append(reviewButton); panel.append(title, operation, message, actions); browser.document.body.append(panel);
    }
    const manager = createManager({
      notify: render,
      emit: (state, detail) => browser.dispatchEvent?.(new CustomEvent('voltflow:persistence-recovery', { detail: { state, ...detail } })),
      persistFailure: record => {
        try { browser.sessionStorage?.setItem('_voltflow_last_unconfirmed_operation', JSON.stringify({ id: record.id, label: record.label, code: record.classification.code, at: record.createdAt })); } catch {}
      },
      clearFailure: id => {
        try {
          const current = JSON.parse(browser.sessionStorage?.getItem('_voltflow_last_unconfirmed_operation') || 'null');
          if (current?.id === id) browser.sessionStorage.removeItem('_voltflow_last_unconfirmed_operation');
        } catch {}
      }
    });
    try {
      const interrupted = JSON.parse(browser.sessionStorage?.getItem('_voltflow_last_unconfirmed_operation') || 'null');
      if (interrupted?.id) {
        const error = Object.assign(new Error('PERSISTENCE_VERSION_CONFLICT'), { code: 'PERSISTENCE_VERSION_CONFLICT' });
        const showInterrupted = () => manager.fail({ id: interrupted.id, label: interrupted.label || 'datos', review: null }, error);
        if (browser.document?.body) browser.setTimeout(showInterrupted, 0);
        else browser.addEventListener?.('DOMContentLoaded', showInterrupted, { once: true });
      }
    } catch {}
    browser.addEventListener?.('voltflow:persistence', event => {
      const detail = event.detail || {};
      if (detail.state !== 'failed') return;
      const classification = classify(detail.message);
      if (manager.hasActive() || manager.pending().some(item => item.label === (detail.label || detail.key))) return;
      manager.fail({ id: `external:${detail.key || 'unknown'}`, label: detail.label || detail.key || 'datos', review: null }, Object.assign(new Error(detail.message || classification.code), { code: classification.code }));
    });
    return Object.assign(manager, { classify, canonical, equal, mergeCollectionsById, collectionsEqualById });
  }

  return { classify, canonical, equal, mergeCollectionsById, collectionsEqualById, createManager, createBrowserManager };
});
