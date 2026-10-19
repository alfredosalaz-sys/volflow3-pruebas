#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const EXPECTED_PROFILES = Object.freeze([
  'community-property-management',
  'technical-architect-prescriber',
  'architect-prescriber',
  'real-estate-commercial',
  'property-asset-management',
]);
const EXPECTED_SECTORS = Object.freeze([
  'architects',
  'property-management',
  'real-estate-agencies',
  'technical-architects',
]);
const ROLES = new Set(['direct-client', 'collaborator', 'prescriber']);
const SOURCE_STATUSES = new Set(['candidate', 'verified-code', 'broad-candidate', 'requires-etl-validation', 'requires-source-taxonomy-validation']);
const REQUIRED_CONTACT_META = ['sourceId', 'sourceUrl', 'obtainedAt', 'confidence', 'verificationStatus'];
const REQUIRED_METRICS = ['companiesFound', 'uniqueEstablishments', 'usefulContacts', 'decisionMakersIdentified', 'personalizedEmailsPrepared'];

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function containsTerm(text, term) {
  const source = ` ${normalize(text)} `;
  const needle = ` ${normalize(term)} `;
  return needle.trim() && source.includes(needle);
}

function classifyConsultancy(text, contract) {
  const rules = contract.disambiguation || {};
  const candidates = ['propertyManagement', 'administrativeConsultancy'].map(id => {
    const rule = rules[id] || {};
    const positives = (rule.positiveTerms || []).filter(term => containsTerm(text, term));
    const negatives = (rule.negativeTerms || []).filter(term => containsTerm(text, term));
    return { id, sectorId: rule.sectorId, positives, negatives };
  }).filter(candidate => candidate.positives.length && !candidate.negatives.length);
  candidates.sort((a, b) => Math.max(...b.positives.map(term => normalize(term).length)) - Math.max(...a.positives.map(term => normalize(term).length)));
  return candidates[0]?.sectorId || null;
}

