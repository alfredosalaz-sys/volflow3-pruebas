(function (root, factory) {
  const memoryApi = root?.VoltflowCommercialMemory || (typeof require === 'function' ? require('./commercial-memory.js') : null);
  const communications = root?.CommercialCommunications || (typeof require === 'function' ? require('./commercial-communications.js') : null);
  const emailApi = root?.VoltflowCommercialEmailC3 || (typeof require === 'function' ? require('./commercial-email-c3.js') : null);
  const followups = root?.VoltflowCommercialFollowupsC4 || (typeof require === 'function' ? require('./commercial-followups-c4.js') : null);
  const api = factory(memoryApi, communications, emailApi, followups);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VoltflowCommercialResponsesC5 = api;
  if (root?.document) api.installBrowser(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (memoryApi, communications, emailApi, followups) {
  'use strict';

  const PURPOSE = 'commercial_reply';
  const PLAN_SCHEMA = 'voltflow-commercial-reply-plan';
  const PLAN_VERSION = 1;
  const REVIEW_SCHEMA = 'voltflow-commercial-inbound-review';
  const REVIEW_VERSION = 1;
  const INTENTS = Object.freeze([
    'interested', 'information_request', 'quote_request', 'existing_supplier', 'no_current_need',
    'contact_later', 'price_objection', 'references_request', 'referral', 'meeting_or_call',
    'rejection', 'opt_out', 'ambiguous'
  ]);
  const INTENT_LABELS = Object.freeze({
    interested: 'Muestra interes', information_request: 'Solicita informacion', quote_request: 'Solicita presupuesto',
    existing_supplier: 'Ya tiene proveedor', no_current_need: 'No necesita ahora', contact_later: 'Contactar mas adelante',
    price_objection: 'Objecion de precio', references_request: 'Solicita referencias', referral: 'Deriva a otra persona',
    meeting_or_call: 'Propone reunion o llamada', rejection: 'Rechaza la propuesta', opt_out: 'Solicita no recibir mensajes',
    ambiguous: 'Respuesta ambigua'
  });
  const STRATEGIES = Object.freeze(['answer_directly', 'clarify_scope', 'arrange_call', 'respect_pause', 'acknowledge_objection', 'close_respectfully']);
  const CTAS = Object.freeze(['send_information', 'request_scope', 'suggest_call', 'confirm_future_date', 'no_cta']);
  const TONES = Object.freeze(['professional', 'friendly', 'direct']);
  const PLAN_POLICY = Object.freeze({
    interested: Object.freeze([Object.freeze(['arrange_call', 'suggest_call'])]),
    information_request: Object.freeze([Object.freeze(['answer_directly', 'send_information'])]),
    quote_request: Object.freeze([Object.freeze(['clarify_scope', 'request_scope'])]),
    existing_supplier: Object.freeze([Object.freeze(['respect_pause', 'no_cta'])]),
    no_current_need: Object.freeze([Object.freeze(['respect_pause', 'no_cta'])]),
    contact_later: Object.freeze([Object.freeze(['respect_pause', 'confirm_future_date'])]),
    price_objection: Object.freeze([Object.freeze(['acknowledge_objection', 'suggest_call'])]),
    references_request: Object.freeze([Object.freeze(['answer_directly', 'send_information'])]),
    referral: Object.freeze([Object.freeze(['answer_directly', 'no_cta'])]),
    meeting_or_call: Object.freeze([Object.freeze(['arrange_call', 'suggest_call'])]),
    rejection: Object.freeze([Object.freeze(['close_respectfully', 'no_cta'])]),
    opt_out: Object.freeze([Object.freeze(['close_respectfully', 'no_cta'])]),
    ambiguous: Object.freeze([Object.freeze(['clarify_scope', 'request_scope'])])
  });

  function normalize(value) {
    return String(value == null ? '' : value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  }

  function cleanLine(value, max = 240) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function cleanBody(value, max = 12000) {
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
  }

  function extractEmail(value) {
    const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? communications.normalizeTarget('email', match[0]) : '';
  }

  function parsePastedReply(rawInput) {
    const raw = cleanBody(rawInput);
    if (raw.length < 5) throw new Error('C5_REPLY_TEXT_REQUIRED');
    const lines = raw.split('\n');
    const headers = {};
    let bodyStart = 0;
    let recognized = 0;
    for (let index = 0; index < Math.min(lines.length, 40); index++) {
      const line = lines[index];
      if (!line.trim() && recognized) { bodyStart = index + 1; break; }
      const match = line.match(/^\s*(De|From|Para|To|Asunto|Subject|Fecha|Date|Message-ID|Id\. de mensaje)\s*:\s*(.*)$/i);
      if (!match) {
        if (recognized) { bodyStart = index; break; }
        continue;
      }
      recognized++;
      const key = normalize(match[1]);
      headers[key] = cleanLine(match[2], 500);
      bodyStart = index + 1;
    }
    const from = headers.de || headers.from || '';
    const subject = cleanLine(headers.asunto || headers.subject || '(sin asunto)', 180);
    const sourceDate = cleanLine(headers.fecha || headers.date || '', 160);
    const messageId = cleanLine(headers['message-id'] || headers['id. de mensaje'] || '', 240);
    const body = cleanBody(recognized ? lines.slice(bodyStart).join('\n') : raw, 12000);
    if (!body) throw new Error('C5_REPLY_BODY_REQUIRED');
    return Object.freeze({ raw, sender: cleanLine(from, 240), senderEmail: extractEmail(from), subject, sourceDate, messageId, body });
  }

  const RULES = Object.freeze([
    ['opt_out', [/no (?:me|nos) (?:envien|contacten|escriban)/i, /(?:darme|darnos|dar de) baja/i, /no deseo recibir/i, /retir(?:e|en) (?:mi|nuestro) (?:correo|email)/i]],
    ['price_objection', [/(?:precio|presupuesto).{0,35}(?:alto|caro|elevado)/i, /se nos va de presupuesto/i]],
    ['quote_request', [/presupuesto/i, /cotizaci[oó]n/i, /cu[aá]nto (?:costar[ií]a|cuesta)/i, /valoraci[oó]n econ[oó]mica/i]],
    ['meeting_or_call', [/reuni[oó]n/i, /podemos hablar/i, /(?:ll[aá]mame|llamada|videollamada)/i, /agend(?:ar|amos)/i]],
    ['contact_later', [/(?:m[aá]s adelante|otro momento|pr[oó]ximo trimestre)/i, /contact(?:a|e|ad).{0,20}(?:mes|semana|fecha)/i]],
    ['referral', [/(?:contacte|escriba|hable) con/i, /responsable (?:es|ser[ií]a)/i, /le pongo en copia/i]],
    ['existing_supplier', [/ya (?:tenemos|dispongo de) (?:proveedor|empresa)/i, /trabajamos con otra empresa/i]],
    ['references_request', [/referencias/i, /trabajos anteriores/i, /casos (?:de exito|similares)/i]],
    ['no_current_need', [/ahora no (?:necesitamos|nos hace falta)/i, /no tenemos (?:necesidad|proyectos)/i, /sin necesidad actualmente/i]],
    ['rejection', [/no (?:nos|me) interesa/i, /descartamos (?:la|su) propuesta/i, /no vamos a continuar/i]],
    ['information_request', [/env[ií](?:a|e|en).{0,20}informaci[oó]n/i, /puede (?:ampliar|explicar)/i, /qu[eé] servicios/i, /m[aá]s detalles/i]],
    ['interested', [/nos interesa/i, /me parece interesante/i, /queremos valorar/i, /podr[ií]amos colaborar/i]]
  ]);

  function inspectUntrustedReply(parsed) {
    const text = `${parsed?.subject || ''}\n${parsed?.body || ''}`;
    const suspectedPromptInjection = /(ignora|omite|olvida).{0,40}(instrucciones|sistema|prompt)|system\s*prompt|<script|javascript:|ejecuta.{0,20}(c[oó]digo|comando)/i.test(text);
    return { suspectedPromptInjection, externalInstructionsIgnored: true };
  }

  function classifyDeterministic(parsed) {
    const text = `${parsed?.subject || ''}\n${parsed?.body || ''}`;
    for (const [intent, patterns] of RULES) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return { intent, confidence: intent === 'opt_out' ? 'high' : 'medium', evidenceSpans: [cleanLine(match[0], 180)], requiresHumanReview: true };
      }
    }
    return { intent: 'ambiguous', confidence: 'low', evidenceSpans: [], requiresHumanReview: true };
  }

  function resolveBinding(input = {}) {
    if (!followups?.sequenceState) throw new Error('C5_C4_REQUIRED');
    const state = followups.sequenceState({ lead: input.lead, memory: input.memory, emailHistory: input.emailHistory || [], contactId: input.contactId, target: input.target });
    if (!state.identityResolved) throw new Error(state.resolutionError || 'C5_CONTACT_IDENTITY_UNRESOLVED');
    const senderEmail = communications.normalizeTarget('email', input.parsed?.senderEmail || '');
    if (!senderEmail) throw new Error('C5_SENDER_EMAIL_REQUIRED');
    if (senderEmail !== state.target) throw new Error('C5_SENDER_CONTACT_MISMATCH');
    return state;
  }

  function fingerprintFor(parsed, binding) {
    return memoryApi.inboundMessageFingerprint({
      companyId: binding.companyId, contactId: binding.contactId, channel: 'email', target: binding.target,
      messageId: parsed.messageId, sourceDate: parsed.sourceDate, subject: parsed.subject, body: parsed.body
    });
  }

  function prepareReview(input = {}) {
    const parsed = input.parsed || parsePastedReply(input.raw);
    const binding = resolveBinding({ ...input, parsed });
    const classification = classifyDeterministic(parsed);
    const inspection = inspectUntrustedReply(parsed);
    return {
      schema: REVIEW_SCHEMA, schemaVersion: REVIEW_VERSION,
      leadId: input.lead?.id ?? null, companyId: binding.companyId, establishmentId: binding.lead?.commercialRefs?.establishmentId || null,
      contactId: binding.contactId, target: binding.target, sequenceId: binding.sequenceId, sequenceKey: binding.sequenceKey,
      parsed, proposedIntent: classification.intent, intent: classification.intent, confidence: classification.confidence,
      evidenceSpans: classification.evidenceSpans, suspectedPromptInjection: inspection.suspectedPromptInjection,
      fingerprint: fingerprintFor(parsed, binding), humanReviewed: false, applyCommercialEffect: false,
      createdAt: new Date().toISOString()
    };
  }

  function finalizeReview(reviewInput, edits = {}) {
    const review = { ...reviewInput, parsed: { ...(reviewInput?.parsed || {}) } };
    if (edits.sender !== undefined) { review.parsed.sender = cleanLine(edits.sender, 240); review.parsed.senderEmail = extractEmail(edits.sender); }
    if (edits.subject !== undefined) review.parsed.subject = cleanLine(edits.subject, 180) || '(sin asunto)';
    if (edits.sourceDate !== undefined) review.parsed.sourceDate = cleanLine(edits.sourceDate, 160);
    if (edits.body !== undefined) review.parsed.body = cleanBody(edits.body, 12000);
    if (!review.parsed.body) throw new Error('C5_REPLY_BODY_REQUIRED');
    review.intent = INTENTS.includes(edits.intent) ? edits.intent : review.intent;
    if (!INTENTS.includes(review.intent)) throw new Error('C5_INTENT_INVALID');
    review.humanReviewed = edits.humanReviewed === true;
    review.applyCommercialEffect = edits.applyCommercialEffect === true;
    review.confirmOptOut = edits.confirmOptOut === true;
    review.reviewedAt = edits.reviewedAt || new Date().toISOString();
    review.fingerprint = fingerprintFor(review.parsed, review);
    return review;
  }

  function validateReviewed(review) {
    if (!review || review.schema !== REVIEW_SCHEMA || review.schemaVersion !== REVIEW_VERSION) throw new Error('C5_REVIEW_SCHEMA_INVALID');
    if (!review.humanReviewed) throw new Error('C5_HUMAN_REVIEW_REQUIRED');
    if (!review.companyId || !review.contactId || !review.target || !review.sequenceId) throw new Error('C5_REVIEW_IDENTITY_REQUIRED');
    if (!INTENTS.includes(review.intent)) throw new Error('C5_INTENT_INVALID');
    if (!review.parsed?.body || !review.fingerprint) throw new Error('C5_REVIEW_CONTENT_REQUIRED');
    if (review.intent === 'opt_out' && (!review.applyCommercialEffect || !review.confirmOptOut)) throw new Error('C5_OPT_OUT_CONFIRMATION_REQUIRED');
    return true;
  }

  function effectFor(review) {
    if (!review.applyCommercialEffect) return null;
    const common = { text: `Clasificacion revisada por el usuario: ${INTENT_LABELS[review.intent]}.`, responseFingerprint: review.fingerprint };
    if (review.intent === 'interested') return { type: 'interest_recorded', payload: common };
    if (review.intent === 'information_request') return { type: 'information_requested', payload: common };
    if (review.intent === 'quote_request') return { type: 'quote_requested', payload: common, opportunityId: memoryApi.stableId('opportunity', [review.companyId, review.contactId, review.fingerprint, 'quote']) };
    if (['existing_supplier', 'price_objection'].includes(review.intent)) return { type: 'objection_recorded', payload: common };
    if (review.intent === 'rejection') return { type: 'contact_rejected', payload: common };
    if (review.intent === 'opt_out') return { type: 'opt_out_confirmed', payload: { ...common, target: review.target } };
    return null;
  }

  function applyReviewedResponse(memoryInput, review, options = {}) {
    validateReviewed(review);
    let memory = memoryApi.normalizeMemory(memoryInput);
    if (!memory.companies[review.companyId]) throw new Error('C5_COMPANY_NOT_FOUND');
    const responseKey = `c5-inbound:${review.fingerprint}`;
    const existingResponse = Object.values(memory.events || {}).find(event => event.idempotencyKey === responseKey);
    if (existingResponse && (existingResponse.contactId !== review.contactId || existingResponse.payload?.intent !== review.intent)) {
      throw new Error('C5_EXISTING_RESPONSE_REVIEW_MISMATCH');
    }
    const response = existingResponse ? { memory, event: existingResponse, reused: true } : memoryApi.appendEvent(memory, {
        companyId: review.companyId, establishmentId: review.establishmentId, contactId: review.contactId,
        sequenceId: review.sequenceId, channel: 'email', type: 'response_received', actor: 'user',
        occurredAt: options.occurredAt || review.reviewedAt, sourceRef: 'commercial-responses-c5',
        idempotencyKey: responseKey,
        payload: {
          subject: review.parsed.subject, text: review.parsed.body, sender: review.parsed.sender,
          senderEmail: review.parsed.senderEmail, sourceDate: review.parsed.sourceDate, sourceMessageId: review.parsed.messageId,
          intent: review.intent, confidence: review.confidence, evidenceSpans: review.evidenceSpans,
          suspectedPromptInjection: review.suspectedPromptInjection === true, humanReviewed: true,
          responseFingerprint: review.fingerprint
        }
      });
    memory = response.memory;
    const effect = effectFor(review);
    let effectEvent = null;
    if (effect) {
      const effectKey = `c5-effect:${review.fingerprint}:${review.intent}`;
      const existingEffect = Object.values(memory.events || {}).find(event => event.idempotencyKey === effectKey);
      const result = existingEffect ? { memory, event: existingEffect, reused: true } : memoryApi.appendEvent(memory, {
        companyId: review.companyId, establishmentId: review.establishmentId, contactId: review.contactId,
        sequenceId: review.sequenceId, channel: 'email', opportunityId: effect.opportunityId,
        type: effect.type, actor: 'user', occurredAt: options.occurredAt || review.reviewedAt,
        sourceRef: 'commercial-responses-c5', idempotencyKey: effectKey,
        payload: effect.payload
      });
      memory = result.memory;
      effectEvent = result.event;
    }
    const opportunity = effect?.opportunityId ? memory.opportunities[effect.opportunityId] : null;
    return { memory, responseEvent: response.event, effectEvent, opportunity, reused: response.reused };
  }

  function safeContext(input = {}) {
    const review = input.review;
    validateReviewed(review);
    const memory = memoryApi.normalizeMemory(input.memory);
    const company = memory.companies[review.companyId];
    const contact = memory.contacts[review.contactId];
    if (!company || !contact || !company.contactIds.includes(review.contactId)) throw new Error('C5_CONTEXT_IDENTITY_INVALID');
    const emailContext = emailApi.buildContext({ lead: input.lead, memory, emailHistory: input.emailHistory || [], contactId: review.contactId, target: review.target, purpose: PURPOSE, serviceId: input.serviceId });
    return { review, memory, company, contact, emailContext, companyId: review.companyId, contactId: review.contactId, target: review.target, sequenceId: review.sequenceId, intent: review.intent, serviceId: emailContext.serviceId, service: emailContext.service };
  }

  function localPlan(context, options = {}) {
    const [strategy, cta] = contextIsRestricted(context) ? ['close_respectfully', 'no_cta'] : (PLAN_POLICY[context.intent] || PLAN_POLICY.ambiguous)[0];
    return { schema: PLAN_SCHEMA, schemaVersion: PLAN_VERSION, intent: context.intent, strategy, cta, tone: TONES.includes(options.tone) ? options.tone : 'professional', serviceId: context.serviceId };
  }

  function contextIsRestricted(context) {
    if (context?.intent === 'opt_out' || context?.intent === 'rejection') return true;
    if (context?.company?.restrictions?.doNotContact || context?.company?.commercialStatus === 'excluded') return true;
    return Object.values(context?.memory?.exclusions || {}).some(item => item?.active !== false && (item.companyId === context.companyId || item.contactId === context.contactId));
  }

  function validatePlan(plan, context) {
    const errors = [];
    const allowed = ['schema', 'schemaVersion', 'intent', 'strategy', 'cta', 'tone', 'serviceId'];
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) errors.push('C5_PLAN_OBJECT_REQUIRED');
    if (plan?.schema !== PLAN_SCHEMA || plan?.schemaVersion !== PLAN_VERSION) errors.push('C5_PLAN_SCHEMA_INVALID');
    if (plan?.intent !== context.intent) errors.push('C5_PLAN_INTENT_CHANGED');
    if (!STRATEGIES.includes(plan?.strategy)) errors.push('C5_PLAN_STRATEGY_INVALID');
    if (!CTAS.includes(plan?.cta)) errors.push('C5_PLAN_CTA_INVALID');
    const policy = contextIsRestricted(context) ? [['close_respectfully', 'no_cta']] : (PLAN_POLICY[context?.intent] || []);
    if (!policy.some(([strategy, cta]) => strategy === plan?.strategy && cta === plan?.cta)) errors.push('C5_PLAN_INTENT_COMBINATION_FORBIDDEN');
    if (contextIsRestricted(context) && (plan?.strategy !== 'close_respectfully' || plan?.cta !== 'no_cta')) errors.push('C5_PLAN_RESTRICTED_CONTACT_FORBIDDEN');
    if (!TONES.includes(plan?.tone)) errors.push('C5_PLAN_TONE_INVALID');
    if (plan?.serviceId !== context.serviceId) errors.push('C5_PLAN_SERVICE_CHANGED');
    if (Object.keys(plan || {}).some(key => !allowed.includes(key))) errors.push('C5_PLAN_FREE_TEXT_FORBIDDEN');
    return { ok: errors.length === 0, errors, value: errors.length ? null : { ...plan } };
  }

  function buildPrompt(context, options = {}) {
    const payload = {
      task: 'select_commercial_reply_plan', schema: PLAN_SCHEMA, schemaVersion: PLAN_VERSION,
      allowed: { combinations: contextIsRestricted(context) ? [['close_respectfully', 'no_cta']] : (PLAN_POLICY[context.intent] || PLAN_POLICY.ambiguous), tone: TONES },
      fixed: { intent: context.intent, serviceId: context.serviceId, sector: cleanLine(context.company.sector, 120) || null },
      rules: ['Return JSON only', 'Do not add free text', 'Do not infer facts', 'Do not change intent or service']
    };
    return JSON.stringify(payload, null, 2);
  }

  function renderPlan(context, plan) {
    const checked = validatePlan(plan, context);
    if (!checked.ok) throw new Error(checked.errors.join(','));
    const name = emailApi.validatePersonName(context.contact?.name);
    const salutation = name.ok ? `Hola ${name.value},` : 'Buenos dias,';
    const bodies = {
      interested: 'Gracias por su respuesta y por el interes mostrado. Podemos concretar el alcance y valorar como encajar los servicios de Voltium Madrid.',
      information_request: `Gracias por su respuesta. Podemos facilitarle informacion sobre ${context.service?.label || 'nuestros servicios de reformas y mantenimiento'} y resolver las cuestiones que necesite.`,
      quote_request: 'Gracias por solicitar una valoracion. Para preparar una propuesta ajustada necesitamos confirmar el alcance, la ubicacion y las condiciones principales del trabajo.',
      existing_supplier: 'Gracias por indicarlo. Respetamos que ya trabajen con otro proveedor y quedamos disponibles si en el futuro necesitan una alternativa o apoyo puntual.',
      no_current_need: 'Gracias por responder. Entendemos que ahora no exista una necesidad concreta y no queremos insistir innecesariamente.',
      contact_later: 'Gracias por responder. Podemos retomar la conversacion en el momento que resulte adecuado para ustedes.',
      price_objection: 'Gracias por trasladarnos su observacion sobre el precio. Podemos revisar el alcance y las prioridades para valorar alternativas sin asumir condiciones que no esten confirmadas.',
      references_request: 'Gracias por su mensaje. Podemos preparar informacion verificable y adecuada al tipo de servicio que desean valorar.',
      referral: 'Gracias por orientarnos hacia la persona o departamento adecuado. Revisaremos los datos antes de realizar cualquier nuevo contacto.',
      meeting_or_call: 'Gracias por su propuesta. Podemos coordinar una llamada o reunion para entender el alcance y los siguientes pasos.',
      rejection: 'Gracias por responder. Tomamos nota de su decision y no insistiremos con esta propuesta.',
      opt_out: 'Confirmamos que hemos registrado su solicitud y no realizaremos nuevas comunicaciones comerciales a este contacto.',
      ambiguous: 'Gracias por su respuesta. Para evitar interpretar incorrectamente su mensaje, agradeceriamos que nos indicara como prefiere continuar.'
    };
    const ctas = {
      send_information: 'Indiquenos que informacion concreta le resultaria mas util.',
      request_scope: 'Si lo considera oportuno, puede indicarnos el alcance general para preparar el siguiente paso.',
      suggest_call: 'Puede proponernos una franja conveniente para una breve llamada.',
      confirm_future_date: 'Indiquenos, si lo desea, en que fecha seria apropiado retomarlo.',
      no_cta: ''
    };
    const bodyText = [salutation, '', bodies[context.intent] || bodies.ambiguous, ctas[checked.value.cta] ? `\n${ctas[checked.value.cta]}` : '', '', 'Un saludo,', 'Voltium Madrid', 'https://www.voltiummadrid.es'].filter(value => value !== '').join('\n').replace(/\n{3,}/g, '\n\n');
    const subjectBase = context.review.parsed.subject && context.review.parsed.subject !== '(sin asunto)' ? context.review.parsed.subject.replace(/^re:\s*/i, '') : 'su mensaje';
    return { subject: `Re: ${cleanLine(subjectBase, 130)}`.slice(0, 140), bodyText, structuredPlan: checked.value, claims: [], factualValidation: { status: 'controlled_renderer', automaticFreeTextVerification: false } };
  }

  function parsePlanResponse(value) {
    const text = String(value?.text ?? value ?? '').trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return JSON.parse(fenced ? fenced[1] : text);
  }

  async function generateReply(context, options = {}) {
    const fallback = () => ({ draft: renderPlan(context, localPlan(context, options)), provenance: { kind: 'local_template', reason: 'safe_local_fallback' } });
    if (options.useExternalAI !== true) return fallback();
    if (options.externalConsent !== true || typeof options.aiCall !== 'function') return fallback();
    const prompt = buildPrompt(context, options);
    if (options.externalPrompt !== prompt) throw new Error('C5_AI_PREVIEW_MISMATCH');
    try {
      const response = await options.aiCall(prompt, { purpose: 'commercial_reply_plan', structured: true });
      const checked = validatePlan(parsePlanResponse(response), context);
      if (!checked.ok) return fallback();
      return { draft: renderPlan(context, checked.value), provenance: { kind: 'ai', mode: 'structured_plan', provider: response?.provider || null } };
    } catch (error) {
      const result = fallback(); result.provenance.errorCode = cleanLine(error?.code || error?.message || 'AI_ERROR', 120); return result;
    }
  }

  function makeDraft(context, generated) {
    const now = new Date().toISOString();
    const draftId = memoryApi.stableId('c5-reply-draft', [context.review.fingerprint, context.contactId, PURPOSE]);
    const versionId = memoryApi.stableId('c5-reply-version', [draftId, generated.draft.subject, generated.draft.bodyText]);
    return {
      schema: 'voltflow-commercial-email-draft', schemaVersion: 1, draftId,
      companyId: context.companyId, establishmentId: context.review.establishmentId, contactId: context.contactId,
      target: context.target, purpose: PURPOSE, status: 'DRAFT_CREATED', currentVersion: 1, createdAt: now, updatedAt: now,
      sourceResponseEventId: context.review.responseEventId || null,
      versions: [{ version: 1, versionId, subject: generated.draft.subject, bodyText: generated.draft.bodyText, structuredPlan: generated.draft.structuredPlan, provenance: generated.provenance, contextFingerprint: context.review.fingerprint, createdAt: now }]
    };
  }

  function installBrowser(root) {
    let active = null;
    function node(tag, className, text) { const item = root.document.createElement(tag); if (className) item.className = className; if (text != null) item.textContent = text; return item; }
    function currentHistory() { return Array.isArray(root.emailHistory) ? root.emailHistory : []; }
    function close() { root.document.getElementById('commercial-response-c5-modal')?.remove(); active = null; }

    async function commitReview(lead, review) {
      validateReviewed(review);
      const freshMemory = await root.getCommercialMemorySnapshot();
      const fresh = resolveBinding({ lead, memory: freshMemory, emailHistory: currentHistory(), contactId: review.contactId, target: review.target, parsed: review.parsed });
      if (fresh.companyId !== review.companyId || fresh.contactId !== review.contactId || fresh.sequenceId !== review.sequenceId) throw new Error('C5_CONTACT_BINDING_CHANGED');
      const responseKey = `c5-inbound:${review.fingerprint}`;
      const existing = Object.values(freshMemory.events || {}).find(event => event.idempotencyKey === responseKey);
      if (existing && (existing.contactId !== review.contactId || existing.payload?.intent !== review.intent)) throw new Error('C5_EXISTING_RESPONSE_REVIEW_MISMATCH');
      const responseResult = existing ? { event: existing, reused: true } : await root.recordCommercialMemoryEvent(lead, 'response_received', {
          subject: review.parsed.subject, text: review.parsed.body, sender: review.parsed.sender, senderEmail: review.parsed.senderEmail,
          sourceDate: review.parsed.sourceDate, sourceMessageId: review.parsed.messageId, intent: review.intent,
          confidence: review.confidence, evidenceSpans: review.evidenceSpans, suspectedPromptInjection: review.suspectedPromptInjection,
          humanReviewed: true, responseFingerprint: review.fingerprint
        }, { contactId: review.contactId, sequenceId: review.sequenceId, channel: 'email', sourceRef: 'commercial-responses-c5', idempotencyKey: responseKey, occurredAt: review.reviewedAt });
      const effect = effectFor(review);
      if (effect) {
        const latest = existing ? freshMemory : await root.getCommercialMemorySnapshot();
        const effectKey = `c5-effect:${review.fingerprint}:${review.intent}`;
        const effectExists = Object.values(latest.events || {}).some(event => event.idempotencyKey === effectKey);
        if (!effectExists) await root.recordCommercialMemoryEvent(lead, effect.type, effect.payload, { contactId: review.contactId, sequenceId: review.sequenceId, channel: 'email', opportunityId: effect.opportunityId, sourceRef: 'commercial-responses-c5', idempotencyKey: effectKey, occurredAt: review.reviewedAt });
      }
      return { ...responseResult, review: { ...review, responseEventId: responseResult.event?.eventId } };
    }

    async function openReview(lead, options = {}) {
      close();
      const memory = await root.getCommercialMemorySnapshot();
      const alias = memory.aliases?.[`lead:${lead?.id}`];
      const company = memory.companies?.[lead?.commercialRefs?.companyId || alias?.companyId];
      const contacts = (company?.contactIds || []).map(id => memory.contacts[id]).filter(Boolean).flatMap(contact => (contact.contactPoints || []).filter(point => point.channel === 'email').map(point => ({ contact, target: communications.normalizeTarget('email', point.value) })));
      const overlay = node('div', 'commercial-email-c3-overlay'); overlay.id = 'commercial-response-c5-modal';
      const dialog = node('section', 'commercial-email-c3-dialog commercial-response-c5-dialog'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
      const header = node('header', 'commercial-email-c3-header'); const title = node('div'); title.append(node('h2', '', 'Registrar respuesta de Outlook'), node('p', '', company?.name || lead?.company || 'Empresa seleccionada'));
      const closeButton = node('button', 'commercial-email-icon-button', '\u00d7'); closeButton.type = 'button'; closeButton.setAttribute('aria-label', 'Cerrar'); closeButton.onclick = close; header.append(title, closeButton); dialog.append(header);
      const form = node('div', 'commercial-response-c5-form');
      const contact = node('select'); contacts.forEach(item => { const option = node('option', '', [item.contact.name, item.target].filter(Boolean).join(' - ')); option.value = item.contact.contactId; option.dataset.target = item.target; if (item.target === communications.normalizeTarget('email', lead.email)) option.selected = true; contact.append(option); });
      const raw = node('textarea'); raw.rows = 9; raw.placeholder = 'Pega aqui la respuesta recibida desde Outlook';
      raw.value = String(options.initialRaw || '');
      const analyze = node('button', 'btn-primary', 'Analizar y revisar'); analyze.type = 'button';
      const addField = (label, control) => { const wrap = node('label'); wrap.append(node('span', '', label), control); form.append(wrap); };
      addField('Contacto y destinatario', contact); addField('Respuesta pegada', raw); form.append(analyze); dialog.append(form);
      const reviewBox = node('section', 'commercial-response-c5-review'); reviewBox.hidden = true; dialog.append(reviewBox);
      const status = node('div', 'commercial-email-c3-status', 'La respuesta no se guardara hasta que la revises y confirmes.'); dialog.append(status);
      overlay.append(dialog); root.document.body.append(overlay);
      if (!contacts.length) { analyze.disabled = true; status.textContent = 'No existe un contacto con email resuelto de forma segura.'; }

      analyze.onclick = () => {
        try {
          const selected = contacts.find(item => item.contact.contactId === contact.value && item.target === contact.selectedOptions[0]?.dataset.target);
          const preview = prepareReview({ raw: raw.value, lead, memory, emailHistory: currentHistory(), contactId: selected?.contact.contactId, target: selected?.target });
          reviewBox.replaceChildren();
          const sender = node('input'); sender.value = preview.parsed.sender;
          const subject = node('input'); subject.value = preview.parsed.subject;
          const sourceDate = node('input'); sourceDate.value = preview.parsed.sourceDate;
          const body = node('textarea'); body.rows = 8; body.value = preview.parsed.body;
          const intent = node('select'); INTENTS.forEach(value => { const option = node('option', '', INTENT_LABELS[value]); option.value = value; option.selected = value === preview.intent; intent.append(option); });
          const effect = node('input'); effect.type = 'checkbox';
          const reviewed = node('input'); reviewed.type = 'checkbox';
          const save = node('button', 'btn-primary', 'Confirmar e incorporar al historial'); save.type = 'button';
          const warning = node('div', 'commercial-email-c3-warning', preview.suspectedPromptInjection ? 'El texto contiene posibles instrucciones maliciosas. Se trataran solo como datos.' : 'Clasificacion propuesta: revisala antes de guardar.');
          [['Remitente', sender], ['Asunto', subject], ['Fecha declarada', sourceDate], ['Mensaje', body], ['Clasificacion', intent]].forEach(([label, control]) => { const wrap = node('label'); wrap.append(node('span', '', label), control); reviewBox.append(wrap); });
          const effectLabel = node('label', 'commercial-email-c3-consent'); effectLabel.append(effect, node('span', '', 'Aplicar tambien el efecto comercial revisado (oportunidad, objecion, rechazo u oposicion).'));
          const reviewedLabel = node('label', 'commercial-email-c3-consent'); reviewedLabel.append(reviewed, node('span', '', 'He revisado el remitente, mensaje, clasificacion y contacto asociado.'));
          reviewBox.append(warning, effectLabel, reviewedLabel, save); reviewBox.hidden = false;
          save.onclick = async () => {
            save.disabled = true;
            try {
              const optOut = intent.value === 'opt_out' && effect.checked ? root.confirm('Confirmas que este contacto ha solicitado no recibir mas comunicaciones comerciales?') : false;
              const finalReview = finalizeReview(preview, { sender: sender.value, subject: subject.value, sourceDate: sourceDate.value, body: body.value, intent: intent.value, humanReviewed: reviewed.checked, applyCommercialEffect: effect.checked, confirmOptOut: optOut });
              const committed = await commitReview(lead, finalReview);
              if (typeof options.onCommitted === 'function') await options.onCommitted({ lead, review: committed.review, reused: committed.reused });
              const currentMemory = await root.getCommercialMemorySnapshot();
              const context = safeContext({ review: committed.review, memory: currentMemory, lead, emailHistory: currentHistory() });
              const generated = await generateReply(context);
              const subjectOut = node('input'); subjectOut.value = generated.draft.subject;
              const bodyOut = node('textarea'); bodyOut.rows = 10; bodyOut.value = generated.draft.bodyText;
              const open = node('button', 'btn-primary', 'Revisar y abrir Outlook'); open.type = 'button';
              reviewBox.replaceChildren(node('h3', '', committed.reused ? 'Respuesta ya registrada' : 'Respuesta incorporada'), node('p', '', `Clasificacion: ${INTENT_LABELS[finalReview.intent]}. La secuencia de ausencia de respuesta queda suspendida.`));
              [['Asunto de contestacion', subjectOut], ['Contestacion editable', bodyOut]].forEach(([label, control]) => { const wrap = node('label'); wrap.append(node('span', '', label), control); reviewBox.append(wrap); }); reviewBox.append(open);
              status.textContent = 'La contestacion es local y estructurada. Debes revisarla y aprobarla antes de abrir Outlook.';
              active = { lead, review: committed.review, context, generated, subjectOut, bodyOut };
              open.onclick = async () => {
                open.disabled = true;
                try {
                  const latest = await root.getCommercialMemorySnapshot();
                  const responseExists = Object.values(latest.events || {}).some(event => event.idempotencyKey === `c5-inbound:${active.review.fingerprint}` && event.contactId === active.review.contactId);
                  if (!responseExists) throw new Error('C5_RESPONSE_EVENT_MISSING');
                  resolveBinding({ lead, memory: latest, emailHistory: currentHistory(), contactId: active.review.contactId, target: active.review.target, parsed: active.review.parsed });
                  const draft = makeDraft(active.context, { draft: { ...active.generated.draft, subject: subjectOut.value.trim(), bodyText: bodyOut.value.trim() }, provenance: { kind: 'human_reviewed', basedOn: active.generated.provenance.kind } });
                  await root.saveCommercialEmailDraft(lead, draft);
                  const mailto = `mailto:${encodeURIComponent(active.review.target)}?subject=${encodeURIComponent(subjectOut.value.trim())}&body=${encodeURIComponent(bodyOut.value.trim())}`;
                  const result = await root.prepareCommercialMessageAndOpen({ lead, channel: 'email', target: active.review.target, contactId: active.review.contactId, purpose: PURPOSE, subject: subjectOut.value.trim(), body: bodyOut.value.trim(), generatedBy: active.generated.provenance.kind === 'ai' ? 'ai' : 'local_template', externalClient: 'outlook', openExternal: () => { const anchor = node('a'); anchor.href = mailto; anchor.hidden = true; root.document.body.append(anchor); anchor.click(); anchor.remove(); return true; } });
                  status.textContent = result.opened ? 'Outlook abierto. El envio continua pendiente de confirmacion.' : `Apertura bloqueada: ${result.reason || 'operacion cancelada'}.`;
                } catch (error) { status.textContent = `Apertura bloqueada: ${cleanLine(error.message, 180)}`; }
                finally { open.disabled = false; }
              };
            } catch (error) { status.textContent = `No se pudo registrar: ${cleanLine(error.message, 180)}`; }
            finally { save.disabled = false; }
          };
        } catch (error) { status.textContent = `No se pudo analizar: ${cleanLine(error.message, 180)}`; }
      };
      return { opened: true, contacts: contacts.length };
    }

    root.openCommercialResponseReview = openReview;
    root.closeCommercialResponseReview = close;
    return root.VoltflowCommercialResponsesC5;
  }

  return Object.freeze({
    PURPOSE, PLAN_SCHEMA, PLAN_VERSION, REVIEW_SCHEMA, REVIEW_VERSION, INTENTS, INTENT_LABELS, PLAN_POLICY,
    parsePastedReply, inspectUntrustedReply, classifyDeterministic, resolveBinding, fingerprintFor,
    prepareReview, finalizeReview, validateReviewed, effectFor, applyReviewedResponse, safeContext,
    localPlan, validatePlan, buildPrompt, renderPlan, generateReply, makeDraft, installBrowser
  });
});
