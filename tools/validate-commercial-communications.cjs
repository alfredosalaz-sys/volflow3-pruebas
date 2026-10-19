#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_STATES = Object.freeze([
  'DRAFT_CREATED',
  'DRAFT_REVIEWED',
  'DRAFT_APPROVED',
  'EXTERNAL_CLIENT_OPENED',
  'PENDING_SEND_CONFIRMATION',
  'SENT_CONFIRMED',
  'INBOUND_RECEIVED',
  'CANCELLED',
  'LEGACY_SENT_UNVERIFIED',
]);

function validateCommercialCommunications(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const contractPath = path.resolve(root, options.file || 'data/commercial-communications.v1.json');
  const priorityPath = path.join(root, 'data/prospecting-priorities.v1.json');
  const errors = [];
  const fail = (code, location, message) => errors.push({ code, location, message });
  let contract;
  let priorities;
  try { contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')); } catch (error) { fail('CONTRACT_INVALID', 'contract', error.message); }
  try { priorities = JSON.parse(fs.readFileSync(priorityPath, 'utf8')); } catch (error) { fail('PRIORITIES_INVALID', 'priorities', error.message); }
  if (!contract || !priorities) return { ok: false, errors, checked: {} };

  if (contract.schemaVersion !== 1) fail('SCHEMA_VERSION', 'schemaVersion', 'Debe ser 1.');
  if (!/^\d+\.\d+\.\d+$/.test(String(contract.contractVersion || ''))) fail('CONTRACT_VERSION', 'contractVersion', 'Version semantica requerida.');
  if (contract.prospectingProfileVersion !== priorities.profileVersion) fail('PROSPECTING_VERSION', 'prospectingProfileVersion', 'Debe coincidir con el contrato de prospeccion.');
  if (contract.taxonomyVersion !== priorities.taxonomyVersion) fail('TAXONOMY_VERSION', 'taxonomyVersion', 'Debe coincidir con la taxonomia aprobada.');
  if (contract.maxConfirmedContactsPerSequence !== 5) fail('SEQUENCE_LIMIT', 'maxConfirmedContactsPerSequence', 'El maximo contractual debe ser cinco.');

  const states = Array.isArray(contract.states) ? contract.states : [];
  const stateSet = new Set(states);
  if (stateSet.size !== states.length) fail('DUPLICATE_STATE', 'states', 'No se admiten estados duplicados.');
  for (const state of REQUIRED_STATES) if (!stateSet.has(state)) fail('STATE_MISSING', 'states', `Falta ${state}.`);
  for (const [from, targets] of Object.entries(contract.transitions || {})) {
    if (!stateSet.has(from)) fail('UNKNOWN_TRANSITION_SOURCE', `transitions.${from}`, 'Estado de origen inexistente.');
    if (!Array.isArray(targets)) fail('TRANSITION_LIST', `transitions.${from}`, 'Debe ser una lista.');
    for (const target of targets || []) if (!stateSet.has(target)) fail('UNKNOWN_TRANSITION_TARGET', `transitions.${from}`, `Destino inexistente: ${target}.`);
  }
  for (const state of states) if (!Object.hasOwn(contract.transitions || {}, state)) fail('TRANSITIONS_MISSING', `transitions.${state}`, 'Falta declarar transiciones.');
  if ((contract.transitions.EXTERNAL_CLIENT_OPENED || []).includes('SENT_CONFIRMED')) fail('OPEN_CONFIRMS_SEND', 'transitions.EXTERNAL_CLIENT_OPENED', 'Abrir un cliente no puede confirmar el envio.');
  if (!(contract.transitions.EXTERNAL_CLIENT_OPENED || []).includes('PENDING_SEND_CONFIRMATION')) fail('PENDING_REQUIRED', 'transitions.EXTERNAL_CLIENT_OPENED', 'La apertura debe quedar pendiente.');
  if (JSON.stringify(contract.sentCountingStates) !== JSON.stringify(['SENT_CONFIRMED'])) fail('COUNTING_STATES', 'sentCountingStates', 'Solo SENT_CONFIRMED puede contar como envio.');

  const methods = new Set(contract.confirmationMethods || []);
  for (const method of ['manual_explicit', 'provider_verified']) if (!methods.has(method)) fail('CONFIRMATION_METHOD', 'confirmationMethods', `Falta ${method}.`);
  for (const field of ['confirmedBy', 'confirmedAt', 'confirmationId']) if (!contract.manualConfirmationRequiredFields?.includes(field)) fail('MANUAL_CONFIRMATION_FIELD', 'manualConfirmationRequiredFields', `Falta ${field}.`);
  for (const field of ['provider', 'providerMessageId', 'verifiedAt']) if (!contract.providerConfirmationRequiredFields?.includes(field)) fail('PROVIDER_CONFIRMATION_FIELD', 'providerConfirmationRequiredFields', `Falta ${field}.`);

  const identity = contract.identity || {};
  for (const field of ['companyId', 'establishmentId', 'contactId']) if (!identity.required?.includes(field)) fail('IDENTITY_REQUIRED', 'identity.required', `Falta ${field}.`);
  let idPattern;
  try { idPattern = new RegExp(identity.stableIdPattern); } catch { fail('IDENTITY_PATTERN', 'identity.stableIdPattern', 'Expresion regular invalida.'); }
  if (idPattern && (!idPattern.test('company:abc123') || idPattern.test('INVALID'))) fail('IDENTITY_PATTERN', 'identity.stableIdPattern', 'El patron no valida IDs estables.');
  if (identity.persistentReferencesRequired !== true || identity.verifiedEquivalencesPreserved !== true || identity.destructiveMigrationAllowed !== false || identity.establishmentsRemainDistinct !== true || identity.collisionMustBlock !== true) {
    fail('IDENTITY_PERSISTENCE_POLICY', 'identity', 'La identidad debe persistirse, conservar equivalencias y bloquear colisiones sin migracion destructiva.');
  }

  const binding = contract.authorizationBinding || {};
  for (const field of ['channel', 'target', 'contactId', 'purpose', 'sourceId']) if (!binding.required?.includes(field)) fail('AUTHORIZATION_BINDING_FIELD', 'authorizationBinding.required', `Falta ${field}.`);
  if (binding.targetNormalizationRequired !== true || binding.legacyAuthorizationRequiresExplicitReview !== true || binding.targetChangeRequiresNewAuthorization !== true || binding.preservePreviousAuthorizations !== true) {
    fail('AUTHORIZATION_BINDING_POLICY', 'authorizationBinding', 'La autorizacion debe vincular destino, contacto y finalidad, conservando revisiones previas.');
  }

  const sequence = contract.sequencePolicy || {};
  for (const field of ['companyId', 'contactId', 'purpose']) if (!sequence.scopeFields?.includes(field)) fail('SEQUENCE_SCOPE_FIELD', 'sequencePolicy.scopeFields', `Falta ${field}.`);
  if (sequence.canonicalKeyRequired !== true || sequence.storedKeyIsNotAuthority !== true || sequence.deriveFromCanonicalIdentity !== true || sequence.legacyEquivalencesSupported !== true || sequence.countOnlyValidConfirmedRecords !== true || sequence.enforceOnDraftCreation !== true || sequence.enforceOnConfirmation !== true || sequence.independentContactsAllowed !== true || sequence.independentPurposesAllowed !== true) {
    fail('SEQUENCE_POLICY', 'sequencePolicy', 'El limite debe aplicarse a la clave canonica al crear y confirmar.');
  }

  const evidence = contract.confirmationEvidence || {};
  const manualEvidenceScope = ['method', 'confirmedBy', 'confirmationId'];
  const providerEvidenceScope = ['method', 'provider', 'providerAccountId', 'providerMessageId'];
  if (evidence.strictObjectRequired !== true || evidence.validTimestampRequired !== true || evidence.invalidEvidencePreservedUncounted !== true || evidence.uniqueEventRequired !== true || evidence.duplicateAttemptPreservedUncounted !== true
    || JSON.stringify(evidence.manualScopeFields) !== JSON.stringify(manualEvidenceScope)
    || JSON.stringify(evidence.providerScopeFields) !== JSON.stringify(providerEvidenceScope)) {
    fail('CONFIRMATION_EVIDENCE_POLICY', 'confirmationEvidence', 'La evidencia invalida debe conservarse sin contabilizarse.');
  }

  const restrictions = contract.commercialRestrictions || {};
  if (restrictions.allowedLegalBasisStatus !== 'allowed_for_purpose' || restrictions.doNotContactAlwaysBlocks !== true || restrictions.channelVerificationRequired !== true || restrictions.contactSourceRequired !== true) {
    fail('COMMERCIAL_RESTRICTIONS', 'commercialRestrictions', 'Las restricciones comerciales deben ser bloqueantes.');
  }
  for (const state of ['unknown', 'pending_review', 'blocked']) if (!restrictions.blockingLegalBasisStatuses?.includes(state)) fail('BLOCKING_LEGAL_STATUS', 'commercialRestrictions.blockingLegalBasisStatuses', `Falta ${state}.`);

  const legacy = contract.legacyCompatibility || {};
  if (legacy.preserveOriginalRecord !== true || legacy.normalizedState !== 'LEGACY_SENT_UNVERIFIED' || legacy.countAsConfirmed !== false) fail('LEGACY_POLICY', 'legacyCompatibility', 'El historico ambiguo debe conservarse sin contarlo.');
  for (const status of ['Enviado', 'Enviado (IA)']) if (!legacy.ambiguousOutboundStatuses?.includes(status)) fail('LEGACY_STATUS', 'legacyCompatibility.ambiguousOutboundStatuses', `Falta ${status}.`);

  const human = contract.humanControl || {};
  if (human.individualReviewRequired !== true || human.individualApprovalRequired !== true || human.automaticSendAllowed !== false || human.externalClientOpenConfirmsSend !== false || human.elapsedTimeConfirmsSend !== false || human.tabOrWindowCloseConfirmsSend !== false) {
    fail('HUMAN_CONTROL', 'humanControl', 'Revision, aprobacion y confirmacion humana deben permanecer separadas.');
  }

  return {
    ok: errors.length === 0,
    errors,
    checked: { states: states.length, transitions: Object.keys(contract.transitions || {}).length, confirmationMethods: methods.size, maxSequence: contract.maxConfirmedContactsPerSequence },
  };
}

if (require.main === module) {
  const result = validateCommercialCommunications({ root: process.argv[2] });
  if (!result.ok) {
    for (const error of result.errors) console.error(`${error.code} ${error.location}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Commercial communications contract OK: ${result.checked.states} states, ${result.checked.transitions} transition sets, max ${result.checked.maxSequence} contacts`);
}

module.exports = { REQUIRED_STATES, validateCommercialCommunications };
