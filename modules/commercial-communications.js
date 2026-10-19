(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CommercialCommunications = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATES = Object.freeze({
    DRAFT_CREATED: 'DRAFT_CREATED',
    DRAFT_REVIEWED: 'DRAFT_REVIEWED',
    DRAFT_APPROVED: 'DRAFT_APPROVED',
    EXTERNAL_CLIENT_OPENED: 'EXTERNAL_CLIENT_OPENED',
    PENDING_SEND_CONFIRMATION: 'PENDING_SEND_CONFIRMATION',
    SENT_CONFIRMED: 'SENT_CONFIRMED',
    INBOUND_RECEIVED: 'INBOUND_RECEIVED',
    CANCELLED: 'CANCELLED',
    LEGACY_SENT_UNVERIFIED: 'LEGACY_SENT_UNVERIFIED'
  });

  const TRANSITIONS = Object.freeze({
    [STATES.DRAFT_CREATED]: [STATES.DRAFT_REVIEWED, STATES.CANCELLED],
    [STATES.DRAFT_REVIEWED]: [STATES.DRAFT_CREATED, STATES.DRAFT_APPROVED, STATES.CANCELLED],
    [STATES.DRAFT_APPROVED]: [STATES.DRAFT_CREATED, STATES.EXTERNAL_CLIENT_OPENED, STATES.CANCELLED],
    [STATES.EXTERNAL_CLIENT_OPENED]: [STATES.PENDING_SEND_CONFIRMATION, STATES.CANCELLED],
    [STATES.PENDING_SEND_CONFIRMATION]: [STATES.EXTERNAL_CLIENT_OPENED, STATES.SENT_CONFIRMED, STATES.CANCELLED],
    [STATES.SENT_CONFIRMED]: [],
    [STATES.INBOUND_RECEIVED]: [],
    [STATES.CANCELLED]: [],
    [STATES.LEGACY_SENT_UNVERIFIED]: []
  });

  const DISPLAY = Object.freeze({
    [STATES.DRAFT_CREATED]: 'Borrador creado',
    [STATES.DRAFT_REVIEWED]: 'Borrador revisado',
    [STATES.DRAFT_APPROVED]: 'Borrador aprobado',
    [STATES.EXTERNAL_CLIENT_OPENED]: 'Cliente externo abierto',
    [STATES.PENDING_SEND_CONFIRMATION]: 'Pendiente de confirmar envio',
    [STATES.SENT_CONFIRMED]: 'Envio confirmado',
    [STATES.INBOUND_RECEIVED]: 'Respuesta recibida',
    [STATES.CANCELLED]: 'Cancelado',
    [STATES.LEGACY_SENT_UNVERIFIED]: 'Historico sin confirmacion verificable'
  });

  const LEGACY_SENT = new Set(['Enviado', 'Enviado (IA)']);
  const MAX_CONFIRMED_CONTACTS = 5;
  const DEFAULT_PURPOSE = 'b2b_prospecting';

  function normalize(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function hashText(value) {
    const text = String(value == null ? '' : value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).padStart(7, '0');
  }

  function stableId(prefix, parts) {
    return `${prefix}:${hashText(parts.map(normalize).join('|'))}`;
  }

  function normalizeTarget(channel, value) {
    const raw = String(value == null ? '' : value).trim();
    if (channel === 'email') return raw.replace(/^mailto:/i, '').trim().toLowerCase();
    if (channel === 'whatsapp' || channel === 'phone') {
      const hasPlus = raw.startsWith('+');
      const digits = raw.replace(/\D/g, '');
      return digits ? `${hasPlus ? '+' : ''}${digits}` : '';
    }
    return raw.toLowerCase();
  }

  function normalizePurpose(value) {
    return String(value || DEFAULT_PURPOSE).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || DEFAULT_PURPOSE;
  }

  function firstAuthorizedContactId(lead, channel, target, purpose) {
    const channelPolicy = lead?.commercialContactPolicy?.channels?.[channel] || {};
    const candidates = [
      ...(Array.isArray(channelPolicy.authorizations) ? channelPolicy.authorizations : []),
      channelPolicy
    ];
    const match = candidates.find(candidate => candidate && typeof candidate === 'object'
      && normalizeTarget(channel, candidate.target) === target
      && normalizePurpose(candidate.purpose) === purpose
      && isNonEmptyString(candidate.contactId));
    return match?.contactId || null;
  }

  function uniqueStrings(values) {
    return [...new Set(values.filter(isNonEmptyString).map(value => String(value)))];
  }

  function deriveIdentities(input = {}) {
    const lead = input.lead || {};
    const channel = input.channel || 'email';
    const target = normalizeTarget(channel, input.target || lead.email || lead.phone || '');
    const purpose = normalizePurpose(input.purpose || lead.commercialPurpose);
    const refs = lead.commercialRefs && typeof lead.commercialRefs === 'object' ? lead.commercialRefs : {};
    const explicitCompanyId = input.companyId || refs.companyId || lead.companyId;
    const companyIdentityAnchor = String(
      input.companyIdentityAnchor
      || refs.companyIdentityAnchor
      || (explicitCompanyId ? `company-id:${explicitCompanyId}` : '')
      || (lead.id != null ? `lead:${normalize(lead.id)}` : '')
      || `provisional:${stableId('identity', [lead.company, lead.discovery?.provider, lead.discovery?.sourceId])}`
    );
    const companyId = String(explicitCompanyId || stableId('company', [companyIdentityAnchor, lead.company]));
    const explicitEstablishmentId = input.establishmentId || refs.establishmentId || lead.establishmentId || lead.discovery?.establishmentId;
    const establishmentIdentityAnchor = String(
      input.establishmentIdentityAnchor
      || refs.establishmentIdentityAnchor
      || (explicitEstablishmentId ? `establishment-id:${explicitEstablishmentId}` : '')
      || (lead.id != null ? `lead-establishment:${normalize(lead.id)}` : '')
      || `provisional-establishment:${stableId('establishment-anchor', [companyIdentityAnchor, lead.address, lead.postalCode])}`
    );
    const establishmentId = String(explicitEstablishmentId || stableId('establishment', [establishmentIdentityAnchor]));
    const contactIdentityAnchor = String(input.contactIdentityAnchor || stableId('contact-anchor', [companyIdentityAnchor, channel, target]));
    const authorizedContactId = firstAuthorizedContactId(lead, channel, target, purpose);
    const contactId = String(input.contactId || authorizedContactId || lead.contactId || stableId('contact', [contactIdentityAnchor]));
    const opportunityId = input.opportunityId || lead.opportunityId || refs.opportunityId || null;
    const sequenceKey = stableId('sequence', [companyIdentityAnchor, contactIdentityAnchor, purpose]);
    const sequenceId = input.sequenceId || sequenceKey;
    const identityEquivalences = {
      version: 1,
      company: {
        canonicalId: companyIdentityAnchor,
        aliases: uniqueStrings([companyId, lead.id != null ? `lead:${lead.id}` : '', ...(refs.companyAliases || [])]),
        verified: lead.id != null || Boolean(explicitCompanyId),
        source: explicitCompanyId ? 'persisted_company_id' : (lead.id != null ? 'crm_lead_id' : 'provisional')
      },
      establishment: {
        canonicalId: establishmentIdentityAnchor,
        aliases: uniqueStrings([establishmentId, ...(refs.establishmentAliases || [])]),
        verified: lead.id != null || Boolean(explicitEstablishmentId),
        source: explicitEstablishmentId ? 'persisted_establishment_id' : (lead.id != null ? 'crm_lead_id' : 'provisional')
      },
      contact: {
        canonicalId: contactIdentityAnchor,
        aliases: uniqueStrings([contactId]),
        verified: Boolean(target),
        source: 'normalized_channel_target'
      }
    };
    if (lead && typeof lead === 'object' && Object.isExtensible(lead)) {
      lead.commercialRefs = {
        ...refs,
        companyId,
        companyIdentityAnchor,
        companyAliases: identityEquivalences.company.aliases,
        establishmentId,
        establishmentIdentityAnchor,
        establishmentAliases: identityEquivalences.establishment.aliases
      };
    }
    return {
      companyId, establishmentId, contactId, opportunityId, sequenceId, sequenceKey, purpose,
      companyIdentityAnchor, establishmentIdentityAnchor, contactIdentityAnchor, identityEquivalences
    };
  }

  function getEffectiveState(record = {}) {
    if (Object.values(STATES).includes(record.commercialState)) return record.commercialState;
    if (record.direction === 'inbound' || record.status === 'Respuesta recibida') return STATES.INBOUND_RECEIVED;
    if (LEGACY_SENT.has(record.status)) return STATES.LEGACY_SENT_UNVERIFIED;
    if (/preparado|borrador/i.test(String(record.status || ''))) return STATES.DRAFT_CREATED;
    return null;
  }

  function getDisplayState(record = {}) {
    if (getEffectiveState(record) === STATES.SENT_CONFIRMED && !isValidSendConfirmation(record.sendConfirmation)) {
      return 'Envio no verificado: evidencia incompleta';
    }
    return DISPLAY[getEffectiveState(record)] || record.status || 'Estado desconocido';
  }

  function isValidTimestamp(value) {
    return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function isValidSendConfirmation(confirmation) {
    if (!confirmation || typeof confirmation !== 'object' || Array.isArray(confirmation)) return false;
    if (confirmation.method === 'manual_explicit') {
      return isNonEmptyString(confirmation.confirmedBy)
        && isNonEmptyString(confirmation.confirmationId)
        && isValidTimestamp(confirmation.confirmedAt);
    }
    if (confirmation.method === 'provider_verified') {
      return isNonEmptyString(confirmation.provider)
        && isNonEmptyString(confirmation.providerMessageId)
        && isValidTimestamp(confirmation.verifiedAt);
    }
    return false;
  }

  function isSentConfirmed(record = {}) {
    return getEffectiveState(record) === STATES.SENT_CONFIRMED && isValidSendConfirmation(record.sendConfirmation);
  }

  function getConfirmedHistory(history = []) {
    return (Array.isArray(history) ? history : []).filter(isSentConfirmed);
  }

  function countConfirmedForContact(history = [], contactId) {
    return getConfirmedHistory(history).filter(record => record.contactId === contactId).length;
  }

  function canonicalCompanyAnchor(record = {}) {
    const equivalence = record.identityEquivalences?.company;
    if (equivalence?.verified === true && isNonEmptyString(equivalence.canonicalId)) return String(equivalence.canonicalId);
    if (isNonEmptyString(record.companyIdentityAnchor)) return String(record.companyIdentityAnchor);
    if (record.leadId != null && String(record.leadId).trim() !== '') return `lead:${normalize(record.leadId)}`;
    if (isNonEmptyString(record.companyId)) return `company-id:${record.companyId}`;
    return null;
  }

  function canonicalContactAnchor(record = {}, companyAnchor) {
    const equivalence = record.identityEquivalences?.contact;
    if (equivalence?.verified === true && isNonEmptyString(equivalence.canonicalId)) return String(equivalence.canonicalId);
    if (isNonEmptyString(record.contactIdentityAnchor)) return String(record.contactIdentityAnchor);
    const channel = record.channel || 'email';
    const target = normalizeTarget(channel, record.target || record.email || record.phone || '');
    if (companyAnchor && target) return stableId('contact-anchor', [companyAnchor, channel, target]);
    if (isNonEmptyString(record.contactId)) return `contact-id:${record.contactId}`;
    return null;
  }

  function sequenceKeyForRecord(record = {}) {
    const companyAnchor = canonicalCompanyAnchor(record);
    const contactAnchor = canonicalContactAnchor(record, companyAnchor);
    if (companyAnchor && contactAnchor) return stableId('sequence', [companyAnchor, contactAnchor, normalizePurpose(record.purpose)]);
    return record.sequenceKey ? String(record.sequenceKey) : (record.sequenceId ? String(record.sequenceId) : null);
  }

  function countConfirmedForSequence(history = [], sequenceKey, excludeRecord) {
    return getConfirmedHistory(history).filter(record => record !== excludeRecord && sequenceKeyForRecord(record) === sequenceKey).length;
  }

  function confirmationEvidenceKey(confirmation = {}) {
    if (!isValidSendConfirmation(confirmation)) return null;
    if (confirmation.method === 'manual_explicit') {
      return `manual_explicit:${normalize(confirmation.confirmedBy)}:${String(confirmation.confirmationId).trim()}`;
    }
    return `provider_verified:${normalize(confirmation.provider)}:${normalize(confirmation.providerAccountId || 'default')}:${String(confirmation.providerMessageId).trim()}`;
  }

  function findConfirmationEvidence(history = [], evidenceKey, excludeRecord) {
    if (!evidenceKey) return null;
    return getConfirmedHistory(history).find(record => record !== excludeRecord
      && confirmationEvidenceKey(record.sendConfirmation) === evidenceKey) || null;
  }

  function assertNoIdentityCollision(history, identities) {
    for (const record of Array.isArray(history) ? history : []) {
      if (!record?.companyId || record.companyId !== identities.companyId) continue;
      const existingAnchor = canonicalCompanyAnchor(record);
      if (existingAnchor && existingAnchor !== identities.companyIdentityAnchor) throw new Error('COMMERCIAL_IDENTITY_COLLISION');
    }
  }

  function isTransitionAllowed(from, to) {
    return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
  }

  function transition(record, nextState, meta = {}, options = {}) {
    if (!record || typeof record !== 'object') throw new Error('COMMERCIAL_RECORD_REQUIRED');
    const current = getEffectiveState(record);
    if (!isTransitionAllowed(current, nextState)) throw new Error(`COMMERCIAL_TRANSITION_BLOCKED:${current || 'UNKNOWN'}:${nextState}`);
    const now = options.now || new Date().toISOString();
    record.commercialState = nextState;
    record.status = DISPLAY[nextState];
    record.updatedAt = now;
    record.stateHistory = Array.isArray(record.stateHistory) ? record.stateHistory : [];
    record.stateHistory.push({ state: nextState, at: now, actor: meta.actor || 'user', source: meta.source || 'local' });
    return record;
  }

  function draftIdempotencyKey(input, identities) {
    return `draft:${hashText([
      identities.companyId,
      identities.contactId,
      input.channel,
      input.target,
      input.subject,
      input.body,
      input.sequenceId || '',
      input.sequenceStep || 1
    ].join('|'))}`;
  }

  function createDraft(history, input = {}, options = {}) {
    if (!Array.isArray(history)) throw new Error('COMMERCIAL_HISTORY_REQUIRED');
    if (!input.channel || !input.target) throw new Error('COMMERCIAL_CHANNEL_TARGET_REQUIRED');
    const identities = deriveIdentities(input);
    assertNoIdentityCollision(history, identities);
    const confirmedCount = countConfirmedForSequence(history, identities.sequenceKey);
    if (confirmedCount >= MAX_CONFIRMED_CONTACTS) throw new Error('COMMERCIAL_SEQUENCE_LIMIT_REACHED');
    const requestedStep = Number(input.sequenceStep || confirmedCount + 1);
    if (!Number.isInteger(requestedStep) || requestedStep < 1 || requestedStep > MAX_CONFIRMED_CONTACTS) throw new Error('COMMERCIAL_SEQUENCE_STEP_INVALID');
    const sequenceStep = Math.max(requestedStep, confirmedCount + 1);
    const idempotencyKey = input.idempotencyKey || draftIdempotencyKey(input, identities);
    const existing = history.find(record => record.idempotencyKey === idempotencyKey && ![STATES.CANCELLED, STATES.SENT_CONFIRMED].includes(getEffectiveState(record)));
    if (existing) return { record: existing, reused: true };
    const now = options.now || new Date().toISOString();
    const record = {
      id: input.id || `communication:${hashText(`${idempotencyKey}|${now}`)}`,
      schemaVersion: 1,
      ...identities,
      leadId: input.lead?.id ?? input.leadId ?? null,
      company: input.lead?.company || input.company || '',
      email: input.target,
      target: input.target,
      segment: input.lead?.segment || input.segment || '',
      channel: input.channel,
      direction: 'outbound',
      subject: input.subject || '',
      body: input.body || '',
      bodyHash: hashText(input.body || ''),
      contentVersion: 1,
      sequenceStep,
      idempotencyKey,
      date: now,
      createdAt: now,
      updatedAt: now,
      commercialState: STATES.DRAFT_CREATED,
      status: DISPLAY[STATES.DRAFT_CREATED],
      generatedBy: input.generatedBy || 'manual',
      notes: input.notes || '',
      stateHistory: [{ state: STATES.DRAFT_CREATED, at: now, actor: input.generatedBy === 'ai' ? 'ai' : 'user', source: 'local' }]
    };
    Object.defineProperty(record, '__commercialHistory', { value: history, enumerable: false, configurable: false });
    history.unshift(record);
    return { record, reused: false };
  }

  function editDraft(record, content = {}, options = {}) {
    const state = getEffectiveState(record);
    if (![STATES.DRAFT_CREATED, STATES.DRAFT_REVIEWED, STATES.DRAFT_APPROVED].includes(state)) throw new Error('COMMERCIAL_DRAFT_NOT_EDITABLE');
    if (state !== STATES.DRAFT_CREATED) transition(record, STATES.DRAFT_CREATED, { actor: 'user', source: 'edit_invalidates_approval' }, options);
    record.subject = content.subject == null ? record.subject : String(content.subject);
    record.body = content.body == null ? record.body : String(content.body);
    record.bodyHash = hashText(record.body);
    record.contentVersion = Number(record.contentVersion || 1) + 1;
    delete record.reviewedAt;
    delete record.approvedAt;
    return record;
  }

  function checkCommercialRestrictions(input = {}) {
    const lead = input.lead || {};
    const channel = input.channel || 'email';
    const target = normalizeTarget(channel, input.target || (channel === 'email' ? lead.email : lead.whatsapp || lead.phone));
    const purpose = normalizePurpose(input.purpose);
    const identities = deriveIdentities({ ...input, lead, channel, target, purpose });
    const policy = input.policy || lead.commercialContactPolicy || {};
    const channelPolicy = policy.channels?.[channel] || {};
    if (lead.doNotContact || lead.optOut || policy.doNotContact || policy.legalBasisStatus === 'blocked') return { ok: false, reason: 'DO_NOT_CONTACT' };
    if (policy.legalBasisStatus !== 'allowed_for_purpose') return { ok: false, reason: 'LEGAL_BASIS_NOT_ALLOWED' };
    if (!target) return { ok: false, reason: 'CONTACT_TARGET_REQUIRED' };
    const authorizations = Array.isArray(channelPolicy.authorizations) ? channelPolicy.authorizations : [];
    const candidates = [...authorizations, channelPolicy].filter(candidate => candidate && typeof candidate === 'object');
    const authorization = candidates.find(candidate => candidate.verified === true
      && isNonEmptyString(candidate.sourceId)
      && normalizeTarget(channel, candidate.target) === target
      && String(candidate.contactId || '') === identities.contactId
      && normalizePurpose(candidate.purpose) === purpose);
    if (!authorization) {
      if (channelPolicy.verified !== true && !authorizations.length) return { ok: false, reason: 'CHANNEL_NOT_VERIFIED' };
      if (candidates.some(candidate => candidate.target && normalizeTarget(channel, candidate.target) !== target)) return { ok: false, reason: 'AUTHORIZATION_TARGET_MISMATCH' };
      return { ok: false, reason: 'AUTHORIZATION_REVIEW_REQUIRED' };
    }
    return { ok: true, policy, channelPolicy, authorization, identities, target, purpose };
  }

  function markReviewed(record, options = {}) {
    transition(record, STATES.DRAFT_REVIEWED, { actor: 'user', source: 'explicit_review' }, options);
    record.reviewedAt = options.now || new Date().toISOString();
    record.reviewedBodyHash = record.bodyHash;
    return record;
  }

  function markApproved(record, options = {}) {
    if (record.reviewedBodyHash !== record.bodyHash) throw new Error('COMMERCIAL_REVIEW_STALE');
    transition(record, STATES.DRAFT_APPROVED, { actor: 'user', source: 'explicit_approval' }, options);
    record.approvedAt = options.now || new Date().toISOString();
    record.approvedBodyHash = record.bodyHash;
    return record;
  }

  function markExternalClientOpened(record, client, options = {}) {
    if (record.approvedBodyHash !== record.bodyHash) throw new Error('COMMERCIAL_APPROVAL_STALE');
    transition(record, STATES.EXTERNAL_CLIENT_OPENED, { actor: 'user', source: client || 'external_client' }, options);
    record.externalClient = client || 'external_client';
    record.externalOpenedAt = options.now || new Date().toISOString();
    transition(record, STATES.PENDING_SEND_CONFIRMATION, { actor: 'system', source: 'awaiting_explicit_confirmation' }, options);
    return record;
  }

  function confirmSent(record, confirmation = {}, options = {}) {
    if (isSentConfirmed(record)) return { record, duplicate: true };
    if (getEffectiveState(record) !== STATES.PENDING_SEND_CONFIRMATION) throw new Error('COMMERCIAL_NOT_PENDING_CONFIRMATION');
    const method = confirmation.method;
    if (!['manual_explicit', 'provider_verified'].includes(method)) throw new Error('COMMERCIAL_CONFIRMATION_METHOD_INVALID');
    if (method === 'manual_explicit' && (!isNonEmptyString(confirmation.confirmedBy) || !isNonEmptyString(confirmation.confirmationId) || !isValidTimestamp(confirmation.confirmedAt))) throw new Error('COMMERCIAL_MANUAL_CONFIRMATION_INCOMPLETE');
    if (method === 'provider_verified' && (!isNonEmptyString(confirmation.provider) || !isNonEmptyString(confirmation.providerMessageId) || !isValidTimestamp(confirmation.verifiedAt))) throw new Error('COMMERCIAL_PROVIDER_CONFIRMATION_INCOMPLETE');
    const sequenceKey = sequenceKeyForRecord(record);
    const relatedHistory = options.history || record.__commercialHistory || [];
    if (sequenceKey && countConfirmedForSequence(relatedHistory, sequenceKey, record) >= MAX_CONFIRMED_CONTACTS) throw new Error('COMMERCIAL_SEQUENCE_LIMIT_REACHED');
    const now = confirmation.confirmedAt || confirmation.verifiedAt || options.now || new Date().toISOString();
    const candidateConfirmation = {
      method,
      source: confirmation.source || (method === 'manual_explicit' ? 'user_explicit' : 'provider_api'),
      confirmedBy: confirmation.confirmedBy || null,
      confirmationId: confirmation.confirmationId || null,
      provider: confirmation.provider || null,
      providerAccountId: confirmation.providerAccountId || null,
      providerMessageId: confirmation.providerMessageId || null,
      confirmedAt: now,
      verifiedAt: method === 'provider_verified' ? confirmation.verifiedAt : null
    };
    if (!isValidSendConfirmation(candidateConfirmation)) throw new Error('COMMERCIAL_CONFIRMATION_INVALID');
    const evidenceKey = confirmationEvidenceKey(candidateConfirmation);
    const duplicateEvidence = findConfirmationEvidence(relatedHistory, evidenceKey, record);
    if (duplicateEvidence) {
      record.confirmationAttempts = Array.isArray(record.confirmationAttempts) ? record.confirmationAttempts : [];
      record.confirmationAttempts.push({
        outcome: 'duplicate_evidence_rejected', evidenceKey, at: now,
        conflictingRecordId: duplicateEvidence.id || null
      });
      throw new Error('COMMERCIAL_CONFIRMATION_EVIDENCE_DUPLICATE');
    }
    record.sendConfirmation = { ...candidateConfirmation, evidenceKey };
    transition(record, STATES.SENT_CONFIRMED, { actor: method === 'manual_explicit' ? 'user' : 'system', source: record.sendConfirmation.source }, { now });
    record.date = now;
    return { record, duplicate: false };
  }

  function preserveLegacyRecord(record = {}) {
    return {
      ...record,
      effectiveCommercialState: getEffectiveState(record),
      legacyUncertainty: LEGACY_SENT.has(record.status) ? 'outbound_open_or_send_not_verifiable' : null
    };
  }

  return Object.freeze({
    STATES,
    TRANSITIONS,
    DISPLAY,
    MAX_CONFIRMED_CONTACTS,
    DEFAULT_PURPOSE,
    stableId,
    normalizeTarget,
    normalizePurpose,
    deriveIdentities,
    getEffectiveState,
    getDisplayState,
    isValidSendConfirmation,
    isSentConfirmed,
    getConfirmedHistory,
    countConfirmedForContact,
    countConfirmedForSequence,
    sequenceKeyForRecord,
    confirmationEvidenceKey,
    findConfirmationEvidence,
    isTransitionAllowed,
    transition,
    createDraft,
    editDraft,
    checkCommercialRestrictions,
    markReviewed,
    markApproved,
    markExternalClientOpened,
    confirmSent,
    preserveLegacyRecord
  });
});

(function installBrowserIntegration(root) {
  'use strict';
  if (!root || !root.document || !root.CommercialCommunications) return;
  const api = root.CommercialCommunications;

  function history() {
    return typeof emailHistory !== 'undefined' && Array.isArray(emailHistory) ? emailHistory : [];
  }

  function leadById(leadId) {
    return typeof leads !== 'undefined' && Array.isArray(leads) ? leads.find(lead => String(lead.id) === String(leadId)) : null;
  }

  function toast(message) {
    if (typeof showToast === 'function') showToast(message);
  }

  async function persistHistory(label) {
    if (typeof persistEmailHistory !== 'function') throw new Error('COMMERCIAL_PERSISTENCE_UNAVAILABLE');
    await persistEmailHistory(label || 'estados comerciales');
  }

  async function persistLeadPolicy() {
    if (typeof saveLeads === 'function') await saveLeads();
  }

  async function ensureCommercialPermission(lead, channel, target, purpose, contactId) {
    const normalizedTarget = api.normalizeTarget(channel, target);
    const normalizedPurpose = api.normalizePurpose(purpose);
    const identities = api.deriveIdentities({ lead, channel, target: normalizedTarget, purpose: normalizedPurpose, contactId });
    let result = api.checkCommercialRestrictions({ lead, channel, target: normalizedTarget, purpose: normalizedPurpose, contactId: identities.contactId });
    if (result.ok) return result;
    if (result.reason === 'DO_NOT_CONTACT') {
      toast('Contacto bloqueado por oposicion o exclusion comercial.');
      return result;
    }
    const company = lead?.company || normalizedTarget || 'este contacto';
    const accepted = root.confirm(
      `Voltflow no puede acreditar automaticamente la condicion legal ni la procedencia de ${company}.\n\n` +
      'Continua solo si has verificado personalmente que este canal corporativo puede utilizarse para esta finalidad.'
    );
    if (!accepted) return result;
    const sourceId = String(root.prompt('Indica la fuente verificable del canal (por ejemplo: web corporativa o contacto facilitado):', '') || '').trim();
    if (!sourceId) {
      toast('No se puede preparar el cliente externo sin registrar la fuente del contacto.');
      return { ok: false, reason: 'CONTACT_SOURCE_REQUIRED' };
    }
    const legalApproved = root.confirm(
      'Confirma que has revisado la condicion habilitante, la finalidad, la informacion necesaria y el derecho de oposicion para esta comunicacion.'
    );
    if (!legalApproved) return { ok: false, reason: 'LEGAL_BASIS_NOT_ALLOWED' };
    const now = new Date().toISOString();
    lead.commercialContactPolicy = lead.commercialContactPolicy || { channels: {} };
    lead.commercialContactPolicy.channels = lead.commercialContactPolicy.channels || {};
    lead.commercialContactPolicy.legalBasisStatus = 'allowed_for_purpose';
    lead.commercialContactPolicy.legalPurposes = [...new Set([...(lead.commercialContactPolicy.legalPurposes || []), normalizedPurpose])];
    lead.commercialContactPolicy.reviewedAt = now;
    lead.commercialContactPolicy.reviewedBy = 'user_manual';
    const channelPolicy = lead.commercialContactPolicy.channels[channel] || {};
    const authorizations = Array.isArray(channelPolicy.authorizations) ? channelPolicy.authorizations.slice() : [];
    const authorization = {
      authorizationId: api.stableId('authorization', [identities.contactId, channel, normalizedTarget, normalizedPurpose, sourceId]),
      verified: true,
      sourceId,
      target: normalizedTarget,
      channel,
      contactId: identities.contactId,
      purpose: normalizedPurpose,
      verifiedAt: now,
      verifiedBy: 'user_manual'
    };
    const sameAuthorization = authorizations.findIndex(item => item.authorizationId === authorization.authorizationId);
    if (sameAuthorization >= 0) authorizations[sameAuthorization] = authorization;
    else authorizations.push(authorization);
    lead.commercialContactPolicy.channels[channel] = { ...channelPolicy, authorizations };
    await persistLeadPolicy();
    return api.checkCommercialRestrictions({ lead, channel, target: normalizedTarget, purpose: normalizedPurpose, contactId: identities.contactId });
  }

  async function recordCommercialDraft(params = {}) {
    const lead = params.lead || leadById(params.leadId);
    const created = api.createDraft(history(), { ...params, lead });
    if (lead?.commercialRefs) await persistLeadPolicy();
    await persistHistory('borrador comercial');
    return created.record;
  }

  async function prepareCommercialMessageAndOpen(params = {}) {
    const lead = params.lead || leadById(params.leadId);
    if (!lead) throw new Error('COMMERCIAL_LEAD_REQUIRED');
    const created = api.createDraft(history(), { ...params, lead });
    const record = created.record;
    if (lead.commercialRefs) await persistLeadPolicy();
    await persistHistory('borrador comercial');

    const permission = await ensureCommercialPermission(lead, params.channel, params.target, record.purpose, record.contactId);
    if (!permission.ok) {
      toast('Borrador conservado. La apertura para envio permanece bloqueada.');
      return { record, opened: false, reason: permission.reason };
    }

    if (api.getEffectiveState(record) === api.STATES.DRAFT_CREATED) {
      if (!root.confirm('Confirma que has revisado individualmente el destinatario, el asunto y el contenido.')) {
        return { record, opened: false, reason: 'REVIEW_NOT_CONFIRMED' };
      }
      api.markReviewed(record);
      await persistHistory('borrador revisado');
    }
    if (api.getEffectiveState(record) === api.STATES.DRAFT_REVIEWED) {
      if (!root.confirm('Apruebas expresamente este borrador para prepararlo en el cliente externo?')) {
        return { record, opened: false, reason: 'APPROVAL_NOT_CONFIRMED' };
      }
      api.markApproved(record);
      await persistHistory('borrador aprobado');
    }

    if (typeof params.openExternal !== 'function') throw new Error('COMMERCIAL_EXTERNAL_OPENER_REQUIRED');
    const externalResult = params.openExternal();
    if (externalResult === false || externalResult === null) {
      toast('El cliente externo no pudo abrirse. El borrador aprobado se conserva.');
      return { record, opened: false, reason: 'EXTERNAL_CLIENT_BLOCKED' };
    }
    api.markExternalClientOpened(record, params.externalClient || params.channel);
    await persistHistory('cliente externo abierto');
    toast('Cliente externo abierto. El envio sigue pendiente de confirmacion.');

    root.setTimeout(function requestConfirmation() {
      if (root.confirm('Confirma el envio solo si lo realizaste realmente desde el cliente externo.\n\nCancelar mantiene el estado pendiente.')) {
        root.confirmCommercialSend(record.id, { method: 'manual_explicit' });
      }
    }, 500);
    return { record, opened: true, reason: null };
  }

  async function confirmCommercialSend(recordId, confirmation = {}) {
    const record = history().find(item => String(item.id) === String(recordId));
    if (!record) throw new Error('COMMERCIAL_RECORD_NOT_FOUND');
    const result = api.confirmSent(record, {
      method: confirmation.method || 'manual_explicit',
      confirmedBy: confirmation.confirmedBy || 'user_manual',
      confirmedAt: confirmation.confirmedAt || new Date().toISOString(),
      confirmationId: confirmation.confirmationId || `manual:${record.id}`,
      source: confirmation.source || 'user_explicit',
      provider: confirmation.provider,
      providerAccountId: confirmation.providerAccountId,
      providerMessageId: confirmation.providerMessageId,
      verifiedAt: confirmation.verifiedAt
    }, { history: history() });
    if (result.duplicate) {
      toast('Este envio ya estaba confirmado; no se ha duplicado.');
      return result;
    }
    await persistHistory('envio confirmado');
    const lead = leadById(record.leadId);
    if (lead) {
      if (!lead.first_contact_date) {
        lead.first_contact_date = record.sendConfirmation.confirmedAt;
        const createdAt = new Date(lead.date || lead.first_contact_date).getTime();
        lead.ttfc_hours = Math.max(0, Math.round((new Date(lead.first_contact_date).getTime() - createdAt) / 3600000));
      }
      if (lead.status === 'Pendiente') {
        lead.status = 'Contactado';
        lead.status_date = record.sendConfirmation.confirmedAt;
      }
      if (typeof addActivityLog === 'function') addActivityLog(lead.id, `${record.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} enviado (confirmacion manual): "${record.subject || ''}"`);
      await persistLeadPolicy();
    }
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderTracking === 'function') renderTracking();
    if (typeof updateStreakData === 'function') updateStreakData();
    toast('Envio confirmado y registrado una sola vez.');
    return result;
  }

  root.getConfirmedCommercialHistory = function getConfirmedCommercialHistory() {
    return api.getConfirmedHistory(history());
  };
  root.getCommercialDisplayState = api.getDisplayState;
  root.isCommercialSendConfirmed = api.isSentConfirmed;
  root.recordCommercialDraft = recordCommercialDraft;
  root.prepareCommercialMessageAndOpen = prepareCommercialMessageAndOpen;
  root.confirmCommercialSend = confirmCommercialSend;
  root.ensureCommercialPermission = ensureCommercialPermission;
})(typeof globalThis !== 'undefined' ? globalThis : this);
