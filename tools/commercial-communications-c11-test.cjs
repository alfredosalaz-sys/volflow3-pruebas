#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../modules/commercial-communications.js');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let passed = 0;
const pass = name => { passed += 1; console.log(`PASS ${name}`); };
const expectCode = (code, run) => assert.throws(run, error => String(error.message).includes(code));

function leadFixture(email = 'oficina@empresa.test') {
  const lead = {
    id: 'c11-lead', company: 'Empresa demostracion', address: 'Calle Mayor 1, Madrid', email,
    commercialContactPolicy: { legalBasisStatus: 'allowed_for_purpose', channels: { email: { verified: true, sourceId: 'fixture-public-source' } } },
  };
  const identity = api.deriveIdentities({ lead, channel: 'email', target: email, purpose: 'b2b_prospecting' });
  Object.assign(lead.commercialContactPolicy.channels.email, {
    target: api.normalizeTarget('email', email), contactId: identity.contactId, purpose: 'b2b_prospecting'
  });
  return lead;
}

function confirmRecord(history, lead, index, extras = {}) {
  const input = {
    lead, channel: 'email', target: extras.target || lead.email,
    purpose: extras.purpose || 'b2b_prospecting', subject: `Mensaje ${index}`, body: `Contenido ${index}`,
    sequenceId: extras.sequenceId,
  };
  const { record } = api.createDraft(history, input);
  api.markReviewed(record); api.markApproved(record); api.markExternalClientOpened(record, 'mailto');
  return api.confirmSent(record, {
    method: 'manual_explicit', confirmedBy: 'user', confirmationId: `c11-${index}-${extras.purpose || 'prospecting'}`,
    confirmedAt: `2026-10-15T12:${String(index).padStart(2, '0')}:00.000Z`,
  }, { history }).record;
}

function createPending(history, lead, extras = {}) {
  const { record } = api.createDraft(history, {
    lead, channel: 'email', target: lead.email, purpose: extras.purpose || 'b2b_prospecting',
    subject: 'Confirmacion de proveedor', body: 'Contenido revisado'
  });
  api.markReviewed(record);
  api.markApproved(record);
  api.markExternalClientOpened(record, 'provider');
  return record;
}

const lead = leadFixture();
assert.equal(api.checkCommercialRestrictions({ lead, channel: 'email', target: ' OFICINA@EMPRESA.TEST ', purpose: 'b2b_prospecting' }).ok, true);
assert.equal(api.checkCommercialRestrictions({ lead, channel: 'email', target: 'otro@empresa.test', purpose: 'b2b_prospecting' }).ok, false);
pass('autorizacion ligada al destinatario normalizado');

const legacyPolicyLead = leadFixture();
legacyPolicyLead.commercialContactPolicy.channels.email = { verified: true, sourceId: 'legacy-source', target: legacyPolicyLead.email };
assert.equal(api.checkCommercialRestrictions({ lead: legacyPolicyLead, channel: 'email', target: legacyPolicyLead.email }).reason, 'AUTHORIZATION_REVIEW_REQUIRED');
pass('autorizacion legacy exige revision explicita');

const secondTarget = 'direccion@empresa.test';
const secondIdentity = api.deriveIdentities({ lead, channel: 'email', target: secondTarget, purpose: 'b2b_prospecting' });
lead.commercialContactPolicy.channels.email.authorizations = [
  { ...lead.commercialContactPolicy.channels.email },
  { verified: true, sourceId: 'second-source', target: secondTarget, contactId: secondIdentity.contactId, purpose: 'b2b_prospecting' },
];
assert.equal(api.checkCommercialRestrictions({ lead, channel: 'email', target: lead.email, purpose: 'b2b_prospecting' }).ok, true);
assert.equal(api.checkCommercialRestrictions({ lead, channel: 'email', target: secondTarget, purpose: 'b2b_prospecting' }).ok, true);
pass('varias autorizaciones se conservan sin sobrescribirse');

const history = [];
for (let index = 1; index <= 5; index += 1) confirmRecord(history, lead, index, { sequenceId: 'sequence:reimport' });
expectCode('COMMERCIAL_SEQUENCE_LIMIT_REACHED', () => confirmRecord(history, { ...lead, id: 'reimported-lead' }, 6, { sequenceId: 'sequence:nuevo-id-intento' }));
assert.equal(api.getConfirmedHistory(history).length, 5);
assert.deepEqual(api.getConfirmedHistory(history).map(record => record.sequenceStep), [5, 4, 3, 2, 1]);
pass('reimportacion y sequenceId alternativo no superan cinco confirmados');

