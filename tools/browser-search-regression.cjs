'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const requestedRoot = process.argv.slice(2).find(arg => !arg.startsWith('--'));
const root = requestedRoot ? path.resolve(requestedRoot) : path.resolve(__dirname, '..');
const measureOnly = process.argv.includes('--measure-only');
const commercialOnly = process.argv.includes('--commercial-only');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profilePath = path.join(root, '.tmp-chrome-search-regression');
const port = 8767;
const debugPort = 9333;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return response;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timeout waiting for ${url}`);
}

class CdpClient {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.events = [];
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout opening Chrome DevTools WebSocket')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.ws.addEventListener('error', error => { clearTimeout(timeout); reject(error); }, { once: true });
    });
    this.ws.addEventListener('message', async event => {
      let raw;
      if (typeof event.data === 'string') raw = event.data;
      else if (Buffer.isBuffer(event.data)) raw = event.data.toString('utf8');
      else if (event.data instanceof ArrayBuffer) raw = Buffer.from(event.data).toString('utf8');
      else raw = Buffer.from(await event.data.arrayBuffer()).toString('utf8');
      const message = JSON.parse(raw);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result || {});
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for CDP method ${method}`));
      }, method === 'Runtime.evaluate' ? 30000 : 15000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value); },
        reject: error => { clearTimeout(timeout); reject(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  assert.ok(fs.existsSync(chromePath), 'Chrome executable missing');
  fs.rmSync(profilePath, { recursive: true, force: true });
  const contentTypes = { '.html': 'text/html; charset=UTF-8', '.js': 'text/javascript; charset=UTF-8', '.json': 'application/json; charset=UTF-8', '.css': 'text/css; charset=UTF-8' };
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent((request.url || '/').split('?')[0]).replace(/^\/+/, '') || 'app.html';
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) response.writeHead(404).end('Not found');
      else response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
    });
  });
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', error => error ? reject(error) : resolve()));
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profilePath}`,
    '--no-first-run',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let client;
  try {
    await waitFor(`http://127.0.0.1:${port}/version.json`);
    const targetsResponse = await waitFor(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = await targetsResponse.json();
    const target = targets.find(item => item.type === 'page');
    assert.ok(target?.webSocketDebuggerUrl, 'Chrome page target missing');
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.open();
    await Promise.all([
      client.send('Page.enable'),
      client.send('Runtime.enable'),
      client.send('Network.enable'),
      client.send('Performance.enable'),
      client.send('Emulation.setCPUThrottlingRate', { rate: 4 }),
    ]);
    await client.send('Network.setBlockedURLs', { urls: ['https://*/*'] });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__browserAudit = { longTasks: [], errors: [] };
        window.addEventListener('error', event => window.__browserAudit.errors.push(String(event.message || event.error || 'error')));
        window.addEventListener('unhandledrejection', event => window.__browserAudit.errors.push(String(event.reason || 'rejection')));
        try {
          new PerformanceObserver(list => list.getEntries().forEach(entry => window.__browserAudit.longTasks.push(entry.duration)))
            .observe({ type: 'longtask', buffered: true });
        } catch {}
      `,
    });
    await client.send('Page.navigate', { url: `http://127.0.0.1:${port}/app.html` });
    await delay(5000);

    if (commercialOnly) {
      const commercial = await client.send('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
        expression: `(async () => {
          const originalConfirm = window.confirm;
          window.confirm = () => false;
          try {
            emailHistory = [];
            leads = [{
              id: 'browser-c1-lead', company: 'Estudio C1', address: 'Madrid',
              email: 'contacto@example.test', segment: 'Arquitectos', status: 'Pendiente',
              date: '2026-10-01T00:00:00.000Z',
              commercialContactPolicy: {
                legalBasisStatus: 'allowed_for_purpose',
                channels: { email: { verified: true, sourceId: 'browser-fixture' } }
              }
            }];
            const browserIdentity = CommercialCommunications.deriveIdentities({
              lead: leads[0], channel: 'email', target: leads[0].email, purpose: 'b2b_prospecting'
            });
            Object.assign(leads[0].commercialContactPolicy.channels.email, {
              target: CommercialCommunications.normalizeTarget('email', leads[0].email),
              contactId: browserIdentity.contactId,
              purpose: 'b2b_prospecting'
            });
            let externalOpenCount = 0;
            const prepared = await prepareCommercialMessageAndOpen({
              lead: leads[0], channel: 'email', target: leads[0].email,
              subject: 'Prueba C1', body: 'Contenido revisado', purpose: 'b2b_prospecting', externalClient: 'mock_outlook',
              openExternal: () => { externalOpenCount += 1; return true; }
            });
            const afterOpen = getConfirmedCommercialHistory().length;
            const statusAfterOpen = leads[0].status;
            await confirmCommercialSend(prepared.record.id, {
              method: 'manual_explicit', confirmationId: 'browser-c1-confirmation'
            });
            await confirmCommercialSend(prepared.record.id, {
              method: 'manual_explicit', confirmationId: 'browser-c1-confirmation'
            });
            const changedTarget = await prepareCommercialMessageAndOpen({
              lead: leads[0], channel: 'email', target: 'otro@empresa.test',
              subject: 'Destino distinto', body: 'No debe abrirse', purpose: 'b2b_prospecting', externalClient: 'mock_outlook',
              openExternal: () => { externalOpenCount += 1; return true; }
            });
            const originalWindowOpen = window.open;
            const popupEvents = [];
            window.open = (url, target) => ({
              closed: false,
              url,
              target,
              close() { this.closed = true; popupEvents.push('closed'); }
            });
            const reservedPopup = reserveCommercialExternalWindow();
            const popupReservedDuringUserGesture = !!reservedPopup && !reservedPopup.closed;
            await Promise.resolve();
            const popupSurvivedAsyncBoundary = !!reservedPopup && !reservedPopup.closed;
            if (reservedPopup && !reservedPopup.closed) reservedPopup.close();
            window.open = originalWindowOpen;
            return {
              apiAvailable: typeof CommercialCommunications === 'object',
              opened: prepared.opened,
              externalOpenCount,
              pendingState: prepared.record.stateHistory.some(item => item.state === 'PENDING_SEND_CONFIRMATION'),
              afterOpen,
              statusAfterOpen,
              afterConfirm: getConfirmedCommercialHistory().length,
              confirmedTransitions: prepared.record.stateHistory.filter(item => item.state === 'SENT_CONFIRMED').length,
              changedTargetOpened: changedTarget.opened,
              changedTargetReason: changedTarget.reason,
              popupReservedDuringUserGesture,
              popupSurvivedAsyncBoundary,
              popupOpenedAboutBlank: reservedPopup?.url === 'about:blank' && reservedPopup?.target === '_blank',
              finalLeadStatus: leads[0].status,
              errors: window.__browserAudit.errors.slice()
            };
          } finally {
            window.confirm = originalConfirm;
          }
        })()`,
      });
      if (commercial.exceptionDetails) throw new Error(commercial.exceptionDetails.exception?.description || commercial.exceptionDetails.text || 'Commercial browser evaluation failed');
      const result = commercial.result.value;
      assert.strictEqual(result.apiAvailable, true);
      assert.strictEqual(result.opened, true);
      assert.strictEqual(result.externalOpenCount, 1);
      assert.strictEqual(result.pendingState, true);
      assert.strictEqual(result.afterOpen, 0);
      assert.strictEqual(result.statusAfterOpen, 'Pendiente');
      assert.strictEqual(result.afterConfirm, 1);
      assert.strictEqual(result.confirmedTransitions, 1);
      assert.strictEqual(result.changedTargetOpened, false);
      assert.strictEqual(result.changedTargetReason, 'AUTHORIZATION_TARGET_MISMATCH');
      assert.strictEqual(result.popupReservedDuringUserGesture, true);
      assert.strictEqual(result.popupSurvivedAsyncBoundary, true);
      assert.strictEqual(result.popupOpenedAboutBlank, true);
      assert.strictEqual(result.finalLeadStatus, 'Contactado');
      assert.deepEqual(result.errors, []);
      console.log(JSON.stringify({ cpuThrottlingRate: 4, externalHttpsBlocked: true, ...result }, null, 2));
      console.log('browser-commercial-communications OK');
      return;
    }

    const evaluated = await client.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        window.alert = () => {};
        window.confirm = () => false;
        if (typeof leads === 'undefined') window.leads = [];
        const startupLongTasks = window.__browserAudit.longTasks.slice();
        window.__browserAudit.longTasks.length = 0;
        const makeResults = (items, status = 'SUCCESS_WITH_RESULTS') => {
          const list = items.slice();
          list.__placesDiagnostics = { status, provider: 'browser_fixture' };
          return list;
        };
        localStorage.setItem('gordi_zero_cost_google_places_hard_quota_confirmed', 'true');
        localStorage.setItem('gordi_zero_cost_allow_google_places', 'true');
        const googleAllowed = isZeroCostProviderAllowed('google_places', 'discovery').ok;
        let progressiveCount = 0;
        const madrid = await fetchPlacesZeroCost('Dental', 'Madrid', 20, {
          freeProviderAdapters: [{ id: 'static_open_data', run: () => fetchStaticOpenDataBusinesses('Dental', 'Madrid', 20) }],
          onPartialResults(items) { progressiveCount = Math.max(progressiveCount, items.length); },
        });
        let remoteAdapterCalls = 0;
        const localFirst = await fetchPlacesZeroCost('Dental', 'Madrid', 20, {
          returnAfterLocalResults: true,
          freeProviderAdapters: [
            { id: 'static_open_data', run: async () => makeResults(madrid.slice(0, 1)) },
            { id: 'osm_overpass', run: async () => { remoteAdapterCalls++; return makeResults([]); } },
          ],
        });
        let aiBlockedCode = '';
        try {
          await VoltflowAIGateway.requestGemini('gemini-2.0-flash', 'synthetic-key', {}, { purpose: 'browser_test' });
        } catch (error) {
          aiBlockedCode = error?.code || '';
        }
        const dibaFixture = VoltflowBusinessProviders.normalizeDibaElement({
          id: 'cens-0819230008-868',
          nom_comercial: 'GESTORIA JORBA',
          rao_social_nom: 'GESTORIA ASSESSORIA JORBA SL',
          descripcio_activitat: 'Gestor administratiu',
          descripcio_nace: 'Administrative and support service activities',
          adreca: {
            adreca_completa: 'C FONT BARRERA 3, BAIXOS, 08251 SANTPEDOR',
            localitzacio: '41.7838067,1.8387808',
            codi_postal: '08251',
            nom_municipi: 'SANTPEDOR'
          }
        }, { segment: 'Gestorias' });
        const barcelona = await fetchPlacesZeroCost('Gestorias', 'Barcelona', 20, {
          freeProviderAdapters: [{ id: 'static_open_data', run: async () => makeResults([dibaFixture]) }],
        });
        const networkFailure = makeResults([], 'NETWORK_ERROR');
        const confirmedEmpty = makeResults([], 'SUCCESS_EMPTY');
        const failed = await fetchPlacesZeroCost('Dental', 'Madrid', 20, {
          freeProviderAdapters: [
            { id: 'osm_overpass', run: async () => networkFailure },
            { id: 'static_open_data', run: async () => confirmedEmpty },
          ],
        });
        const separate = deduplicateResults([
          { name: 'Consultorio Uno', phone: '916111111', address: 'Calle Uno 3, Madrid', provenance: [{ provider: 'osm_overpass' }] },
          { name: 'Consultorio Dos', phone: '916111111', address: 'Calle Dos 7, Madrid', provenance: [{ provider: 'diba_gia' }] },
        ]);
        const duplicate = deduplicateResults([
          { name: 'Clinica Centro', address: 'Calle Mayor 1, Madrid', postalCode: '28013', provider: 'osm_overpass', provenance: [{ provider: 'osm_overpass' }] },
          { name: 'Clinica Centro', address: 'Calle Mayor 1, Madrid', postalCode: '28013', provider: 'static_open_data', provenance: [{ provider: 'static_open_data' }] },
        ]);
        let importCandidate = null;
        try {
          if (typeof buildLeadFromSearchCompany === 'function') importCandidate = buildLeadFromSearchCompany(madrid[0], 'Dental', 'Madrid');
        } catch {}
        let filterAccepted = false;
        try {
          if (typeof searchResultPassesFilters === 'function') filterAccepted = searchResultPassesFilters(madrid[0]);
        } catch {}
        const syntheticLead = { id: 'browser-synthetic-1', company: 'Empresa Sintetica', segment: 'Dental', status: 'Pendiente' };
        localStorage.setItem('gordi_leads', JSON.stringify([syntheticLead]));
        localStorage.setItem('gordi_search_coverage', JSON.stringify({ Madrid: { Dental: { status: 'complete' } } }));
        localStorage.setItem('gordi_gemini_key', 'legacy-synthetic-key');
        loadAllData();
        const snapshot = exportDataSnapshot();
        const persistenceLoaded = leads.some(lead => lead.id === syntheticLead.id);
        const coveragePreserved = snapshot.gordi_search_coverage === localStorage.getItem('gordi_search_coverage');
        const legacyKeyBackedUp = snapshot.gordi_gemini_key === 'legacy-synthetic-key';
        localStorage.setItem('gordi_leads', '[]');
        importDataSnapshot(snapshot, true, { reason: 'browser_synthetic_restore' });
        const restorePreservedLead = JSON.parse(localStorage.getItem('gordi_leads') || '[]').some(lead => lead.id === syntheticLead.id);
        localStorage.removeItem('gordi_gemini_key');
        const keyInput = document.getElementById('claude-key-input');
        if (keyInput) keyInput.value = 'new-session-synthetic-key';
        saveClaudeKey();
        const newAiKeySessionOnly = sessionStorage.getItem('gordi_gemini_key') === 'new-session-synthetic-key'
          && localStorage.getItem('gordi_gemini_key') === null;
        const sanitizerAvailable = typeof sanitizeAIHTML === 'function';
        const sanitized = sanitizerAvailable
          ? sanitizeAIHTML('<p onclick="steal()">Texto<strong>seguro</strong><img src=x onerror="steal()"></p><script>steal()</script>')
          : '';
        const sanitizerBlockedExecution = sanitizerAvailable
          && !/script|onerror|onclick|<img/i.test(sanitized)
          && sanitized.toLowerCase().includes('<strong>seguro</strong>');
        const started = performance.now();
        try { if (typeof showView === 'function') showView('search'); } catch {}
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const interactionMs = performance.now() - started;
        const script = document.getElementById('google-maps-script');
        return {
          title: document.title,
          madridCount: madrid.length,
          madridProgressiveCount: progressiveCount,
          localFirstCount: localFirst.length,
          remoteAdapterCalls,
          aiBlockedCode,
          defaultEnrichmentMode: document.getElementById('plan-enrich')?.value,
          barcelonaCount: barcelona.length,
          barcelonaProvider: barcelona[0]?.provider,
          mixedFailureStatus: failed.__placesDiagnostics?.status,
          distinctSharedPhoneCount: separate.length,
          trueDuplicateCount: duplicate.length,
          provenanceCount: duplicate[0]?.provenance?.length || 0,
          importCandidateValid: !!(importCandidate?.company && importCandidate?.segment),
          filterAccepted,
          persistenceLoaded,
          coveragePreserved,
          legacyKeyBackedUp,
          restorePreservedLead,
          newAiKeySessionOnly,
          diskBackupAvailable: typeof runDiskBackupNow === 'function',
          sanitizerBlockedExecution,
          googleAllowed,
          googleScriptPresent: !!script,
          interactionMs,
          startupLongTasks,
          operationLongTasks: window.__browserAudit.longTasks,
          windowErrors: window.__browserAudit.errors,
        };
      })()`,
    });
    if (evaluated.exceptionDetails) {
      const detail = evaluated.exceptionDetails;
      const description = detail.exception?.description || detail.text || 'Browser evaluation failed';
      const frames = (detail.stackTrace?.callFrames || [])
        .map(frame => `${frame.functionName || '<anonymous>'} (${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1})`)
        .join('\n');
      throw new Error(frames ? `${description}\n${frames}` : description);
    }
    const result = evaluated.result.value;
    const metrics = await client.send('Performance.getMetrics');
    const metricMap = Object.fromEntries((metrics.metrics || []).map(item => [item.name, item.value]));
    const runtimeErrors = client.events.filter(event => event.method === 'Runtime.exceptionThrown');

    if (!measureOnly) {
      assert.ok(result.madridCount >= 1, 'Madrid local index returned no data');
      assert.strictEqual(result.madridProgressiveCount, result.madridCount, 'Madrid results were not emitted progressively');
      assert.ok(result.localFirstCount >= 1, 'Local-first search returned no data');
      assert.strictEqual(result.remoteAdapterCalls, 0, 'Local-first search waited for a remote provider');
      assert.strictEqual(result.aiBlockedCode, 'AI_ZERO_COST_BLOCKED', 'AI gateway did not fail closed');
      assert.strictEqual(result.defaultEnrichmentMode, 'none', 'Slow enrichment is still selected by default');
      assert.strictEqual(result.barcelonaCount, 1, 'Barcelona DIBA fixture failed');
      assert.strictEqual(result.barcelonaProvider, 'diba_gia');
      assert.strictEqual(result.mixedFailureStatus, 'PARTIAL_WITH_ERRORS');
      assert.strictEqual(result.distinctSharedPhoneCount, 2);
      assert.strictEqual(result.trueDuplicateCount, 1);
      assert.ok(result.provenanceCount >= 2);
      assert.ok(result.importCandidateValid, 'Search result cannot be converted for import');
      assert.strictEqual(result.filterAccepted, true, 'Search result filters rejected a valid local record');
      assert.strictEqual(result.persistenceLoaded, true, 'Synthetic lead was not loaded');
      assert.strictEqual(result.coveragePreserved, true, 'Coverage was not preserved in the snapshot');
      assert.strictEqual(result.legacyKeyBackedUp, true, 'Legacy persisted key was lost from the compatible backup');
      assert.strictEqual(result.restorePreservedLead, true, 'Synthetic snapshot restore lost the lead');
      assert.strictEqual(result.newAiKeySessionOnly, true, 'A new AI key persisted beyond the session');
      assert.strictEqual(result.diskBackupAvailable, true, 'Disk backup entry point is missing');
      assert.strictEqual(result.sanitizerBlockedExecution, true, 'AI HTML sanitizer allowed executable markup');
      assert.strictEqual(result.googleAllowed, false);
      assert.strictEqual(result.googleScriptPresent, false);
      assert.strictEqual(runtimeErrors.length, 0, 'Uncaught JavaScript exceptions detected');
    }

    const report = {
      cpuThrottlingRate: 4,
      externalHttpsBlocked: true,
      ...result,
      startupLongTaskCount: result.startupLongTasks.length,
      startupMaxLongTaskMs: result.startupLongTasks.length ? Math.max(...result.startupLongTasks) : 0,
      operationLongTaskCount: result.operationLongTasks.length,
      operationMaxLongTaskMs: result.operationLongTasks.length ? Math.max(...result.operationLongTasks) : 0,
      jsHeapUsedBytes: metricMap.JSHeapUsedSize || null,
      runtimeExceptionCount: runtimeErrors.length,
    };
    delete report.startupLongTasks;
    delete report.operationLongTasks;
    console.log(JSON.stringify(report, null, 2));
    console.log('browser-search-regression OK');
  } finally {
    if (client) client.close();
    chrome.kill();
    await new Promise(resolve => server.close(resolve));
    await delay(300);
    fs.rmSync(profilePath, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
