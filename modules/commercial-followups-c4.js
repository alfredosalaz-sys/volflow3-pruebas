(function (root, factory) {
  const communications = root?.CommercialCommunications
    || (typeof require === 'function' ? require('./commercial-communications.js') : null);
  const memoryApi = root?.VoltflowCommercialMemory
    || (typeof require === 'function' ? require('./commercial-memory.js') : null);
  const emailApi = root?.VoltflowCommercialEmailC3
    || (typeof require === 'function' ? require('./commercial-email-c3.js') : null);
  const api = factory(communications, memoryApi, emailApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowCommercialFollowupsC4 = api;
  if (root?.document) api.installBrowser(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (communications, memoryApi, emailApi) {
  'use strict';

  const PURPOSE = emailApi?.PURPOSE || 'commercial_first_contact';
  const MAX_CONFIRMED = communications?.MAX_CONFIRMED_CONTACTS || 5;
  const DEFAULT_INTERVALS = Object.freeze([4, 7, 10, 14]);
  const PLAN_SCHEMA = 'voltflow-commercial-followup-plan';
  const PLAN_VERSION = 1;
  const TONES = Object.freeze(['professional', 'friendly', 'direct']);
  const LENGTHS = Object.freeze(['short', 'medium']);
  const STATES = Object.freeze({
    NEVER_CONTACTED: 'never_contacted',
    FIRST_PENDING: 'first_pending_confirmation',
    SENT_NO_RESPONSE: 'sent_no_response',
    RESPONDED: 'responded',
    RECOMMENDED: 'followup_recommended',
    OVERDUE: 'followup_overdue',
    OPPORTUNITY: 'opportunity_open',
    EXHAUSTED: 'sequence_exhausted',
    CLOSED: 'sequence_closed',
    EXCLUDED: 'contact_excluded'
  });
  const LABELS = Object.freeze({
    [STATES.NEVER_CONTACTED]: 'Nunca contactado',
    [STATES.FIRST_PENDING]: 'Primer correo pendiente',
    [STATES.SENT_NO_RESPONSE]: 'Enviado, sin respuesta',
    [STATES.RESPONDED]: 'Respondido',
    [STATES.RECOMMENDED]: 'Seguimiento recomendado',
    [STATES.OVERDUE]: 'Seguimiento vencido',
    [STATES.OPPORTUNITY]: 'Oportunidad abierta',
    [STATES.EXHAUSTED]: 'Secuencia agotada',
    [STATES.CLOSED]: 'Secuencia cerrada',
    [STATES.EXCLUDED]: 'Contacto excluido'
  });
  const ANGLES = Object.freeze({
    practical_value: 'recordatorio breve y disponibilidad practica',
    sector_alternative: 'otro enfoque de valor adaptado al sector',
    future_collaboration: 'disponibilidad para futuras actuaciones',
    respectful_close: 'cierre respetuoso sin presion'
  });
  const CTAS = Object.freeze({
    brief_reply: 'Si le encaja, basta con una respuesta breve y lo comentamos.',
    assess_need: 'Si en algun momento surge una actuacion, podemos valorar juntos la forma de ayudar.',
    future_contact: 'Quedamos a su disposicion para cuando resulte oportuno.',
    no_pressure: 'No es necesario responder si ahora no encaja; evitaremos insistir.'
  });
  const STAGE_DEFAULTS = Object.freeze({
    2: Object.freeze({ angleId: 'practical_value', ctaId: 'brief_reply' }),
    3: Object.freeze({ angleId: 'sector_alternative', ctaId: 'assess_need' }),
    4: Object.freeze({ angleId: 'future_collaboration', ctaId: 'future_contact' }),
    5: Object.freeze({ angleId: 'respectful_close', ctaId: 'no_pressure' })
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

  function clean(value, max = 300) {
    const redacted = emailApi?.cleanText
      ? emailApi.cleanText(value, max)
      : String(value == null ? '' : value).slice(0, max);
    return redacted.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function iso(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  function normalizeIntervals(value) {
    const source = Array.isArray(value) && value.length === 4 ? value : DEFAULT_INTERVALS;
    return source.map((item, index) => {
      const numeric = Number(item);
      return Number.isInteger(numeric) && numeric >= 1 && numeric <= 90 ? numeric : DEFAULT_INTERVALS[index];
    });
  }

  function confirmedAt(record) {
    return iso(record?.sendConfirmation?.confirmedAt || record?.sendConfirmation?.verifiedAt || record?.date || record?.updatedAt);
  }

  function isPendingRecord(record) {
    const state = communications?.getEffectiveState?.(record) || record?.commercialState;
    return ['DRAFT_CREATED', 'DRAFT_REVIEWED', 'DRAFT_APPROVED', 'EXTERNAL_CLIENT_OPENED', 'PENDING_SEND_CONFIRMATION'].includes(state);
  }

  function buildIndex(memoryInput, history = []) {
    const memory = memoryInput && typeof memoryInput === 'object' && !Array.isArray(memoryInput)
      && memoryInput.companies && memoryInput.contacts && memoryInput.events && memoryInput.opportunities
      ? memoryInput
      : (memoryApi?.normalizeMemory ? memoryApi.normalizeMemory(memoryInput || {}) : (memoryInput || {}));
    const recordsBySequence = new Map();
    for (const record of Array.isArray(history) ? history : []) {
      const key = communications?.sequenceKeyForRecord?.(record) || record?.sequenceKey || record?.sequenceId;
      if (!key) continue;
      if (!recordsBySequence.has(key)) recordsBySequence.set(key, []);
      recordsBySequence.get(key).push(record);
    }
    const eventsByCompany = new Map();
    for (const event of Object.values(memory.events || {})) {
      if (!event?.companyId) continue;
      if (!eventsByCompany.has(event.companyId)) eventsByCompany.set(event.companyId, []);
      eventsByCompany.get(event.companyId).push(event);
    }
    for (const events of eventsByCompany.values()) events.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    return { memory, recordsBySequence, eventsByCompany };
  }

  function identityFor(lead, contact, target) {
    return communications?.deriveIdentities
      ? communications.deriveIdentities({ lead, channel: 'email', target, contactId: contact?.contactId, purpose: PURPOSE })
      : { companyId: lead?.commercialRefs?.companyId, contactId: contact?.contactId, sequenceKey: null, sequenceId: null };
  }

  function emailPoints(contact) {
    const values = (contact?.contactPoints || [])
      .filter(point => point?.channel === 'email' && point.value)
      .map(point => communications?.normalizeTarget ? communications.normalizeTarget('email', point.value) : String(point.value).trim().toLowerCase())
      .filter(Boolean);
    return [...new Set(values)];
  }

  function contactFor(memory, company, lead, requestedContactId, requestedTarget) {
    const contacts = (company?.contactIds || []).map(id => memory.contacts?.[id]).filter(Boolean);
    const normalizeEmail = value => communications?.normalizeTarget ? communications.normalizeTarget('email', value) : String(value || '').trim().toLowerCase();
    const leadTarget = normalizeEmail(lead?.email);
    const explicitTarget = normalizeEmail(requestedTarget);
    const target = explicitTarget || leadTarget;
    const fail = reason => ({ ok: false, contact: null, target, reason });

    if (explicitTarget && leadTarget && explicitTarget !== leadTarget) return fail('C4_LEAD_TARGET_CHANGED');

    if (requestedContactId) {
      const requested = contacts.find(contact => String(contact.contactId) === String(requestedContactId));
      if (!requested) return fail('C4_CONTACT_NOT_IN_COMPANY');
      const points = emailPoints(requested);
      if (target) {
        if (!points.includes(target)) return fail('C4_CONTACT_TARGET_MISMATCH');
        return { ok: true, contact: requested, target, reason: null };
      }
      if (points.length !== 1) return fail(points.length ? 'C4_CONTACT_TARGET_AMBIGUOUS' : 'C4_CONTACT_EMAIL_REQUIRED');
      return { ok: true, contact: requested, target: points[0], reason: null };
    }

    if (!target) return fail('C4_CONTACT_EMAIL_REQUIRED');
    const matches = contacts.filter(contact => emailPoints(contact).includes(target));
    if (matches.length === 1) return { ok: true, contact: matches[0], target, reason: null };
    if (matches.length > 1) return fail('C4_CONTACT_IDENTITY_AMBIGUOUS');
    return fail('C4_CONTACT_NOT_RESOLVED');
  }

  function eventMatches(event, identity) {
    if (['response_received', 'followup_closed', 'followup_dismissed', 'followup_postponed'].includes(event?.type)
      && !event.sequenceId && !event.contactId) return false;
    if (event.sequenceId && identity.sequenceId && event.sequenceId !== identity.sequenceId && event.sequenceId !== identity.sequenceKey) return false;
    if (event.contactId && identity.contactId && event.contactId !== identity.contactId) return false;
    return true;
  }

  function sequenceState(input = {}) {
    const lead = input.lead || {};
    const index = input.index || buildIndex(input.memory, input.emailHistory);
    const memory = index.memory;
    const alias = lead.id != null ? memory.aliases?.[`lead:${lead.id}`] : null;
    const derived = memoryApi?.deriveIdentities?.(lead) || {};
    const companyId = lead?.commercialRefs?.companyId || alias?.companyId || derived.companyId;
    const company = memory.companies?.[companyId] || null;
    const selected = contactFor(memory, company, lead, input.contactId, input.target);
    if (!selected.ok) {
      return {
        leadId: lead.id, lead, companyId, company, contactId: null, contact: null,
        target: selected.target, sequenceId: null, sequenceKey: null,
        state: STATES.NEVER_CONTACTED, label: 'Destinatario no resuelto', priority: 0,
        confirmedCount: 0, remaining: MAX_CONFIRMED, nextStage: 1, dueAt: null,
        lastConfirmedAt: null, pendingCount: 0, responseCount: 0, hasResponse: false,
        recommendationDismissed: false, identityResolved: false, blocked: true,
        reason: 'No se pudo asociar de forma inequivoca el lead con un contacto y email de esta empresa.',
        resolutionError: selected.reason
      };
    }
    const identity = identityFor(lead, selected.contact, selected.target);
    const records = index.recordsBySequence.get(identity.sequenceKey) || [];
    const confirmed = records.filter(record => communications?.isSentConfirmed?.(record)).sort((a, b) => Date.parse(confirmedAt(a)) - Date.parse(confirmedAt(b)));
    const pending = records.filter(isPendingRecord);
    const events = (index.eventsByCompany.get(companyId) || []).filter(event => eventMatches(event, identity));
    const lastConfirmedAt = confirmed.length ? confirmedAt(confirmed[confirmed.length - 1]) : null;
    const lastConfirmedMs = Date.parse(lastConfirmedAt || '') || 0;
    const replies = events.filter(event => event.type === 'response_received' && Date.parse(event.occurredAt) >= lastConfirmedMs);
    const closed = [...events].reverse().find(event => event.type === 'followup_closed' && Date.parse(event.occurredAt) >= lastConfirmedMs);
    const dismissed = [...events].reverse().find(event => event.type === 'followup_dismissed' && Date.parse(event.occurredAt) >= lastConfirmedMs);
    const postponed = [...events].reverse().find(event => event.type === 'followup_postponed' && Date.parse(event.occurredAt) >= lastConfirmedMs);
    const blocked = Boolean(lead.doNotContact || lead.optOut || lead.commercialContactPolicy?.doNotContact
      || company?.restrictions?.doNotContact || company?.commercialStatus === 'excluded');
    const opportunity = Boolean(company?.commercialStatus === 'interested' || company?.commercialStatus === 'quote'
      || (company?.opportunityIds || []).some(id => ['open', 'interested', 'quote_requested', 'quote_sent'].includes(memory.opportunities?.[id]?.status)));
    const intervals = normalizeIntervals(input.intervals || memory.followupSettings?.intervalsDays);
    const confirmedCount = confirmed.length;
    const nextStage = Math.min(MAX_CONFIRMED, confirmedCount + 1);
    let dueAt = null;
    if (confirmedCount > 0 && confirmedCount < MAX_CONFIRMED && lastConfirmedAt) {
      const scheduled = Date.parse(lastConfirmedAt) + intervals[confirmedCount - 1] * 86400000;
      dueAt = new Date(scheduled).toISOString();
    }
    if (postponed?.payload?.dueAt && Date.parse(postponed.payload.dueAt) > lastConfirmedMs) dueAt = iso(postponed.payload.dueAt);
    const now = Date.parse(input.now || new Date().toISOString());
    let state;
    if (blocked) state = STATES.EXCLUDED;
    else if (closed) state = STATES.CLOSED;
    else if (confirmedCount >= MAX_CONFIRMED) state = STATES.EXHAUSTED;
    else if (opportunity) state = STATES.OPPORTUNITY;
    else if (replies.length) state = STATES.RESPONDED;
    else if (!confirmedCount && pending.length) state = STATES.FIRST_PENDING;
    else if (!confirmedCount) state = STATES.NEVER_CONTACTED;
    else if (dismissed) state = STATES.SENT_NO_RESPONSE;
    else if (dueAt && now >= Date.parse(dueAt) + 86400000) state = STATES.OVERDUE;
    else if (dueAt && now >= Date.parse(dueAt)) state = STATES.RECOMMENDED;
    else state = STATES.SENT_NO_RESPONSE;
    const overdueDays = dueAt && now > Date.parse(dueAt) ? Math.floor((now - Date.parse(dueAt)) / 86400000) : 0;
    const priority = state === STATES.OVERDUE ? 100 + Math.min(30, overdueDays)
      : state === STATES.OPPORTUNITY ? 95
        : state === STATES.RECOMMENDED ? 85
          : state === STATES.RESPONDED ? 75
            : state === STATES.FIRST_PENDING ? 60
              : state === STATES.NEVER_CONTACTED ? 50 : 20;
    const hasResponse = replies.length > 0;
    return {
      leadId: lead.id, lead, companyId, company, contactId: identity.contactId, contact: selected.contact,
      target: selected.target, sequenceId: identity.sequenceId, sequenceKey: identity.sequenceKey,
      state, label: LABELS[state], priority, confirmedCount, remaining: Math.max(0, MAX_CONFIRMED - confirmedCount),
      nextStage, dueAt, lastConfirmedAt, pendingCount: pending.length, responseCount: replies.length,
      hasResponse, recommendationDismissed: Boolean(dismissed),
      identityResolved: true,
      blocked: hasResponse || [STATES.EXCLUDED, STATES.CLOSED, STATES.EXHAUSTED, STATES.RESPONDED].includes(state),
      reason: state === STATES.EXCLUDED ? 'Existe una exclusion u oposicion comercial activa.'
        : hasResponse ? 'Existe una respuesta; la secuencia de ausencia de respuesta queda pausada.'
          : state === STATES.EXHAUSTED ? 'Se alcanzaron cinco comunicaciones confirmadas en total.'
            : state === STATES.CLOSED ? 'La secuencia fue cerrada manualmente.'
              : null
    };
  }

  function buildAgenda(input = {}) {
    const leads = Array.isArray(input.leads) ? input.leads : [];
    const index = buildIndex(input.memory, input.emailHistory);
    const states = leads.filter(lead => !lead.archived).map(lead => sequenceState({ ...input, lead, index }));
    states.sort((a, b) => b.priority - a.priority || Date.parse(a.dueAt || '9999-12-31') - Date.parse(b.dueAt || '9999-12-31') || String(a.company?.name || a.lead?.company || '').localeCompare(String(b.company?.name || b.lead?.company || '')));
    const counts = Object.fromEntries(Object.values(STATES).map(state => [state, 0]));
    states.forEach(item => { counts[item.state] = (counts[item.state] || 0) + 1; });
    return { generatedAt: new Date().toISOString(), states, counts, index };
  }

  function isActionable(item) {
    return item?.identityResolved === true && !item?.blocked && !item?.recommendationDismissed
      && [STATES.RECOMMENDED, STATES.OVERDUE, STATES.SENT_NO_RESPONSE, STATES.NEVER_CONTACTED, STATES.OPPORTUNITY].includes(item.state);
  }

  function assertSameBinding(expected, actual, includeStage = true) {
    const normalizeEmail = value => communications?.normalizeTarget ? communications.normalizeTarget('email', value) : String(value || '').trim().toLowerCase();
    if (!actual?.identityResolved) throw new Error(actual?.resolutionError || 'C4_CONTACT_IDENTITY_UNRESOLVED');
    const expectedState = expected?.c4 || expected || {};
    const fields = ['companyId', 'contactId', 'sequenceKey'];
    if (fields.some(field => String(expectedState[field] || '') !== String(actual?.[field] || ''))
      || normalizeEmail(expectedState.target) !== normalizeEmail(actual?.target)
      || (includeStage && Number(expectedState.nextStage || expected?.stage) !== Number(actual?.nextStage))) {
      throw new Error('C4_CONTACT_BINDING_CHANGED');
    }
    return actual;
  }

  function safeStage(value) {
    const stage = Number(value);
    return Number.isInteger(stage) && stage >= 2 && stage <= 5 ? stage : null;
  }

  function buildGenerationContext(input = {}) {
    const state = input.state || sequenceState(input);
    if (state.confirmedCount < 1) throw new Error('C4_INITIAL_CONTACT_USES_C3');
    if (state.blocked) throw new Error(state.reason || 'C4_SEQUENCE_BLOCKED');
    const c3 = emailApi.buildContext({
      lead: state.lead, memory: input.memory, emailHistory: input.emailHistory,
      contactId: state.contactId, target: state.target, serviceId: input.serviceId, purpose: PURPOSE
    });
    if (c3.blocked) throw new Error(c3.restrictionReason || 'C4_CONTEXT_BLOCKED');
    return { ...c3, c4: state, stage: state.nextStage, purpose: PURPOSE };
  }

  function localPlan(context, options = {}) {
    const stage = safeStage(context?.stage);
    if (!stage) throw new Error('C4_STAGE_INVALID');
    const hasObjection = (context.verifiedFacts || []).some(fact => fact.key.startsWith('company.objections'));
    const opportunity = context.c4?.state === STATES.OPPORTUNITY;
    const defaults = hasObjection || opportunity
      ? { angleId: 'future_collaboration', ctaId: 'future_contact' }
      : STAGE_DEFAULTS[stage];
    return {
      schema: PLAN_SCHEMA, schemaVersion: PLAN_VERSION, stage,
      serviceId: context.serviceId,
      tone: TONES.includes(options.tone) ? options.tone : 'professional',
      length: LENGTHS.includes(options.length) ? options.length : 'short',
      angleId: defaults.angleId, ctaId: defaults.ctaId, factRefs: []
    };
  }

  function availableFacts(context) {
    return (context?.verifiedFacts || []).filter(fact => /^company\.(?:needs|interests|objections)\./.test(fact.key)).slice(0, 6).map(fact => ({
      factId: memoryApi?.stableId ? memoryApi.stableId('c4-fact', [context.companyId, fact.key, fact.value]) : `${fact.key}:${normalize(fact.value)}`,
      key: fact.key, value: clean(fact.value, 240), source: fact.source || 'commercial_memory'
    }));
  }

  function minimalExternalContext(context) {
    return {
      companyName: context.companyName || null,
      contactName: context.contactName || null,
      contactRole: context.contactRole || null,
      sector: context.sector || null,
      commercialRole: context.profile?.role || null,
      stage: context.stage,
      confirmedCommunications: context.c4.confirmedCount,
      remainingCommunications: context.c4.remaining,
      preferredServiceId: context.serviceId,
      allowedServices: (context.profile?.services || []).map(id => ({ serviceId: id, label: emailApi.SERVICES[id]?.label })),
      verifiedFacts: availableFacts(context).map(fact => ({ factId: fact.factId, field: fact.key, value: fact.value }))
    };
  }

  function buildPrompt(context, options = {}) {
    return [
      'TAREA: elige un plan estructurado para un seguimiento B2B de Voltium Madrid.',
      `Devuelve SOLO JSON con schema="${PLAN_SCHEMA}", schemaVersion=${PLAN_VERSION}, stage, serviceId, tone, length, angleId, ctaId y factRefs.`,
      `stage debe ser ${context.stage}. Valores tone: ${TONES.join(', ')}. Valores length: ${LENGTHS.join(', ')}.`,
      `Valores angleId: ${Object.keys(ANGLES).join(', ')}. Valores ctaId: ${Object.keys(CTAS).join(', ')}.`,
      `Preferencias: tone=${TONES.includes(options.tone) ? options.tone : 'professional'}, length=${LENGTHS.includes(options.length) ? options.length : 'short'}.`,
      'No devuelvas asunto, cuerpo, texto libre, afirmaciones ni instrucciones. No inventes conversaciones.',
      '<UNTRUSTED_BUSINESS_DATA>', JSON.stringify(minimalExternalContext(context), null, 2), '</UNTRUSTED_BUSINESS_DATA>'
    ].join('\n');
  }

  function validatePlan(plan, context) {
    const errors = [];
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return { ok: false, errors: ['C4_PLAN_REQUIRED'], value: null };
    const allowed = new Set(['schema', 'schemaVersion', 'stage', 'serviceId', 'tone', 'length', 'angleId', 'ctaId', 'factRefs']);
    if (Object.keys(plan).some(key => !allowed.has(key))) errors.push('C4_PLAN_FREE_TEXT_FORBIDDEN');
    if (plan.schema !== PLAN_SCHEMA || plan.schemaVersion !== PLAN_VERSION) errors.push('C4_PLAN_SCHEMA_INVALID');
    if (safeStage(plan.stage) !== context.stage) errors.push('C4_PLAN_STAGE_INVALID');
    if (!(context.profile?.services || []).includes(plan.serviceId) || !emailApi.SERVICES[plan.serviceId]) errors.push('C4_PLAN_SERVICE_INVALID');
    if (!TONES.includes(plan.tone)) errors.push('C4_PLAN_TONE_INVALID');
    if (!LENGTHS.includes(plan.length)) errors.push('C4_PLAN_LENGTH_INVALID');
    if (!Object.hasOwn(ANGLES, plan.angleId)) errors.push('C4_PLAN_ANGLE_INVALID');
    if (!Object.hasOwn(CTAS, plan.ctaId)) errors.push('C4_PLAN_CTA_INVALID');
    const facts = new Map(availableFacts(context).map(fact => [fact.factId, fact]));
    if (!Array.isArray(plan.factRefs) || plan.factRefs.length > 2 || plan.factRefs.some(ref => !facts.has(ref))) errors.push('C4_PLAN_FACT_REF_INVALID');
    return { ok: !errors.length, errors, value: errors.length ? null : clone(plan) };
  }

  function parsePlan(response) {
    const text = String(response?.text ?? response ?? '').trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return JSON.parse(fenced ? fenced[1] : text);
  }

  function salutation(context) {
    return context.contactName ? `Hola ${context.contactName},` : 'Buenos dias,';
  }

  function stageOpening(stage) {
    if (stage === 2) return 'Retomo brevemente el mensaje anterior por si puede resultar de interes.';
    if (stage === 3) return 'Queria compartir otro enfoque que puede ser util para su actividad.';
    if (stage === 4) return 'De cara a futuras actuaciones, quedamos disponibles como posible apoyo profesional.';
    return 'Cierro este seguimiento para no insistir innecesariamente.';
  }

  function angleLine(context, plan) {
    const service = emailApi.SERVICES[plan.serviceId];
    if (plan.angleId === 'practical_value') return `Podemos valorar apoyo puntual en ${service.label}, siempre que exista una necesidad real.`;
    if (plan.angleId === 'sector_alternative') return `Como alternativa, podemos colaborar en ${service.label} cuando un proyecto concreto lo requiera.`;
    if (plan.angleId === 'future_collaboration') return `Podemos quedar como contacto para futuras necesidades de ${service.label}.`;
    return 'No volveremos a contactar dentro de esta secuencia salvo que usted considere oportuno retomar la conversacion.';
  }

  function renderPlan(context, planInput) {
    const checked = validatePlan(planInput, context);
    if (!checked.ok) throw new Error(`C4_PLAN_REJECTED:${checked.errors.join(',')}`);
    const plan = checked.value;
    const service = emailApi.SERVICES[plan.serviceId];
    const facts = new Map(availableFacts(context).map(fact => [fact.factId, fact]));
    const selectedFacts = plan.factRefs.map(ref => facts.get(ref)).filter(Boolean);
    const factLines = selectedFacts.map(fact => `Como dato registrado: ${fact.value}.`);
    const subjectPrefix = plan.stage === 5 ? 'Cierre de seguimiento' : plan.stage === 4 ? 'Para futuras actuaciones' : 'Seguimiento';
    const subject = `${subjectPrefix}: ${service.label}`.slice(0, 140);
    const parts = [salutation(context), '', stageOpening(plan.stage), angleLine(context, plan), ...factLines, '', CTAS[plan.ctaId], '', 'Un saludo,', 'Voltium Madrid', 'https://www.voltiummadrid.es'];
    if (plan.length === 'short' && factLines.length) parts.splice(4, factLines.length);
    return {
      subject, bodyText: parts.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 3500),
      structuredPlan: clone(plan), personalizationLevel: selectedFacts.length ? 'company_specific' : 'sector_honest',
      claims: selectedFacts.map(fact => ({ text: fact.value, sourceField: fact.key, sourceRef: fact.source })),
      warnings: clone(context.warnings || []), modelAudit: { deterministicRenderer: true, freeTextFromAI: false }
    };
  }

  function sentences(value) {
    return String(value || '').split(/(?<=[.!?])\s+|\n+/).map(item => item.trim()).filter(Boolean);
  }

  function validateEditedDraft(input = {}, context, baseDraft) {
    const subject = String(input.subject || '').trim().slice(0, 140);
    const bodyText = String(input.bodyText || '').trim().slice(0, 3500);
    const errors = [];
    if (!subject) errors.push('C4_SUBJECT_REQUIRED');
    if (!bodyText) errors.push('C4_BODY_REQUIRED');
    const baseSentences = new Set(sentences(baseDraft?.bodyText));
    const additions = sentences(bodyText).filter(sentence => !baseSentences.has(sentence));
    const safeBody = sentence => `Buenos dias,\n\n${sentence}\n\nSi le parece oportuno, podemos valorarlo.\n\nUn saludo,\nVoltium Madrid`;
    const subjectCheck = emailApi.validateDraft({ subject, bodyText: safeBody('Quedamos a su disposicion para una posible colaboracion.'), personalizationLevel: 'sector_honest', claims: [] }, context);
    if (!subjectCheck.ok) errors.push(...subjectCheck.errors.map(error => `C4_EDIT_SUBJECT_${error}`));
    additions.forEach(sentence => {
      const checked = emailApi.validateDraft({ subject: baseDraft?.subject || `Seguimiento: ${context.service.label}`, bodyText: safeBody(sentence), personalizationLevel: 'sector_honest', claims: [] }, context);
      if (!checked.ok) errors.push(...checked.errors.map(error => `C4_EDIT_BODY_${error}`));
    });
    return { ok: !errors.length, errors: [...new Set(errors)], value: { subject, bodyText, additions } };
  }

  async function generateDraft(context, options = {}) {
    const fallbackPlan = localPlan(context, options);
    if (options.useExternalAI !== true) return { draft: renderPlan(context, fallbackPlan), provenance: { kind: 'local_template', mode: 'c4_deterministic', reason: 'external_ai_not_requested' } };
    if (options.externalConsent !== true) throw new Error('C4_AI_CONSENT_REQUIRED');
    if (typeof options.aiCall !== 'function') return { draft: renderPlan(context, fallbackPlan), provenance: { kind: 'local_template', mode: 'c4_deterministic', reason: 'free_ai_unavailable' } };
    const expected = buildPrompt(context, options);
    if (options.externalPrompt !== expected) throw new Error('C4_AI_PREVIEW_REQUIRED');
    try {
      const response = await options.aiCall(expected, { purpose: 'email_followup_generation', containsPersonalData: Boolean(context.contactName), cancelPrevious: true, maxOutputTokens: 600 });
      const checked = validatePlan(parsePlan(response), context);
      if (!checked.ok) throw new Error(`C4_AI_PLAN_REJECTED:${checked.errors.join(',')}`);
      return { draft: renderPlan(context, checked.value), provenance: { kind: 'ai', mode: 'structured_plan', provider: response?.provider || null, purpose: 'email_followup_generation' } };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      return { draft: renderPlan(context, fallbackPlan), provenance: { kind: 'local_template', mode: 'c4_deterministic', reason: 'external_ai_failed', errorCode: clean(error?.message, 160) } };
    }
  }

  function installBrowser(root) {
    let agendaCache = { signature: null, value: null };
    let page = 0;
    let activeFilter = 'actionable';
    let activeComposer = null;

    function node(tag, className, text) {
      const item = root.document.createElement(tag);
      if (className) item.className = className;
      if (text != null) item.textContent = String(text);
      return item;
    }

    function currentLeads() { return Array.isArray(root.leads) ? root.leads : (typeof leads !== 'undefined' && Array.isArray(leads) ? leads : []); }
    function currentHistory() { return Array.isArray(root.emailHistory) ? root.emailHistory : (typeof emailHistory !== 'undefined' && Array.isArray(emailHistory) ? emailHistory : []); }

    async function freshAgenda() {
      await root.reconcileCommercialMemoryHistory?.();
      const memory = await root.getCommercialMemorySnapshot();
      const leadRows = currentLeads();
      const history = currentHistory();
      const signature = `${memory.revision}:${leadRows.length}:${history.length}`;
      if (agendaCache.signature !== signature) agendaCache = { signature, value: buildAgenda({ memory, leads: leadRows, emailHistory: history }) };
      return { memory, agenda: agendaCache.value };
    }

    async function decision(item, type, payload = {}) {
      const currentMemory = await root.getCommercialMemorySnapshot();
      const currentState = sequenceState({ lead: item.lead, memory: currentMemory, emailHistory: currentHistory(), contactId: item.contactId, target: item.target });
      assertSameBinding(item, currentState);
      const id = memoryApi.stableId('c4-decision', [item.sequenceKey, type, payload.dueAt || '', payload.reason || '']);
      if (type === 'followup_postponed') {
        await root.setCommercialNextAction(item.lead, { text: `Revisar seguimiento ${item.nextStage} de ${MAX_CONFIRMED}`, dueAt: payload.dueAt });
      }
      await root.recordCommercialMemoryEvent(item.lead, type, payload, {
        contactId: item.contactId, sequenceId: item.sequenceId, channel: 'email', sourceRef: 'commercial-followups-c4', idempotencyKey: id
      });
      agendaCache.signature = null;
      await renderAgenda(activeFilter);
    }

    function closeComposer() {
      root.VoltflowAIGateway?.cancel?.('email_followup_generation');
      root.document.getElementById('commercial-followup-c4-modal')?.remove();
      activeComposer = null;
    }

    async function openComposer(item) {
      closeComposer();
      const memory = await root.getCommercialMemorySnapshot();
      const state = sequenceState({ lead: item.lead, memory, emailHistory: currentHistory(), contactId: item.contactId, target: item.target });
      assertSameBinding(item, state);
      if (state.blocked) { root.showToast?.(state.reason); return { opened: false, reason: state.state }; }
      if (state.confirmedCount < 1) return root.VoltflowCommercialEmailC3.openComposer(item.lead);
      const context = buildGenerationContext({ state, memory, emailHistory: currentHistory() });
      const overlay = node('div', 'commercial-email-c3-overlay'); overlay.id = 'commercial-followup-c4-modal';
      const dialog = node('section', 'commercial-email-c3-dialog commercial-followup-c4-dialog'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
      const header = node('header', 'commercial-email-c3-header');
      const heading = node('div'); heading.append(node('h2', '', `Seguimiento ${state.nextStage} de ${MAX_CONFIRMED}`), node('p', '', context.companyName || 'Empresa seleccionada'));
      const close = node('button', 'commercial-email-icon-button', '\u00d7'); close.type = 'button'; close.setAttribute('aria-label', 'Cerrar'); close.onclick = closeComposer; header.append(heading, close); dialog.append(header);
      const controls = {};
      const form = node('div', 'commercial-email-c3-form');
      controls.tone = node('select'); [['professional', 'Profesional'], ['friendly', 'Cercano'], ['direct', 'Directo']].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; controls.tone.append(option); });
      controls.length = node('select'); [['short', 'Breve'], ['medium', 'Media']].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; controls.length.append(option); });
      [['Destinatario', node('strong', '', [context.contactName, context.target].filter(Boolean).join(' - '))], ['Tono', controls.tone], ['Longitud', controls.length]].forEach(([label, control]) => { const wrap = node('label'); wrap.append(node('span', '', label), control); form.append(wrap); });
      dialog.append(form);
      const previewBox = node('section', 'commercial-email-c3-context'); previewBox.append(node('h3', '', 'Vista previa exacta de la solicitud externa'));
      const preview = node('pre', 'commercial-email-c3-disclosure'); previewBox.append(preview); dialog.append(previewBox);
      const consent = node('label', 'commercial-email-c3-consent'); controls.useAI = node('input'); controls.useAI.type = 'checkbox'; consent.append(controls.useAI, node('span', '', 'Usar IA externa gratuita autorizada para elegir el plan. El texto se construira localmente.')); dialog.append(consent);
      const status = node('div', 'commercial-email-c3-status', 'Modo local: no se enviaran datos a proveedores.'); dialog.append(status);
      const generate = node('button', 'btn-primary', 'Preparar seguimiento'); generate.type = 'button'; dialog.append(generate);
      const editor = node('section', 'commercial-email-c3-editor'); editor.hidden = true;
      controls.subject = node('input'); controls.subject.type = 'text'; controls.subject.maxLength = 140;
      controls.body = node('textarea'); controls.body.rows = 12; controls.body.maxLength = 3500;
      const subjectLabel = node('label'); subjectLabel.append(node('span', '', 'Asunto'), controls.subject);
      const bodyLabel = node('label'); bodyLabel.append(node('span', '', 'Mensaje editable'), controls.body);
      const audit = node('div', 'commercial-email-c3-audit');
      const actions = node('div', 'commercial-email-c3-actions'); const open = node('button', 'btn-primary', 'Revisar y abrir Outlook'); open.type = 'button'; actions.append(open);
      editor.append(subjectLabel, bodyLabel, audit, actions); dialog.append(editor); overlay.append(dialog); root.document.body.append(overlay);
      let disclosedPrompt = buildPrompt(context, { tone: controls.tone.value, length: controls.length.value });
      let authorizedPrompt = null;
      preview.textContent = disclosedPrompt;
      const refresh = () => {
        disclosedPrompt = buildPrompt(context, { tone: controls.tone.value, length: controls.length.value });
        preview.textContent = disclosedPrompt; controls.useAI.checked = false; authorizedPrompt = null; activeComposer = null; editor.hidden = true;
        status.textContent = 'La configuracion cambio. Revisa la solicitud antes de autorizar la IA.';
      };
      [controls.tone, controls.length].forEach(control => { control.onchange = refresh; });
      controls.useAI.onchange = () => { authorizedPrompt = controls.useAI.checked ? disclosedPrompt : null; status.textContent = controls.useAI.checked ? 'Solicitud autorizada para una unica generacion.' : 'Modo local: no se enviaran datos a proveedores.'; };
      generate.onclick = async () => {
        generate.disabled = true;
        try {
          const freshMemory = await root.getCommercialMemorySnapshot();
          const freshState = sequenceState({ lead: item.lead, memory: freshMemory, emailHistory: currentHistory(), contactId: context.contactId, target: context.target });
          assertSameBinding(context, freshState);
          if (freshState.blocked) throw new Error('C4_CONTEXT_CHANGED');
          const freshContext = buildGenerationContext({ state: freshState, memory: freshMemory, emailHistory: currentHistory() });
          const exact = buildPrompt(freshContext, { tone: controls.tone.value, length: controls.length.value });
          if (controls.useAI.checked && (authorizedPrompt !== exact || disclosedPrompt !== exact)) throw new Error('C4_AI_PREVIEW_CHANGED');
          const gateway = root.VoltflowAIGateway;
          const providerReady = controls.useAI.checked && gateway?.status && Object.values(gateway.status()).some(value => value.configured && value.ok && !value.limited);
          const generated = await generateDraft(freshContext, {
            tone: controls.tone.value, length: controls.length.value,
            useExternalAI: controls.useAI.checked, externalConsent: controls.useAI.checked,
            externalPrompt: controls.useAI.checked ? exact : null,
            aiCall: providerReady ? ((prompt, options) => gateway.generate(prompt, options)) : null
          });
          const existing = Object.values(freshMemory.drafts || {}).find(draft => draft.companyId === freshContext.companyId && draft.contactId === freshContext.contactId && draft.purpose === PURPOSE);
          const stored = emailApi.upsertDraft(existing, freshContext, generated, { tone: controls.tone.value, length: controls.length.value });
          await root.saveCommercialEmailDraft(item.lead, stored);
          activeComposer = { context: freshContext, generated, stored, edited: false };
          controls.subject.value = generated.draft.subject; controls.body.value = generated.draft.bodyText;
          audit.replaceChildren(node('strong', '', generated.provenance.kind === 'ai' ? 'Plan estructurado de IA; texto construido localmente' : 'Plantilla local determinista'), node('p', '', `Etapa ${freshContext.stage} de ${MAX_CONFIRMED}. Restan ${freshContext.c4.remaining} comunicaciones posibles antes de confirmar esta.`));
          editor.hidden = false; status.textContent = 'Borrador preparado. Revisa individualmente antes de abrir Outlook.';
        } catch (error) { status.textContent = `No se pudo preparar: ${clean(error?.message, 180)}`; }
        finally { generate.disabled = false; }
      };
      [controls.subject, controls.body].forEach(control => { control.oninput = () => { if (activeComposer) activeComposer.edited = true; }; });
      open.onclick = async () => {
        if (!activeComposer) return root.showToast?.('Prepara y revisa un borrador primero.');
        open.disabled = true;
        try {
          const freshMemory = await root.getCommercialMemorySnapshot();
          const freshState = sequenceState({ lead: item.lead, memory: freshMemory, emailHistory: currentHistory(), contactId: activeComposer.context.contactId, target: activeComposer.context.target });
          assertSameBinding(activeComposer.context, freshState);
          if (freshState.blocked) throw new Error('C4_CONTEXT_CHANGED');
          const subject = controls.subject.value.trim(); const bodyText = controls.body.value.trim();
          if (!subject || !bodyText) throw new Error('C4_DRAFT_REQUIRED');
          if (!activeComposer.edited) {
            const expected = renderPlan(activeComposer.context, activeComposer.generated.draft.structuredPlan);
            if (subject !== expected.subject || bodyText !== expected.bodyText) throw new Error('C4_RENDER_CHANGED');
          } else {
            const checked = validateEditedDraft({ subject, bodyText }, activeComposer.context, activeComposer.generated.draft);
            if (!checked.ok) throw new Error(`C4_EDIT_REJECTED:${checked.errors.join(',')}`);
            const edited = { draft: { ...activeComposer.generated.draft, subject: checked.value.subject, bodyText: checked.value.bodyText, structuredPlan: null }, provenance: { kind: 'human_edited', basedOn: activeComposer.generated.provenance.kind, stage: activeComposer.context.stage } };
            activeComposer.stored = emailApi.upsertDraft(activeComposer.stored, activeComposer.context, edited, { tone: controls.tone.value, length: controls.length.value });
            await root.saveCommercialEmailDraft(item.lead, activeComposer.stored); activeComposer.edited = false;
          }
          const mailto = `mailto:${encodeURIComponent(activeComposer.context.target)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
          const result = await root.prepareCommercialMessageAndOpen({
            lead: item.lead, channel: 'email', target: activeComposer.context.target, contactId: activeComposer.context.contactId,
            purpose: PURPOSE, sequenceStep: activeComposer.context.stage, subject, body: bodyText,
            generatedBy: activeComposer.generated.provenance.kind === 'ai' ? 'ai' : 'local_template', externalClient: 'outlook',
            openExternal: () => { const anchor = node('a'); anchor.href = mailto; anchor.hidden = true; root.document.body.append(anchor); anchor.click(); anchor.remove(); return true; }
          });
          if (result.opened) closeComposer(); else status.textContent = `Outlook no se abrio: ${result.reason || 'operacion cancelada'}.`;
        } catch (error) { status.textContent = `Apertura bloqueada: ${clean(error?.message, 180)}`; }
        finally { open.disabled = false; }
      };
      activeComposer = { context, generated: null, stored: null, edited: false };
      return { opened: true, context };
    }

    async function renderAgenda(selectedFilter) {
      const host = root.document.getElementById('commercial-followup-overview');
      if (!host) return;
      try {
        const { memory, agenda } = await freshAgenda();
        const settings = memory.followupSettings || {};
        const pageSize = Math.max(10, Math.min(50, Number(settings.pageSize || 20)));
        if (selectedFilter) { activeFilter = selectedFilter; page = 0; }
        let rows = activeFilter === 'all' ? agenda.states : activeFilter === 'actionable' ? agenda.states.filter(isActionable) : agenda.states.filter(item => item.state === activeFilter);
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize)); page = Math.min(page, totalPages - 1);
        rows = rows.slice(page * pageSize, (page + 1) * pageSize);
        host.replaceChildren(); host.classList.add('commercial-followup-c4');
        const top = node('div', 'commercial-followup-c4-header');
        const title = node('div'); title.append(node('strong', '', 'Agenda comercial'), node('span', '', `${agenda.states.length} empresas evaluadas`));
        const interval = node('button', 'btn-outline c4-settings', 'Intervalos'); interval.type = 'button'; interval.title = 'Configurar dias tras cada comunicacion confirmada';
        interval.onclick = async () => {
          const current = normalizeIntervals(settings.intervalsDays).join(', ');
          const value = root.prompt('Dias despues de los contactos 1, 2, 3 y 4 (cuatro numeros entre 1 y 90):', current);
          if (value == null) return;
          const parsed = value.split(',').map(item => Number(item.trim()));
          if (parsed.length !== 4 || parsed.some(item => !Number.isInteger(item) || item < 1 || item > 90)) return root.showToast?.('Indica cuatro intervalos validos entre 1 y 90 dias.');
          await root.updateCommercialFollowupSettings({ intervalsDays: parsed, pageSize }); agendaCache.signature = null; await renderAgenda(activeFilter);
        };
        top.append(title, interval); host.append(top);
        const tabs = node('div', 'commercial-overview-tabs');
        const filters = [['actionable', 'Acciones'], [STATES.OVERDUE, 'Vencidos'], [STATES.RECOMMENDED, 'Recomendados'], [STATES.RESPONDED, 'Respondidos'], [STATES.OPPORTUNITY, 'Oportunidades'], [STATES.EXCLUDED, 'Excluidos'], ['all', 'Todos']];
        filters.forEach(([key, label]) => { const count = key === 'actionable' ? agenda.states.filter(isActionable).length : key === 'all' ? agenda.states.length : agenda.counts[key] || 0; const button = node('button', key === activeFilter ? 'is-active' : '', `${label} ${count}`); button.type = 'button'; button.onclick = () => renderAgenda(key); tabs.append(button); });
        host.append(tabs);
        const list = node('div', 'commercial-overview-list');
        rows.forEach(item => {
          const row = node('article', `commercial-overview-row c4-state-${item.state}`);
          const main = node('button', 'c4-row-main'); main.type = 'button'; main.onclick = () => root.openLeadDetail?.(item.leadId);
          const name = item.company?.name || item.lead?.company || 'Empresa sin nombre';
          const meta = [item.label, item.recommendationDismissed ? 'Recomendacion descartada' : null, `${item.confirmedCount}/${MAX_CONFIRMED} confirmados`, item.dueAt ? new Date(item.dueAt).toLocaleDateString('es-ES') : null].filter(Boolean).join(' - ');
          main.append(node('strong', '', name), node('span', '', meta));
          if (!item.identityResolved) main.append(node('span', 'c4-identity-warning', item.reason));
          const actions = node('div', 'c4-row-actions');
          const prepare = node('button', 'btn-primary', item.confirmedCount ? 'Preparar' : 'Primer correo'); prepare.type = 'button'; prepare.disabled = item.blocked || (![STATES.NEVER_CONTACTED, STATES.SENT_NO_RESPONSE, STATES.RECOMMENDED, STATES.OVERDUE, STATES.OPPORTUNITY].includes(item.state)); prepare.onclick = () => openComposer(item); actions.append(prepare);
          if (item.confirmedCount > 0 && !item.blocked) {
            const delay = node('select', 'c4-delay'); [2, 4, 7, 14, 30].forEach(days => { const option = node('option', '', `${days} d`); option.value = days; delay.append(option); });
            const postpone = node('button', 'btn-outline', 'Posponer'); postpone.type = 'button'; postpone.onclick = () => { const dueAt = new Date(Date.now() + Number(delay.value) * 86400000).toISOString(); decision(item, 'followup_postponed', { dueAt, stage: item.nextStage }); }; actions.append(delay, postpone);
            const dismiss = node('button', 'btn-outline', 'Descartar'); dismiss.type = 'button'; dismiss.onclick = () => decision(item, 'followup_dismissed', { stage: item.nextStage, reason: 'user_dismissed' }); actions.append(dismiss);
            const close = node('button', 'btn-outline', 'Cerrar'); close.type = 'button'; close.onclick = () => { if (root.confirm('Cerrar esta secuencia sin enviar mas comunicaciones?')) decision(item, 'followup_closed', { stage: item.nextStage, reason: 'user_closed' }); }; actions.append(close);
          }
          row.append(main, actions); list.append(row);
        });
        if (!rows.length) list.append(node('div', 'commercial-empty', 'No hay empresas en esta vista.'));
        host.append(list);
        const pagination = node('div', 'c4-pagination');
        const previous = node('button', 'btn-outline', 'Anterior'); previous.type = 'button'; previous.disabled = page === 0; previous.onclick = () => { page--; renderAgenda(); };
        const indicator = node('span', '', `${page + 1} / ${totalPages}`);
        const next = node('button', 'btn-outline', 'Siguiente'); next.type = 'button'; next.disabled = page >= totalPages - 1; next.onclick = () => { page++; renderAgenda(); };
        pagination.append(previous, indicator, next); host.append(pagination);
      } catch (error) {
        host.replaceChildren(node('div', 'commercial-memory-error', `Agenda no disponible: ${clean(error?.message, 180)}`));
      }
    }

    root.renderCommercialFollowupOverview = renderAgenda;
    root.openCommercialFollowupComposer = openComposer;
    root.setTimeout?.(() => renderAgenda().catch(() => {}), 0);
    return root.VoltflowCommercialFollowupsC4;
  }

  return Object.freeze({
    PURPOSE, MAX_CONFIRMED, DEFAULT_INTERVALS, STATES, LABELS, ANGLES, CTAS,
    normalizeIntervals, buildIndex, sequenceState, buildAgenda, isActionable, buildGenerationContext, assertSameBinding,
    localPlan, minimalExternalContext, buildPrompt, validatePlan, renderPlan, validateEditedDraft, generateDraft,
    installBrowser
  });
});
