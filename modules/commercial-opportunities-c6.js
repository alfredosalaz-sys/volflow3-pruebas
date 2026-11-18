(function (root, factory) {
  const memoryApi = root?.VoltflowCommercialMemory || (typeof require === 'function' ? require('./commercial-memory.js') : null);
  const api = factory(memoryApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowCommercialOpportunitiesC6 = api;
  if (root?.document) api.installBrowser(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (memoryApi) {
  'use strict';

  const SCHEMA = 'voltflow-commercial-opportunity';
  const SCHEMA_VERSION = 1;
  const STATUSES = Object.freeze(['identified', 'interested', 'quote_requested', 'quote_preparing', 'quote_sent', 'negotiation', 'won', 'lost', 'suspended']);
  const STATUS_LABELS = Object.freeze({
    identified: 'Oportunidad identificada', interested: 'Interes confirmado', quote_requested: 'Solicitud de presupuesto',
    quote_preparing: 'Presupuesto en preparacion', quote_sent: 'Presupuesto enviado', negotiation: 'Negociacion',
    won: 'Trabajo ganado', lost: 'Trabajo perdido', suspended: 'Suspendida'
  });
  const SERVICES = Object.freeze([
    ['integral_renovation', 'Reformas integrales'], ['facade_rehabilitation', 'Rehabilitacion de fachadas'],
    ['community_works', 'Obras en comunidades'], ['waterproofing', 'Impermeabilizaciones'],
    ['repairs', 'Reparaciones'], ['building_maintenance', 'Mantenimiento de edificios'],
    ['premises_adaptation', 'Adecuacion de locales'], ['technical_collaboration', 'Trabajos para arquitectos y tecnicos'],
    ['other_construction', 'Otros trabajos de construccion']
  ]);
  const TRANSITIONS = Object.freeze({
    identified: ['interested', 'quote_requested', 'suspended', 'lost'],
    interested: ['quote_requested', 'quote_preparing', 'negotiation', 'suspended', 'lost'],
    quote_requested: ['quote_preparing', 'suspended', 'lost'],
    quote_preparing: ['quote_sent', 'suspended', 'lost'],
    quote_sent: ['negotiation', 'won', 'lost', 'suspended'],
    negotiation: ['won', 'lost', 'suspended'],
    suspended: ['identified', 'interested', 'quote_requested', 'quote_preparing', 'quote_sent', 'negotiation', 'lost'],
    won: [], lost: []
  });
  const OPEN = new Set(['identified', 'interested', 'quote_requested', 'quote_preparing', 'quote_sent', 'negotiation', 'suspended']);

  function clone(value) { return value === undefined ? undefined : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
  function memoryView(input) { return input && typeof input === 'object' && !Array.isArray(input) && input.companies && input.contacts && input.events && input.opportunities ? input : memoryApi.normalizeMemory(input || {}); }
  function clean(value, max = 500) { return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
  function iso(value) { const date = value ? new Date(value) : new Date(); if (!Number.isFinite(date.getTime())) throw new Error('C6_DATE_INVALID'); return date.toISOString(); }
  function nullableAmount(value) {
    if (value === '' || value === null || value === undefined) return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000000) throw new Error('C6_AMOUNT_INVALID');
    return Math.round(amount * 100) / 100;
  }
  function serviceLabel(id, custom) { return SERVICES.find(item => item[0] === id)?.[1] || clean(custom || id || 'Otro trabajo', 120); }
  function normalizeHistory(history) { return Array.isArray(history) ? history.filter(item => item && item.historyId).map(clone) : []; }
  function normalizeOpportunity(input = {}) {
    const status = STATUSES.includes(input.status) ? input.status : 'identified';
    return {
      ...clone(input), schema: SCHEMA, schemaVersion: SCHEMA_VERSION,
      opportunityId: clean(input.opportunityId, 160), companyId: clean(input.companyId, 160),
      establishmentId: clean(input.establishmentId, 160) || null, contactId: clean(input.contactId, 160) || null,
      target: normalizeEmail(input.target) || null, purpose: clean(input.purpose || 'commercial_first_contact', 120),
      title: clean(input.title || input.description || 'Oportunidad comercial', 180),
      serviceId: clean(input.serviceId || 'other_construction', 80), serviceLabel: serviceLabel(input.serviceId, input.serviceLabel),
      description: clean(input.description, 2000), source: clean(input.source || 'manual', 120),
      sourceEventId: clean(input.sourceEventId, 180) || null, sourceResponseFingerprint: clean(input.sourceResponseFingerprint, 180) || null,
      status, previousStatus: STATUSES.includes(input.previousStatus) ? input.previousStatus : null,
      owner: clean(input.owner, 120) || null, estimatedAmount: nullableAmount(input.estimatedAmount),
      confirmedAmount: nullableAmount(input.confirmedAmount), quoteReference: clean(input.quoteReference, 180) || null,
      nextAction: input.nextAction && typeof input.nextAction === 'object' ? {
        text: clean(input.nextAction.text, 300), dueAt: input.nextAction.dueAt ? iso(input.nextAction.dueAt) : null,
        status: ['pending', 'completed', 'discarded'].includes(input.nextAction.status) ? input.nextAction.status : 'pending',
        updatedAt: iso(input.nextAction.updatedAt || input.updatedAt)
      } : null,
      notes: Array.isArray(input.notes) ? input.notes.map(note => clean(note, 1000)).filter(Boolean) : [],
      documents: Array.isArray(input.documents) ? input.documents.map(clone) : [],
      originIdentity: input.originIdentity && typeof input.originIdentity === 'object' ? clone(input.originIdentity) : ((input.sourceEventId || input.sourceResponseFingerprint) ? { companyId: clean(input.companyId, 160), establishmentId: clean(input.establishmentId, 160) || null, contactId: clean(input.contactId, 160) || null, target: normalizeEmail(input.target) || null } : null),
      identityTransfers: Array.isArray(input.identityTransfers) ? input.identityTransfers.map(clone) : [],
      history: normalizeHistory(input.history), outcome: input.outcome && typeof input.outcome === 'object' ? clone(input.outcome) : null,
      createdAt: iso(input.createdAt), updatedAt: iso(input.updatedAt || input.createdAt)
    };
  }

  function historyEntry(opportunity, type, payload, options = {}) {
    const occurredAt = iso(options.occurredAt);
    const idempotencyKey = clean(options.idempotencyKey || `${type}:${occurredAt}:${memoryApi.hash(payload || {})}`, 300);
    return { historyId: memoryApi.stableId('c6-history', [opportunity.opportunityId, idempotencyKey]), idempotencyKey, type, occurredAt, actor: options.actor || 'user', payload: clone(payload || {}) };
  }
  function appendHistory(opportunity, entry) {
    const existing = opportunity.history.find(item => item.historyId === entry.historyId);
    if (existing) {
      if (memoryApi.canonical(existing) !== memoryApi.canonical(entry)) throw new Error('C6_HISTORY_IDEMPOTENCY_COLLISION');
      return { opportunity, reused: true, entry: existing };
    }
    opportunity.history.push(entry); opportunity.history.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    return { opportunity, reused: false, entry };
  }
  function ensureCompany(memory, companyId) { if (!companyId || !memory.companies?.[companyId]) throw new Error('C6_COMPANY_REQUIRED'); return memory.companies[companyId]; }
  function ensureIdentityReferences(memory, input) {
    const company = ensureCompany(memory, input.companyId);
    if (input.contactId && (!memory.contacts?.[input.contactId] || !(company.contactIds || []).includes(input.contactId))) throw new Error('C6_CONTACT_COMPANY_MISMATCH');
    if (input.establishmentId && (!memory.establishments?.[input.establishmentId] || memory.establishments[input.establishmentId].companyId !== input.companyId)) throw new Error('C6_ESTABLISHMENT_COMPANY_MISMATCH');
    if (input.target) {
      if (!input.contactId) throw new Error('C6_TARGET_CONTACT_REQUIRED');
      const points = (memory.contacts[input.contactId]?.contactPoints || []).filter(point => point?.channel === 'email').map(point => normalizeEmail(point.value)).filter(Boolean);
      if (!points.includes(normalizeEmail(input.target))) throw new Error('C6_CONTACT_TARGET_MISMATCH');
    }
    return company;
  }
  function opportunityIdFor(input) {
    if (input.opportunityId) return clean(input.opportunityId, 160);
    if (input.sourceResponseFingerprint) return memoryApi.stableId('opportunity', [input.companyId, input.contactId || '', input.sourceResponseFingerprint, input.serviceId || 'other_construction']);
    if (!input.creationKey) throw new Error('C6_CREATION_KEY_REQUIRED');
    return memoryApi.stableId('opportunity', [input.companyId, input.establishmentId || '', input.contactId || '', input.creationKey]);
  }
  function addMemoryEvent(memory, opportunity, type, payload, options = {}) {
    return memoryApi.appendEvent(memory, {
      companyId: opportunity.companyId, establishmentId: opportunity.establishmentId, contactId: opportunity.contactId,
      opportunityId: opportunity.opportunityId, type, payload, actor: options.actor || 'user', occurredAt: options.occurredAt,
      sourceRef: options.sourceRef || 'commercial-opportunities-c6', idempotencyKey: options.idempotencyKey
    }, { mutate: true });
  }
  function createOpportunity(memoryInput, input = {}, options = {}) {
    if (input.humanConfirmed !== true) throw new Error('C6_HUMAN_CONFIRMATION_REQUIRED');
    const memory = memoryApi.normalizeMemory(memoryInput); const company = ensureIdentityReferences(memory, input);
    const opportunityId = opportunityIdFor(input); const existing = memory.opportunities[opportunityId];
    if (existing) {
      if (existing.companyId !== input.companyId || (input.sourceResponseFingerprint && existing.sourceResponseFingerprint !== input.sourceResponseFingerprint)) throw new Error('C6_OPPORTUNITY_ID_COLLISION');
      return { memory, opportunity: normalizeOpportunity(existing), reused: true };
    }
    const now = iso(options.occurredAt || input.createdAt);
    const opportunity = normalizeOpportunity({ ...input, opportunityId, status: input.status || 'identified', createdAt: now, updatedAt: now });
    if (!opportunity.title || !opportunity.description) throw new Error('C6_OPPORTUNITY_DETAILS_REQUIRED');
    validateInitialStatus(opportunity.status, input);
    if (opportunity.status === 'quote_sent') opportunity.quoteReference = clean(input.quoteReference || input.note, 180);
    if (opportunity.status === 'won') opportunity.outcome = { result: 'won', reason: clean(input.note, 500), at: now };
    if (opportunity.status === 'lost') opportunity.outcome = { result: 'lost', reason: clean(input.lossReason || input.note, 500), at: now };
    const entry = historyEntry(opportunity, 'created', { status: opportunity.status, source: opportunity.source, sourceEventId: opportunity.sourceEventId, sourceResponseFingerprint: opportunity.sourceResponseFingerprint, evidenceType: input.evidenceType || null, evidenceId: clean(input.evidenceId, 180) || null, note: clean(input.note, 500) || null }, { occurredAt: now, idempotencyKey: `created:${opportunityId}` });
    appendHistory(opportunity, entry); memory.opportunities[opportunityId] = opportunity;
    company.opportunityIds = [...new Set([...(company.opportunityIds || []), opportunityId])]; company.updatedAt = now;
    addMemoryEvent(memory, opportunity, 'opportunity_created', { status: opportunity.status, title: opportunity.title }, { occurredAt: now, idempotencyKey: `c6-created:${opportunityId}` });
    return { memory, opportunity, reused: false };
  }
  function validateInitialStatus(status, input = {}) {
    if (status === 'quote_sent' && (input.evidenceType !== 'quote_sent_confirmed' || !clean(input.quoteReference || input.note, 180))) throw new Error('C6_QUOTE_SENT_EVIDENCE_REQUIRED');
    if (status === 'won' && (input.evidenceType !== 'contract_confirmed' || !clean(input.note, 500))) throw new Error('C6_WON_EVIDENCE_REQUIRED');
    if (status === 'lost' && !clean(input.lossReason || input.note, 500)) throw new Error('C6_LOSS_REASON_REQUIRED');
  }
  function transitionEvidence(current, next, input = {}) {
    if (input.humanConfirmed !== true) throw new Error('C6_HUMAN_CONFIRMATION_REQUIRED');
    if (!(TRANSITIONS[current] || []).includes(next)) throw new Error('C6_TRANSITION_FORBIDDEN');
    if (next === 'quote_sent' && (input.evidenceType !== 'quote_sent_confirmed' || !clean(input.quoteReference || input.note, 180))) throw new Error('C6_QUOTE_SENT_EVIDENCE_REQUIRED');
    if (next === 'won' && (input.evidenceType !== 'contract_confirmed' || !clean(input.note, 500))) throw new Error('C6_WON_EVIDENCE_REQUIRED');
    if (next === 'lost' && !clean(input.lossReason || input.note, 500)) throw new Error('C6_LOSS_REASON_REQUIRED');
  }
  function transitionOpportunity(memoryInput, opportunityId, nextStatus, input = {}, options = {}) {
    const memory = memoryApi.normalizeMemory(memoryInput); const source = memory.opportunities[opportunityId];
    if (!source) throw new Error('C6_OPPORTUNITY_NOT_FOUND');
    const opportunity = normalizeOpportunity(source);
    const requestedKey = clean(options.idempotencyKey || input.idempotencyKey, 300);
    const prior = requestedKey && opportunity.history.find(item => item.idempotencyKey === requestedKey);
    if (prior) {
      if (prior.type !== 'stage_changed' || prior.payload?.to !== nextStatus) throw new Error('C6_HISTORY_IDEMPOTENCY_COLLISION');
      return { memory, opportunity, reused: true };
    }
    transitionEvidence(opportunity.status, nextStatus, input);
    const key = clean(options.idempotencyKey || input.idempotencyKey || `stage:${opportunityId}:${opportunity.status}:${nextStatus}:${input.evidenceId || ''}`, 300);
    const entry = historyEntry(opportunity, 'stage_changed', { from: opportunity.status, to: nextStatus, evidenceType: input.evidenceType || null, note: clean(input.note, 500) || null, lossReason: clean(input.lossReason, 500) || null }, { occurredAt: options.occurredAt, idempotencyKey: key });
    const appended = appendHistory(opportunity, entry);
    if (appended.reused) return { memory, opportunity, reused: true };
    opportunity.previousStatus = opportunity.status; opportunity.status = nextStatus; opportunity.updatedAt = entry.occurredAt;
    if (nextStatus === 'quote_sent') opportunity.quoteReference = clean(input.quoteReference || input.note, 180);
    if (input.confirmedAmount !== undefined) opportunity.confirmedAmount = nullableAmount(input.confirmedAmount);
    if (nextStatus === 'won') opportunity.outcome = { result: 'won', reason: clean(input.note, 500), at: entry.occurredAt };
    if (nextStatus === 'lost') opportunity.outcome = { result: 'lost', reason: clean(input.lossReason || input.note, 500), at: entry.occurredAt };
    memory.opportunities[opportunityId] = opportunity;
    addMemoryEvent(memory, opportunity, 'opportunity_stage_changed', entry.payload, { occurredAt: entry.occurredAt, idempotencyKey: `c6-${key}` });
    return { memory, opportunity, reused: false };
  }
  function updateOpportunity(memoryInput, opportunityId, patch = {}, options = {}) {
    if (patch.humanConfirmed !== true) throw new Error('C6_HUMAN_CONFIRMATION_REQUIRED');
    const memory = memoryApi.normalizeMemory(memoryInput); const source = memory.opportunities[opportunityId]; if (!source) throw new Error('C6_OPPORTUNITY_NOT_FOUND');
    const rejectedIdentityFields = ['companyId', 'establishmentId', 'contactId', 'target'].filter(field => patch[field] !== undefined && (patch[field] || null) !== (source[field] || null));
    const prior = options.idempotencyKey && normalizeOpportunity(source).history.find(item => item.idempotencyKey === options.idempotencyKey);
    if (prior) return { memory, opportunity: normalizeOpportunity(source), reused: true };
    const opportunity = normalizeOpportunity({ ...source, title: patch.title ?? source.title, description: patch.description ?? source.description, serviceId: patch.serviceId ?? source.serviceId, serviceLabel: patch.serviceLabel ?? source.serviceLabel, owner: patch.owner ?? source.owner, estimatedAmount: patch.estimatedAmount !== undefined ? patch.estimatedAmount : source.estimatedAmount, confirmedAmount: patch.confirmedAmount !== undefined ? patch.confirmedAmount : source.confirmedAmount, updatedAt: options.occurredAt });
    ensureIdentityReferences(memory, opportunity);
    const fields = Object.keys(patch).filter(key => key !== 'humanConfirmed' && !['companyId', 'establishmentId', 'contactId', 'target'].includes(key));
    const entry = historyEntry(opportunity, rejectedIdentityFields.length ? 'identity_change_rejected' : 'updated', { fields, rejectedIdentityFields, transferRequired: rejectedIdentityFields.length > 0 }, { occurredAt: options.occurredAt, idempotencyKey: options.idempotencyKey }); appendHistory(opportunity, entry);
    memory.opportunities[opportunityId] = opportunity; addMemoryEvent(memory, opportunity, 'opportunity_updated', entry.payload, { occurredAt: entry.occurredAt, idempotencyKey: `c6-${entry.idempotencyKey}` });
    return { memory, opportunity, identityChangeRejected: rejectedIdentityFields.length > 0 };
  }
  function transferOpportunityIdentity(memoryInput, opportunityId, transfer = {}, options = {}) {
    if (transfer.humanConfirmed !== true || transfer.transferApproved !== true) throw new Error('C6_IDENTITY_TRANSFER_APPROVAL_REQUIRED');
    const reason = clean(transfer.reason, 500); if (!reason) throw new Error('C6_IDENTITY_TRANSFER_REASON_REQUIRED');
    const memory = memoryApi.normalizeMemory(memoryInput); const source = memory.opportunities[opportunityId]; if (!source) throw new Error('C6_OPPORTUNITY_NOT_FOUND');
    const opportunity = normalizeOpportunity(source);
    const next = { companyId: opportunity.companyId, establishmentId: transfer.establishmentId !== undefined ? (clean(transfer.establishmentId, 160) || null) : opportunity.establishmentId, contactId: transfer.contactId !== undefined ? (clean(transfer.contactId, 160) || null) : opportunity.contactId, target: transfer.target !== undefined ? (normalizeEmail(transfer.target) || null) : opportunity.target };
    ensureIdentityReferences(memory, next);
    const previous = { companyId: opportunity.companyId, establishmentId: opportunity.establishmentId, contactId: opportunity.contactId, target: opportunity.target };
    const key = clean(options.idempotencyKey || transfer.idempotencyKey || `identity-transfer:${opportunityId}:${memoryApi.hash({ previous, next, reason })}`, 300);
    const prior = opportunity.history.find(item => item.idempotencyKey === key);
    if (prior) {
      if (prior.type !== 'identity_transferred' || memoryApi.canonical(prior.payload?.to) !== memoryApi.canonical(next)) throw new Error('C6_HISTORY_IDEMPOTENCY_COLLISION');
      return { memory, opportunity, reused: true };
    }
    if (memoryApi.canonical(previous) === memoryApi.canonical(next)) throw new Error('C6_IDENTITY_TRANSFER_NO_CHANGE');
    const at = iso(options.occurredAt); const payload = { from: previous, to: next, reason, sourceEventId: opportunity.sourceEventId, sourceResponseFingerprint: opportunity.sourceResponseFingerprint };
    const entry = historyEntry(opportunity, 'identity_transferred', payload, { occurredAt: at, idempotencyKey: key, actor: options.actor || 'user' }); appendHistory(opportunity, entry);
    opportunity.establishmentId = next.establishmentId; opportunity.contactId = next.contactId; opportunity.target = next.target; opportunity.updatedAt = at;
    opportunity.identityTransfers.push({ transferId: entry.historyId, ...payload, approvedAt: at, approvedBy: options.actor || 'user' });
    memory.opportunities[opportunityId] = opportunity;
    addMemoryEvent(memory, opportunity, 'opportunity_identity_transferred', payload, { occurredAt: at, idempotencyKey: `c6-${key}`, actor: options.actor || 'user' });
    return { memory, opportunity, reused: false };
  }
  function setNextAction(memoryInput, opportunityId, action = {}, options = {}) {
    if (action.humanConfirmed !== true) throw new Error('C6_HUMAN_CONFIRMATION_REQUIRED');
    const memory = memoryApi.normalizeMemory(memoryInput); const source = memory.opportunities[opportunityId]; if (!source) throw new Error('C6_OPPORTUNITY_NOT_FOUND');
    const opportunity = normalizeOpportunity(source);
    const prior = options.idempotencyKey && opportunity.history.find(item => item.idempotencyKey === options.idempotencyKey);
    if (prior) return { memory, opportunity, reused: true };
    const text = clean(action.text, 300); if (!text) throw new Error('C6_ACTION_TEXT_REQUIRED');
    const status = ['pending', 'completed', 'discarded'].includes(action.status) ? action.status : 'pending';
    const now = iso(options.occurredAt); opportunity.nextAction = { text, dueAt: action.dueAt ? iso(action.dueAt) : null, status, updatedAt: now }; opportunity.updatedAt = now;
    const type = status === 'completed' ? 'opportunity_action_completed' : status === 'discarded' ? 'opportunity_action_discarded' : 'opportunity_action_set';
    const entry = historyEntry(opportunity, type, opportunity.nextAction, { occurredAt: now, idempotencyKey: options.idempotencyKey }); appendHistory(opportunity, entry);
    memory.opportunities[opportunityId] = opportunity; addMemoryEvent(memory, opportunity, type, entry.payload, { occurredAt: now, idempotencyKey: `c6-${entry.idempotencyKey}` });
    return { memory, opportunity };
  }
  function totals(memoryInput) {
    const memory = memoryView(memoryInput); const opportunities = Object.values(memory.opportunities || {}).map(normalizeOpportunity);
    const byStatus = Object.fromEntries(STATUSES.map(status => [status, 0])); let openKnown = 0; let openUnknown = 0; let wonKnown = 0; let wonUnknown = 0;
    for (const item of opportunities) {
      byStatus[item.status]++;
      if (OPEN.has(item.status)) item.estimatedAmount === null ? openUnknown++ : openKnown += item.estimatedAmount;
      if (item.status === 'won') item.confirmedAmount === null ? wonUnknown++ : wonKnown += item.confirmedAmount;
    }
    const total = opportunities.length; const won = byStatus.won; const lost = byStatus.lost;
    const reached = (item, status) => item.status === status || item.history.some(entry => entry.payload?.from === status || entry.payload?.to === status || entry.payload?.status === status);
    const quoteRequests = opportunities.filter(item => reached(item, 'quote_requested')).length;
    const sentQuotes = opportunities.filter(item => reached(item, 'quote_sent')).length;
    const events = Object.values(memory.events || {});
    const confirmedContacts = new Set(events.filter(event => event.type === 'send_confirmed').map(event => [event.companyId, event.contactId, event.channel, event.payload?.target || ''].join('|'))).size;
    return { total, companies: Object.keys(memory.companies || {}).length, confirmedContacts, responses: events.filter(event => event.type === 'response_received').length, open: opportunities.filter(item => OPEN.has(item.status)).length, pendingActions: opportunities.filter(item => OPEN.has(item.status) && item.nextAction?.status === 'pending').length, byStatus, quoteRequests, pendingQuotes: byStatus.quote_requested + byStatus.quote_preparing, sentQuotes, negotiations: byStatus.negotiation, won, lost, openAmount: { known: openKnown, unknownCount: openUnknown }, wonAmount: { known: wonKnown, unknownCount: wonUnknown }, conversion: { wonFromClosed: won + lost ? won / (won + lost) : null, quoteFromTotal: total ? quoteRequests / total : null } };
  }
  function agenda(memoryInput, nowValue) {
    const memory = memoryView(memoryInput); const now = Date.parse(nowValue || new Date().toISOString()); const rows = [];
    for (const raw of Object.values(memory.opportunities || {})) {
      const item = normalizeOpportunity(raw); if (!OPEN.has(item.status) || item.status === 'suspended') continue;
      const action = item.nextAction; let priority = 4; let reason = 'Revisar oportunidad sin proxima accion';
      if (item.status === 'quote_requested') { priority = 1; reason = 'Contestar y preparar presupuesto solicitado'; }
      else if (item.status === 'quote_preparing') { priority = 1; reason = 'Completar presupuesto pendiente'; }
      else if (item.status === 'negotiation') { priority = 2; reason = 'Revisar propuesta en negociacion'; }
      else if (item.status === 'quote_sent') { priority = 3; reason = 'Revisar decision pendiente'; }
      if (action?.status === 'pending') {
        const due = action.dueAt ? Date.parse(action.dueAt) : NaN;
        if (Number.isFinite(due) && due <= now) { priority = 0; reason = action.text; }
        else reason = action.text;
      }
      rows.push({ opportunityId: item.opportunityId, companyId: item.companyId, status: item.status, priority, reason, dueAt: action?.dueAt || null });
    }
    return rows.sort((a, b) => a.priority - b.priority || (Date.parse(a.dueAt || '9999') - Date.parse(b.dueAt || '9999')) || a.opportunityId.localeCompare(b.opportunityId));
  }

  function resolveOpportunityRecipient(memoryInput, opportunityInput, leadsInput) {
    const memory = memoryInput && typeof memoryInput === 'object' && memoryInput.companies && memoryInput.contacts && memoryInput.opportunities
      ? memoryInput
      : memoryApi.normalizeMemory(memoryInput || {});
    const opportunity = normalizeOpportunity(opportunityInput || {});
    const fail = reason => ({ ok: false, reason, lead: null, contact: null, target: null, companyId: opportunity.companyId, contactId: opportunity.contactId, purpose: opportunity.purpose });
    const company = memory.companies?.[opportunity.companyId]; if (!company) return fail('C6_RECIPIENT_COMPANY_NOT_FOUND');
    if (!opportunity.contactId) return fail('C6_RECIPIENT_CONTACT_REQUIRED');
    if (!(company.contactIds || []).includes(opportunity.contactId)) return fail('C6_RECIPIENT_CONTACT_NOT_IN_COMPANY');
    const contact = memory.contacts?.[opportunity.contactId]; if (!contact) return fail('C6_RECIPIENT_CONTACT_NOT_FOUND');
    const emails = [...new Set((contact.contactPoints || []).filter(point => point?.channel === 'email').map(point => normalizeEmail(point.value)).filter(Boolean))];
    let target = normalizeEmail(opportunity.target);
    if (target && !emails.includes(target)) return fail('C6_RECIPIENT_TARGET_CONTACT_MISMATCH');
    if (!target) {
      if (emails.length !== 1) return fail(emails.length ? 'C6_RECIPIENT_TARGET_AMBIGUOUS' : 'C6_RECIPIENT_EMAIL_REQUIRED');
      target = emails[0];
    }
    const matches = (Array.isArray(leadsInput) ? leadsInput : []).filter(lead => {
      const alias = lead?.id != null ? memory.aliases?.[`lead:${lead.id}`] : null;
      const companyId = lead?.commercialRefs?.companyId || alias?.companyId;
      const contactId = lead?.commercialRefs?.contactId || alias?.contactId;
      return companyId === opportunity.companyId && contactId === opportunity.contactId && normalizeEmail(lead?.email) === target;
    });
    if (matches.length !== 1) return fail(matches.length ? 'C6_RECIPIENT_LEAD_AMBIGUOUS' : 'C6_RECIPIENT_LEAD_NOT_FOUND');
    return { ok: true, reason: null, lead: matches[0], company, contact, target, companyId: opportunity.companyId, establishmentId: opportunity.establishmentId, contactId: opportunity.contactId, purpose: opportunity.purpose };
  }

  function installBrowser(root) {
    const repository = memoryApi.createBrowserRepository(root); let mode = 'kanban'; let page = 0; let filterStatus = 'all'; let query = ''; const PAGE_SIZE = 50;
    const node = (tag, className, text) => { const item = root.document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = String(text); return item; };
    const money = value => value === null ? 'Desconocido' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
    const currentLeads = () => Array.isArray(root.leads) ? root.leads : (typeof leads !== 'undefined' && Array.isArray(leads) ? leads : []);
    async function mutate(label, operation) { const result = await repository.mutate(label, operation); await render(); return result; }
    function openEditor(memory, opportunity) {
      root.document.getElementById('commercial-opportunity-c6-modal')?.remove();
      const overlay = node('div', 'c6-modal-overlay'); overlay.id = 'commercial-opportunity-c6-modal';
      const dialog = node('section', 'c6-modal'); const title = node('h2', '', opportunity ? 'Editar oportunidad' : 'Nueva oportunidad'); dialog.append(title);
      const company = node('select'); Object.values(memory.companies || {}).sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(item => { const option = node('option', '', item.name || item.companyId); option.value = item.companyId; option.selected = item.companyId === opportunity?.companyId; company.append(option); });
      const establishment = node('select'); const contact = node('select');
      function fillRelations() {
        const selected = memory.companies?.[company.value]; establishment.replaceChildren(); contact.replaceChildren();
        const noEstablishment = node('option', '', 'Sin establecimiento especifico'); noEstablishment.value = ''; establishment.append(noEstablishment);
        (selected?.establishmentIds || []).map(id => memory.establishments[id]).filter(Boolean).forEach(item => { const option = node('option', '', item.address || item.name || item.establishmentId); option.value = item.establishmentId; option.selected = item.establishmentId === opportunity?.establishmentId; establishment.append(option); });
        const noContact = node('option', '', 'Sin contacto especifico'); noContact.value = ''; contact.append(noContact);
        (selected?.contactIds || []).map(id => memory.contacts[id]).filter(Boolean).forEach(item => {
          const emails = [...new Set((item.contactPoints || []).filter(point => point?.channel === 'email').map(point => normalizeEmail(point.value)).filter(Boolean))];
          if (!emails.length) { const option = node('option', '', `${[item.name, item.role].filter(Boolean).join(' - ') || item.contactId} (sin email)`); option.value = item.contactId; option.disabled = true; contact.append(option); return; }
          emails.forEach(email => { const option = node('option', '', [[item.name, item.role].filter(Boolean).join(' - ') || item.contactId, email].join(' - ')); option.value = item.contactId; option.dataset.target = email; option.selected = item.contactId === opportunity?.contactId && (!opportunity?.target || normalizeEmail(opportunity.target) === email); contact.append(option); });
        });
      }
      company.onchange = fillRelations; fillRelations();
      if (opportunity) { company.disabled = true; establishment.disabled = true; contact.disabled = true; }
      const name = node('input'); name.value = opportunity?.title || ''; const description = node('textarea'); description.rows = 4; description.value = opportunity?.description || '';
      const service = node('select'); SERVICES.forEach(([id, label]) => { const option = node('option', '', label); option.value = id; option.selected = id === opportunity?.serviceId; service.append(option); });
      const amount = node('input'); amount.type = 'number'; amount.min = '0'; amount.step = '0.01'; amount.value = opportunity?.estimatedAmount ?? '';
      const status = node('select'); STATUSES.forEach(value => { const option = node('option', '', STATUS_LABELS[value]); option.value = value; option.selected = value === opportunity?.status; status.append(option); }); status.disabled = !opportunity;
      const evidence = node('input'); evidence.placeholder = 'Evidencia o motivo requerido para enviar, ganar o perder';
      const next = node('input'); next.placeholder = 'Proxima accion'; next.value = opportunity?.nextAction?.text || ''; const due = node('input'); due.type = 'date'; due.value = opportunity?.nextAction?.dueAt?.slice(0, 10) || '';
      const actionStatus = node('select'); [['pending', 'Pendiente'], ['completed', 'Completada'], ['discarded', 'Descartada']].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; option.selected = value === (opportunity?.nextAction?.status || 'pending'); actionStatus.append(option); });
      const add = (label, control) => { const wrap = node('label'); wrap.append(node('span', '', label), control); dialog.append(wrap); };
      add('Empresa', company); add('Establecimiento', establishment); add('Contacto', contact); add('Oportunidad', name); add('Servicio', service); add('Descripcion', description); add('Importe estimado conocido', amount); if (opportunity) add('Nuevo estado', status); add('Evidencia o motivo', evidence); add('Proxima accion', next); add('Fecha de accion', due); add('Estado de la accion', actionStatus);
      const actions = node('div', 'c6-modal-actions'); const cancel = node('button', 'btn-outline', 'Cancelar'); const save = node('button', 'btn-primary', 'Guardar'); cancel.type = save.type = 'button'; cancel.onclick = () => overlay.remove();
      save.onclick = async () => {
        save.disabled = true;
        try {
          let savedOpportunityId = opportunity?.opportunityId || null;
          if (!opportunity) {
            const created = await mutate('crear oportunidad C6', memoryNow => createOpportunity(memoryNow, { companyId: company.value, establishmentId: establishment.value || null, contactId: contact.value || null, target: contact.selectedOptions[0]?.dataset.target || null, creationKey: root.crypto.randomUUID(), title: name.value, description: description.value, serviceId: service.value, estimatedAmount: amount.value, source: 'manual', humanConfirmed: true }));
            savedOpportunityId = created.result?.opportunity?.opportunityId || null;
          } else {
            await mutate('editar oportunidad C6', memoryNow => updateOpportunity(memoryNow, opportunity.opportunityId, { establishmentId: establishment.value || null, contactId: contact.value || null, title: name.value, description: description.value, serviceId: service.value, estimatedAmount: amount.value, humanConfirmed: true }));
            if (status.value !== opportunity.status) await mutate('cambiar etapa C6', memoryNow => transitionOpportunity(memoryNow, opportunity.opportunityId, status.value, { humanConfirmed: true, evidenceType: status.value === 'quote_sent' ? 'quote_sent_confirmed' : status.value === 'won' ? 'contract_confirmed' : 'human_confirmation', note: evidence.value, quoteReference: evidence.value, lossReason: evidence.value }));
          }
          if (next.value.trim()) {
            if (!savedOpportunityId) throw new Error('C6_OPPORTUNITY_ID_UNRESOLVED');
            await mutate('accion oportunidad C6', memoryNow => setNextAction(memoryNow, savedOpportunityId, { text: next.value, dueAt: due.value ? `${due.value}T09:00:00` : null, status: actionStatus.value, humanConfirmed: true }));
          }
          overlay.remove();
        } catch (error) { root.showToast?.(`No se pudo guardar: ${error.message}`); }
        finally { save.disabled = false; }
      };
      actions.append(cancel, save); dialog.append(actions); overlay.append(dialog); root.document.body.append(overlay);
    }
    function renderMetrics(host, summary) {
      const values = [['Empresas', summary.companies], ['Contactos confirmados', summary.confirmedContacts], ['Respuestas', summary.responses], ['Abiertas', summary.open], ['Solicitudes', summary.quoteRequests], ['Presupuestos pendientes', summary.pendingQuotes], ['Presupuestos enviados', summary.sentQuotes], ['Negociacion', summary.negotiations], ['Acciones pendientes', summary.pendingActions], ['Ganados', summary.won], ['Perdidos', summary.lost], ['Importe abierto', money(summary.openAmount.known) + (summary.openAmount.unknownCount ? ` + ${summary.openAmount.unknownCount} sin valorar` : '')], ['Importe ganado', money(summary.wonAmount.known) + (summary.wonAmount.unknownCount ? ` + ${summary.wonAmount.unknownCount} desconocidos` : '')]];
      const grid = node('div', 'c6-metrics'); values.forEach(([label, value]) => { const item = node('div', 'c6-metric'); item.append(node('span', '', label), node('strong', '', value)); grid.append(item); }); host.append(grid);
    }
    function card(memory, opportunity) {
      const company = memory.companies[opportunity.companyId]; const item = node('article', 'c6-card'); item.tabIndex = 0;
      item.append(node('strong', '', opportunity.title), node('span', 'c6-company', company?.name || opportunity.companyId), node('span', 'c6-service', opportunity.serviceLabel));
      const amount = node('span', 'c6-amount', `Estimacion: ${money(opportunity.estimatedAmount)}`); item.append(amount);
      if (opportunity.nextAction?.status === 'pending') item.append(node('span', 'c6-next', opportunity.nextAction.text));
      const binding = resolveOpportunityRecipient(memory, opportunity, currentLeads());
      const prepare = node('button', 'btn-outline c6-email-button', binding.ok ? 'Preparar correo' : 'Correo no disponible'); prepare.type = 'button'; prepare.disabled = !binding.ok; prepare.title = binding.ok ? `Destinatario: ${binding.target}` : 'No se pudo resolver de forma inequivoca el contacto y su email.';
      prepare.onclick = event => {
        event.stopPropagation();
        const current = resolveOpportunityRecipient(root.__c6Memory || memory, opportunity, currentLeads());
        if (!current.ok) return root.showToast?.(`No se puede preparar el correo: ${current.reason}`);
        if (!root.VoltflowCommercialEmailC3?.openComposer) return root.showToast?.('El compositor C3 no esta disponible.');
        root.VoltflowCommercialEmailC3.openComposer(current.lead, { companyId: current.companyId, establishmentId: current.establishmentId, contactId: current.contactId, target: current.target, purpose: current.purpose, strictIdentity: true, identityLocked: true, opportunityId: opportunity.opportunityId });
      };
      item.append(prepare);
      item.onclick = () => openEditor(memory, opportunity); return item;
    }
    async function render() {
      const host = root.document.getElementById('opportunities-c6-root'); if (!host) return;
      const memory = await repository.read(); root.__c6Memory = memory; const summary = totals(memory); const actions = agenda(memory); host.replaceChildren();
      const header = node('div', 'c6-header'); const heading = node('div'); heading.append(node('h1', '', 'Centro de oportunidades'), node('p', '', 'Trabajos, presupuestos y proximas acciones comerciales'));
      const controls = node('div', 'c6-controls'); const kanban = node('button', mode === 'kanban' ? 'btn-primary' : 'btn-outline', 'Kanban'); const table = node('button', mode === 'table' ? 'btn-primary' : 'btn-outline', 'Tabla'); const create = node('button', 'btn-primary', 'Nueva oportunidad'); kanban.type = table.type = create.type = 'button'; kanban.onclick = () => { mode = 'kanban'; render(); }; table.onclick = () => { mode = 'table'; render(); }; create.onclick = () => openEditor(memory, null); controls.append(kanban, table, create); header.append(heading, controls); host.append(header); renderMetrics(host, summary);
      const filters = node('div', 'c6-filters'); const search = node('input'); search.type = 'search'; search.placeholder = 'Buscar oportunidad o empresa'; search.value = query; search.onchange = () => { query = search.value.trim().toLocaleLowerCase('es'); page = 0; render(); }; const stage = node('select'); const all = node('option', '', 'Todos los estados'); all.value = 'all'; stage.append(all); STATUSES.forEach(value => { const option = node('option', '', STATUS_LABELS[value]); option.value = value; option.selected = filterStatus === value; stage.append(option); }); stage.value = filterStatus; stage.onchange = () => { filterStatus = stage.value; page = 0; render(); }; filters.append(search, stage); host.append(filters);
      const today = node('section', 'c6-today'); today.append(node('h2', '', 'Que debo hacer hoy')); const actionList = node('div', 'c6-action-list'); actions.slice(0, 12).forEach(action => { const opportunity = normalizeOpportunity(memory.opportunities[action.opportunityId]); const row = node('button', 'c6-action-row'); row.type = 'button'; row.append(node('strong', '', opportunity.title), node('span', '', action.reason), node('small', '', action.dueAt ? new Date(action.dueAt).toLocaleDateString('es-ES') : 'Sin fecha inventada')); row.onclick = () => openEditor(memory, opportunity); actionList.append(row); }); if (!actions.length) actionList.append(node('p', 'c6-empty', 'No hay acciones pendientes documentadas.')); today.append(actionList); host.append(today);
      const opportunities = Object.values(memory.opportunities || {}).map(normalizeOpportunity).filter(item => {
        if (filterStatus !== 'all' && item.status !== filterStatus) return false;
        const haystack = `${item.title} ${item.description} ${memory.companies[item.companyId]?.name || ''} ${item.serviceLabel}`.toLocaleLowerCase('es');
        return !query || haystack.includes(query);
      }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      if (mode === 'kanban') {
        const board = node('div', 'c6-kanban'); STATUSES.forEach(status => { const column = node('section', 'c6-column'); const rows = opportunities.filter(item => item.status === status); column.append(node('h3', '', `${STATUS_LABELS[status]} (${rows.length})`)); const list = node('div', 'c6-column-list'); rows.slice(0, PAGE_SIZE).forEach(item => list.append(card(memory, item))); if (rows.length > PAGE_SIZE) list.append(node('p', 'c6-empty', `Mostrando ${PAGE_SIZE} de ${rows.length}`)); column.append(list); board.append(column); }); host.append(board);
      } else {
        const pages = Math.max(1, Math.ceil(opportunities.length / PAGE_SIZE)); if (page >= pages) page = pages - 1;
        const wrap = node('div', 'c6-table-wrap'); const tableEl = node('table', 'c6-table'); const head = node('thead'); const hr = node('tr'); ['Oportunidad', 'Empresa', 'Estado', 'Servicio', 'Estimacion', 'Proxima accion'].forEach(text => hr.append(node('th', '', text))); head.append(hr); const body = node('tbody'); opportunities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach(item => { const tr = node('tr'); [item.title, memory.companies[item.companyId]?.name || item.companyId, STATUS_LABELS[item.status], item.serviceLabel, money(item.estimatedAmount), item.nextAction?.text || 'Sin accion'].forEach(text => tr.append(node('td', '', text))); tr.onclick = () => openEditor(memory, item); body.append(tr); }); tableEl.append(head, body); wrap.append(tableEl); host.append(wrap);
        const pager = node('div', 'c6-pager'); const previous = node('button', 'btn-outline', 'Anterior'); const info = node('span', '', `Pagina ${page + 1} de ${pages}`); const nextPage = node('button', 'btn-outline', 'Siguiente'); previous.disabled = page === 0; nextPage.disabled = page >= pages - 1; previous.onclick = () => { page--; render(); }; nextPage.onclick = () => { page++; render(); }; pager.append(previous, info, nextPage); host.append(pager);
      }
    }
    root.renderOpportunityCenter = render;
    root.openOpportunityEditor = async opportunityId => { const memory = await repository.read(); openEditor(memory, opportunityId ? normalizeOpportunity(memory.opportunities[opportunityId]) : null); };
    root.addEventListener?.('voltflow:commercial-memory-changed', () => render());
    return { render, repository };
  }

  return Object.freeze({ SCHEMA, SCHEMA_VERSION, STATUSES, STATUS_LABELS, SERVICES, TRANSITIONS, normalizeOpportunity, createOpportunity, updateOpportunity, transferOpportunityIdentity, transitionOpportunity, setNextAction, totals, agenda, resolveOpportunityRecipient, installBrowser, nullableAmount });
});
