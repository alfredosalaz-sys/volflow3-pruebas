(function (root, factory) {
  const communications = root?.CommercialCommunications || (typeof require === 'function' ? require('./commercial-communications.js') : null);
  const memoryApi = root?.VoltflowCommercialMemory || (typeof require === 'function' ? require('./commercial-memory.js') : null);
  const followups = root?.VoltflowCommercialFollowupsC4 || (typeof require === 'function' ? require('./commercial-followups-c4.js') : null);
  const opportunities = root?.VoltflowCommercialOpportunitiesC6 || (typeof require === 'function' ? require('./commercial-opportunities-c6.js') : null);
  const api = factory(communications, memoryApi, followups, opportunities);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowCommercialIntegrationC7 = api;
  if (root?.document) api.installBrowser(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (communications, memoryApi, followups, opportunities) {
  'use strict';

  const SCHEMA = 'voltflow-commercial-integration-c7';
  const SCHEMA_VERSION = 1;
  const PAGE_SIZE = 20;
  const ACTIONS = Object.freeze({
    CONFIRM_SEND: 'confirm_send', PREPARE_INITIAL: 'prepare_initial', PREPARE_FOLLOWUP: 'prepare_followup',
    REVIEW_RESPONSE: 'review_response', REVIEW_OPPORTUNITY: 'review_opportunity', REVIEW_LEAD: 'review_lead', SEARCH: 'search'
  });
  const GROUPS = Object.freeze({ send: 'Envios', followup: 'Seguimientos', response: 'Respuestas', opportunity: 'Oportunidades', lead: 'Empresas' });

  function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
  function clean(value, max = 300) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  function canonical(value) { return memoryApi?.canonical ? memoryApi.canonical(value) : JSON.stringify(value); }
  function stableId(prefix, values) { return memoryApi?.stableId ? memoryApi.stableId(prefix, values) : `${prefix}:${values.map(value => clean(value, 120)).join('|')}`; }
  function effectiveState(record) { return communications?.getEffectiveState?.(record) || record?.commercialState || record?.state || null; }
  function currentMemory(input) {
    return input && typeof input === 'object' && input.companies && input.contacts && input.opportunities
      ? input
      : memoryApi.normalizeMemory(input || {});
  }
  function bindingOf(item = {}) {
    return {
      companyId: item.companyId || null, establishmentId: item.establishmentId || null,
      contactId: item.contactId || null, target: normalizeEmail(item.target) || null,
      purpose: item.purpose || 'commercial_first_contact', opportunityId: item.opportunityId || null,
      sequenceKey: item.sequenceKey || null, recordId: item.recordId || null, leadId: item.leadId == null ? null : String(item.leadId)
    };
  }
  function leadMatches(memory, lead, binding) {
    const alias = lead?.id != null ? memory.aliases?.[`lead:${lead.id}`] : null;
    const companyId = lead?.commercialRefs?.companyId || alias?.companyId;
    const contactId = lead?.commercialRefs?.contactId || alias?.contactId;
    if (binding.leadId && String(lead?.id) !== binding.leadId) return false;
    return companyId === binding.companyId && (!contactId || contactId === binding.contactId) && normalizeEmail(lead?.email) === binding.target;
  }
  function exactLead(memory, leads, binding) {
    if (!binding.companyId || !binding.contactId || !binding.target) return { ok: false, reason: 'C7_IDENTITY_INCOMPLETE', lead: null };
    const company = memory.companies?.[binding.companyId];
    const contact = memory.contacts?.[binding.contactId];
    if (!company || !contact || !(company.contactIds || []).includes(binding.contactId)) return { ok: false, reason: 'C7_CONTACT_NOT_IN_COMPANY', lead: null };
    const targets = (contact.contactPoints || []).filter(point => point?.channel === 'email').map(point => normalizeEmail(point.value)).filter(Boolean);
    if (!targets.includes(binding.target)) return { ok: false, reason: 'C7_TARGET_NOT_IN_CONTACT', lead: null };
    const contactsForTarget = (company.contactIds || []).map(id => memory.contacts?.[id]).filter(Boolean).filter(item =>
      (item.contactPoints || []).some(point => point?.channel === 'email' && normalizeEmail(point.value) === binding.target));
    if (contactsForTarget.length !== 1 || contactsForTarget[0].contactId !== binding.contactId) return { ok: false, reason: 'C7_CONTACT_TARGET_AMBIGUOUS', lead: null };
    const matches = (Array.isArray(leads) ? leads : []).filter(lead => leadMatches(memory, lead, binding));
    if (matches.length !== 1) return { ok: false, reason: matches.length ? 'C7_LEAD_AMBIGUOUS' : 'C7_LEAD_NOT_FOUND', lead: null };
    return { ok: true, reason: null, lead: matches[0], company, contact };
  }
  function makeAction(kind, group, priority, binding, label, detail, extra = {}) {
    const normalized = bindingOf(binding);
    return {
      schema: SCHEMA, schemaVersion: SCHEMA_VERSION,
      actionId: stableId('c7-action', [kind, normalized.companyId, normalized.contactId, normalized.target, normalized.purpose, normalized.opportunityId, normalized.recordId, extra.state || '']),
      kind, group, priority, binding: normalized, label: clean(label, 180), detail: clean(detail, 300),
      blocked: Boolean(extra.blocked), blockReason: extra.blockReason || null, dueAt: extra.dueAt || null,
      state: extra.state || null, source: extra.source || null
    };
  }
  function leadDependency(lead, memory) {
    const leadId = lead?.id == null ? null : String(lead.id);
    const alias = leadId ? memory.aliases?.[`lead:${leadId}`] : null;
    const companyId = lead?.commercialRefs?.companyId || alias?.companyId || null;
    const contactId = lead?.commercialRefs?.contactId || alias?.contactId || null;
    const establishmentId = lead?.commercialRefs?.establishmentId || alias?.establishmentId || null;
    const relevant = {
      leadId, companyId, contactId, establishmentId, archived: Boolean(lead?.archived),
      company: String(lead?.company || lead?.businessName || ''), name: String(lead?.name || ''),
      email: String(lead?.email || ''), phone: String(lead?.phone || ''), website: String(lead?.website || ''),
      segment: String(lead?.segment || lead?.sector || ''), address: String(lead?.address || ''),
      postalCode: String(lead?.postalCode || ''), doNotContact: Boolean(lead?.doNotContact || lead?.optOut || lead?.commercialContactPolicy?.doNotContact)
    };
    return { ...relevant, fingerprint: JSON.stringify([
      relevant.companyId, relevant.contactId, relevant.establishmentId, relevant.archived,
      relevant.company, relevant.name, relevant.email, relevant.phone, relevant.website,
      relevant.segment, relevant.address, relevant.postalCode, relevant.doNotContact
    ]) };
  }
  function leadDependencies(leads, memory) {
    const output = new Map();
    for (const lead of Array.isArray(leads) ? leads : []) {
      const dependency = leadDependency(lead, memory);
      if (dependency.leadId) output.set(dependency.leadId, dependency);
    }
    return output;
  }
  function changedLeadIds(previous, leads, memory) {
    const next = leadDependencies(leads, memory); const changed = new Set();
    for (const [leadId, dependency] of next) if (previous?.get(leadId)?.fingerprint !== dependency.fingerprint) changed.add(leadId);
    for (const leadId of previous?.keys?.() || []) if (!next.has(leadId)) changed.add(leadId);
    return { changed, next };
  }
  function buildLeadIndex(memory, leads) {
    const byId = new Map();
    const byCompany = new Map();
    const byContact = new Map();
    const byTarget = new Map();
    const byCompanyTarget = new Map();
    const contactByCompanyTarget = new Map();
    const add = (index, key, lead) => {
      if (!key) return;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(lead);
    };
    for (const lead of Array.isArray(leads) ? leads : []) {
      const alias = lead?.id != null ? memory.aliases?.[`lead:${lead.id}`] : null;
      const companyId = lead?.commercialRefs?.companyId || alias?.companyId || null;
      const contactId = lead?.commercialRefs?.contactId || alias?.contactId || null;
      const target = normalizeEmail(lead?.email) || null;
      if (lead?.id != null) add(byId, String(lead.id), lead);
      add(byCompany, companyId, lead);
      add(byContact, contactId, lead);
      add(byTarget, target, lead);
      if (companyId && target) add(byCompanyTarget, JSON.stringify([companyId, target]), lead);
    }
    for (const company of Object.values(memory.companies || {})) {
      for (const contactId of company.contactIds || []) {
        const contact = memory.contacts?.[contactId]; if (!contact) continue;
        for (const point of contact.contactPoints || []) {
          if (point?.channel !== 'email') continue;
          const target = normalizeEmail(point.value); if (!target) continue;
          const key = JSON.stringify([company.companyId, target]);
          if (!contactByCompanyTarget.has(key)) contactByCompanyTarget.set(key, contactId);
          else if (contactByCompanyTarget.get(key) !== contactId) contactByCompanyTarget.set(key, null);
        }
      }
    }
    return {
      byId, byCompany, byContact, byTarget, byCompanyTarget, contactByCompanyTarget,
      exact(binding) {
        if (!binding.companyId || !binding.contactId || !binding.target) return { ok: false, reason: 'C7_IDENTITY_INCOMPLETE', lead: null };
        const company = memory.companies?.[binding.companyId]; const contact = memory.contacts?.[binding.contactId];
        if (!company || !contact || !(company.contactIds || []).includes(binding.contactId)) return { ok: false, reason: 'C7_CONTACT_NOT_IN_COMPANY', lead: null };
        const key = JSON.stringify([binding.companyId, normalizeEmail(binding.target)]); const owner = contactByCompanyTarget.get(key);
        if (owner === undefined) return { ok: false, reason: 'C7_TARGET_NOT_IN_CONTACT', lead: null };
        if (owner === null || owner !== binding.contactId) return { ok: false, reason: 'C7_CONTACT_TARGET_AMBIGUOUS', lead: null };
        const candidates = binding.leadId
          ? (byId.get(String(binding.leadId)) || [])
          : (byCompanyTarget.get(key) || []);
        const matches = candidates.filter(lead => leadMatches(memory, lead, binding));
        if (matches.length !== 1) return { ok: false, reason: matches.length ? 'C7_LEAD_AMBIGUOUS' : 'C7_LEAD_NOT_FOUND', lead: null };
        return { ok: true, reason: null, lead: matches[0], company, contact };
      }
    };
  }
  function buildJourney(memory, leads, history, followupAgenda) {
    const events = Object.values(memory.events || {});
    const opportunityRows = Object.values(memory.opportunities || {});
    const opportunityCounts = {}; let open = 0; for (const item of opportunityRows) { opportunityCounts[item.status] = (opportunityCounts[item.status] || 0) + 1; if (!['won', 'lost'].includes(item.status)) open++; }
    let pending = 0; let confirmed = 0; for (const record of history) { if (effectiveState(record) === 'PENDING_SEND_CONFIRMATION') pending++; if (communications?.isSentConfirmed?.(record)) confirmed++; }
    let activeLeads = 0; for (const lead of leads) if (!lead.archived) activeLeads++;
    let actionableFollowups = 0; for (const item of followupAgenda.states || []) if (followups.isActionable(item)) actionableFollowups++;
    let responses = 0; for (const event of events) if (event.type === 'response_received') responses++;
    return [
      { id: 'discovered', label: 'Empresas', count: activeLeads },
      { id: 'memory', label: 'Revisadas', count: Object.keys(memory.companies || {}).length },
      { id: 'drafts', label: 'Borradores', count: Object.keys(memory.drafts || {}).length },
      { id: 'pending_send', label: 'Por confirmar', count: pending },
      { id: 'sent', label: 'Enviados', count: confirmed },
      { id: 'followup', label: 'Seguimientos', count: actionableFollowups },
      { id: 'responses', label: 'Respuestas', count: responses },
      { id: 'opportunities', label: 'Oportunidades', count: open },
      { id: 'quotes', label: 'Presupuestos', count: (opportunityCounts.quote_requested || 0) + (opportunityCounts.quote_preparing || 0) + (opportunityCounts.quote_sent || 0) },
      { id: 'won', label: 'Ganados', count: opportunityCounts.won || 0 },
      { id: 'lost', label: 'Perdidos', count: opportunityCounts.lost || 0 }
    ];
  }

  function followupAction(item) {
    const actionable = followups.isActionable(item);
    if (!actionable && item.identityResolved !== false) return null;
    const kind = item.confirmedCount > 0 ? ACTIONS.PREPARE_FOLLOWUP : ACTIONS.PREPARE_INITIAL;
    const binding = bindingOf({ ...item, leadId: item.leadId, purpose: followups.PURPOSE });
    return makeAction(kind, 'followup', item.priority, binding,
      item.confirmedCount ? `Preparar seguimiento ${item.nextStage} de ${followups.MAX_CONFIRMED}` : 'Preparar primer correo',
      [item.company?.name || item.lead?.company, item.contact?.name, item.label].filter(Boolean).join(' - '), {
        blocked: !actionable || item.identityResolved !== true || item.blocked, blockReason: item.resolutionError || item.reason, dueAt: item.dueAt, state: item.state, source: 'commercial-followups-c4'
      });
  }
  function opportunityAction(memory, row) {
    const opportunity = memory.opportunities?.[row.opportunityId];
    if (!opportunity) return null;
    const binding = bindingOf({ ...opportunity, opportunityId: row.opportunityId });
    return makeAction(ACTIONS.REVIEW_OPPORTUNITY, 'opportunity', 110 - Math.min(50, row.priority * 10), binding,
      row.reason, opportunity.title || 'Oportunidad', { dueAt: row.dueAt, state: opportunity.status, source: 'commercial-opportunities-c6' });
  }
  function compareActions(a, b) { return b.priority - a.priority || Date.parse(a.dueAt || '9999-12-31') - Date.parse(b.dueAt || '9999-12-31') || a.actionId.localeCompare(b.actionId); }
  function insertAction(actions, action) {
    let low = 0; let high = actions.length;
    while (low < high) { const middle = (low + high) >>> 1; if (compareActions(actions[middle], action) <= 0) low = middle + 1; else high = middle; }
    actions.splice(low, 0, action);
  }
  function centerFromParts(memory, leads, history, followupStates, actions, now, alreadySorted = false) {
    if (!alreadySorted) actions.sort(compareActions);
    const countsByState = {};
    for (const item of followupStates) countsByState[item.state] = (countsByState[item.state] || 0) + 1;
    const followupAgenda = { states: followupStates, counts: countsByState };
    const journey = buildJourney(memory, leads, history, followupAgenda);
    const totals = opportunities.totals(memory);
    const byGroup = Object.fromEntries(Object.keys(GROUPS).map(group => [group, 0])); let blocked = 0;
    for (const action of actions) { if (action.blocked) blocked++; byGroup[action.group] = (byGroup[action.group] || 0) + 1; }
    return { schema: SCHEMA, schemaVersion: SCHEMA_VERSION, generatedAt: now, revision: memory.revision || 0, journey, actions, counts: { total: actions.length, blocked, byGroup }, opportunityTotals: totals, followupCounts: countsByState };
  }
  function actionCounts(actions) {
    const byGroup = Object.fromEntries(Object.keys(GROUPS).map(group => [group, 0])); let blocked = 0;
    for (const action of actions) { if (action.blocked) blocked++; byGroup[action.group] = (byGroup[action.group] || 0) + 1; }
    return { total: actions.length, blocked, byGroup };
  }

  function buildWorkCenterDetailed(input = {}) {
    const memory = currentMemory(input.memory);
    const leads = Array.isArray(input.leads) ? input.leads : [];
    const history = Array.isArray(input.emailHistory) ? input.emailHistory : [];
    const now = input.now || new Date().toISOString();
    const followupAgenda = followups.buildAgenda({ memory, leads, emailHistory: history, now });
    const actions = []; let leadIndex = null;
    const resolveLead = binding => (leadIndex ||= buildLeadIndex(memory, leads)).exact(binding);
    for (const record of history) {
      if (effectiveState(record) !== 'PENDING_SEND_CONFIRMATION') continue;
      const binding = bindingOf({ ...record, recordId: record.id, leadId: record.leadId, purpose: record.purpose });
      const resolved = resolveLead(binding);
      actions.push(makeAction(ACTIONS.CONFIRM_SEND, 'send', 120, binding, 'Confirmar envio real', record.subject || 'Mensaje abierto en cliente externo', { blocked: !resolved.ok, blockReason: resolved.reason, state: 'pending_send_confirmation', source: 'commercial-communications' }));
    }
    for (const item of followupAgenda.states) { const action = followupAction(item); if (action) actions.push(action); }
    for (const row of opportunities.agenda(memory, now)) { const action = opportunityAction(memory, row); if (action) actions.push(action); }
    const center = centerFromParts(memory, leads, history, followupAgenda.states, actions, now);
    return { center, runtime: { followupIndex: followupAgenda.index, followupStates: new Map(followupAgenda.states.map(item => [String(item.leadId), item])), leadDependencies: leadDependencies(leads, memory) } };
  }

  function buildWorkCenter(input = {}) {
    return buildWorkCenterDetailed(input).center;
  }

  function updateWorkCenterIncremental(previous, input = {}, changes = {}) {
    if (!previous?.center || !previous?.runtime || changes.global) return buildWorkCenterDetailed(input);
    const memory = currentMemory(input.memory); const leads = Array.isArray(input.leads) ? input.leads : []; const history = Array.isArray(input.emailHistory) ? input.emailHistory : []; const now = input.now || new Date().toISOString();
    const leadDiff = changes.nextLeadDependencies
      ? { changed: new Set((changes.leadIds || []).map(String)), next: changes.nextLeadDependencies }
      : changedLeadIds(previous.runtime.leadDependencies, leads, memory);
    const affectedLeads = new Set([...(changes.leadIds || [])].map(String));
    for (const id of leadDiff.changed) affectedLeads.add(id);
    const affectedCompanies = new Set(changes.companyIds || []);
    for (const id of affectedLeads) {
      const oldDependency = previous.runtime.leadDependencies.get(id); const nextDependency = leadDiff.next.get(id);
      if (oldDependency?.companyId !== nextDependency?.companyId
        || oldDependency?.contactId !== nextDependency?.contactId
        || oldDependency?.establishmentId !== nextDependency?.establishmentId) {
        if (oldDependency?.companyId) affectedCompanies.add(oldDependency.companyId);
        if (nextDependency?.companyId) affectedCompanies.add(nextDependency.companyId);
      }
    }
    if (affectedCompanies.size) {
      for (const [leadId, dependency] of leadDiff.next) if (affectedCompanies.has(dependency.companyId)) affectedLeads.add(leadId);
      for (const [leadId, dependency] of previous.runtime.leadDependencies) if (affectedCompanies.has(dependency.companyId)) affectedLeads.add(leadId);
    }
    if (!affectedLeads.size && !affectedCompanies.size && !(changes.opportunityIds || []).length) return buildWorkCenterDetailed(input);
    const memoryChanged = memory !== previous.input?.memory || Number(memory.revision || 0) !== Number(previous.center.revision || 0);
    const followupIndex = memoryChanged || changes.historyChanged ? followups.buildIndex(memory, history) : previous.runtime.followupIndex;
    const stateMap = new Map(previous.runtime.followupStates);
    const leadsById = new Map(leads.filter(lead => lead?.id != null).map(lead => [String(lead.id), lead]));
    const stateTransitions = [];
    for (const leadId of affectedLeads) {
      const before = stateMap.get(leadId) || null;
      const lead = leadsById.get(leadId);
      if (!lead || lead.archived) stateMap.delete(leadId);
      else stateMap.set(leadId, followups.sequenceState({ memory, leads, emailHistory: history, now, lead, index: followupIndex }));
      stateTransitions.push({ leadId, before, after: stateMap.get(leadId) || null });
    }
    const affectedOpportunities = new Set(changes.opportunityIds || []);
    for (const opportunity of Object.values(memory.opportunities || {})) if (affectedCompanies.has(opportunity.companyId)) affectedOpportunities.add(opportunity.opportunityId);
    for (const action of previous.center.actions) if (action.source === 'commercial-opportunities-c6' && affectedCompanies.has(action.binding.companyId)) affectedOpportunities.add(action.binding.opportunityId);
    const actions = previous.center.actions.filter(action => {
      if (action.source === 'commercial-followups-c4' && affectedLeads.has(String(action.binding.leadId))) return false;
      if (action.source === 'commercial-communications' && (affectedLeads.has(String(action.binding.leadId)) || affectedCompanies.has(action.binding.companyId))) return false;
      if (action.source === 'commercial-opportunities-c6' && (affectedCompanies.has(action.binding.companyId) || affectedOpportunities.has(action.binding.opportunityId))) return false;
      return true;
    });
    const replacements = [];
    for (const leadId of affectedLeads) { const state = stateMap.get(leadId); const action = state && followupAction(state); if (action) replacements.push(action); }
    if (affectedLeads.size || affectedCompanies.size) {
      const pendingRecords = [];
      for (const record of history) {
        if (effectiveState(record) !== 'PENDING_SEND_CONFIRMATION') continue;
        const binding = bindingOf({ ...record, recordId: record.id, leadId: record.leadId, purpose: record.purpose });
        if (!affectedLeads.has(String(binding.leadId)) && !affectedCompanies.has(binding.companyId)) continue;
        pendingRecords.push({ record, binding });
      }
      const leadIndex = pendingRecords.length ? buildLeadIndex(memory, leads) : null;
      for (const { record, binding } of pendingRecords) {
        const resolved = leadIndex.exact(binding);
        replacements.push(makeAction(ACTIONS.CONFIRM_SEND, 'send', 120, binding, 'Confirmar envio real', record.subject || 'Mensaje abierto en cliente externo', { blocked: !resolved.ok, blockReason: resolved.reason, state: 'pending_send_confirmation', source: 'commercial-communications' }));
      }
    }
    if (affectedOpportunities.size) {
      const subset = {}; for (const id of affectedOpportunities) if (memory.opportunities?.[id]) subset[id] = memory.opportunities[id];
      for (const row of opportunities.agenda({ ...memory, opportunities: subset }, now)) { const action = opportunityAction(memory, row); if (action) replacements.push(action); }
    }
    for (const action of replacements.sort(compareActions)) insertAction(actions, action);
    const onlyLeadStateChanged = !memoryChanged && !changes.historyChanged && affectedCompanies.size === 0 && affectedOpportunities.size === 0;
    if (onlyLeadStateChanged) {
      const followupCounts = { ...(previous.center.followupCounts || {}) };
      let activeDelta = 0; let actionableDelta = 0;
      for (const transition of stateTransitions) {
        if (transition.before?.state) followupCounts[transition.before.state] = Math.max(0, Number(followupCounts[transition.before.state] || 0) - 1);
        if (transition.after?.state) followupCounts[transition.after.state] = Number(followupCounts[transition.after.state] || 0) + 1;
        actionableDelta += Number(Boolean(transition.after && followups.isActionable(transition.after))) - Number(Boolean(transition.before && followups.isActionable(transition.before)));
        const oldDependency = previous.runtime.leadDependencies.get(transition.leadId); const newDependency = leadDiff.next.get(transition.leadId);
        activeDelta += Number(Boolean(newDependency && !newDependency.archived)) - Number(Boolean(oldDependency && !oldDependency.archived));
      }
      const journey = previous.center.journey.map(step => step.id === 'discovered' ? { ...step, count: Math.max(0, step.count + activeDelta) } : step.id === 'followup' ? { ...step, count: Math.max(0, step.count + actionableDelta) } : { ...step });
      return { center: { ...previous.center, generatedAt: now, journey, actions, counts: actionCounts(actions), followupCounts }, runtime: { followupIndex, followupStates: stateMap, leadDependencies: leadDiff.next } };
    }
    const followupStates = [...stateMap.values()];
    return { center: centerFromParts(memory, leads, history, followupStates, actions, now, true), runtime: { followupIndex, followupStates: stateMap, leadDependencies: leadDiff.next } };
  }

  function revalidateAction(action, input = {}) {
    if (!action?.actionId) throw new Error('C7_ACTION_REQUIRED');
    const current = buildWorkCenter(input).actions.find(item => item.actionId === action.actionId);
    if (!current) throw new Error('C7_ACTION_STALE');
    if (canonical(current.binding) !== canonical(action.binding) || current.kind !== action.kind) throw new Error('C7_ACTION_BINDING_CHANGED');
    if (current.blocked) throw new Error(current.blockReason || 'C7_ACTION_BLOCKED');
    return current;
  }

  function installBrowser(root) {
    let filter = 'all'; let page = 0; let renderToken = 0; let cachedModel = null; let pendingChanges = null;
    const repository = memoryApi.createBrowserRepository(root);
    const updates = typeof root.BroadcastChannel === 'function' ? new root.BroadcastChannel('voltflow-commercial-center-c8-x03') : null;
    const node = (tag, className, text) => { const item = root.document.createElement(tag); if (className) item.className = className; if (text != null) item.textContent = String(text); return item; };
    const currentLeads = () => Array.isArray(root.leads) ? root.leads : (typeof leads !== 'undefined' && Array.isArray(leads) ? leads : []);
    const currentHistory = () => Array.isArray(root.emailHistory) ? root.emailHistory : (typeof emailHistory !== 'undefined' && Array.isArray(emailHistory) ? emailHistory : []);
    async function snapshot() { return { memory: await repository.read(), leads: currentLeads(), emailHistory: currentHistory(), now: new Date().toISOString() }; }
    async function execute(action) {
      const input = await snapshot(); const fresh = revalidateAction(action, input);
      const resolved = [ACTIONS.PREPARE_INITIAL, ACTIONS.PREPARE_FOLLOWUP, ACTIONS.REVIEW_RESPONSE, ACTIONS.CONFIRM_SEND].includes(fresh.kind)
        ? exactLead(input.memory, input.leads, fresh.binding) : null;
      if (resolved && !resolved.ok) throw new Error(resolved.reason);
      if (fresh.kind === ACTIONS.CONFIRM_SEND) {
        if (!root.confirm('Confirma solo si este mensaje se envio realmente desde el cliente externo.')) return { executed: false, reason: 'USER_CANCELLED' };
        await root.confirmCommercialSend(fresh.binding.recordId, { method: 'manual_explicit' }); return { executed: true };
      }
      if (fresh.kind === ACTIONS.PREPARE_INITIAL || fresh.kind === ACTIONS.PREPARE_FOLLOWUP) {
        const agenda = followups.buildAgenda(input); const state = agenda.states.find(item => String(item.leadId) === fresh.binding.leadId && item.contactId === fresh.binding.contactId && item.target === fresh.binding.target && item.sequenceKey === fresh.binding.sequenceKey);
        if (!state) throw new Error('C7_FOLLOWUP_CONTEXT_STALE');
        return root.openCommercialFollowupComposer(state);
      }
      if (fresh.kind === ACTIONS.REVIEW_RESPONSE) return root.openCommercialResponseReview(resolved.lead, { contactId: fresh.binding.contactId, target: fresh.binding.target, strictIdentity: true });
      if (fresh.kind === ACTIONS.REVIEW_OPPORTUNITY) { root.showView('opportunities'); await root.openOpportunityEditor(fresh.binding.opportunityId); return { executed: true }; }
      if (fresh.kind === ACTIONS.REVIEW_LEAD) { root.openLeadDetail?.(fresh.binding.leadId); return { executed: true }; }
      if (fresh.kind === ACTIONS.SEARCH) { root.showView('planner'); return { executed: true }; }
      throw new Error('C7_ACTION_UNSUPPORTED');
    }
    async function render(options = {}) {
      const host = root.document.getElementById('commercial-integration-c7-root'); if (!host) return;
      const token = ++renderToken; host.setAttribute('aria-busy', 'true');
      try {
        const reuse = options.force !== true && !pendingChanges && cachedModel && Date.now() - cachedModel.createdAt < 60000;
        let input; let detailed;
        if (reuse) { input = cachedModel.input; detailed = cachedModel; }
        else if (options.force !== true && cachedModel && pendingChanges && !pendingChanges.global) {
          input = { memory: pendingChanges.memory || cachedModel.input.memory, leads: currentLeads(), emailHistory: currentHistory(), now: new Date().toISOString() };
          detailed = updateWorkCenterIncremental(cachedModel, input, pendingChanges);
        } else { input = await snapshot(); detailed = buildWorkCenterDetailed(input); }
        const center = detailed.center; if (token !== renderToken) return;
        if (!reuse) cachedModel = { input, center, runtime: detailed.runtime, createdAt: Date.now() };
        pendingChanges = null;
        root.__c7Center = center; root.__c7Input = input; host.replaceChildren();
        const header = node('header', 'c7-header'); const heading = node('div'); heading.append(node('p', 'c7-kicker', 'Circuito comercial'), node('h1', '', 'Trabajo comercial'), node('p', 'c7-subtitle', 'La proxima accion valida para convertir empresas en trabajos.'));
        const headerActions = node('div', 'c7-header-actions'); const inbox = node('button', 'btn-outline', 'Registrar respuesta'); inbox.type = 'button'; inbox.onclick = () => root.showView('inbox'); const search = node('button', 'btn-primary c7-search', 'Buscar empresas'); search.type = 'button'; search.onclick = () => root.showView('planner'); headerActions.append(inbox, search); header.append(heading, headerActions); host.append(header);
        const journey = node('section', 'c7-journey'); journey.setAttribute('aria-label', 'Recorrido comercial'); center.journey.forEach((step, index) => { const item = node('button', 'c7-journey-step'); item.type = 'button'; item.dataset.stage = step.id; item.append(node('small', '', String(index + 1).padStart(2, '0')), node('strong', '', step.count), node('span', '', step.label)); item.onclick = () => { if (step.id === 'discovered') root.showView('planner'); else if (step.id === 'responses') root.showView('inbox'); else if (['opportunities', 'quotes', 'won', 'lost'].includes(step.id)) root.showView('opportunities'); else root.showView('leads'); }; journey.append(item); }); host.append(journey);
        const work = node('section', 'c7-work'); const workHead = node('div', 'c7-work-head'); const workTitle = node('div'); workTitle.append(node('h2', '', 'Que requiere atencion'), node('p', '', `${center.counts.total} acciones basadas en datos persistentes`));
        const filters = node('div', 'c7-filters'); [['all', 'Todo'], ...Object.entries(GROUPS)].forEach(([value, label]) => { const button = node('button', value === filter ? 'is-active' : '', label); button.type = 'button'; button.onclick = () => { filter = value; page = 0; render(); }; filters.append(button); }); workHead.append(workTitle, filters); work.append(workHead);
        const rows = filter === 'all' ? center.actions : center.actions.filter(item => item.group === filter); const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); page = Math.min(page, pages - 1);
        const list = node('div', 'c7-action-list'); rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach(action => {
          const row = node('article', `c7-action ${action.blocked ? 'is-blocked' : ''}`); row.dataset.actionId = action.actionId;
          const marker = node('span', `c7-action-marker group-${action.group}`); marker.setAttribute('aria-hidden', 'true');
          const text = node('div', 'c7-action-copy'); text.append(node('strong', '', action.label), node('span', '', action.detail));
          const identity = [input.memory.companies?.[action.binding.companyId]?.name, input.memory.contacts?.[action.binding.contactId]?.name, action.binding.target].filter(Boolean).join(' - '); if (identity) text.append(node('small', '', identity));
          const button = node('button', action.blocked ? 'btn-outline' : 'btn-primary', action.blocked ? 'Bloqueado' : action.kind === ACTIONS.CONFIRM_SEND ? 'Confirmar envio' : 'Continuar'); button.type = 'button'; button.disabled = action.blocked; button.title = action.blocked ? action.blockReason || 'Identidad no verificable' : action.label;
          button.onclick = async () => { button.disabled = true; try { await execute(action); } catch (error) { root.showToast?.(`Accion bloqueada: ${clean(error.message, 180)}`); } finally { button.disabled = action.blocked; } };
          row.append(marker, text, button); list.append(row);
        });
        if (!rows.length) { const empty = node('div', 'c7-empty'); empty.append(node('strong', '', 'No hay acciones pendientes en esta vista.'), node('span', '', 'Puedes buscar nuevas empresas o revisar el centro de oportunidades.')); list.append(empty); }
        work.append(list);
        if (pages > 1) { const pager = node('div', 'c7-pager'); const previous = node('button', 'btn-outline', 'Anterior'); const next = node('button', 'btn-outline', 'Siguiente'); previous.disabled = page === 0; next.disabled = page >= pages - 1; previous.onclick = () => { page--; render(); }; next.onclick = () => { page++; render(); }; pager.append(previous, node('span', '', `${page + 1} / ${pages}`), next); work.append(pager); }
        host.append(work);
      } catch (error) { host.replaceChildren(node('div', 'c7-error', `Circuito comercial no disponible: ${clean(error.message, 180)}`)); }
      finally { host.setAttribute('aria-busy', 'false'); }
    }
    root.renderCommercialIntegrationCenter = render;
    root.executeCommercialIntegrationAction = execute;
    function mergeChanges(next = {}) {
      if (!cachedModel || next.global) { pendingChanges = { global: true }; return; }
      const current = pendingChanges || {};
      pendingChanges = { memory: next.memory || current.memory || null, global: false, historyChanged: Boolean(current.historyChanged || next.historyChanged), leadIds: [...new Set([...(current.leadIds || []), ...(next.leadIds || [])])], companyIds: [...new Set([...(current.companyIds || []), ...(next.companyIds || [])])], opportunityIds: [...new Set([...(current.opportunityIds || []), ...(next.opportunityIds || [])])], nextLeadDependencies: next.nextLeadDependencies || current.nextLeadDependencies || null };
    }
    root.addEventListener?.('voltflow:commercial-memory-changed', event => {
      const detail = event.detail || { global: true }; mergeChanges(detail);
      try { updates?.postMessage({ type: 'memory-changed', revision: detail.revision || null, companyIds: detail.companyIds || [], opportunityIds: detail.opportunityIds || [] }); } catch {}
      if (root.document.getElementById('commercial-integration-c7-view')?.classList.contains('active')) render();
    });
    const stateBus = root.VoltiumEvents || (typeof VoltiumEvents !== 'undefined' ? VoltiumEvents : null);
    stateBus?.on?.('state:changed', event => {
      if (!cachedModel) { pendingChanges = { global: true }; return; }
      if (event?.global === false && Array.isArray(event.leadIds) && event.leadIds.length) {
        const next = new Map(cachedModel.runtime.leadDependencies);
        const supplied = new Map((event.changedLeads || []).filter(lead => lead?.id != null).map(lead => [String(lead.id), lead]));
        for (const idValue of event.leadIds) {
          const id = String(idValue); const lead = supplied.get(id);
          if (lead) next.set(id, leadDependency(lead, cachedModel.input.memory)); else next.delete(id);
        }
        mergeChanges({ leadIds: event.leadIds.map(String), nextLeadDependencies: next });
        try { updates?.postMessage({ type: 'leads-changed', leadIds: event.leadIds.map(String) }); } catch {}
        return;
      }
      const diff = changedLeadIds(cachedModel.runtime.leadDependencies, currentLeads(), cachedModel.input.memory);
      if (!diff.changed.size) { pendingChanges = { global: true }; return; }
      const threshold = Math.max(100, Math.ceil(diff.next.size * 0.1));
      mergeChanges(diff.changed.size <= threshold ? { leadIds: [...diff.changed], nextLeadDependencies: diff.next } : { global: true });
    });
    if (updates) updates.onmessage = async event => {
      if (event.data?.type === 'memory-changed') {
        pendingChanges = { global: true };
      } else if (event.data?.type === 'leads-changed') {
        try {
          const stored = await root.VoltflowStorage?.loadCriticalValue?.('gordi_leads', null);
          if (Array.isArray(stored)) { const target = currentLeads(); target.splice(0, target.length, ...stored); }
        } catch {}
        pendingChanges = { global: true };
      }
      if (root.document.getElementById('commercial-integration-c7-view')?.classList.contains('active')) render();
    };
    root.addEventListener?.('storage', event => { if (event.key === memoryApi.STORAGE_KEY || event.key === 'gordi_leads' || event.key === 'gordi_email_history') pendingChanges = { global: true }; });
    return { render, execute, repository };
  }

  return Object.freeze({ SCHEMA, SCHEMA_VERSION, PAGE_SIZE, ACTIONS, GROUPS, bindingOf, exactLead, buildJourney, buildWorkCenter, buildWorkCenterDetailed, updateWorkCenterIncremental, leadDependencies, changedLeadIds, revalidateAction, installBrowser });
});
