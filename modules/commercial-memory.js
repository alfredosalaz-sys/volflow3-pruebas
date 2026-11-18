(function (root, factory) {
  const communications = root?.CommercialCommunications
    || (typeof require === 'function' ? require('./commercial-communications.js') : null);
  const api = factory(communications);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowCommercialMemory = api;
  if (root?.document) api.installBrowser(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (communications) {
  'use strict';

  const STORAGE_KEY = 'gordi_commercial_memory';
  const SCHEMA_VERSION = 2;
  const EVENT_TYPES = new Set([
    'lead_discovered', 'company_incorporated', 'contact_identified',
    'draft_prepared', 'draft_reviewed', 'message_approved', 'external_client_opened',
    'send_confirmed', 'response_received', 'call_logged', 'meeting_logged',
    'information_requested', 'quote_requested', 'quote_sent', 'work_won',
    'contact_rejected', 'opt_out_confirmed', 'note_added', 'service_offered',
    'interest_recorded', 'need_recorded', 'objection_recorded',
    'commercial_status_changed', 'next_action_set', 'next_action_completed',
    'followup_recommended', 'followup_postponed', 'followup_dismissed', 'followup_closed',
    'opportunity_created', 'opportunity_updated', 'opportunity_stage_changed',
    'opportunity_action_set', 'opportunity_action_completed', 'opportunity_action_discarded',
    'opportunity_identity_transferred'
  ]);
  const COMMUNICATION_EVENT = Object.freeze({
    DRAFT_CREATED: 'draft_prepared',
    DRAFT_REVIEWED: 'draft_reviewed',
    DRAFT_APPROVED: 'message_approved',
    EXTERNAL_CLIENT_OPENED: 'external_client_opened',
    PENDING_SEND_CONFIRMATION: 'external_client_opened',
    SENT_CONFIRMED: 'send_confirmed',
    INBOUND_RECEIVED: 'response_received'
  });
  const STATUS_LABELS = Object.freeze({
    new: 'Pendiente de primer contacto', contacted: 'Pendiente de respuesta',
    interested: 'Interés confirmado', quote: 'Posible presupuesto',
    won: 'Trabajo conseguido', rejected: 'Descartada', excluded: 'No contactar'
  });

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(value) {
    return String(value == null ? '' : value).trim().toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  }

  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function hash(value) {
    const text = typeof value === 'string' ? value : canonical(value);
    let result = 2166136261;
    for (let index = 0; index < text.length; index++) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36).padStart(7, '0');
  }

  function stableId(prefix, parts) {
    return `${prefix}:${hash(parts.map(normalize).join('|'))}`;
  }

  function iso(value, fallback) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : (fallback || new Date().toISOString());
  }

  function unique(values) {
    return [...new Set((values || []).filter(value => value != null && String(value).trim()).map(String))];
  }

  function emptyMemory() {
    return {
      schema: 'voltflow-commercial-memory', schemaVersion: SCHEMA_VERSION,
      revision: 0, createdAt: new Date().toISOString(), updatedAt: null,
      companies: {}, establishments: {}, contacts: {}, events: {},
      opportunities: {}, tasks: {}, exclusions: {}, aliases: {}, drafts: {},
      followupSettings: { schemaVersion: 1, intervalsDays: [4, 7, 10, 14], pageSize: 20 },
      unknown: {}
    };
  }

  function normalizeMemory(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? clone(input) : {};
    const base = emptyMemory();
    const memory = { ...source, ...base, ...source };
    memory.schema = 'voltflow-commercial-memory';
    memory.schemaVersion = SCHEMA_VERSION;
    memory.revision = Number.isInteger(Number(source.revision)) ? Number(source.revision) : 0;
    ['companies', 'establishments', 'contacts', 'events', 'opportunities', 'tasks', 'exclusions', 'aliases', 'drafts', 'unknown'].forEach(key => {
      memory[key] = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] : {};
    });
    const intervals = Array.isArray(source.followupSettings?.intervalsDays) && source.followupSettings.intervalsDays.length === 4
      ? source.followupSettings.intervalsDays.map(Number)
      : [4, 7, 10, 14];
    memory.followupSettings = {
      ...(source.followupSettings && typeof source.followupSettings === 'object' ? source.followupSettings : {}),
      schemaVersion: 1,
      intervalsDays: intervals.map((value, index) => Number.isInteger(value) && value >= 1 && value <= 90 ? value : [4, 7, 10, 14][index]),
      pageSize: Math.max(10, Math.min(50, Number(source.followupSettings?.pageSize || 20)))
    };
    return memory;
  }

  function memoryView(input) {
    if (input && typeof input === 'object' && !Array.isArray(input)
      && input.companies && input.events && input.contacts && input.opportunities) return input;
    return normalizeMemory(input);
  }

  function deriveIdentities(lead, options = {}) {
    if (communications?.deriveIdentities) return communications.deriveIdentities({ lead, ...options });
    const companyAnchor = lead?.commercialRefs?.companyIdentityAnchor || `lead:${lead?.id || stableId('lead', [lead?.company])}`;
    const companyId = lead?.commercialRefs?.companyId || stableId('company', [companyAnchor]);
    const establishmentId = lead?.commercialRefs?.establishmentId || stableId('establishment', [companyAnchor, lead?.address, lead?.postalCode]);
    const target = options.target || lead?.email || lead?.phone || '';
    return {
      companyId, establishmentId,
      contactId: options.contactId || stableId('contact', [companyAnchor, options.channel || 'identity', target || lead?.name]),
      companyIdentityAnchor: companyAnchor,
      establishmentIdentityAnchor: lead?.commercialRefs?.establishmentIdentityAnchor || `lead-establishment:${lead?.id || establishmentId}`,
      contactIdentityAnchor: stableId('contact-anchor', [companyAnchor, options.channel || 'identity', target || lead?.name])
    };
  }

  function sourceRefFromLead(lead) {
    const sourceId = lead?.discovery?.sourceId || lead?.sourceId || lead?.placeId || lead?.id || null;
    if (!lead?.source && !lead?.discovery?.provider && !sourceId) return null;
    return {
      sourceId: sourceId == null ? null : String(sourceId),
      provider: lead?.discovery?.provider || lead?.source || 'crm',
      sourceUrl: lead?.sourceUrl || lead?.discovery?.sourceUrl || null,
      observedAt: iso(lead?.discovery?.observedAt || lead?.date),
      confidence: lead?.discovery?.confidence || 'unknown'
    };
  }

  function addUniqueObject(list, item, identity) {
    if (!item) return list || [];
    const output = Array.isArray(list) ? list : [];
    const key = identity(item);
    if (!output.some(existing => identity(existing) === key)) output.push(item);
    return output;
  }

  function projectLead(memoryInput, lead, options = {}) {
    if (!lead || typeof lead !== 'object') throw new Error('COMMERCIAL_MEMORY_LEAD_REQUIRED');
    const memory = options.mutate === true ? memoryInput : normalizeMemory(memoryInput);
    const identities = deriveIdentities(lead, options);
    const now = iso(options.now);
    const sourceRef = sourceRefFromLead(lead);
    const existing = memory.companies[identities.companyId] || {};
    const company = {
      ...existing,
      companyId: identities.companyId,
      identityAnchor: identities.companyIdentityAnchor,
      name: lead.company || existing.name || '',
      legalName: lead.legalName || existing.legalName || null,
      sector: lead.segment || existing.sector || null,
      commercialRoles: unique([...(existing.commercialRoles || []), ...(lead.commercialRoles || [])]),
      establishmentIds: unique([...(existing.establishmentIds || []), identities.establishmentId]),
      contactIds: unique(existing.contactIds || []),
      eventIds: unique(existing.eventIds || []),
      opportunityIds: unique(existing.opportunityIds || []),
      servicesOffered: unique(existing.servicesOffered || []),
      interests: unique(existing.interests || []),
      needs: unique(existing.needs || []),
      objections: unique(existing.objections || []),
      notes: unique(existing.notes || []),
      sourceRefs: addUniqueObject(existing.sourceRefs, sourceRef, item => canonical(item)),
      commercialStatus: existing.commercialStatus || 'new',
      nextAction: existing.nextAction || null,
      restrictions: {
        ...(existing.restrictions || {}),
        doNotContact: Boolean(existing.restrictions?.doNotContact || lead.doNotContact || lead.optOut || lead.commercialContactPolicy?.doNotContact),
        legalBasisStatus: lead.commercialContactPolicy?.legalBasisStatus || existing.restrictions?.legalBasisStatus || 'unknown'
      },
      createdAt: existing.createdAt || now,
      updatedAt: existing.updatedAt || now
    };
    memory.companies[company.companyId] = company;

    const currentSite = memory.establishments[identities.establishmentId] || {};
    memory.establishments[identities.establishmentId] = {
      ...currentSite,
      establishmentId: identities.establishmentId,
      companyId: company.companyId,
      identityAnchor: identities.establishmentIdentityAnchor,
      name: lead.establishmentName || lead.company || currentSite.name || '',
      address: lead.address || currentSite.address || null,
      city: lead.city || currentSite.city || null,
      province: lead.province || currentSite.province || null,
      postalCode: lead.postalCode || lead.postal_code || currentSite.postalCode || null,
      coordinates: Number.isFinite(Number(lead.lat)) && Number.isFinite(Number(lead.lng)) ? { lat: Number(lead.lat), lng: Number(lead.lng) } : (currentSite.coordinates || null),
      sourceRefs: addUniqueObject(currentSite.sourceRefs, sourceRef, item => canonical(item)),
      createdAt: currentSite.createdAt || now,
      updatedAt: currentSite.updatedAt || now
    };

    const points = [
      lead.email ? { channel: 'email', value: String(lead.email).trim().toLowerCase() } : null,
      lead.phone ? { channel: 'phone', value: String(lead.phone).trim() } : null
    ].filter(Boolean);
    if (!points.length && lead.name) points.push({ channel: 'identity', value: String(lead.name).trim() });
    const personIdentity = deriveIdentities(lead, {
      ...options,
      contactId: lead?.commercialRefs?.contactId || options.contactId,
      channel: points[0]?.channel || 'identity',
      target: points[0]?.value || lead.name || identities.establishmentId
    });
    points.forEach(point => {
      const contactId = personIdentity.contactId;
      const currentContact = memory.contacts[contactId] || {};
      memory.contacts[contactId] = {
        ...currentContact,
        contactId,
        companyId: company.companyId,
        establishmentId: identities.establishmentId,
        identityAnchor: personIdentity.contactIdentityAnchor,
        name: lead.name || currentContact.name || null,
        role: lead.role || lead.position || currentContact.role || null,
        contactPoints: addUniqueObject(currentContact.contactPoints, {
          channel: point.channel, value: point.value,
          normalizedValue: communications?.normalizeTarget ? communications.normalizeTarget(point.channel, point.value) : normalize(point.value),
          sourceRef, verified: false, legalBasisStatus: lead.commercialContactPolicy?.legalBasisStatus || 'unknown'
        }, item => `${item.channel}:${item.normalizedValue}`),
        createdAt: currentContact.createdAt || now,
        updatedAt: currentContact.updatedAt || now
      };
      company.contactIds = unique([...company.contactIds, contactId]);
    });
    memory.aliases[`lead:${lead.id}`] = {
      companyId: company.companyId,
      establishmentId: identities.establishmentId,
      contactId: personIdentity.contactId
    };
    return { memory, company, establishment: memory.establishments[identities.establishmentId], identities };
  }

  function projectLeadsBatch(memoryInput, leads, options = {}) {
    const memory = normalizeMemory(memoryInput);
    (Array.isArray(leads) ? leads : []).forEach(lead => {
      projectLead(memory, lead, { ...options, mutate: true });
    });
    return memory;
  }

  function eventIdempotency(event) {
    return event.idempotencyKey || [event.companyId, event.type, event.sourceRef || '', event.occurredAt || '', canonical(event.payload || {})].join('|');
  }

  function appendEvent(memoryInput, eventInput, options = {}) {
    const memory = options.mutate === true ? memoryInput : normalizeMemory(memoryInput);
    const event = clone(eventInput || {});
    if (!EVENT_TYPES.has(event.type)) throw new Error(`COMMERCIAL_MEMORY_EVENT_TYPE_INVALID:${event.type || 'missing'}`);
    if (!event.companyId || !memory.companies[event.companyId]) throw new Error('COMMERCIAL_MEMORY_COMPANY_REQUIRED');
    const idempotencyKey = eventIdempotency(event);
    const eventId = event.eventId || stableId('commercial-event', [idempotencyKey]);
    const occurredAt = iso(event.occurredAt);
    const record = {
      schemaVersion: 1, eventId, idempotencyKey,
      companyId: event.companyId,
      establishmentId: event.establishmentId || null,
      contactId: event.contactId || null,
      opportunityId: event.opportunityId || null,
      sequenceId: event.sequenceId || null,
      communicationId: event.communicationId || null,
      type: event.type,
      channel: event.channel || null,
      occurredAt,
      recordedAt: iso(event.recordedAt),
      actor: event.actor || 'user',
      payload: event.payload && typeof event.payload === 'object' ? event.payload : {},
      sourceRef: event.sourceRef || 'local',
      previousEventId: event.previousEventId || null
    };
    const semanticRecord = {
      eventId: record.eventId,
      idempotencyKey: record.idempotencyKey,
      companyId: record.companyId,
      establishmentId: record.establishmentId,
      contactId: record.contactId,
      opportunityId: record.opportunityId,
      sequenceId: record.sequenceId,
      communicationId: record.communicationId,
      type: record.type,
      channel: record.channel,
      occurredAt: record.occurredAt,
      actor: record.actor,
      payload: record.payload,
      sourceRef: record.sourceRef,
      previousEventId: record.previousEventId
    };
    record.integrity = { contentHash: hash(semanticRecord) };
    const existing = memory.events[eventId];
    if (existing) {
      if (existing.integrity?.contentHash !== record.integrity.contentHash) throw new Error('COMMERCIAL_MEMORY_IDEMPOTENCY_COLLISION');
      return { memory, event: existing, reused: true };
    }
    memory.events[eventId] = record;
    const company = memory.companies[event.companyId];
    company.eventIds = unique([...(company.eventIds || []), eventId]);
    company.updatedAt = record.recordedAt;
    applyEventProjection(memory, company, record);
    return { memory, event: record, reused: false };
  }

  function addText(list, value) {
    const text = String(value || '').trim();
    return text ? unique([...(list || []), text]) : (list || []);
  }

  function applyEventProjection(memory, company, event) {
    const text = String(event.payload?.text || event.payload?.note || '').trim();
    if (event.type === 'service_offered') company.servicesOffered = addText(company.servicesOffered, text);
    if (event.type === 'interest_recorded') { company.interests = addText(company.interests, text); company.commercialStatus = 'interested'; }
    if (event.type === 'need_recorded') company.needs = addText(company.needs, text);
    if (event.type === 'objection_recorded') company.objections = addText(company.objections, text);
    if (event.type === 'note_added') company.notes = addText(company.notes, text);
    if (event.type === 'send_confirmed') company.commercialStatus = 'contacted';
    if (event.type === 'response_received' && company.commercialStatus !== 'excluded') company.commercialStatus = event.payload?.interestConfirmed ? 'interested' : 'contacted';
    if (event.type === 'quote_requested' || event.type === 'quote_sent') company.commercialStatus = 'quote';
    if (event.type === 'work_won') company.commercialStatus = 'won';
    if (event.type === 'contact_rejected') company.commercialStatus = 'rejected';
    if (event.type === 'commercial_status_changed' && STATUS_LABELS[event.payload?.status]) company.commercialStatus = event.payload.status;
    if (event.type === 'opt_out_confirmed') {
      company.commercialStatus = 'excluded';
      company.restrictions = { ...(company.restrictions || {}), doNotContact: true, reason: text || 'opposition', blockedAt: event.occurredAt };
      const exclusionId = stableId('exclusion', [company.companyId, event.contactId, event.channel, event.payload?.target]);
      memory.exclusions[exclusionId] = {
        exclusionId, companyId: company.companyId, contactId: event.contactId,
        channel: event.channel, target: event.payload?.target || null,
        reason: text || 'opposition', createdAt: event.occurredAt, sourceEventId: event.eventId, active: true
      };
    }
    if (event.type === 'quote_requested') {
      const opportunityId = event.opportunityId || stableId('opportunity', [company.companyId, 'quote', event.eventId]);
      memory.opportunities[opportunityId] = {
        ...(memory.opportunities[opportunityId] || {}), opportunityId, companyId: company.companyId,
        establishmentId: event.establishmentId, contactId: event.contactId,
        status: 'quote_requested', title: text || 'Presupuesto solicitado', sourceEventId: event.eventId,
        createdAt: memory.opportunities[opportunityId]?.createdAt || event.occurredAt, updatedAt: event.occurredAt
      };
      company.opportunityIds = unique([...(company.opportunityIds || []), opportunityId]);
    }
  }

  function setNextAction(memoryInput, companyId, action, options = {}) {
    const memory = normalizeMemory(memoryInput);
    const company = memory.companies[companyId];
    if (!company) throw new Error('COMMERCIAL_MEMORY_COMPANY_REQUIRED');
    const text = String(action?.text || '').trim();
    if (!text) throw new Error('COMMERCIAL_MEMORY_NEXT_ACTION_REQUIRED');
    const dueAt = action.dueAt ? iso(action.dueAt) : null;
    const taskId = action.taskId || stableId('task', [companyId, text, dueAt]);
    memory.tasks[taskId] = {
      ...(memory.tasks[taskId] || {}), taskId, companyId,
      text, dueAt, status: action.status || 'pending',
      createdAt: memory.tasks[taskId]?.createdAt || iso(options.now), updatedAt: iso(options.now)
    };
    company.nextAction = { taskId, text, dueAt, status: memory.tasks[taskId].status };
    const appended = appendEvent(memory, {
      companyId, type: 'next_action_set', actor: 'user', occurredAt: options.now,
      idempotencyKey: `next-action:${taskId}:${memory.tasks[taskId].updatedAt}`,
      payload: { text, dueAt, taskId }
    });
    return { memory: appended.memory, task: memory.tasks[taskId], event: appended.event };
  }

  function timeline(memoryInput, companyId, options = {}) {
    const memory = memoryView(memoryInput);
    const company = memory.companies[companyId];
    if (!company) return [];
    const events = (company.eventIds || []).map(id => memory.events[id]).filter(Boolean)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.eventId.localeCompare(b.eventId));
    const offset = Math.max(0, Number(options.offset || 0));
    const limit = Math.max(1, Math.min(100, Number(options.limit || 30)));
    return events.slice(offset, offset + limit);
  }

  function buildSummary(memoryInput, companyId) {
    const memory = memoryView(memoryInput);
    const company = memory.companies[companyId];
    if (!company) return { text: '', facts: [], humanNotes: [], inferences: [] };
    const facts = [];
    if (company.sector) facts.push(`Sector registrado: ${company.sector}.`);
    if (company.commercialRoles?.length) facts.push(`Rol comercial: ${company.commercialRoles.join(', ')}.`);
    const contacts = (company.contactIds || []).map(id => memory.contacts[id]).filter(Boolean);
    if (contacts.length) facts.push(`${contacts.length} contacto${contacts.length === 1 ? '' : 's'} asociado${contacts.length === 1 ? '' : 's'}.`);
    if (company.servicesOffered?.length) facts.push(`Servicios ofrecidos: ${company.servicesOffered.join('; ')}.`);
    if (company.interests?.length) facts.push(`Intereses expresados: ${company.interests.join('; ')}.`);
    if (company.needs?.length) facts.push(`Necesidades registradas: ${company.needs.join('; ')}.`);
    if (company.objections?.length) facts.push(`Objeciones registradas: ${company.objections.join('; ')}.`);
    let sent = 0;
    let replies = 0;
    for (const eventId of company.eventIds || []) {
      const event = memory.events[eventId];
      if (!event) continue;
      if (event.type === 'send_confirmed') sent++;
      if (event.type === 'response_received') replies++;
    }
    if (sent) facts.push(`${sent} comunicación${sent === 1 ? '' : 'es'} enviada${sent === 1 ? '' : 's'} con confirmación.`);
    if (replies) facts.push(`${replies} respuesta${replies === 1 ? '' : 's'} registrada${replies === 1 ? '' : 's'}.`);
    const humanNotes = unique(company.notes || []);
    const inferences = [];
    if (company.nextAction?.text) inferences.push(`Próxima acción registrada: ${company.nextAction.text}.`);
    else if (!company.restrictions?.doNotContact && sent && !replies) inferences.push('Recomendación determinista: revisar si corresponde un seguimiento; no autoriza un envío.');
    return { text: [...facts, ...humanNotes.map(note => `Nota del usuario: ${note}`), ...inferences].join(' '), facts, humanNotes, inferences };
  }

  function leadCompanyId(lead) {
    return lead?.commercialRefs?.companyId || deriveIdentities(lead).companyId;
  }

  function buildFollowupQueues(memoryInput, leads = [], emailHistory = [], nowValue) {
    const memory = memoryView(memoryInput);
    const now = Date.parse(nowValue || new Date().toISOString());
    const queues = { pendingFirstContact: [], pendingResponse: [], overdue: [], interested: [], quotePotential: [], doNotContact: [] };
    const historyByLead = new Map();
    const historyByCompany = new Map();
    const replyCompanies = new Set();
    function statsFor(map, key) {
      if (key == null || key === '') return null;
      const normalizedKey = String(key);
      let stats = map.get(normalizedKey);
      if (!stats) { stats = { confirmed: false, inbound: false }; map.set(normalizedKey, stats); }
      return stats;
    }
    for (const record of Array.isArray(emailHistory) ? emailHistory : []) {
      const isConfirmed = communications?.isSentConfirmed ? communications.isSentConfirmed(record) : record.commercialState === 'SENT_CONFIRMED';
      const isInbound = record.direction === 'inbound' || record.commercialState === 'INBOUND_RECEIVED';
      const leadStats = statsFor(historyByLead, record.leadId);
      const companyStats = statsFor(historyByCompany, record.companyId);
      if (leadStats) { leadStats.confirmed ||= isConfirmed; leadStats.inbound ||= isInbound; }
      if (companyStats) { companyStats.confirmed ||= isConfirmed; companyStats.inbound ||= isInbound; }
    }
    for (const event of Object.values(memory.events || {})) {
      if (event?.companyId && event.type === 'response_received') replyCompanies.add(event.companyId);
    }
    (Array.isArray(leads) ? leads : []).filter(lead => !lead.archived).forEach(lead => {
      const companyId = leadCompanyId(lead);
      const company = memory.companies[companyId] || null;
      const leadStats = historyByLead.get(String(lead.id));
      const companyStats = historyByCompany.get(String(companyId));
      const confirmed = leadStats?.confirmed || companyStats?.confirmed ? [true] : [];
      const hasReply = Boolean(replyCompanies.has(companyId) || leadStats?.inbound || companyStats?.inbound);
      const blocked = Boolean(lead.doNotContact || lead.optOut || lead.commercialContactPolicy?.doNotContact || company?.restrictions?.doNotContact || company?.commercialStatus === 'excluded');
      const item = { leadId: lead.id, companyId, name: lead.company || company?.name || '', nextAction: company?.nextAction || null };
      if (blocked) queues.doNotContact.push({ ...item, reason: 'Exclusión comercial activa' });
      else if (!confirmed.length) queues.pendingFirstContact.push({ ...item, reason: 'Sin comunicación confirmada' });
      else if (!hasReply) queues.pendingResponse.push({ ...item, reason: 'Envío confirmado sin respuesta registrada' });
      if (company?.nextAction?.status === 'pending' && company.nextAction.dueAt && Date.parse(company.nextAction.dueAt) < now) queues.overdue.push({ ...item, reason: company.nextAction.text });
      if (company?.commercialStatus === 'interested') queues.interested.push({ ...item, reason: 'Interés registrado por el usuario' });
      if (company?.commercialStatus === 'quote' || (company?.opportunityIds || []).some(id => memory.opportunities[id]?.status === 'quote_requested')) queues.quotePotential.push({ ...item, reason: 'Solicitud o posibilidad de presupuesto registrada' });
    });
    return queues;
  }

  function inboundMessageFingerprint(input = {}) {
    const messageId = normalize(input.messageId || input.externalMessageId || '');
    const sourceDate = normalize(input.sourceDate || input.date || '');
    const identity = normalize(input.contactId || input.target || input.email || input.sender || '');
    const subject = normalize(input.subject || '');
    const body = normalize(input.raw || input.body || input.notes || '');
    return stableId('inbound-message', [input.companyId || input.leadId || '', input.channel || 'email', identity, messageId, sourceDate, subject, body]);
  }

  function reconcileHistoricalCommunications(memoryInput, emailHistory = [], leads = [], options = {}) {
    const memory = options.mutate === true ? memoryInput : normalizeMemory(memoryInput);
    const leadsById = new Map((Array.isArray(leads) ? leads : []).map(lead => [String(lead.id), lead]));
    let added = 0;
    let reused = 0;
    let skippedAmbiguous = 0;
    for (const record of Array.isArray(emailHistory) ? emailHistory : []) {
      const lead = leadsById.get(String(record?.leadId));
      if (!lead) { skippedAmbiguous++; continue; }
      const projected = projectLead(memory, lead, { mutate: true });
      const state = record.direction === 'inbound' ? 'INBOUND_RECEIVED' : record.commercialState;
      let type = COMMUNICATION_EVENT[state];
      if (type === 'send_confirmed' && !(communications?.isSentConfirmed && communications.isSentConfirmed(record))) {
        type = null;
        skippedAmbiguous++;
      }
      if (!type) continue;
      const fingerprint = state === 'INBOUND_RECEIVED'
        ? (record.inboundFingerprint || inboundMessageFingerprint({ ...record, body: record.notes }))
        : stableId('historical-communication', [record.id || '', record.idempotencyKey || '', state, record.updatedAt || record.date || '', record.subject || '', record.bodyHash || record.notes || '']);
      const existingEvent = Object.values(memory.events || {}).find(event => event.type === type
        && record.id != null && String(event.communicationId) === String(record.id));
      if (existingEvent) { reused++; continue; }
      const result = appendEvent(memory, {
        companyId: projected.company.companyId,
        establishmentId: record.establishmentId || projected.establishment.establishmentId,
        contactId: record.contactId || null,
        sequenceId: record.sequenceId || null,
        communicationId: record.id || null,
        channel: record.channel || (record.email ? 'email' : null),
        type,
        payload: { subject: record.subject || '', state, historical: true },
        actor: 'import',
        occurredAt: record.sendConfirmation?.confirmedAt || record.updatedAt || record.date,
        sourceRef: 'historical-email-reconciliation',
        idempotencyKey: state === 'INBOUND_RECEIVED' ? `inbound:${fingerprint}` : `historical-email:${fingerprint}:${type}`
      }, { mutate: true });
      if (result.reused) reused++; else added++;
    }
    return { memory, added, reused, skippedAmbiguous };
  }

  function parseStored(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { throw new Error('COMMERCIAL_MEMORY_CORRUPT'); }
  }

  function createBrowserRepository(root) {
    async function read() {
      if (root.VoltflowStorage?.isReady && await root.VoltflowStorage.isReady()) {
        if (typeof root.VoltflowStorage.loadCriticalValue === 'function') {
          const stored = await root.VoltflowStorage.loadCriticalValue(STORAGE_KEY, null);
          if (stored) return normalizeMemory(stored);
        }
        const all = await root.VoltflowStorage.loadAll();
        if (all?.commercialMemory) return normalizeMemory(all.commercialMemory);
      }
      return normalizeMemory(parseStored(root.localStorage?.getItem(STORAGE_KEY)));
    }

    async function acquire() {
      if (!root.VoltflowWriteCoordinator?.acquireExclusive) throw new Error('COMMERCIAL_MEMORY_COORDINATOR_REQUIRED');
      let lastError;
      for (let attempt = 0; attempt < 80; attempt++) {
        try { return await root.VoltflowWriteCoordinator.acquireExclusive('commercial-memory'); }
        catch (error) {
          lastError = error;
          if (!/LOCKED|LOCK_RACE|REPLAY_IN_PROGRESS/.test(String(error?.message))) throw error;
          await new Promise(resolve => root.setTimeout(resolve, 25));
        }
      }
      throw lastError || new Error('COMMERCIAL_MEMORY_LOCK_TIMEOUT');
    }

    async function write(memory, token, label) {
      if (typeof root.persistCriticalData === 'function') {
        return root.persistCriticalData(STORAGE_KEY, memory, { label: label || 'memoria comercial', coordinationToken: token });
      }
      if (root.VoltflowStorage?.persistCriticalData) {
        return root.VoltflowStorage.persistCriticalData(STORAGE_KEY, memory, { label: label || 'memoria comercial', coordinationToken: token });
      }
      throw new Error('COMMERCIAL_MEMORY_PERSISTENCE_REQUIRED');
    }

    async function mutate(label, mutator) {
      const token = await acquire();
      try {
        const current = await read();
        const working = normalizeMemory(current);
        const result = await mutator(working);
        const next = normalizeMemory(result?.memory || working);
        if (canonical(next) === canonical(current)) return { memory: current, result, unchanged: true };
        next.revision = Number(current.revision || 0) + 1;
        next.updatedAt = new Date().toISOString();
        await write(next, token, label);
        try {
          const changed = result && typeof result === 'object' ? result : {};
          const companyIds = new Set([changed.companyId, changed.event?.companyId, changed.task?.companyId, changed.draft?.companyId, changed.opportunity?.companyId, changed.opportunity?.originIdentity?.companyId].filter(Boolean));
          const opportunityIds = new Set([changed.opportunity?.opportunityId, changed.event?.opportunityId].filter(Boolean));
          for (const transfer of changed.opportunity?.identityTransfers || []) {
            if (transfer?.from?.companyId) companyIds.add(transfer.from.companyId);
            if (transfer?.to?.companyId) companyIds.add(transfer.to.companyId);
          }
          root.dispatchEvent(new CustomEvent('voltflow:commercial-memory-changed', { detail: {
            revision: next.revision, label, memory: next,
            companyIds: [...companyIds], opportunityIds: [...opportunityIds],
            global: companyIds.size === 0 && opportunityIds.size === 0
          } }));
        } catch {}
        return { memory: next, result };
      } finally {
        root.VoltflowWriteCoordinator.release(token);
      }
    }
    return { read, mutate };
  }

  function installBrowser(root) {
    const repository = createBrowserRepository(root);
    let overviewCache = { signature: null, queues: null };
    let reconciliationSignature = null;

    async function getRestriction(lead, channel, target, purpose, contactId) {
      const memory = await repository.read();
      const identities = deriveIdentities(lead, { channel, target, purpose, contactId });
      const aliasedCompanyId = lead?.id != null ? memory.aliases?.[`lead:${lead.id}`]?.companyId : null;
      const company = memory.companies[identities.companyId] || memory.companies[aliasedCompanyId];
      const effectiveCompanyId = company?.companyId || identities.companyId;
      const normalizedTarget = communications?.normalizeTarget ? communications.normalizeTarget(channel, target) : normalize(target);
      const exclusion = Object.values(memory.exclusions || {}).find(item => item?.active !== false
        && item.companyId === effectiveCompanyId
        && (!item.contactId || item.contactId === identities.contactId)
        && (!item.channel || item.channel === channel)
        && (!item.target || (communications?.normalizeTarget ? communications.normalizeTarget(channel, item.target) : normalize(item.target)) === normalizedTarget));
      if (company?.restrictions?.doNotContact || company?.commercialStatus === 'excluded' || exclusion) {
        return { ok: false, reason: 'DO_NOT_CONTACT', companyId: effectiveCompanyId, exclusion: exclusion || null };
      }
      return { ok: true, companyId: effectiveCompanyId };
    }

    async function reconcileHistory() {
      const leadRows = Array.isArray(root.leads) ? root.leads : (typeof leads !== 'undefined' ? leads : []);
      const historyRows = Array.isArray(root.emailHistory) ? root.emailHistory : (typeof emailHistory !== 'undefined' ? emailHistory : []);
      const signature = hash(historyRows.map(record => [record.id, record.commercialState, record.direction, record.updatedAt, record.date, record.inboundFingerprint, record.subject, record.bodyHash, record.sendConfirmation?.evidenceKey]));
      if (signature === reconciliationSignature) return { unchanged: true };
      const result = await repository.mutate('reconciliacion historica comercial', memory => reconcileHistoricalCommunications(memory, historyRows, leadRows, { mutate: true }));
      reconciliationSignature = signature;
      return result;
    }

    async function ensureLead(lead, options = {}) {
      return repository.mutate('ficha comercial', memory => {
        const projected = projectLead(memory, lead, options);
        let output = projected;
        if (!(projected.company.eventIds || []).some(id => projected.memory.events[id]?.type === 'lead_discovered')) {
          output = appendEvent(projected.memory, {
            companyId: projected.company.companyId, establishmentId: projected.establishment.establishmentId,
            type: 'lead_discovered', actor: 'import', occurredAt: lead.date,
            idempotencyKey: `lead-discovered:${lead.id}`, payload: { leadId: lead.id, source: lead.source || null }
          });
        }
        return { memory: output.memory, companyId: projected.company.companyId };
      });
    }

    async function addEventForLead(lead, type, payload = {}, options = {}) {
      return repository.mutate('evento comercial', memory => {
        const projected = projectLead(memory, lead, options);
        const result = appendEvent(projected.memory, {
          companyId: projected.company.companyId,
          establishmentId: options.establishmentId || projected.establishment.establishmentId,
          contactId: options.contactId || null,
          opportunityId: options.opportunityId || null,
          sequenceId: options.sequenceId || null,
          communicationId: options.communicationId || null,
          channel: options.channel || null,
          type, payload, actor: options.actor || 'user', occurredAt: options.occurredAt,
          sourceRef: options.sourceRef || 'crm_user', idempotencyKey: options.idempotencyKey
        });
        return { memory: result.memory, event: result.event, reused: result.reused, companyId: projected.company.companyId };
      });
    }

    async function recordCommunicationState(record, lead) {
      const type = COMMUNICATION_EVENT[record?.commercialState];
      if (!type || !lead) return null;
      const evidence = record.sendConfirmation?.evidenceKey || record.sendConfirmation?.confirmationId || record.updatedAt || record.date;
      return addEventForLead(lead, type, {
        subject: record.subject || '', state: record.commercialState,
        sequenceStep: record.sequenceStep || null,
        confirmationMethod: type === 'send_confirmed' ? record.sendConfirmation?.method || null : null
      }, {
        contactId: record.contactId, sequenceId: record.sequenceId,
        communicationId: record.id, channel: record.channel,
        occurredAt: record.sendConfirmation?.confirmedAt || record.updatedAt || record.date,
        actor: type === 'send_confirmed' && record.sendConfirmation?.method === 'provider_verified' ? 'system' : 'user',
        sourceRef: 'commercial-communications',
        idempotencyKey: `communication:${record.id}:${record.commercialState}:${record.contentVersion || 1}:${evidence || ''}`
      });
    }

    async function setLeadNextAction(lead, action) {
      return repository.mutate('proxima accion comercial', memory => {
        const projected = projectLead(memory, lead);
        const result = setNextAction(projected.memory, projected.company.companyId, action);
        return { memory: result.memory, task: result.task, companyId: projected.company.companyId };
      });
    }

    async function saveEmailDraft(lead, draft) {
      if (!lead || !draft || !draft.draftId) throw new Error('COMMERCIAL_EMAIL_DRAFT_REQUIRED');
      return repository.mutate('borrador comercial C3', memory => {
        const projected = projectLead(memory, lead);
        if (draft.companyId !== projected.company.companyId) throw new Error('COMMERCIAL_EMAIL_COMPANY_MISMATCH');
        const previous = memory.drafts[draft.draftId];
        if (previous && previous.companyId !== draft.companyId) throw new Error('COMMERCIAL_EMAIL_DRAFT_COLLISION');
        const incomingVersions = Array.isArray(draft.versions) ? clone(draft.versions) : [];
        if (!incomingVersions.length) throw new Error('COMMERCIAL_EMAIL_DRAFT_VERSION_REQUIRED');
        const versions = Array.isArray(previous?.versions) ? clone(previous.versions) : [];
        const versionIds = new Set(versions.map(item => item.versionId).filter(Boolean));
        let highest = versions.reduce((max, item) => Math.max(max, Number(item.version || 0)), 0);
        for (const incoming of incomingVersions) {
          const duplicate = incoming.versionId && versionIds.has(incoming.versionId);
          if (duplicate) continue;
          const sameContent = versions.some(item => item.contextFingerprint === incoming.contextFingerprint
            && item.subject === incoming.subject && item.bodyText === incoming.bodyText && item.provenance?.kind === incoming.provenance?.kind);
          if (sameContent) continue;
          highest++;
          incoming.version = highest;
          versions.push(incoming);
          if (incoming.versionId) versionIds.add(incoming.versionId);
        }
        versions.sort((a, b) => Number(a.version || 0) - Number(b.version || 0));
        const latest = versions[versions.length - 1];
        memory.drafts[draft.draftId] = { ...clone(previous || {}), ...clone(draft), versions, currentVersion: latest.version, updatedAt: latest.createdAt || draft.updatedAt };
        const event = appendEvent(memory, {
          companyId: projected.company.companyId,
          establishmentId: draft.establishmentId || projected.establishment.establishmentId,
          contactId: draft.contactId || null,
          type: 'draft_prepared', channel: 'email', actor: latest.provenance?.kind === 'ai' ? 'ai' : 'system',
          occurredAt: latest.createdAt,
          sourceRef: 'commercial-email-c3',
          idempotencyKey: `c3-draft:${draft.draftId}:${latest.versionId || latest.version}`,
          payload: { subject: latest.subject || '', draftId: draft.draftId, version: latest.version, provenance: latest.provenance?.kind || 'local_template' }
        }, { mutate: true });
        return { memory: event.memory, draft: memory.drafts[draft.draftId], reused: event.reused };
      });
    }

    async function updateFollowupSettings(settings = {}) {
      return repository.mutate('ajustes de seguimiento C4', memory => {
        const intervals = Array.isArray(settings.intervalsDays) ? settings.intervalsDays.map(Number) : memory.followupSettings.intervalsDays;
        if (intervals.length !== 4 || intervals.some(value => !Number.isInteger(value) || value < 1 || value > 90)) {
          throw new Error('COMMERCIAL_FOLLOWUP_INTERVALS_INVALID');
        }
        memory.followupSettings = {
          ...memory.followupSettings,
          schemaVersion: 1,
          intervalsDays: intervals,
          pageSize: Math.max(10, Math.min(50, Number(settings.pageSize || memory.followupSettings.pageSize || 20)))
        };
        return { memory, settings: memory.followupSettings };
      });
    }

    async function recordDiscovery(company, event, extra = {}) {
      const key = String(extra.memoryKey || '').trim();
      if (!key) return null;
      return repository.mutate('memoria de descubrimiento', memory => {
        const now = new Date().toISOString();
        const previous = memory[key] && typeof memory[key] === 'object'
          ? memory[key]
          : { firstSeen: now, events: [] };
        previous.company = company?.name || previous.company || '';
        previous.website = company?.website || previous.website || '';
        previous.email = company?.email || previous.email || '';
        previous.phone = company?.phone || previous.phone || '';
        previous.lastSeen = now;
        previous.events = [
          ...(Array.isArray(previous.events) ? previous.events.slice(-14) : []),
          { event, date: now, ...extra }
        ];
        delete previous.events[previous.events.length - 1].memoryKey;
        memory[key] = previous;
        return { memory, key };
      });
    }

    async function recordDiscoveryBulk(items, event, extraFactory, keyFactory) {
      if (!Array.isArray(items) || !items.length) return null;
      return repository.mutate('memoria de descubrimiento', memory => {
        const now = new Date().toISOString();
        items.forEach((company, index) => {
          const key = String(keyFactory(company) || '').trim();
          if (!key) return;
          const previous = memory[key] && typeof memory[key] === 'object'
            ? memory[key]
            : { firstSeen: now, events: [] };
          previous.company = company?.name || previous.company || '';
          previous.website = company?.website || previous.website || '';
          previous.email = company?.email || previous.email || '';
          previous.phone = company?.phone || previous.phone || '';
          previous.lastSeen = now;
          previous.events = Array.isArray(previous.events) ? previous.events : [];
          previous.events.push({ event, date: now, ...(extraFactory(company, index) || {}) });
          previous.events = previous.events.slice(-12);
          memory[key] = previous;
        });
        return { memory, count: items.length };
      });
    }

    function element(tag, className, text) {
      const node = root.document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = String(text);
      return node;
    }

    function formatDate(value) {
      if (!value) return '';
      try { return new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }); } catch { return String(value); }
    }

    async function renderLeadPanel(lead, hostId = 'commercial-memory-panel') {
      const host = root.document.getElementById(hostId);
      if (!host || !lead) return;
      host.replaceChildren(element('div', 'commercial-memory-loading', 'Cargando memoria comercial...'));
      try {
        await reconcileHistory();
        const ensured = await ensureLead(lead);
        const memory = ensured.memory;
        const companyId = ensured.result.companyId;
        const company = memory.companies[companyId];
        const summary = buildSummary(memory, companyId);
        const events = timeline(memory, companyId, { limit: 30 });
        host.replaceChildren();
        const header = element('div', 'commercial-memory-header');
        header.append(element('div', 'commercial-memory-title', 'Memoria comercial'));
        header.append(element('span', `commercial-memory-status status-${company.commercialStatus}`, STATUS_LABELS[company.commercialStatus] || company.commercialStatus));
        host.append(header);

        const summaryBlock = element('section', 'commercial-memory-summary');
        summaryBlock.append(element('h4', '', 'Resumen verificable'));
        summaryBlock.append(element('p', '', summary.text || 'Sin hechos comerciales registrados.'));
        host.append(summaryBlock);

        const contacts = element('section', 'commercial-memory-section');
        contacts.append(element('h4', '', 'Contactos asociados'));
        const contactList = element('div', 'commercial-contact-list');
        (company.contactIds || []).map(id => memory.contacts[id]).filter(Boolean).forEach(contact => {
          const point = contact.contactPoints?.[0];
          contactList.append(element('div', 'commercial-contact-row', [contact.name, contact.role, point ? `${point.channel}: ${point.value}` : null].filter(Boolean).join(' · ')));
        });
        if (!contactList.children.length) contactList.append(element('div', 'commercial-empty', 'Sin contactos identificados.'));
        contacts.append(contactList); host.append(contacts);

        const emailSection = element('section', 'commercial-memory-section commercial-email-entry');
        emailSection.append(element('h4', '', 'Correo comercial personalizado'));
        const emailButton = element('button', 'btn-primary commercial-email-open', 'Preparar correo con IA');
        emailButton.type = 'button';
        emailButton.onclick = () => {
          if (!root.VoltflowCommercialEmailC3?.openComposer) return root.showToast?.('El compositor C3 no esta disponible.');
          root.VoltflowCommercialEmailC3.openComposer(lead);
        };
        emailSection.append(emailButton, element('p', 'commercial-email-entry-note', 'Generacion local disponible. La IA externa requiere autorizacion expresa y un proveedor gratuito aprobado.'));
        host.append(emailSection);

        const responseSection = element('section', 'commercial-memory-section commercial-response-entry');
        responseSection.append(element('h4', '', 'Respuesta recibida'));
        const responseButton = element('button', 'btn-outline commercial-response-open', 'Registrar respuesta de Outlook');
        responseButton.type = 'button';
        responseButton.onclick = () => {
          if (typeof root.openCommercialResponseReview !== 'function') return root.showToast?.('El modulo C5 no esta disponible.');
          root.openCommercialResponseReview(lead);
        };
        responseSection.append(responseButton, element('p', 'commercial-email-entry-note', 'La respuesta se analiza localmente y no se incorpora hasta que revises contacto, contenido y clasificacion.'));
        host.append(responseSection);

        const actionSection = element('section', 'commercial-memory-section');
        actionSection.append(element('h4', '', 'Próxima acción'));
        const actionRow = element('div', 'commercial-action-editor');
        const actionText = element('input'); actionText.type = 'text'; actionText.placeholder = 'Acción concreta'; actionText.value = company.nextAction?.text || '';
        const actionDate = element('input'); actionDate.type = 'date'; actionDate.value = company.nextAction?.dueAt ? company.nextAction.dueAt.slice(0, 10) : '';
        const actionButton = element('button', 'btn-outline', 'Guardar acción'); actionButton.type = 'button';
        actionButton.onclick = async () => {
          if (!actionText.value.trim()) return root.showToast?.('Indica una acción concreta.');
          actionButton.disabled = true;
          try { await setLeadNextAction(lead, { text: actionText.value, dueAt: actionDate.value ? `${actionDate.value}T09:00:00` : null }); root.showToast?.('Próxima acción guardada.'); await renderLeadPanel(lead); }
          catch (error) { root.showToast?.(`No se pudo guardar: ${error.message}`); }
          finally { actionButton.disabled = false; }
        };
        actionRow.append(actionText, actionDate, actionButton); actionSection.append(actionRow); host.append(actionSection);

        const eventSection = element('section', 'commercial-memory-section');
        eventSection.append(element('h4', '', 'Registrar actuación'));
        const eventRow = element('div', 'commercial-event-editor');
        const eventType = element('select');
        [
          ['note_added', 'Nota'], ['call_logged', 'Llamada'], ['meeting_logged', 'Reunión'],
          ['response_received', 'Respuesta recibida'], ['interest_recorded', 'Interés'],
          ['need_recorded', 'Necesidad'], ['objection_recorded', 'Objeción'],
          ['service_offered', 'Servicio ofrecido'], ['information_requested', 'Información solicitada'],
          ['quote_requested', 'Presupuesto solicitado'], ['quote_sent', 'Presupuesto enviado'],
          ['work_won', 'Trabajo conseguido'], ['contact_rejected', 'Contacto rechazado'],
          ['opt_out_confirmed', 'Oposición confirmada']
        ].forEach(([value, label]) => { const option = element('option', '', label); option.value = value; eventType.append(option); });
        const eventText = element('textarea'); eventText.rows = 2; eventText.placeholder = 'Hecho o nota, sin inferencias';
        const eventButton = element('button', 'btn-outline', 'Registrar'); eventButton.type = 'button';
        eventButton.onclick = async () => {
          const text = eventText.value.trim();
          if (!text) return root.showToast?.('Describe el hecho que deseas registrar.');
          if (eventType.value === 'opt_out_confirmed' && !root.confirm('¿Confirmas que esta empresa o contacto ha solicitado no recibir más comunicaciones comerciales?')) return;
          eventButton.disabled = true;
          try {
            await addEventForLead(lead, eventType.value, { text }, { idempotencyKey: `manual:${lead.id}:${eventType.value}:${hash(text)}:${Date.now()}` });
            root.showToast?.('Actuación registrada.'); await renderLeadPanel(lead); renderOverview();
          } catch (error) { root.showToast?.(`No se pudo registrar: ${error.message}`); }
          finally { eventButton.disabled = false; }
        };
        eventRow.append(eventType, eventText, eventButton); eventSection.append(eventRow); host.append(eventSection);

        const timelineSection = element('section', 'commercial-memory-section');
        timelineSection.append(element('h4', '', 'Historial cronológico'));
        const list = element('div', 'commercial-timeline');
        events.forEach(event => {
          const row = element('div', 'commercial-timeline-row');
          row.append(element('time', '', formatDate(event.occurredAt)));
          const content = element('div'); content.append(element('strong', '', event.type.replace(/_/g, ' ')));
          const detail = event.payload?.text || event.payload?.note || event.payload?.subject;
          if (detail) content.append(element('p', '', detail));
          row.append(content); list.append(row);
        });
        if (!events.length) list.append(element('div', 'commercial-empty', 'Sin actuaciones registradas.'));
        timelineSection.append(list); host.append(timelineSection);
      } catch (error) {
        host.replaceChildren(element('div', 'commercial-memory-error', `No se pudo cargar la memoria comercial: ${error.message}`));
      }
    }

    async function renderOverview(selectedKey) {
      const host = root.document.getElementById('commercial-followup-overview');
      if (!host) return;
      try {
        await reconcileHistory();
        const memory = await repository.read();
        const leadRows = Array.isArray(root.leads) ? root.leads : (typeof leads !== 'undefined' ? leads : []);
        const historyRows = Array.isArray(root.emailHistory) ? root.emailHistory : (typeof emailHistory !== 'undefined' ? emailHistory : []);
        const signature = `${memory.revision}:${leadRows.length}:${historyRows.length}:${new Date().toISOString().slice(0, 10)}`;
        if (overviewCache.signature !== signature) overviewCache = { signature, queues: buildFollowupQueues(memory, leadRows, historyRows) };
        const queues = overviewCache.queues;
        const labels = {
          pendingFirstContact: 'Primer contacto', pendingResponse: 'Sin respuesta', overdue: 'Seguimiento vencido',
          interested: 'Con interés', quotePotential: 'Posible presupuesto', doNotContact: 'No contactar'
        };
        const active = selectedKey && queues[selectedKey] ? selectedKey : host.dataset.activeQueue || 'overdue';
        host.dataset.activeQueue = active;
        host.replaceChildren();
        const tabs = element('div', 'commercial-overview-tabs');
        Object.keys(labels).forEach(key => {
          const button = element('button', key === active ? 'is-active' : '', `${labels[key]} ${queues[key].length}`);
          button.type = 'button'; button.onclick = () => renderOverview(key); tabs.append(button);
        });
        host.append(tabs);
        const rows = element('div', 'commercial-overview-list');
        queues[active].slice(0, 8).forEach(item => {
          const row = element('button', 'commercial-overview-row'); row.type = 'button';
          row.append(element('strong', '', item.name || 'Empresa sin nombre'), element('span', '', item.reason || ''));
          row.onclick = () => root.openLeadDetail?.(item.leadId); rows.append(row);
        });
        if (!rows.children.length) rows.append(element('div', 'commercial-empty', 'Sin empresas en esta vista.'));
        host.append(rows);
      } catch (error) {
        host.replaceChildren(element('div', 'commercial-memory-error', `Estado comercial no disponible: ${error.message}`));
      }
    }

    root.ensureCommercialMemoryForLead = ensureLead;
    root.recordCommercialMemoryEvent = addEventForLead;
    root.recordCommercialCommunicationState = recordCommunicationState;
    root.setCommercialNextAction = setLeadNextAction;
    root.recordCommercialDiscoveryMemory = recordDiscovery;
    root.recordCommercialDiscoveryMemoryBulk = recordDiscoveryBulk;
    root.renderCommercialMemoryLeadPanel = renderLeadPanel;
    root.renderCommercialFollowupOverview = renderOverview;
    root.getCommercialMemoryRestriction = getRestriction;
    root.getCommercialMemorySnapshot = () => repository.read();
    root.saveCommercialEmailDraft = saveEmailDraft;
    root.updateCommercialFollowupSettings = updateFollowupSettings;
    root.reconcileCommercialMemoryHistory = reconcileHistory;
    root.addEventListener?.('voltflow:commercial-memory-changed', () => {
      overviewCache.signature = null;
      const renderer = root.renderCommercialFollowupOverview;
      if (typeof renderer === 'function') renderer();
    });
    return repository;
  }

  return Object.freeze({
    STORAGE_KEY, SCHEMA_VERSION, EVENT_TYPES, STATUS_LABELS,
    emptyMemory, normalizeMemory, deriveIdentities, projectLead, projectLeadsBatch, appendEvent,
    setNextAction, timeline, buildSummary, buildFollowupQueues, inboundMessageFingerprint,
    reconcileHistoricalCommunications,
    createBrowserRepository, installBrowser, hash, stableId, canonical
  });
});