const precreated = [];
const drafts = Array.from({ length: 6 }, (_, index) => api.createDraft(precreated, {
  lead, channel: 'email', target: lead.email, purpose: 'commercial_reply', subject: `Respuesta ${index}`, body: `Texto ${index}`
}).record);
for (const [index, record] of drafts.entries()) {
  api.markReviewed(record); api.markApproved(record); api.markExternalClientOpened(record, 'mailto');
  if (index < 5) api.confirmSent(record, { method: 'manual_explicit', confirmedBy: 'user', confirmationId: `pre-${index}`, confirmedAt: `2026-10-15T13:0${index}:00.000Z` }, { history: precreated });
  else expectCode('COMMERCIAL_SEQUENCE_LIMIT_REACHED', () => api.confirmSent(record, { method: 'manual_explicit', confirmedBy: 'user', confirmationId: 'pre-6', confirmedAt: '2026-10-15T13:06:00.000Z' }, { history: precreated }));
}
assert.equal(api.getConfirmedHistory(precreated).length, 5);
pass('seis borradores previos tampoco evitan el limite al confirmar');

const independent = [];
confirmRecord(independent, leadFixture('contacto-a@empresa.test'), 1);
confirmRecord(independent, leadFixture('contacto-b@empresa.test'), 2);
confirmRecord(independent, leadFixture('contacto-a@empresa.test'), 3, { purpose: 'commercial_reply' });
assert.equal(api.getConfirmedHistory(independent).length, 3);
assert.equal(new Set(api.getConfirmedHistory(independent).map(record => record.sequenceKey)).size, 3);
pass('contactos y finalidades independientes usan secuencias distintas');

const invalidEvidence = [
  {}, 'yes', [], { method: 'manual_explicit' },
  { method: 'manual_explicit', confirmedBy: 'user', confirmationId: 'x', confirmedAt: 'not-a-date' },
  { method: 'manual_explicit', confirmedBy: 7, confirmationId: 'x', confirmedAt: '2026-10-15T10:00:00.000Z' },
  { method: 'provider_verified', provider: 'mock', providerMessageId: 'id' },
  { method: 'provider_verified', provider: 'mock', providerMessageId: {}, verifiedAt: '2026-10-15T10:00:00.000Z' },
];
for (const sendConfirmation of invalidEvidence) assert.equal(api.isSentConfirmed({ commercialState: 'SENT_CONFIRMED', sendConfirmation }), false);
assert.equal(api.isSentConfirmed({ commercialState: 'SENT_CONFIRMED', sendConfirmation: { method: 'manual_explicit', confirmedBy: 'user', confirmationId: 'ok', confirmedAt: '2026-10-15T10:00:00.000Z' } }), true);
assert.equal(api.isSentConfirmed({ commercialState: 'SENT_CONFIRMED', sendConfirmation: { method: 'provider_verified', provider: 'mock', providerMessageId: 'provider-id', verifiedAt: '2026-10-15T10:00:00.000Z' } }), true);
const providerHistory = [];
const providerRecord = createPending(providerHistory, leadFixture('provider@test.example'), { purpose: 'b2b_prospecting' });
api.confirmSent(providerRecord, {
  method: 'provider_verified', provider: 'mock-provider', providerMessageId: 'provider-message-1',
  verifiedAt: '2026-10-15T10:00:00.000Z'
}, { history: providerHistory });
assert.equal(api.isSentConfirmed(providerRecord), true);
assert.equal(providerRecord.sendConfirmation.verifiedAt, '2026-10-15T10:00:00.000Z');
pass('evidencia manual y de proveedor se valida por tipo y timestamp');

const malformed = { id: 'malformed', commercialState: 'SENT_CONFIRMED', sendConfirmation: { method: 'manual_explicit' }, status: 'Envio confirmado' };
assert.equal(api.getConfirmedHistory([malformed]).length, 0);
assert.equal(malformed.commercialState, 'SENT_CONFIRMED');
assert.equal(api.getDisplayState(malformed), 'Envio no verificado: evidencia incompleta');
pass('registro malformado se conserva y queda fuera del conteo');

const routeSources = ['modules/leads.js', 'modules/ai-email.js', 'modules/ai-router.js'].map(relative => fs.readFileSync(path.join(root, relative), 'utf8')).join('\n');
assert((routeSources.match(/prepareCommercialMessageAndOpen\(/g) || []).length >= 4);
assert(routeSources.includes("purpose: 'b2b_prospecting'"));
assert(routeSources.includes("purpose: 'commercial_reply'"));
assert(routeSources.includes("reserveCommercialExternalWindow()"));
assert(/reserveCommercialExternalWindow\(\)[\s\S]{0,700}await prepareCommercialMessageAndOpen/.test(routeSources));
pass('plantillas IA respuestas y WhatsApp conservan el control C1.1');

console.log(`Commercial communications C1.1 tests OK: ${passed}/${passed}`);
