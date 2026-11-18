(function (root, factory) {
  const providers = root?.VoltflowBusinessProviders || (typeof require === 'function' ? require('./business-providers.js') : null);
  const api = factory(providers);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowEnrichmentC73 = api;
  if (root?.document) api.installBrowser(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (businessProviders) {
  'use strict';

  const SCHEMA = 'voltflow-enrichment-c73';
  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'gordi_enrichment_c73_v1';
  const MAX_BATCH = 10;
  const MAX_CONCURRENCY = 2;
  const TTL_MS = 30 * 86400000;
  const FIELD_NAMES = Object.freeze(['legalName', 'name', 'sector', 'postalCode', 'address', 'municipality', 'province', 'website', 'email', 'phone', 'contactName', 'contactRole']);
  const FIELD_LABELS = Object.freeze({ legalName: 'Razon social', name: 'Nombre comercial', sector: 'Sector', postalCode: 'Codigo postal', address: 'Direccion', municipality: 'Municipio', province: 'Provincia', website: 'Web', email: 'Email profesional', phone: 'Telefono profesional', contactName: 'Persona de contacto', contactRole: 'Cargo' });
  const SOURCE_TRUST = Object.freeze({ corporate_website: 'A', official_registry: 'A', madrid_open_data_static: 'A', static_open_data: 'B', osm_overpass: 'B', diba_gia: 'B', overture_places_static: 'B', foursquare_os_places_static: 'B', geofabrik_osm_static: 'B', alltheplaces_static: 'B', synthetic_test: 'B' });
  const INTEGRATIONS = Object.freeze([
    { id: 'gemini', category: 'ai', name: 'Gemini Free', key: true, operational: true, state: 'pending_verification', note: 'Requiere clave y autorizacion explicita por sesion; la facturacion de la cuenta no se verifica localmente.' },
    { id: 'groq', category: 'ai', name: 'Groq Free', key: true, operational: true, state: 'pending_verification', note: 'Solo modelos permitidos y autorizacion de sesion.' },
    { id: 'openrouter', category: 'ai', name: 'OpenRouter Free', key: true, operational: true, state: 'pending_verification', note: 'Solo modelos :free permitidos; disponibilidad variable.' },
    { id: 'static_open_data', category: 'business_data', name: 'Indices locales abiertos', key: false, operational: true, state: 'configured', note: 'Disponible donde existe una particion incluida y validada.' },
    { id: 'madrid_open_data_static', category: 'business_data', name: 'Madrid Open Data', key: false, operational: true, state: 'configured', note: 'Indice piloto local; cobertura municipal y no exhaustiva.' },
    { id: 'osm_overpass', category: 'business_data', name: 'OpenStreetMap / Overpass', key: false, operational: true, state: 'disabled', note: 'Fuente de red opcional; no se usa automaticamente en enriquecimiento C7.3.' },
    { id: 'diba_gia', category: 'business_data', name: 'DIBA GIA', key: false, operational: false, state: 'blocked_security', note: 'Cuarentena geografica E2; no se activa.' },
    { id: 'overture_places_static', category: 'business_data', name: 'Overture Places', key: false, operational: false, state: 'not_available', note: 'Requiere ETL y particiones auditadas.' },
    { id: 'foursquare_os_places_static', category: 'business_data', name: 'Foursquare OS Places', key: true, operational: false, state: 'not_available', note: 'Token solo para ETL offline; no se solicita en GitHub Pages.' },
    { id: 'geofabrik_osm_static', category: 'business_data', name: 'Geofabrik', key: false, operational: false, state: 'not_available', note: 'Requiere ETL; misma base OSM.' },
    { id: 'alltheplaces_static', category: 'business_data', name: 'AllThePlaces', key: false, operational: false, state: 'not_available', note: 'Requiere corpus y revision de procedencia.' },
    { id: 'google_places', category: 'business_data', name: 'Google Places', key: true, operational: false, state: 'blocked_cost', note: 'Requiere facturacion; bloqueado por ZERO_COST_MODE.' },
    { id: 'hunter', category: 'contact_verification', name: 'Hunter.io', key: true, operational: false, state: 'blocked_cost', note: 'Codigo heredado; gratuidad de cuenta no verificable localmente.' },
    { id: 'apollo', category: 'contact_verification', name: 'Apollo.io', key: true, operational: false, state: 'blocked_cost', note: 'Codigo heredado; no se activa automaticamente.' },
    { id: 'outlook_manual', category: 'communications', name: 'Outlook manual', key: false, operational: true, state: 'configured', note: 'Abre borradores; el usuario confirma el envio real.' },
    { id: 'local_templates', category: 'internal', name: 'Plantillas locales', key: false, operational: true, state: 'configured', note: 'Fallback sin red ni IA.' },
    { id: 'encrypted_backup', category: 'internal', name: 'Backup cifrado', key: false, operational: true, state: 'configured', note: 'AES-GCM y restauracion mediante staging.' }
  ]);

  function clone(value) { return value === undefined ? undefined : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
  function clean(value, max = 500) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  function norm(value) { return clean(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function postal(value) { const result = clean(value, 10); return /^\d{5}$/.test(result) ? result : ''; }
  function domain(value) { try { return new URL(/^https?:\/\//i.test(String(value || '')) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
  function email(value) { const result = clean(value, 254).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : ''; }
  function phone(value) { const result = clean(value, 40); const digits = result.replace(/\D/g, ''); return digits.length >= 9 && digits.length <= 15 ? result : ''; }
  function date(value) { const parsed = Date.parse(value || ''); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null; }
  function hash(value) { let output = 2166136261; for (const ch of String(value || '')) { output ^= ch.charCodeAt(0); output = Math.imul(output, 16777619); } return (output >>> 0).toString(36); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function gradeRank(value) { return ({ A: 3, B: 2, C: 1 })[value] || 0; }
  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') return Object.keys(value).sort().reduce((output, key) => { output[key] = stableValue(value[key]); return output; }, {});
    return value === undefined ? null : value;
  }
  function evidenceFingerprint(value) { return hash(JSON.stringify(stableValue(value || null))); }
  function normalizedLead(lead = {}) { return { id: clean(lead.id, 180), companyId: clean(lead.commercialRefs?.companyId || lead.companyId, 180), establishmentId: clean(lead.commercialRefs?.establishmentId || lead.establishmentId, 180), contactId: clean(lead.commercialRefs?.contactId || lead.contactId, 180), recipient: email(lead.email), name: clean(lead.company || lead.name, 240), legalName: clean(lead.legalName || lead.legal_name, 240), sector: clean(lead.segment || lead.sector, 120), postalCode: postal(lead.postalCode || lead.postal_code), address: clean(lead.address, 400), municipality: clean(lead.city || lead.municipality || lead.locality, 140), province: clean(lead.province, 140), website: clean(lead.website || lead.web, 400), email: email(lead.email), phone: phone(lead.phone), contactName: clean(lead.contactName || lead.name, 180), contactRole: clean(lead.role || lead.position, 180), sourceRefs: array(lead.sourceRefs), dataEvidence: lead.dataEvidenceC73 || {} }; }

  function leadFingerprint(lead) {
    const item = normalizedLead(lead);
    return hash(JSON.stringify([item.id, item.companyId, item.establishmentId, item.contactId, item.recipient, norm(item.name), norm(item.legalName), item.postalCode, norm(item.address), domain(item.website)]));
  }
  function referenceIdentity(reference = {}) {
    const provider = clean(reference.provider || reference.source, 120);
    const recordId = clean(reference.sourceId || reference.id || reference.externalId, 200);
    return provider && recordId ? { provider, recordId } : null;
  }

  function analyzeLead(lead, options = {}) {
    const item = normalizedLead(lead); const now = Date.parse(options.now || '') || Date.now(); const staleAfter = Number(options.staleAfterMs || TTL_MS); const missing = []; const stale = [];
    for (const field of FIELD_NAMES) {
      if (!item[field]) missing.push(field);
      const checked = date(item.dataEvidence?.[field]?.checkedAt); if (item[field] && checked && now - Date.parse(checked) > staleAfter) stale.push(field);
    }
    return { leadId: item.id, companyId: item.companyId, establishmentId: item.establishmentId, missing, stale, useful: [...new Set([...missing, ...stale])], hasVerifiedEmail: !!item.email && item.dataEvidence?.email?.grade === 'A', hasPhone: !!item.phone, hasWebsite: !!item.website, needsEnrichment: missing.length > 0 || stale.length > 0 };
  }

  function identityAssessment(lead, observation = {}) {
    const item = normalizedLead(lead); const obsCompany = clean(observation.companyId, 180); const obsSite = clean(observation.establishmentId, 180);
    if (item.companyId && obsCompany && item.companyId !== obsCompany) return { level: 'conflict', reason: 'company_id_conflict' };
    if (item.establishmentId && obsSite && item.establishmentId !== obsSite) return { level: 'conflict', reason: 'establishment_id_conflict' };
    if (item.companyId && obsCompany === item.companyId && item.establishmentId && obsSite === item.establishmentId) return { level: 'strong', reason: 'canonical_ids' };
    const obsName = norm(observation.name || observation.company); const nameEqual = !!obsName && obsName === norm(item.name);
    const obsDomain = domain(observation.website || observation.web); const domainEqual = !!obsDomain && obsDomain === domain(item.website);
    const obsPostal = postal(observation.postalCode || observation.postal_code); const postalEqual = !!obsPostal && obsPostal === item.postalCode;
    const sourceMatch = array(observation.sourceRefs).some(ref => { const observed = referenceIdentity(ref); if (!observed) return false; return item.sourceRefs.some(existing => { const known = referenceIdentity(existing); return !!known && known.provider === observed.provider && known.recordId === observed.recordId; }); });
    if (sourceMatch || (nameEqual && domainEqual && postalEqual)) return { level: 'strong', reason: sourceMatch ? 'source_identifier' : 'name_domain_postal' };
    if ((nameEqual && domainEqual) || (nameEqual && postalEqual && clean(observation.address) && norm(observation.address) === norm(item.address))) return { level: 'probable', reason: 'corroborated_fields' };
    return { level: 'insufficient', reason: nameEqual ? 'name_only' : 'identity_not_proven' };
  }

  function fieldValue(observation, field) {
    const aliases = { legalName: ['legalName', 'legal_name'], name: ['name', 'company'], sector: ['sector', 'segment'], postalCode: ['postalCode', 'postal_code'], address: ['address'], municipality: ['municipality', 'city', 'locality'], province: ['province'], website: ['website', 'web'], email: ['email'], phone: ['phone'], contactName: ['contactName', 'decision_maker'], contactRole: ['contactRole', 'decision_role'] };
    const raw = aliases[field].map(key => observation[key]).find(value => value != null && value !== '');
    if (field === 'email') return email(raw); if (field === 'phone') return phone(raw); if (field === 'postalCode') return postal(raw); return clean(raw, field === 'website' || field === 'address' ? 400 : 240);
  }
  function proposalId(leadId, field, value, sourceId, sourceRecordId) { return `c73:${hash([leadId, field, value, sourceId, sourceRecordId].join('|'))}`; }
  function buildProposals(lead, observation = {}, options = {}) {
    const item = normalizedLead(lead); const identity = identityAssessment(lead, observation); const sourceId = clean(observation.provider || observation.source || 'unknown', 120); const sourceGrade = SOURCE_TRUST[sourceId] || 'C'; const checkedAt = date(observation.checkedAt || observation.observedAt || options.now) || new Date().toISOString(); const sourceUrl = clean(observation.sourceUrl || observation.url, 600); const observationRef = array(observation.sourceRefs).map(referenceIdentity).find(ref => ref?.provider === sourceId); const sourceRecordId = clean(observation.id || observation.externalId || observationRef?.recordId, 200); const concreteProvenance = sourceId !== 'unknown' && !!sourceUrl && (!!sourceRecordId || identity.reason === 'canonical_ids'); const expectedLeadFingerprint = leadFingerprint(lead); const sourceFingerprint = hash(JSON.stringify([sourceId, sourceRecordId, sourceUrl])); const proposals = [];
    for (const field of FIELD_NAMES) {
      const value = fieldValue(observation, field); if (!value) continue;
      let grade = 'C';
      if (identity.level === 'strong') grade = sourceGrade === 'A' && !concreteProvenance ? 'B' : sourceGrade;
      else if (identity.level === 'probable' && sourceGrade !== 'C') grade = 'B';
      if ((field === 'contactName' || field === 'contactRole') && sourceGrade !== 'A') grade = grade === 'C' ? 'C' : 'B';
      proposals.push({ proposalId: proposalId(lead.id, field, value, sourceId, sourceRecordId), leadId: String(lead.id), companyId: item.companyId || null, establishmentId: item.establishmentId || null, contactId: item.contactId || null, recipient: item.recipient || null, expectedLeadFingerprint, expectedFieldValue: item[field] || '', expectedFieldEvidenceFingerprint: evidenceFingerprint(item.dataEvidence?.[field]), field, value, grade, identityLevel: identity.level, identityReason: identity.reason, provider: sourceId, sourceUrl: sourceUrl || null, sourceRecordId: sourceRecordId || null, sourceFingerprint, checkedAt, applicable: grade !== 'C' });
    }
    return { identity, proposals };
  }

  function applyProposals(lead, proposals, approvals = {}) {
    const current = normalizedLead(lead); const currentFingerprint = leadFingerprint(lead); const next = clone(lead); next.dataEvidenceC73 = { ...(next.dataEvidenceC73 || {}) }; const applied = []; const rejected = [];
    const selected = [];
    for (const proposal of array(proposals)) {
      if (proposal.grade === 'C' || approvals[proposal.proposalId] !== true) { rejected.push({ proposalId: proposal.proposalId, reason: proposal.grade === 'C' ? 'not_applicable' : 'human_confirmation_required' }); continue; }
      const identityChanged = String(proposal.leadId) !== String(current.id) || (proposal.companyId || null) !== (current.companyId || null) || (proposal.establishmentId || null) !== (current.establishmentId || null) || (proposal.contactId || null) !== (current.contactId || null) || (proposal.recipient || null) !== (current.recipient || null) || !proposal.expectedLeadFingerprint || proposal.expectedLeadFingerprint !== currentFingerprint;
      const sourceChanged = !proposal.provider || !proposal.sourceFingerprint || proposal.sourceFingerprint !== hash(JSON.stringify([proposal.provider, proposal.sourceRecordId || '', proposal.sourceUrl || '']));
      const fieldValueChanged = !Object.hasOwn(proposal, 'expectedFieldValue') || proposal.expectedFieldValue !== (current[proposal.field] || '');
      const fieldEvidenceChanged = !proposal.expectedFieldEvidenceFingerprint || proposal.expectedFieldEvidenceFingerprint !== evidenceFingerprint(current.dataEvidence?.[proposal.field]);
      if (identityChanged || sourceChanged || fieldValueChanged || fieldEvidenceChanged) {
        rejected.push({ proposalId: proposal.proposalId, reason: identityChanged ? 'stale_lead_identity' : sourceChanged ? 'invalid_source_identity' : fieldValueChanged ? 'stale_field_value' : 'stale_field_evidence' });
        continue;
      }
      selected.push(proposal);
    }
    if (selected.length !== array(proposals).filter(proposal => proposal.grade !== 'C' && approvals[proposal.proposalId] === true).length) {
      for (const proposal of selected) rejected.push({ proposalId: proposal.proposalId, reason: 'atomic_batch_rejected' });
      return { lead: clone(lead), applied, rejected };
    }
    for (const proposal of selected) {
      const prior = next.dataEvidenceC73[proposal.field];
      if (prior && gradeRank(prior.grade) > gradeRank(proposal.grade)) { rejected.push({ proposalId: proposal.proposalId, reason: 'higher_evidence_preserved' }); continue; }
      const target = ({ name: 'company', sector: 'segment', municipality: 'city', contactName: 'name', contactRole: 'role' })[proposal.field] || proposal.field;
      next[target] = proposal.value;
      next.dataEvidenceC73[proposal.field] = { grade: proposal.grade, provider: proposal.provider, sourceUrl: proposal.sourceUrl, sourceRecordId: proposal.sourceRecordId, checkedAt: proposal.checkedAt, proposalId: proposal.proposalId };
      applied.push(proposal);
    }
    next.enrichSource = [...new Set([...(next.enrichSource || []), ...applied.map(item => item.provider)])];
    return { lead: next, applied, rejected };
  }

  function normalizeStore(value = {}) { return { schemaVersion: 1, revision: Number(value.revision || 0), records: array(value.records).slice(-2000), cache: value.cache && typeof value.cache === 'object' ? value.cache : {}, settings: { batchSize: Math.max(1, Math.min(MAX_BATCH, Number(value.settings?.batchSize || 5))), providers: { static_open_data: { enabled: value.settings?.providers?.static_open_data?.enabled !== false, priority: 1 } } } }; }
  function readStore(storage) { try { return normalizeStore(JSON.parse(storage?.getItem?.(STORAGE_KEY) || '{}')); } catch { return normalizeStore(); } }
  function cacheKey(lead, provider) { const item = normalizedLead(lead); return `${provider}:${item.companyId || item.id}:${item.establishmentId || 'none'}:${hash([item.name, item.postalCode, domain(item.website)].join('|'))}`; }
  function cached(store, lead, provider, now = Date.now()) { const item = store.cache[cacheKey(lead, provider)]; return item && now - Date.parse(item.checkedAt || 0) < TTL_MS ? clone(item) : null; }
  function recordCache(store, lead, provider, value, now) { const next = normalizeStore(store); next.cache[cacheKey(lead, provider)] = { ...clone(value), checkedAt: date(now) || new Date().toISOString() }; const keys = Object.keys(next.cache); if (keys.length > 1000) keys.sort((a, b) => Date.parse(next.cache[b].checkedAt) - Date.parse(next.cache[a].checkedAt)).slice(1000).forEach(key => delete next.cache[key]); next.revision += 1; return next; }
  function createBatch(leads, selectedIds) { const ids = new Set(array(selectedIds).map(String)); const selected = array(leads).filter(lead => ids.has(String(lead.id))).slice(0, MAX_BATCH); return { selected, rejectedCount: Math.max(0, ids.size - selected.length), batchId: `c73-batch:${hash(selected.map(item => item.id).join('|'))}` }; }

  async function runBatch(batch, adapters, options = {}) {
    const queue = array(batch?.selected); const output = []; let cursor = 0; const signal = options.signal;
    async function worker() {
      while (cursor < queue.length) {
        if (signal?.aborted) throw Object.assign(new Error('C73_CANCELLED'), { name: 'AbortError' });
        const lead = queue[cursor++]; const analysis = analyzeLead(lead, options); const observations = [];
        for (const providerId of options.providerPriority || ['static_open_data']) {
          if (signal?.aborted) throw Object.assign(new Error('C73_CANCELLED'), { name: 'AbortError' });
          if (providerId !== 'static_open_data' || typeof adapters?.[providerId] !== 'function') continue;
          const value = await adapters[providerId](lead, { signal, analysis }); array(value).forEach(item => observations.push({ ...item, provider: item.provider || providerId }));
        }
        const proposals = observations.flatMap(observation => buildProposals(lead, observation, options).proposals);
        output.push({ batchId: batch.batchId, leadId: String(lead.id), analysis, observations, proposals });
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length || 1) }, worker));
    return { batchId: batch.batchId, results: output.sort((a, b) => a.leadId.localeCompare(b.leadId)), completed: output.length, externalRequests: 0 };
  }

  function integrationSnapshot(browser) {
    const gatewayStatus = browser?.VoltflowAIGateway?.status?.() || {};
    return INTEGRATIONS.map(item => {
      if (!['gemini', 'groq', 'openrouter'].includes(item.id)) {
        const legacyKey = ({ google_places: 'gordi_api_key', hunter: 'gordi_hunter_key', apollo: 'gordi_apollo_key' })[item.id];
        return { ...item, configured: legacyKey ? !!(browser?.sessionStorage?.getItem(legacyKey) || browser?.localStorage?.getItem(legacyKey)) : item.state === 'configured', connected: false };
      }
      const status = gatewayStatus[item.id] || {}; return { ...item, configured: !!status.configured, connected: !!status.ok, state: status.ok ? 'configured' : status.configured ? 'pending_verification' : 'not_configured', lastError: status.telemetry?.lastError || null };
    });
  }

  function installBrowser(browser) {
    let tab = 'integrations'; let pendingRows = []; let previews = []; let controller = null; let runtimeStore = null;
    const node = (tag, className, value) => { const el = browser.document.createElement(tag); if (className) el.className = className; if (value != null) el.textContent = String(value); return el; };
    const statusLabel = value => ({ configured: 'CONFIGURADO', not_configured: 'NO CONFIGURADO', disabled: 'DESACTIVADO', pending_verification: 'PENDIENTE DE VERIFICACION', blocked_cost: 'BLOQUEADO POR COSTE', blocked_security: 'BLOQUEADO POR SEGURIDAD', error: 'ERROR DE SERVICIO', not_available: 'NO DISPONIBLE' })[value] || value;
    async function staticAdapter(lead) {
      runtimeStore ||= readStore(browser.localStorage);
      const prior = cached(runtimeStore, lead, 'static_open_data'); if (prior) return array(prior.observations);
      if (array(browser.__c73MockObservations).length) return browser.__c73MockObservations.filter(item => !item.leadId || String(item.leadId) === String(lead.id));
      if (!businessProviders?.searchStaticIndexes) return [];
      const item = normalizedLead(lead); if (!item.postalCode) return [];
      const result = await businessProviders.searchStaticIndexes({ location: item.postalCode, segment: item.sector, maxResults: 25 });
      const observations = array(result.records).filter(record => identityAssessment(lead, record).level !== 'conflict'); runtimeStore = recordCache(runtimeStore, lead, 'static_open_data', { observations }, new Date().toISOString()); return observations;
    }
    function localLeads() {
      if (array(browser.leads).length) return browser.leads;
      try { return array(JSON.parse(browser.localStorage?.getItem('gordi_leads') || '[]')); } catch { return []; }
    }
    async function authoritativeLeads() {
      await browser.VoltflowStorage?.waitForIdle?.();
      const loaded = await browser.VoltflowStorage?.loadAll?.();
      return array(loaded?.leads).length || loaded?.leads ? array(loaded.leads) : localLeads();
    }
    function candidateLeads() {
      const ids = new Set(pendingRows.flatMap(row => row.leadIds || [])); return localLeads().filter(lead => ids.size ? ids.has(String(lead.id)) : analyzeLead(lead).needsEnrichment).slice(0, 100);
    }
    function renderIntegrations(host) {
      const groups = [['ai','Inteligencia artificial'],['business_data','Fuentes de busqueda y datos'],['contact_verification','Enriquecimiento y contactos'],['communications','Correo y comunicaciones'],['internal','Servicios internos']];
      for (const [id, label] of groups) { const section = node('section','c73-section'); section.append(node('h2','',label)); const grid=node('div','c73-integration-grid'); integrationSnapshot(browser).filter(item=>item.category===id).forEach(item=>{const card=node('article','c73-integration-card');const top=node('div','c73-card-head');top.append(node('strong','',item.name),node('span',`c73-state is-${item.state}`,statusLabel(item.state)));const meta=node('p','',item.note);const details=node('dl','c73-details');[['API key',item.key?'Necesaria':'No necesaria'],['Configuracion',item.configured?'Detectada':'No detectada'],['Conexion',item.connected?'Autorizada en esta sesion':'No comprobada']].forEach(([a,b])=>{details.append(node('dt','',a),node('dd','',b));});card.append(top,meta,details);if(['gemini','groq','openrouter'].includes(item.id)){const manage=node('button','btn-outline','Gestionar IA');manage.type='button';manage.onclick=()=>{tab='ai';render();};card.append(manage);}if(['google_places','hunter','apollo'].includes(item.id)&&item.configured){const remove=node('button','btn-outline','Eliminar credencial heredada');remove.type='button';remove.onclick=()=>{if(!browser.confirm('Eliminar esta credencial de sesion y almacenamiento persistente?'))return;const key=({google_places:'gordi_api_key',hunter:'gordi_hunter_key',apollo:'gordi_apollo_key'})[item.id];browser.localStorage.removeItem(key);browser.sessionStorage.removeItem(key);render();};card.append(remove);}grid.append(card);});section.append(grid);host.append(section); }
    }
    async function applyPreview(result, card) {
      const approvals = {}; card.querySelectorAll('input[data-proposal-id]:checked').forEach(input => { approvals[input.dataset.proposalId] = true; });
      const coordinator = browser.VoltflowWriteCoordinator; let token = null; let baseline = null; let merged = null;
      try {
        await browser.VoltflowStorage?.waitForIdle?.();
        if (coordinator?.acquireExclusive) token = await coordinator.acquireExclusive('c73-apply-proposals');
        baseline = await authoritativeLeads();
        const index = baseline.findIndex(item => String(item.id) === result.leadId);
        if (index < 0) throw new Error('C73_LEAD_NOT_FOUND');
        merged = applyProposals(baseline[index], result.proposals, approvals);
        if (!merged.applied.length) {
          const stale = merged.rejected.some(item => ['stale_lead_identity', 'invalid_source_identity', 'stale_field_value', 'stale_field_evidence', 'atomic_batch_rejected'].includes(item.reason));
          browser.showToast?.(stale ? 'La ficha, el campo o su procedencia cambiaron. Revisa los datos de nuevo.' : 'No hay propuestas aprobadas para aplicar');
          return;
        }
        if (token && coordinator.hasContention?.(token)) throw new Error('C73_CONCURRENT_WRITE_REVIEW_REQUIRED');
        const nextLeads = baseline.slice(); nextLeads[index] = merged.lead;
        await browser.persistCriticalData('gordi_leads', nextLeads, { label: 'enriquecimiento C7.3', coordinationToken: token });
        if (token && coordinator.hasContention?.(token)) {
          await browser.persistCriticalData('gordi_leads', baseline, { label: 'rollback enriquecimiento C7.3', coordinationToken: token });
          throw new Error('C73_CONCURRENT_WRITE_REVIEW_REQUIRED');
        }
        if (token) { coordinator.release(token); token = null; }
        browser.leads = nextLeads;
        for (const item of merged.applied) await browser.recordCommercialMemoryEvent?.(merged.lead, 'note_added', { text: `C7.3: ${FIELD_LABELS[item.field]} actualizado con evidencia ${item.grade} de ${item.provider}` }, { idempotencyKey: `c73:${item.proposalId}`, sourceRef: 'enrichment-c73' });
        let store = readStore(browser.localStorage); store.records.push({ batchId: result.batchId, leadId: result.leadId, applied: merged.applied.map(item => item.proposalId), at: new Date().toISOString() }); store.revision += 1;
        await browser.persistCriticalData(STORAGE_KEY, normalizeStore(store), { label: 'registro enriquecimiento C7.3' });
        browser.loadAllData?.(); browser.showToast?.(`${merged.applied.length} datos actualizados`); previews = previews.filter(item => item.leadId !== result.leadId); render();
      } catch (error) {
        browser.showToast?.(error.message === 'C73_CONCURRENT_WRITE_REVIEW_REQUIRED' ? 'Otra pestana modifico los datos. La propuesta no se aplico; revisa de nuevo.' : `No se pudo aplicar: ${error.message}`);
      } finally {
        if (token) { try { coordinator.release(token); } catch {} }
      }
    }
    function renderEnrichment(host) {
      const section=node('section','c73-section');const heading=node('div','c73-enrich-heading');heading.append(node('div','',pendingRows.length?`Zona seleccionada: ${pendingRows[0].actualPostalCode||'sin CP verificado'}`:'Enriquecimiento selectivo'),node('small','', 'Solo indices locales. Maximo 10 empresas por lote; ninguna consulta se ejecuta al arrancar.'));section.append(heading);const leads=candidateLeads();const list=node('div','c73-candidate-list');leads.slice(0,50).forEach(lead=>{const analysis=analyzeLead(lead);const row=node('label','c73-candidate');const check=node('input');check.type='checkbox';check.value=String(lead.id);check.checked=pendingRows.some(item=>array(item.leadIds).map(String).includes(String(lead.id)));const copy=node('div');copy.append(node('strong','',lead.company||lead.name||'Empresa sin nombre'),node('small','',analysis.useful.length?`Faltan o estan antiguos: ${analysis.useful.map(field=>FIELD_LABELS[field]).join(', ')}`:'Sin carencias prioritarias'));row.append(check,copy);list.append(row);});section.append(list);const actions=node('div','c73-actions');const preview=node('button','btn-primary','Revisar datos disponibles');preview.type='button';preview.onclick=async()=>{const ids=[...list.querySelectorAll('input:checked')].map(input=>input.value);const batch=createBatch(leads,ids);if(!batch.selected.length){browser.showToast?.('Selecciona entre 1 y 10 empresas');return;}controller=new AbortController();runtimeStore=readStore(browser.localStorage);preview.disabled=true;try{const result=await runBatch(batch,{static_open_data:staticAdapter},{signal:controller.signal});previews=result.results;if(runtimeStore)await browser.persistCriticalData(STORAGE_KEY,runtimeStore,{label:'cache enriquecimiento C7.3'});render();}catch(error){browser.showToast?.(error.name==='AbortError'?'Enriquecimiento cancelado':`No se pudo revisar: ${error.message}`);}finally{preview.disabled=false;}};const cancel=node('button','btn-outline','Cancelar');cancel.type='button';cancel.disabled=!controller;cancel.onclick=()=>controller?.abort();actions.append(preview,cancel);section.append(actions);
      if(previews.length){const resultList=node('div','c73-preview-list');previews.forEach(result=>{const lead=leads.find(item=>String(item.id)===result.leadId);const card=node('article','c73-preview-card');card.append(node('h3','',lead?.company||lead?.name||result.leadId));if(!result.proposals.length)card.append(node('p','c73-empty','Los indices locales no aportan campos nuevos verificables.'));result.proposals.forEach(proposal=>{const row=node('label',`c73-proposal grade-${proposal.grade}`);const check=node('input');check.type='checkbox';check.dataset.proposalId=proposal.proposalId;check.disabled=proposal.grade==='C';check.checked=proposal.grade==='A';const copy=node('div');copy.append(node('strong','',`${FIELD_LABELS[proposal.field]}: ${proposal.value}`),node('small','',`Evidencia ${proposal.grade} | ${proposal.provider} | ${proposal.identityReason}`));row.append(check,copy);card.append(row);});const apply=node('button','btn-primary','Aplicar seleccionados');apply.type='button';apply.onclick=()=>applyPreview(result,card);card.append(apply);resultList.append(card);});section.append(resultList);}host.append(section);
    }
    function render() {
      const host=browser.document.getElementById('integration-center-c73-root');if(!host)return;const legacy=browser.document.getElementById('provider-settings-c71-root');host.replaceChildren();const header=node('header','c73-header');const copy=node('div');copy.append(node('p','c73-kicker','Control central y coste cero'),node('h1','','Integraciones y servicios'),node('p','','Estado real de proveedores, credenciales y enriquecimiento selectivo.'));header.append(copy,node('span','c73-zero','ZERO_COST_MODE activo'));host.append(header);const tabs=node('div','c73-tabs');[['integrations','Integraciones'],['ai','IA y claves'],['enrichment','Mejorar datos']].forEach(([id,label])=>{const button=node('button',tab===id?'is-active':'',label);button.type='button';button.onclick=()=>{tab=id;render();};tabs.append(button);});host.append(tabs);if(tab==='integrations')renderIntegrations(host);else if(tab==='enrichment')renderEnrichment(host);else if(legacy){legacy.classList.remove('c73-compat-host');legacy.removeAttribute('aria-hidden');host.append(legacy);}if(legacy&&tab!=='ai'){legacy.classList.add('c73-compat-host');legacy.setAttribute('aria-hidden','true');host.parentNode?.append(legacy);}browser.renderProviderSettingsC71?.();
    }
    browser.renderIntegrationCenterC73=render;
    browser.openZoneEnrichmentC73=(postalCode,rowIds=[])=>{const model=browser.__postalRadarC72;const wanted=new Set(rowIds);pendingRows=array(model?.rows).filter(row=>wanted.has(row.rowId));if(!pendingRows.length&&postalCode)pendingRows=array(model?.rows).filter(row=>row.actualPostalCode===postalCode);tab='enrichment';browser.showView?.('provider-settings');render();};
    browser.addEventListener?.('storage',event=>{if([STORAGE_KEY,'gordi_ai_provider_settings_v1','gordi_leads'].includes(event.key)&&browser.document.getElementById('provider-settings-view')?.classList.contains('active'))render();});
    return {render};
  }

  return Object.freeze({ SCHEMA, SCHEMA_VERSION, STORAGE_KEY, MAX_BATCH, MAX_CONCURRENCY, TTL_MS, FIELD_NAMES, FIELD_LABELS, SOURCE_TRUST, INTEGRATIONS, normalizedLead, analyzeLead, identityAssessment, buildProposals, applyProposals, normalizeStore, readStore, cacheKey, cached, recordCache, createBatch, runBatch, integrationSnapshot, installBrowser });
});
