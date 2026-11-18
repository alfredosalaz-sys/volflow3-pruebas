(function (root, factory) {
  const api = factory(root?.CommercialCommunications || null, root?.VoltflowCommercialMemory || null);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowPostalRadarC72 = api;
  if (root?.document) api.installBrowser(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (communications, memoryApi) {
  'use strict';

  const SCHEMA = 'voltflow-postal-radar';
  const SCHEMA_VERSION = 1;
  const PLAN_KEY = 'gordi_postal_radar_plan_v1';
  const UNVERIFIED = 'UNVERIFIED';
  const PAGE_SIZE = 25;
  const OPEN_OPPORTUNITY = new Set(['identified', 'interested', 'quote_requested', 'quote_preparing', 'quote_sent', 'negotiation', 'suspended']);
  const STAGE_ORDER = Object.freeze(['searched', 'found', 'incorporated', 'reviewed', 'contacted', 'responded', 'opportunity', 'work_won']);

  function clone(value) { return value === undefined ? undefined : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
  function text(value, max = 300) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  function postal(value) { const clean = text(value, 16); return /^\d{5}$/.test(clean) ? clean : null; }
  function dateValue(value) { const parsed = Date.parse(value || ''); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null; }
  function domain(value) { try { return new URL(/^https?:\/\//i.test(String(value || '')) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
  function normalize(value) { return text(value, 400).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function hash(value) { let output = 2166136261; const source = String(value || ''); for (let i = 0; i < source.length; i += 1) { output ^= source.charCodeAt(i); output = Math.imul(output, 16777619); } return (output >>> 0).toString(36); }
  function unique(values) { return [...new Set((values || []).filter(Boolean).map(String))]; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

  function emptyMemory() {
    return { companies: {}, establishments: {}, contacts: {}, events: {}, opportunities: {}, exclusions: {}, aliases: {}, tasks: {} };
  }
  function normalizeMemory(value) {
    const source = object(value); const empty = emptyMemory();
    for (const key of Object.keys(empty)) empty[key] = object(source[key]);
    return { ...source, ...empty };
  }
  function companyKeyFromResult(result = {}) {
    const sourceId = text(result.placeId || result.sourceId || result.id, 200);
    if (sourceId) return `source:${text(result.source || result.provider || 'unknown', 80)}:${sourceId}`;
    const host = domain(result.website || result.web || '');
    const name = normalize(result.name || result.company || result.legalName || '');
    const cp = postal(result.postalCode || result.postal_code || result.postcode) || '';
    if (host && name) return `domain-name:${host}:${name}:${cp}`;
    return `observation:${hash(JSON.stringify([name, text(result.address, 300), cp, text(result.phone, 80)]))}`;
  }
  function explicitPostal(record = {}) { return postal(record.postalCode ?? record.postal_code ?? record.postcode ?? record['addr:postcode']); }
  function addressPostalHint(record = {}) { const match = text(record.address || record.formatted_address, 500).match(/(?:^|\D)(\d{5})(?:\D|$)/); return match ? match[1] : null; }
  function sectorList(record = {}, fallback) { return unique([...(array(record.matchedSectors)), record.sourceSector, record.segment, record.sector, fallback].map(item => text(item, 120))); }
  function sourceList(record = {}) { return unique([record.source, record.provider, record.discovery?.provider, ...(array(record.enrichSource))].map(item => text(item, 100))); }
  function isConfirmedCommunication(record = {}) {
    if (communications?.isSentConfirmed) return communications.isSentConfirmed(record);
    if (record.commercialState !== 'SENT_CONFIRMED' || !record.sendConfirmation || typeof record.sendConfirmation !== 'object' || Array.isArray(record.sendConfirmation)) return false;
    const confirmation = record.sendConfirmation;
    if (confirmation.method === 'manual_explicit') return !!text(confirmation.confirmedBy, 200) && !!text(confirmation.confirmationId, 300) && !!dateValue(confirmation.confirmedAt);
    if (confirmation.method === 'provider_verified') return !!text(confirmation.provider, 200) && !!text(confirmation.providerMessageId, 300) && !!dateValue(confirmation.verifiedAt);
    return false;
  }

  function planId(cp, sector) { return `postal-plan:${cp}:${normalize(sector) || 'all'}`; }
  function normalizePlan(item = {}) {
    const cp = postal(item.postalCode || item.cp); const sector = text(item.sector || 'Todos', 120);
    if (!cp || !sector) return null;
    return {
      planId: planId(cp, sector), postalCode: cp, sector,
      municipality: text(item.municipality, 120) || null, province: text(item.province, 120) || null,
      priority: ['high', 'normal', 'low'].includes(item.priority) ? item.priority : 'normal',
      status: ['pending', 'completed', 'dismissed'].includes(item.status) ? item.status : 'pending',
      note: text(item.note, 500), createdAt: dateValue(item.createdAt) || new Date().toISOString(), updatedAt: dateValue(item.updatedAt) || new Date().toISOString()
    };
  }
  function readPlans(storage) { try { return array(JSON.parse(storage?.getItem?.(PLAN_KEY) || '[]')).map(normalizePlan).filter(Boolean).slice(0, 1000); } catch { return []; } }
  function upsertPlan(plans, item, now) {
    const plan = normalizePlan({ ...item, updatedAt: now || new Date().toISOString() });
    if (!plan) return { ok: false, reason: 'invalid_postal_or_sector', plans: array(plans).map(normalizePlan).filter(Boolean) };
    const existing = array(plans).map(normalizePlan).filter(Boolean).find(entry => entry.planId === plan.planId);
    plan.createdAt = existing?.createdAt || plan.createdAt;
    return { ok: true, plan, plans: [plan, ...array(plans).map(normalizePlan).filter(Boolean).filter(entry => entry.planId !== plan.planId)].slice(0, 1000) };
  }

  function collectSearchObservations(input) {
    const observations = []; const add = item => { if (item?.postalCode) observations.push(item); };
    array(input.coverageEntries).forEach((entry, index) => { const cp = postal(entry.location || entry.postalCode); if (cp) add({ id: `coverage-entry:${entry.key || index}`, postalCode: cp, sector: text(entry.sector || 'Desconocido', 120), at: dateValue(entry.date), status: entry.status === 'error' ? 'error' : 'completed', resultCount: Number(entry.uniqueCount ?? entry.rawCount ?? 0), source: 'coverage_entry', providerSources: array(entry.sources), error: text(entry.error, 300), evidence: 'verified' }); });
    array(input.coverageEvents).forEach((entry, index) => { const cp = postal(entry.location || entry.postalCode); if (cp) add({ id: `coverage-event:${entry.id || index}`, postalCode: cp, sector: text(entry.sector || 'Desconocido', 120), at: dateValue(entry.date), status: entry.status === 'error' || entry.type === 'error' ? 'error' : 'completed', resultCount: Number(entry.uniqueCount ?? entry.rawCount ?? 0), source: 'coverage_event', providerSources: array(entry.sources), error: text(entry.error, 300), evidence: 'verified' }); });
    array(input.savedSearches).forEach((entry, index) => { const cp = postal(entry.location || entry.postalCode || entry.query); if (cp) add({ id: `saved-search:${entry.id || index}`, postalCode: cp, sector: text(entry.segment || entry.sector || 'Desconocido', 120), at: dateValue(entry.date || entry.createdAt || entry.updatedAt), status: entry.error ? 'error' : 'completed', resultCount: array(entry.results).length || Number(entry.count || 0), source: 'saved_search', providerSources: unique(array(entry.results).flatMap(sourceList)), error: text(entry.error, 300), evidence: 'verified' }); });
    array(input.searchHistory).forEach((entry, index) => { const cp = postal(entry.location || entry.postalCode || entry.query || entry.cp); if (cp) add({ id: `search-history:${entry.id || index}`, postalCode: cp, sector: text(entry.segment || entry.sector || 'Desconocido', 120), at: dateValue(entry.date || entry.createdAt), status: entry.error ? 'error' : (entry.status || 'attempted'), resultCount: Number(entry.resultCount ?? entry.count ?? 0), source: 'search_history', providerSources: array(entry.sources), error: text(entry.error, 300), evidence: entry.status || entry.results ? 'verified' : 'inferred' }); });
    Object.values(object(input.legacyHistory)).forEach((entry, index) => { const cp = postal(entry.location || entry.postalCode); if (cp) add({ id: `legacy-search:${index}:${cp}:${text(entry.segment, 80)}`, postalCode: cp, sector: text(entry.segment || 'Desconocido', 120), at: dateValue(entry.date), status: 'attempted', resultCount: null, source: 'legacy_search_history', providerSources: [], error: '', evidence: 'inferred' }); });
    return observations;
  }

  function buildRadar(input = {}) {
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const memory = normalizeMemory(input.memory); const leads = array(input.leads); const history = array(input.emailHistory); const savedSearches = array(input.savedSearches); const plans = array(input.plans).map(normalizePlan).filter(Boolean);
    const observations = collectSearchObservations(input);
    const partialHistory = array(input.coverageEntries).length >= 500 || array(input.coverageEvents).length >= 1000 || input.historyKnownPartial === true;
    const leadById = new Map(leads.map(lead => [String(lead.id), lead]));
    const leadByPlace = new Map(); const leadByDomainName = new Map();
    for (const lead of leads) {
      if (lead.placeId) leadByPlace.set(String(lead.placeId), lead);
      const host = domain(lead.website); const name = normalize(lead.company || lead.name); if (host && name) leadByDomainName.set(`${host}:${name}`, lead);
    }
    const companySites = new Map();
    for (const establishment of Object.values(memory.establishments)) {
      if (!establishment?.companyId) continue;
      if (!companySites.has(establishment.companyId)) companySites.set(establishment.companyId, []);
      companySites.get(establishment.companyId).push(establishment);
    }
    const rows = new Map(); const ensureRow = (companyId, establishmentId, seed = {}) => {
      const key = `${companyId || 'unknown'}::${establishmentId || seed.observationId || 'unverified'}`;
      if (!rows.has(key)) rows.set(key, {
        rowId: key, companyId: companyId || null, establishmentId: establishmentId || null,
        name: seed.name || 'Empresa sin nombre', legalName: seed.legalName || null, municipality: null, province: null,
        actualPostalCode: null, postalEvidence: 'unknown', postalSource: null, postalHint: null,
        requestedPostalCodes: new Set(), sectors: new Set(), sources: new Set(), searchIds: new Set(), leadIds: new Set(), contactIds: new Set(),
        emails: new Set(), phones: new Set(), websites: new Set(),
        found: false, incorporated: false, reviewed: false, contacted: false, responded: false, excluded: false,
        opportunityIds: new Set(), openOpportunityIds: new Set(), quoteSentIds: new Set(), wonIds: new Set(),
        nextActions: [], lastActivityAt: null
      });
      const row = rows.get(key); if (seed.name && row.name === 'Empresa sin nombre') row.name = seed.name; return row;
    };
    const resolveCompanyForLead = lead => lead?.commercialRefs?.companyId || memory.aliases?.[`lead:${lead?.id}`]?.companyId || `lead:${lead?.id}`;
    const resolveEstablishmentForLead = lead => lead?.commercialRefs?.establishmentId || memory.aliases?.[`lead:${lead?.id}`]?.establishmentId || `lead-establishment:${lead?.id}`;
    const applyPostal = (row, record, source) => {
      const cp = explicitPostal(record); const hint = addressPostalHint(record);
      if (cp) { row.actualPostalCode = cp; row.postalEvidence = 'verified'; row.postalSource = source; }
      else if (!row.postalHint && hint) row.postalHint = hint;
      row.municipality ||= text(record.city || record.municipality || record.locality, 120) || null;
      row.province ||= text(record.province, 120) || null;
    };

    for (const establishment of Object.values(memory.establishments)) {
      if (!establishment?.companyId || !establishment.establishmentId) continue;
      const company = memory.companies[establishment.companyId] || {};
      const row = ensureRow(establishment.companyId, establishment.establishmentId, { name: establishment.name || company.name, legalName: company.legalName });
      row.incorporated = true; applyPostal(row, establishment, 'commercial_memory_establishment'); sectorList(company).forEach(value => row.sectors.add(value)); array(establishment.sourceRefs).forEach(ref => row.sources.add(text(ref.provider || ref.sourceId, 100)));
      array(establishment.emails).concat(establishment.email || []).forEach(value => { const item = text(value?.value || value, 254); if (item) row.emails.add(item); });
      array(establishment.phones).concat(establishment.phone || []).forEach(value => { const item = text(value?.value || value, 80); if (item) row.phones.add(item); });
      array(establishment.websites).concat(establishment.website || []).forEach(value => { const item = text(value?.value || value, 400); if (item) row.websites.add(item); });
      array(company.contactIds).forEach(id => { const contact = memory.contacts[id]; if (!contact || contact.establishmentId === establishment.establishmentId) row.contactIds.add(id); });
    }
    for (const lead of leads) {
      const companyId = resolveCompanyForLead(lead); const establishmentId = resolveEstablishmentForLead(lead); const row = ensureRow(companyId, establishmentId, { name: lead.company || lead.name });
      row.incorporated = true; row.leadIds.add(String(lead.id)); if (lead.commercialRefs?.contactId) row.contactIds.add(lead.commercialRefs.contactId);
      applyPostal(row, lead, 'crm_lead'); sectorList(lead).forEach(value => row.sectors.add(value)); sourceList(lead).forEach(value => row.sources.add(value));
      [lead.email].filter(Boolean).forEach(value => row.emails.add(text(value, 254))); [lead.phone].filter(Boolean).forEach(value => row.phones.add(text(value, 80))); [lead.website || lead.web].filter(Boolean).forEach(value => row.websites.add(text(value, 400)));
      row.reviewed ||= lead.reviewed === true || !!dateValue(lead.reviewedAt || lead.commercialReview?.reviewedAt);
      const requested = postal(lead.coverageLocation || lead.coverageMission?.location); if (requested) row.requestedPostalCodes.add(requested);
    }

    for (const search of savedSearches) {
      const requested = postal(search.location || search.postalCode || search.query); const fallbackSector = search.segment || search.sector;
      for (const result of array(search.results)) {
        const matchingLead = (result.placeId && leadByPlace.get(String(result.placeId))) || leadByDomainName.get(`${domain(result.website)}:${normalize(result.name || result.company)}`);
        const companyId = matchingLead ? resolveCompanyForLead(matchingLead) : companyKeyFromResult(result);
        const establishmentId = matchingLead ? resolveEstablishmentForLead(matchingLead) : `observation-site:${hash(JSON.stringify([companyId, explicitPostal(result), text(result.address, 300)]))}`;
        const row = ensureRow(companyId, establishmentId, { name: result.name || result.company, observationId: companyKeyFromResult(result) });
        row.found = true; if (requested) row.requestedPostalCodes.add(requested); applyPostal(row, result, 'saved_search_result');
        sectorList(result, fallbackSector).forEach(value => row.sectors.add(value)); sourceList(result).forEach(value => row.sources.add(value)); row.searchIds.add(String(search.id || `${requested}:${fallbackSector}`));
      }
    }

    const rowsByCompany = new Map();
    for (const row of rows.values()) {
      if (!rowsByCompany.has(row.companyId)) rowsByCompany.set(row.companyId, []);
      rowsByCompany.get(row.companyId).push(row);
    }
    function resolvePostalRow(companyId, establishmentId) {
      if (establishmentId) return rows.get(`${companyId}::${establishmentId}`) || null;
      const companyRows = array(rowsByCompany.get(companyId)).filter(row => row.actualPostalCode);
      return companyRows.length === 1 ? companyRows[0] : null;
    }
    for (const record of history) {
      if (!isConfirmedCommunication(record)) continue;
      const row = resolvePostalRow(record.companyId, record.establishmentId); if (!row) continue;
      row.contacted = true; if (record.contactId) row.contactIds.add(record.contactId); row.lastActivityAt = latest(row.lastActivityAt, record.sendConfirmation?.confirmedAt || record.sendConfirmation?.verifiedAt || record.updatedAt);
    }
    for (const event of Object.values(memory.events)) {
      if (!event?.companyId) continue; const row = resolvePostalRow(event.companyId, event.establishmentId); if (!row) continue;
      if (event.type === 'call_logged' && event.actor === 'user') row.contacted = true;
      if (event.type === 'response_received') row.responded = true;
      if (['lead_reviewed', 'company_reviewed', 'contact_reviewed'].includes(event.type)) row.reviewed = true;
      if (event.contactId) row.contactIds.add(event.contactId); row.lastActivityAt = latest(row.lastActivityAt, event.occurredAt);
    }
    for (const opportunity of Object.values(memory.opportunities)) {
      if (!opportunity?.companyId || !opportunity.opportunityId) continue; const row = resolvePostalRow(opportunity.companyId, opportunity.establishmentId); if (!row) continue;
      row.opportunityIds.add(opportunity.opportunityId); if (OPEN_OPPORTUNITY.has(opportunity.status)) row.openOpportunityIds.add(opportunity.opportunityId);
      if (hasOpportunityEvidence(opportunity, 'quote_sent_confirmed')) row.quoteSentIds.add(opportunity.opportunityId);
      if (opportunity.status === 'won' && hasOpportunityEvidence(opportunity, 'contract_confirmed')) row.wonIds.add(opportunity.opportunityId);
      if (opportunity.nextAction?.status === 'pending') row.nextActions.push({ opportunityId: opportunity.opportunityId, text: text(opportunity.nextAction.text, 240), dueAt: dateValue(opportunity.nextAction.dueAt) });
    }
    for (const exclusion of Object.values(memory.exclusions)) {
      if (exclusion?.active === false || !exclusion?.companyId) continue;
      for (const row of array(rowsByCompany.get(exclusion.companyId))) if (!exclusion.contactId || row.contactIds.has(exclusion.contactId)) row.excluded = true;
    }
    for (const company of Object.values(memory.companies)) {
      if (!company?.companyId) continue;
      if (company.restrictions?.doNotContact || company.commercialStatus === 'excluded') for (const row of array(rowsByCompany.get(company.companyId))) row.excluded = true;
      if (company.nextAction?.status === 'pending') for (const row of array(rowsByCompany.get(company.companyId))) row.nextActions.push({ text: text(company.nextAction.text, 240), dueAt: dateValue(company.nextAction.dueAt) });
    }

    const postalCodes = new Set([UNVERIFIED]); observations.forEach(item => postalCodes.add(item.postalCode)); plans.forEach(item => postalCodes.add(item.postalCode)); rows.forEach(row => postalCodes.add(row.actualPostalCode || UNVERIFIED));
    const cells = [...postalCodes].map(cp => buildCell(cp, rows, observations, plans, partialHistory, input.now)).sort((a, b) => a.postalCode === UNVERIFIED ? 1 : b.postalCode === UNVERIFIED ? -1 : a.postalCode.localeCompare(b.postalCode));
    const rowList = [...rows.values()].map(finalizeRow);
    const recommendation = buildRecommendations(cells, plans);
    const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
    return { schema: SCHEMA, schemaVersion: SCHEMA_VERSION, generatedAt: dateValue(input.now) || new Date().toISOString(), historyCompleteness: partialHistory ? 'partial' : 'available_not_exhaustive', retention: { coverageEntries: array(input.coverageEntries).length, coverageEvents: array(input.coverageEvents).length, entriesMayBeTruncated: array(input.coverageEntries).length >= 500, eventsMayBeTruncated: array(input.coverageEvents).length >= 1000 }, cells, rows: rowList, observations, plans, recommendations: recommendation, metrics: aggregate(cells, rowList), elapsedMs };
  }

  function latest(a, b) { const left = dateValue(a); const right = dateValue(b); if (!left) return right; if (!right) return left; return Date.parse(right) > Date.parse(left) ? right : left; }
  function hasOpportunityEvidence(opportunity, evidenceType) { return array(opportunity.history).some(item => item?.payload?.evidenceType === evidenceType); }
  function finalizeRow(row) {
    const stage = row.wonIds.size ? 'work_won' : row.opportunityIds.size ? 'opportunity' : row.responded ? 'responded' : row.contacted ? 'contacted' : row.reviewed ? 'reviewed' : row.incorporated ? 'incorporated' : row.found ? 'found' : 'incorporated';
    return { ...row, requestedPostalCodes: [...row.requestedPostalCodes], sectors: [...row.sectors], sources: [...row.sources], searchIds: [...row.searchIds], leadIds: [...row.leadIds], contactIds: [...row.contactIds], emails: [...row.emails], phones: [...row.phones], websites: [...row.websites], opportunityIds: [...row.opportunityIds], openOpportunityIds: [...row.openOpportunityIds], quoteSentIds: [...row.quoteSentIds], wonIds: [...row.wonIds], stage, stageIndex: STAGE_ORDER.indexOf(stage) };
  }
  function buildCell(cp, rowsMap, observations, plans, partialHistory, nowValue) {
    const obs = observations.filter(item => item.postalCode === cp); const actualRows = [...rowsMap.values()].filter(row => (row.actualPostalCode || UNVERIFIED) === cp); const foundRows = cp === UNVERIFIED ? [] : [...rowsMap.values()].filter(row => row.requestedPostalCodes.has(cp)); const allRows = [...new Map([...actualRows, ...foundRows].map(row => [row.rowId, row])).values()];
    const companies = list => new Set(list.map(row => row.companyId).filter(Boolean)).size; const sectors = unique([...obs.map(item => item.sector), ...allRows.flatMap(row => [...row.sectors]), ...plans.filter(item => item.postalCode === cp).map(item => item.sector)]);
    const dates = obs.map(item => item.at).filter(Boolean).sort(); const latestAt = dates.at(-1) || null; const ageDays = latestAt ? Math.max(0, Math.floor(((Date.parse(nowValue || '') || Date.now()) - Date.parse(latestAt)) / 86400000)) : null;
    const municipalities = unique(actualRows.map(row => row.municipality)); const provinces = unique(actualRows.map(row => row.province)); const successful = obs.filter(item => item.status !== 'error'); const errors = obs.filter(item => item.status === 'error');
    const foundCompanies = new Set(foundRows.map(row => row.companyId).filter(Boolean)); const outOfArea = foundRows.filter(row => row.actualPostalCode && row.actualPostalCode !== cp); const unverifiedFound = foundRows.filter(row => !row.actualPostalCode);
    return {
      postalCode: cp, municipality: municipalities.length === 1 ? municipalities[0] : municipalities.length ? 'Varios' : null, province: provinces.length === 1 ? provinces[0] : provinces.length ? 'Varias' : null,
      sectors, lastSearchAt: latestAt, ageDays, searchEvidence: obs.length ? (obs.some(item => item.evidence === 'verified') ? 'verified' : 'inferred') : 'unknown', searchAttempts: obs.length, successfulSearches: successful.length, searchErrors: errors.length, emptySearches: successful.filter(item => Number(item.resultCount) === 0).length,
      sourceLabels: unique(obs.flatMap(item => [item.source, ...item.providerSources])), dataQuality: errors.length && !successful.length ? 'error_only' : !obs.length ? 'unknown' : ageDays != null && ageDays > 30 ? 'stale' : 'current_non_exhaustive', historyPartial: partialHistory,
      found: foundCompanies.size, establishments: actualRows.length, incorporated: companies(actualRows.filter(row => row.incorporated)), reviewed: companies(actualRows.filter(row => row.reviewed)), contacted: companies(actualRows.filter(row => row.contacted)), responded: companies(actualRows.filter(row => row.responded)), openOpportunities: actualRows.reduce((sum, row) => sum + row.openOpportunityIds.size, 0), quoteSent: actualRows.reduce((sum, row) => sum + row.quoteSentIds.size, 0), won: actualRows.reduce((sum, row) => sum + row.wonIds.size, 0), exclusions: companies(actualRows.filter(row => row.excluded)), pendingReview: companies(foundRows.filter(row => !row.reviewed && !row.incorporated)), pendingContact: companies(actualRows.filter(row => row.incorporated && !row.contacted && !row.excluded)), missingEmail: actualRows.filter(row => row.emails.size === 0).length, missingPhone: actualRows.filter(row => row.phones.size === 0).length, withWebsite: actualRows.filter(row => row.websites.size > 0).length, enrichmentCandidates: actualRows.filter(row => row.emails.size === 0 || row.phones.size === 0 || row.websites.size === 0).length, outOfArea: outOfArea.length, unverifiedFound: unverifiedFound.length, rowIds: allRows.map(row => row.rowId), planItems: plans.filter(item => item.postalCode === cp)
    };
  }
  function aggregate(cells, rows) {
    const normal = cells.filter(cell => cell.postalCode !== UNVERIFIED); const companyIds = predicate => new Set(rows.filter(predicate).map(row => row.companyId).filter(Boolean)).size;
    return { postalCodes: normal.length, searchedPostalCodes: normal.filter(cell => cell.searchAttempts).length, found: companyIds(row => row.found), incorporated: companyIds(row => row.incorporated), contacted: companyIds(row => row.contacted), responded: companyIds(row => row.responded), openOpportunities: new Set(rows.flatMap(row => row.openOpportunityIds)).size, won: new Set(rows.flatMap(row => row.wonIds)).size };
  }
  function buildRecommendations(cells, plans) {
    const output = [];
    for (const cell of cells) {
      if (cell.postalCode === UNVERIFIED) continue;
      const sectors = cell.sectors.length ? cell.sectors : ['Todos'];
      for (const sector of sectors) {
        const plan = plans.find(item => item.postalCode === cell.postalCode && item.sector === sector); if (plan?.status === 'dismissed' || plan?.status === 'completed') continue;
        let score = plan ? (plan.priority === 'high' ? 50 : plan.priority === 'low' ? 20 : 35) : 0; const reasons = [];
        if (plan) reasons.push('objetivo manual pendiente');
        if (!cell.searchAttempts) { score += 30; reasons.push('sin evidencia en el historico disponible'); }
        if (cell.pendingReview) { score += Math.min(25, cell.pendingReview); reasons.push(`${cell.pendingReview} empresas por revisar`); }
        if (cell.pendingContact) { score += Math.min(25, cell.pendingContact); reasons.push(`${cell.pendingContact} empresas sin contacto confirmado`); }
        if (cell.ageDays != null && cell.ageDays > 30) { score += Math.min(20, Math.floor(cell.ageDays / 15)); reasons.push('busqueda antigua'); }
        if (cell.searchErrors && !cell.successfulSearches) { score += 15; reasons.push('ultimo historial con error'); }
        if (cell.openOpportunities) { score += 20; reasons.push(`${cell.openOpportunities} oportunidades abiertas`); }
        output.push({ postalCode: cell.postalCode, sector, score, reasons, planId: plan?.planId || null });
      }
    }
    return output.sort((a, b) => b.score - a.score || a.postalCode.localeCompare(b.postalCode)).slice(0, 100);
  }
  function filterCells(model, filters = {}) {
    const cp = text(filters.postalCode, 16); const province = normalize(filters.province); const municipality = normalize(filters.municipality); const sector = normalize(filters.sector); const state = text(filters.state, 40);
    return array(model?.cells).filter(cell => (!cp || cell.postalCode.includes(cp)) && (!province || normalize(cell.province).includes(province)) && (!municipality || normalize(cell.municipality).includes(municipality)) && (!sector || cell.sectors.some(item => normalize(item).includes(sector))) && (!state || state === 'all' || (state === 'pending' && (cell.pendingReview || cell.pendingContact)) || (state === 'responded' && cell.responded) || (state === 'opportunity' && cell.openOpportunities) || (state === 'won' && cell.won) || (state === 'error' && cell.searchErrors) || (state === 'unknown' && cell.searchEvidence === 'unknown')));
  }
  function rowsForCell(model, postalCode, options = {}) {
    const cell = array(model?.cells).find(item => item.postalCode === postalCode); if (!cell) return { total: 0, page: 0, pages: 0, rows: [] };
    const byId = new Map(array(model.rows).map(row => [row.rowId, row])); const all = cell.rowIds.map(id => byId.get(id)).filter(Boolean).sort((a, b) => b.stageIndex - a.stageIndex || a.name.localeCompare(b.name, 'es')); const size = Math.max(1, Math.min(100, Number(options.pageSize || PAGE_SIZE))); const pages = Math.max(1, Math.ceil(all.length / size)); const page = Math.max(0, Math.min(pages - 1, Number(options.page || 0)));
    return { total: all.length, page, pages, rows: all.slice(page * size, (page + 1) * size) };
  }

  function installBrowser(browser) {
    let model = null; let page = 0; let activePostal = null; let detailPage = 0; let timer = null;
    let lastPlanRaw = browser.localStorage?.getItem(PLAN_KEY) || '';
    const filterState = { postalCode: '', province: '', municipality: '', sector: '', state: 'all' };
    const updates = typeof browser.BroadcastChannel === 'function' ? new browser.BroadcastChannel('voltflow-postal-radar-c72') : null;
    const node = (tag, className, value) => { const element = browser.document.createElement(tag); if (className) element.className = className; if (value != null) element.textContent = String(value); return element; };
    const parse = (key, fallback) => { try { const value = JSON.parse(browser.localStorage.getItem(key) || JSON.stringify(fallback)); return value; } catch { return fallback; } };
    async function collect() {
      const memory = browser.getCommercialMemorySnapshot ? await browser.getCommercialMemorySnapshot() : parse('gordi_commercial_memory', {});
      return buildRadar({ coverageEntries: parse('gordi_search_coverage', []), coverageEvents: parse('gordi_coverage_events', []), savedSearches: parse('gordi_saved_searches', []), searchHistory: Array.isArray(browser.searchHistoryList) ? browser.searchHistoryList : parse('gordi_search_history', []), legacyHistory: parse('voltium_search_history', {}), leads: Array.isArray(browser.leads) ? browser.leads : parse('gordi_leads', []), emailHistory: Array.isArray(browser.emailHistory) ? browser.emailHistory : parse('gordi_email_history', []), campaigns: Array.isArray(browser.campaigns) ? browser.campaigns : parse('gordi_campaigns', []), memory, plans: readPlans(browser.localStorage) });
    }
    function filters() { return { ...filterState }; }
    function badge(label, value) { const item = node('div', 'c72-kpi'); item.append(node('span', '', label), node('strong', '', value)); return item; }
    function renderDetail(host) {
      if (!activePostal) return; const result = rowsForCell(model, activePostal, { page: detailPage }); const cell = model.cells.find(item => item.postalCode === activePostal); const section = node('section', 'c72-detail'); const header = node('header'); const heading = node('div'); heading.append(node('strong', '', `${activePostal === UNVERIFIED ? 'SIN CP VERIFICADO' : activePostal} - ${result.total} registros`), node('small', '', `${cell?.missingEmail || 0} sin email | ${cell?.missingPhone || 0} sin telefono | ${cell?.withWebsite || 0} con web`)); const controls = node('div', 'c72-detail-controls'); const enrich = node('button', 'btn-primary', 'Mejorar datos de esta zona'); enrich.type = 'button'; enrich.disabled = !cell?.enrichmentCandidates || typeof browser.openZoneEnrichmentC73 !== 'function'; enrich.onclick = () => browser.openZoneEnrichmentC73(activePostal, cell.rowIds); const close = node('button', 'btn-icon', 'Cerrar'); close.type = 'button'; close.onclick = () => { activePostal = null; renderCurrent(); }; controls.append(enrich, close); header.append(heading, controls); section.append(header);
      const list = node('div', 'c72-company-list');
      for (const row of result.rows) { const item = node('article', 'c72-company-row'); const title = node('div', 'c72-company-title'); title.append(node('strong', '', row.name), node('small', '', row.actualPostalCode ? `CP verificado ${row.actualPostalCode}` : row.postalHint ? `CP ${row.postalHint} solo como indicio` : 'Sin CP verificado')); const stages = node('div', 'c72-company-stages'); ['found','incorporated','contacted','responded','opportunity','work_won'].forEach(stage => stages.append(node('span', row.stageIndex >= STAGE_ORDER.indexOf(stage) ? 'is-done' : '', stageLabel(stage)))); const meta = node('div', 'c72-company-meta', `${row.sectors.join(', ') || 'Sector desconocido'} | ${row.sources.join(', ') || 'Procedencia no documentada'}`); const action = node('div', 'c72-company-action', row.excluded ? 'No contactar' : row.nextActions[0]?.text || (row.incorporated && !row.contacted ? 'Revisar condicion legal y preparar contacto' : row.found && !row.incorporated ? 'Revisar e incorporar si procede' : 'Sin accion documentada')); item.append(title, stages, meta, action); list.append(item); }
      if (!result.rows.length) list.append(node('p', 'c72-empty', 'No hay empresas asignables a este CP con la evidencia disponible.')); section.append(list);
      const pager = node('div', 'c72-pager'); const prev = node('button', 'btn-outline', 'Anterior'); prev.disabled = result.page <= 0; prev.onclick = () => { detailPage -= 1; renderCurrent(); }; const count = node('span', '', `Pagina ${result.page + 1} de ${result.pages}`); const next = node('button', 'btn-outline', 'Siguiente'); next.disabled = result.page + 1 >= result.pages; next.onclick = () => { detailPage += 1; renderCurrent(); }; pager.append(prev, count, next); section.append(pager); host.append(section);
    }
    function renderCurrent() {
      const host = browser.document.getElementById('postal-radar-c72-root'); if (!host || !model) return; host.replaceChildren();
      const header = node('header', 'c72-header'); const intro = node('div'); intro.append(node('p', 'c72-kicker', 'Prospeccion territorial verificable'), node('h1', '', 'Radar por codigo postal'), node('p', '', model.historyCompleteness === 'partial' ? 'Historico parcial: la ausencia de un CP no demuestra que nunca se buscara.' : 'Cobertura operativa, no censo exhaustivo de empresas.')); const refresh = node('button', 'btn-outline', 'Actualizar'); refresh.type = 'button'; refresh.onclick = () => render(true); header.append(intro, refresh); host.append(header);
      const summary = node('section', 'c72-summary'); summary.append(badge('CP con evidencia', model.metrics.searchedPostalCodes), badge('Encontradas', model.metrics.found), badge('En CRM', model.metrics.incorporated), badge('Contactadas', model.metrics.contacted), badge('Respuestas', model.metrics.responded), badge('Oportunidades', model.metrics.openOpportunities), badge('Ganados', model.metrics.won)); host.append(summary);
      const toolbar = node('section', 'c72-toolbar'); const definitions = [['postalCode','c72-filter-cp','CP'],['province','c72-filter-province','Provincia'],['municipality','c72-filter-municipality','Municipio'],['sector','c72-filter-sector','Sector']]; for (const [key, id, placeholder] of definitions) { const input = node('input'); input.id = id; input.placeholder = placeholder; input.value = filterState[key]; input.oninput = event => { filterState[key] = event.currentTarget.value; page = 0; renderCurrent(); }; toolbar.append(input); } const state = node('select'); state.id = 'c72-filter-state'; [['all','Todos'],['pending','Pendientes'],['responded','Respondidos'],['opportunity','Con oportunidad'],['won','Ganados'],['error','Con error'],['unknown','Sin evidencia']].forEach(([value,label]) => { const option = node('option','',label); option.value=value; state.append(option); }); state.value = filterState.state; state.onchange = event => { filterState.state = event.currentTarget.value; page = 0; renderCurrent(); }; toolbar.append(state); host.append(toolbar);
      const filtered = filterCells(model, filters()); const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); page = Math.max(0, Math.min(pages - 1, page)); const tableWrap = node('div', 'c72-table-wrap'); const table = node('table', 'c72-table'); const thead = node('thead'); const trh = node('tr'); ['CP / territorio','Sectores y ultima busqueda','Encontradas / CRM','Contacto real','Oportunidades','Pendiente','Calidad'].forEach(label => trh.append(node('th','',label))); thead.append(trh); const tbody = node('tbody');
      for (const cell of filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) { const tr = node('tr'); tr.tabIndex = 0; const territory = node('td'); territory.append(node('strong','',cell.postalCode === UNVERIFIED ? 'SIN CP VERIFICADO' : cell.postalCode), node('small','', [cell.municipality,cell.province].filter(Boolean).join(', ') || 'Territorio no verificado')); const searches = node('td'); searches.append(node('span','',cell.sectors.join(', ') || 'Sin sector'), node('small','',cell.lastSearchAt ? new Date(cell.lastSearchAt).toLocaleDateString('es-ES') : 'Sin evidencia de busqueda')); const found = node('td','',`${cell.found} / ${cell.incorporated}`); const contact = node('td','',`${cell.contacted} contactadas | ${cell.responded} respuestas`); const opportunities = node('td','',`${cell.openOpportunities} abiertas | ${cell.quoteSent} presupuestos | ${cell.won} ganados`); const pending = node('td','',`${cell.pendingReview} revisar | ${cell.pendingContact} contactar`); const quality = node('td'); quality.append(node('span',`c72-quality is-${cell.dataQuality}`,qualityLabel(cell)), node('small','',cell.historyPartial?'Historico posiblemente truncado':'Sin denominador exhaustivo')); tr.append(territory,searches,found,contact,opportunities,pending,quality); tr.onclick=()=>{activePostal=cell.postalCode;detailPage=0;renderCurrent();}; tr.onkeydown=e=>{if(e.key==='Enter')tr.click();}; tbody.append(tr); }
      table.append(thead,tbody); tableWrap.append(table); host.append(tableWrap); const pager=node('div','c72-pager'); const prev=node('button','btn-outline','Anterior');prev.disabled=page<=0;prev.onclick=()=>{page-=1;renderCurrent();};const count=node('span','',`Pagina ${page+1} de ${pages} - ${filtered.length} CP`);const next=node('button','btn-outline','Siguiente');next.disabled=page+1>=pages;next.onclick=()=>{page+=1;renderCurrent();};pager.append(prev,count,next);host.append(pager);
      const lower=node('div','c72-lower'); const recommendations=node('section','c72-recommendations'); recommendations.append(node('h2','','Proxima zona recomendada')); model.recommendations.slice(0,8).forEach(item=>{const row=node('div','c72-recommendation');const copy=node('div');copy.append(node('strong','',`${item.postalCode} - ${item.sector}`),node('small','',item.reasons.join(' | ')||'Objetivo manual'));const button=node('button','btn-outline','Preparar busqueda');button.type='button';button.onclick=()=>openPlanner(item.postalCode,item.sector);row.append(copy,button);recommendations.append(row);}); if(!model.recommendations.length)recommendations.append(node('p','c72-empty','No hay objetivos pendientes documentados.')); const plan=node('section','c72-plan'); plan.append(node('h2','','Plan manual CP / sector')); const cp=node('input');cp.placeholder='Codigo postal';cp.maxLength=5;cp.inputMode='numeric';const sector=node('input');sector.placeholder='Sector';const priority=node('select');[['normal','Prioridad normal'],['high','Prioridad alta'],['low','Prioridad baja']].forEach(([value,label])=>{const option=node('option','',label);option.value=value;priority.append(option);});const save=node('button','btn-primary','Guardar objetivo');save.type='button';save.onclick=async()=>{const result=upsertPlan(readPlans(browser.localStorage),{postalCode:cp.value,sector:sector.value,priority:priority.value,status:'pending'});if(!result.ok){browser.showToast?.('CP o sector no valido');return;}if(browser.persistCriticalData)await browser.persistCriticalData(PLAN_KEY,result.plans,{label:'plan radar postal'});else browser.localStorage.setItem(PLAN_KEY,JSON.stringify(result.plans));updates?.postMessage({type:'plan-updated'});browser.showToast?.('Objetivo postal guardado');await render(true);};plan.append(cp,sector,priority,save); lower.append(recommendations,plan);host.append(lower); renderDetail(host);
    }
    async function render(force) { if (!force && model) { renderCurrent(); return model; } model = await collect(); browser.__postalRadarC72 = model; renderCurrent(); return model; }
    function openPlanner(cp, sector) { browser.showView?.('planner'); const location = browser.document.getElementById('plan-location'); const segment = browser.document.getElementById('plan-segment'); if (location) location.value = cp; if (segment && [...segment.options].some(option => option.value === sector)) segment.value = sector; }
    function schedule() { clearTimeout(timer); timer = setTimeout(() => { if (browser.document.getElementById('postal-radar-view')?.classList.contains('active')) render(true); }, 120); }
    if (updates) updates.onmessage = event => { if (event.data?.type === 'plan-updated' && browser.document.getElementById('postal-radar-view')?.classList.contains('active')) render(true); };
    browser.setInterval?.(() => {
      if (!browser.document.getElementById('postal-radar-view')?.classList.contains('active')) return;
      const current = browser.localStorage?.getItem(PLAN_KEY) || '';
      if (current !== lastPlanRaw) { lastPlanRaw = current; schedule(); }
    }, 1000);
    browser.renderPostalRadarC72 = render; browser.addEventListener?.('storage', event => { if (![PLAN_KEY,'gordi_search_coverage','gordi_coverage_events','gordi_saved_searches','gordi_leads','gordi_email_history','gordi_commercial_memory'].includes(event.key)) return; if (browser.document.getElementById('postal-radar-view')?.classList.contains('active')) render(true); }); browser.addEventListener?.('voltflow:persistence', schedule); return { render };
  }
  function stageLabel(stage) { return ({ found:'Encontrada',incorporated:'En CRM',contacted:'Contactada',responded:'Respondida',opportunity:'Oportunidad',work_won:'Ganada' })[stage] || stage; }
  function qualityLabel(cell) { if (cell.dataQuality === 'error_only') return 'Solo errores'; if (cell.dataQuality === 'unknown') return 'Desconocida'; if (cell.dataQuality === 'stale') return 'Antigua'; return 'Actual no exhaustiva'; }

  return Object.freeze({ SCHEMA, SCHEMA_VERSION, PLAN_KEY, UNVERIFIED, PAGE_SIZE, STAGE_ORDER, postal, explicitPostal, addressPostalHint, companyKeyFromResult, isConfirmedCommunication, normalizePlan, readPlans, upsertPlan, collectSearchObservations, buildRadar, filterCells, rowsForCell, hasOpportunityEvidence, installBrowser });
});
