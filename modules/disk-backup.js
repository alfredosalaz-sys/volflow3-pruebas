// Automatic daily disk backups.
// Uses the browser File System Access API when available and authorized.
(function () {
  'use strict';

  const DB_NAME = 'gordi_disk_backup_db';
  const DB_VERSION = 1;
  const STORE = 'handles';
  const HANDLE_KEY = 'backupDirectory';
  const ENABLED_KEY = 'gordi_disk_backup_enabled';
  const LAST_DATE_KEY = 'gordi_disk_backup_last_date';
  const LAST_STATUS_KEY = 'gordi_disk_backup_last_status';
  const LAST_FILE_KEY = 'gordi_disk_backup_last_file';
  const LAST_ERROR_KEY = 'gordi_disk_backup_last_error';
  let sessionBackupPassword = '';

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function isSupported() {
    return typeof window.showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined';
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('No se pudo leer el permiso'));
      tx.oncomplete = () => db.close();
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error || new Error('No se pudo guardar el permiso'));
    });
  }

  async function idbDelete(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error || new Error('No se pudo eliminar el permiso'));
    });
  }

  async function hasWritePermission(handle, requestIfNeeded) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission(opts);
      if (current === 'granted') return true;
    }
    if (requestIfNeeded && typeof handle.requestPermission === 'function') {
      const next = await handle.requestPermission(opts);
      return next === 'granted';
    }
    return false;
  }

  function setStatus(status, detail) {
    const payload = {
      status,
      detail: detail || '',
      at: new Date().toISOString()
    };
    localStorage.setItem(LAST_STATUS_KEY, JSON.stringify(payload));
    if (status !== 'error') localStorage.removeItem(LAST_ERROR_KEY);
    if (status === 'error') localStorage.setItem(LAST_ERROR_KEY, detail || 'Error desconocido');
    renderDiskBackupStatus();
  }

  async function writeBackupFile(dirHandle, fileName, payload) {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    await writable.close();
  }

  function unlockBackupPassword() {
    const password = prompt('Contraseña maestra para cifrar las copias de esta sesión (mínimo 12 caracteres):');
    if (password === null) return false;
    if (password.length < 12) {
      alert('La contraseña debe tener al menos 12 caracteres y no se guardará en el navegador.');
      return false;
    }
    sessionBackupPassword = password;
    return true;
  }

  async function runDiskBackupNow(showFeedback = true, options = {}) {
    if (!window.VoltflowSecureBackup) {
      setStatus('error', 'El módulo de copia cifrada no está disponible. No se escribió ningún archivo.');
      return false;
    }
    if (!sessionBackupPassword && showFeedback && !unlockBackupPassword()) {
      setStatus('locked', 'Introduce la contraseña maestra para crear una copia cifrada.');
      return false;
    }
    if (!sessionBackupPassword) {
      setStatus('locked', 'La copia diaria está pendiente hasta desbloquear el cifrado en esta sesión.');
      return false;
    }
    if (!isSupported()) {
      setStatus('unsupported', 'Tu navegador no permite guardar backups directos en una carpeta.');
      if (showFeedback && typeof showToast === 'function') showToast('Este navegador no permite backup automatico a carpeta');
      return false;
    }

    const dirHandle = await idbGet(HANDLE_KEY);
    if (!dirHandle) {
      setStatus('not_configured', 'Elige una carpeta de backups una vez para activar la copia diaria.');
      if (showFeedback && typeof showToast === 'function') showToast('Elige primero una carpeta de backups');
      return false;
    }

    try {
      const canWrite = await hasWritePermission(dirHandle, !!options.requestPermission);
      if (!canWrite) {
        setStatus('permission_needed', 'Chrome necesita que vuelvas a autorizar la carpeta de backups.');
        if (showFeedback && typeof showToast === 'function') showToast('Autoriza de nuevo la carpeta de backups');
        return false;
      }

      const date = todayKey();
      if (!options.force && localStorage.getItem(LAST_DATE_KEY) === date) {
        localStorage.setItem(LAST_DATE_KEY, date);
        setStatus('already_exists', `Ya existe una copia cifrada verificada de hoy.`);
        return true;
      }

      const result = await VoltflowSecureBackup.createBrowserBackup(sessionBackupPassword, {
        includeSessionSecrets: false,
        tabsCoordinated: document.visibilityState === 'visible'
      });
      const fileName = result.filename;
      await writeBackupFile(dirHandle, fileName, result.container);
      const writtenHandle = await dirHandle.getFileHandle(fileName, { create: false });
      const writtenFile = await writtenHandle.getFile();
      const verification = await VoltflowSecureBackup.verifyBackupFile(writtenFile, sessionBackupPassword);
      if (!verification.ok) throw new Error('La copia escrita no superó la verificación');
      localStorage.setItem(ENABLED_KEY, 'true');
      localStorage.setItem(LAST_DATE_KEY, date);
      localStorage.setItem(LAST_FILE_KEY, fileName);
      localStorage.setItem('gordi_last_external_backup_verified', JSON.stringify({
        verifiedAt: new Date().toISOString(),
        createdAt: verification.createdAt,
        filename: fileName,
        bytes: writtenFile.size,
        secretsEncrypted: verification.secrets,
        build: verification.build,
        location: 'authorized_directory',
        verifiedFromDisk: true
      }));
      setStatus('ok', `Copia cifrada escrita y verificada: ${fileName}`);
      if (showFeedback && typeof showToast === 'function') {
        showToast(`Copia cifrada verificada: ${Math.round(writtenFile.size / 1024)} KB`);
      }
      return true;
    } catch (err) {
      setStatus('error', err && err.message ? err.message : String(err));
      if (showFeedback && typeof showToast === 'function') showToast('No se pudo crear el backup en disco');
      return false;
    }
  }

  async function maybeCreateDailyDiskBackup() {
    if (localStorage.getItem(ENABLED_KEY) !== 'true') {
      renderDiskBackupStatus();
      return false;
    }
    if (localStorage.getItem(LAST_DATE_KEY) === todayKey()) {
      renderDiskBackupStatus();
      return true;
    }
    return runDiskBackupNow(false, { requestPermission: false });
  }

  async function connectDiskBackupFolder() {
    if (!isSupported()) {
      setStatus('unsupported', 'Usa Chrome o Edge actualizado para guardar automaticamente en disco.');
      alert('Tu navegador no permite elegir una carpeta para backups automaticos. Usa Chrome o Edge actualizado.');
      return;
    }
    try {
      if (!sessionBackupPassword && !unlockBackupPassword()) return;
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const canWrite = await hasWritePermission(dirHandle, true);
      if (!canWrite) {
        setStatus('permission_needed', 'No se concedio permiso de escritura.');
        return;
      }
      await idbSet(HANDLE_KEY, dirHandle);
      localStorage.setItem(ENABLED_KEY, 'true');
      await runDiskBackupNow(true, { requestPermission: true, force: false });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setStatus('error', err && err.message ? err.message : String(err));
    }
  }

  async function disconnectDiskBackupFolder() {
    await idbDelete(HANDLE_KEY);
    localStorage.setItem(ENABLED_KEY, 'false');
    setStatus('not_configured', 'Backup automatico a disco desactivado.');
    if (typeof showToast === 'function') showToast('Backup automatico a disco desactivado');
  }

  function getStatusLabel(status) {
    const labels = {
      ok: 'Activo',
      already_exists: 'Hecho hoy',
      not_configured: 'Sin carpeta',
      permission_needed: 'Permiso necesario',
      unsupported: 'No compatible',
      locked: 'Cifrado bloqueado',
      error: 'Error'
    };
    return labels[status] || 'Pendiente';
  }

  function renderDiskBackupStatus() {
    const host = document.getElementById('disk-backup-status');
    if (!host) return;
    let lastStatus = null;
    try { lastStatus = JSON.parse(localStorage.getItem(LAST_STATUS_KEY) || 'null'); } catch {}
    const enabled = localStorage.getItem(ENABLED_KEY) === 'true';
    const lastDate = localStorage.getItem(LAST_DATE_KEY) || '-';
    const lastFile = localStorage.getItem(LAST_FILE_KEY) || '-';
    const supported = isSupported();
    const status = lastStatus?.status || (enabled ? 'permission_needed' : (supported ? 'not_configured' : 'unsupported'));
    const color = status === 'ok' || status === 'already_exists' ? 'var(--success)'
      : status === 'error' ? 'var(--danger)'
      : status === 'unsupported' ? 'var(--warning)'
      : 'var(--text-muted)';
    host.innerHTML = `
      <div style="display:grid;gap:.45rem">
        <div style="display:flex;align-items:center;gap:.55rem;flex-wrap:wrap">
          <strong style="color:${color}">${getStatusLabel(status)}</strong>
          <span style="color:var(--text-muted);font-size:.78rem">${lastStatus?.detail || 'El backup se crea una vez al dia mientras la app esta abierta.'}</span>
        </div>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;color:var(--text-dim);font-size:.74rem">
          <span>Ultimo dia: <strong style="color:var(--text-muted)">${lastDate}</strong></span>
          <span>Archivo: <strong style="color:var(--text-muted)">${lastFile}</strong></span>
          <span>Formato: AES-256-GCM; la contraseña solo permanece en memoria durante esta sesión</span>
        </div>
      </div>`;
  }

  window.connectDiskBackupFolder = connectDiskBackupFolder;
  window.disconnectDiskBackupFolder = disconnectDiskBackupFolder;
  window.runDiskBackupNow = runDiskBackupNow;
  window.maybeCreateDailyDiskBackup = maybeCreateDailyDiskBackup;
  window.renderDiskBackupStatus = renderDiskBackupStatus;

  function scheduleDailyDiskBackup() {
    const run = () => maybeCreateDailyDiskBackup();
    if ('requestIdleCallback' in window) {
      setTimeout(() => requestIdleCallback(run, { timeout: 120000 }), 300000);
    } else {
      setTimeout(run, 300000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleDailyDiskBackup);
  } else {
    scheduleDailyDiskBackup();
  }
})();