function validatePriorities(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const prioritiesPath = path.resolve(root, options.file || 'data/prospecting-priorities.v1.json');
  const taxonomyPath = path.resolve(root, 'data/business-taxonomy.v1.json');
  const errors = [];
  const fail = (code, location, message) => errors.push({ code, location, message });
  let contract;
  let taxonomy;
  try { contract = JSON.parse(fs.readFileSync(prioritiesPath, 'utf8')); } catch (error) { fail('PRIORITIES_INVALID', 'priorities', error.message); }
  try { taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf8')); } catch (error) { fail('TAXONOMY_INVALID', 'taxonomy', error.message); }
  if (!contract || !taxonomy) return { ok: false, errors, checked: {} };

  if (contract.schemaVersion !== 1) fail('SCHEMA_VERSION', 'schemaVersion', 'Debe ser 1.');
  if (contract.taxonomyVersion !== taxonomy.taxonomyVersion) fail('TAXONOMY_VERSION', 'taxonomyVersion', 'Debe coincidir con la taxonomia.');
  if (contract.runtimeEnabled !== false) fail('RUNTIME_ENABLED', 'runtimeEnabled', 'La ampliacion contractual no puede activar runtime antes de E5.');
  if (contract.zeroCostRequired !== true) fail('ZERO_COST', 'zeroCostRequired', 'El coste cero debe ser obligatorio.');

  const taxonomyIds = new Set((taxonomy.sectors || []).map(sector => sector.id));
  const profiles = Array.isArray(contract.profiles) ? contract.profiles : [];
  const profileIds = new Set();
  for (const [index, profile] of profiles.entries()) {
    const location = `profiles[${index}]`;
    if (!profile?.id || profileIds.has(profile.id)) fail('PROFILE_ID', `${location}.id`, 'ID ausente o duplicado.');
    profileIds.add(profile?.id);
    if (!taxonomyIds.has(profile?.sectorId)) fail('UNKNOWN_SECTOR', `${location}.sectorId`, 'El perfil debe reutilizar un sector existente.');
    if (profile?.priority !== 1) fail('NOT_PRIORITY', `${location}.priority`, 'Todos los perfiles de esta entrega deben ser prioritarios.');
    if (!Array.isArray(profile?.commercialRoles) || !profile.commercialRoles.length || profile.commercialRoles.some(role => !ROLES.has(role))) fail('COMMERCIAL_ROLE', `${location}.commercialRoles`, 'Rol comercial invalido.');
    for (const field of ['searchTerms', 'requiredAnyTerms', 'serviceAngles']) {
      if (!Array.isArray(profile?.[field]) || !profile[field].length) fail('PROFILE_TERMS', `${location}.${field}`, `${field} no puede estar vacio.`);
    }
    if (!Array.isArray(profile?.excludedTerms)) fail('PROFILE_TERMS', `${location}.excludedTerms`, 'excludedTerms debe ser un array.');
    const mappings = profile?.sourceSearchMappings;
    if (!mappings || typeof mappings !== 'object' || !Object.keys(mappings).length) fail('SOURCE_MAPPINGS', `${location}.sourceSearchMappings`, 'Debe declarar correspondencias de fuente.');
    for (const [source, mapping] of Object.entries(mappings || {})) {
      if (!SOURCE_STATUSES.has(mapping?.status)) fail('SOURCE_STATUS', `${location}.sourceSearchMappings.${source}.status`, 'Estado de mapping invalido.');
    }
  }

  if (EXPECTED_PROFILES.some(id => !profileIds.has(id)) || profileIds.size !== EXPECTED_PROFILES.length) fail('PROFILE_SET', 'profiles', 'Deben existir exactamente los cinco perfiles aprobados.');
  const usedSectors = [...new Set(profiles.map(profile => profile.sectorId))].sort();
  if (JSON.stringify(usedSectors) !== JSON.stringify(EXPECTED_SECTORS)) fail('SECTOR_REUSE', 'profiles', 'Los cinco perfiles deben reutilizar exactamente cuatro sectores E2.2.');

  const disambiguation = contract.disambiguation || {};
  if (disambiguation.requestedSectorIsEvidence !== false) fail('QUERY_CONTAMINATION', 'disambiguation.requestedSectorIsEvidence', 'El sector solicitado no puede ser evidencia.');
  const scenarios = [
    ['Gestoria administrativa Lopez, asesoria fiscal y laboral', 'accounting-advisory'],
    ['Gestoria de fincas Lopez, administracion de comunidades', 'property-management'],
    ['Gestion patrimonial y gestion de inmuebles', 'property-management'],
  ];
  for (const [text, expected] of scenarios) {
    if (classifyConsultancy(text, contract) !== expected) fail('DISAMBIGUATION', 'disambiguation', `Clasificacion incorrecta para: ${text}`);
  }

  const contact = contract.contactDataContract || {};
  for (const field of ['corporatePhone', 'corporateEmail', 'website', 'responsiblePerson', 'responsibleRole']) {
    if (!contact.fields?.includes(field)) fail('CONTACT_FIELD', 'contactDataContract.fields', `Falta ${field}.`);
  }
  for (const field of REQUIRED_CONTACT_META) {
    if (!contact.requiredMetadata?.includes(field)) fail('CONTACT_PROVENANCE', 'contactDataContract.requiredMetadata', `Falta ${field}.`);
  }
  for (const metric of REQUIRED_METRICS) {
    if (!contract.measurementContract?.requiredMetrics?.includes(metric)) fail('METRIC_REQUIRED', 'measurementContract.requiredMetrics', `Falta ${metric}.`);
  }

  const email = contract.emailPolicy || {};
  if (!email.aiMayUseOnlyVerifiedFields || !email.unknownFieldsMustRemainUnknown || !email.individualReviewRequired || !email.individualApprovalRequired || email.automaticSendingAllowed !== false || email.outboundClient !== 'outlook-user-action') {
    fail('EMAIL_POLICY', 'emailPolicy', 'La IA debe usar datos verificados y exigir revision/aprobacion individual en Outlook.');
  }
  for (const phase of ['E3', 'E4', 'E5', 'E6', 'E7', 'E8']) {
    if (!Array.isArray(contract.phaseAcceptance?.[phase]) || !contract.phaseAcceptance[phase].length) fail('PHASE_ACCEPTANCE', `phaseAcceptance.${phase}`, 'Faltan criterios de aceptacion.');
  }
  const performance = contract.performanceContract || {};
  if (!performance.localIndexesFirst || !performance.progressiveResults || !performance.optionalEnrichment || performance.maxConcurrentEnrichment > 1 || !performance.physicalCeleronValidationRequiredBeforeClaim) {
    fail('PERFORMANCE_POLICY', 'performanceContract', 'La politica debe priorizar local, progresivo, enriquecimiento opcional y validacion fisica.');
  }

  return {
    ok: errors.length === 0,
    errors,
    checked: { profiles: profiles.length, reusedSectors: usedSectors.length, phases: Object.keys(contract.phaseAcceptance || {}).length, metrics: contract.measurementContract?.requiredMetrics?.length || 0 },
  };
}

if (require.main === module) {
  const result = validatePriorities({ root: process.argv[2] });
  if (!result.ok) {
    for (const error of result.errors) console.error(`${error.code} ${error.location}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Priority prospecting contract OK: ${result.checked.profiles} profiles, ${result.checked.reusedSectors} existing sectors, ${result.checked.phases} phases`);
}

module.exports = { EXPECTED_PROFILES, EXPECTED_SECTORS, classifyConsultancy, validatePriorities };
