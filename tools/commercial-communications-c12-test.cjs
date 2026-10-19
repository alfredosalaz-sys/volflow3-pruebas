#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const api = require('../modules/commercial-communications.js');
const { validateCommercialCommunications } = require('./validate-commercial-communications.cjs');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let passed = 0;
const pass = name => { passed += 1; console.log(`PASS ${name}`); };
const expectCode = (code, run) => assert.throws(run, error => String(error.message).includes(code));

function makeLead(overrides = {}) {
  return {
    id: 'lead-c12-1', company: 'Administracion Fincas Centro', address: 'Calle Mayor 15, Madrid',
    postalCode: '28013', email: 'info@fincas-centro.test', ...overrides
  };
}

function pending(history, lead, index, options = {}) {
  const { record } = api.createDraft(history, {
    lead, channel: options.channel || 'email', target: options.target || lead.email,
    purpose: options.purpose || 'b2b_prospecting', subject: `Asunto ${index}`, body: `Contenido ${index}`,
    sequenceId: options.sequenceId
  });
  api.markReviewed(record);
  api.markApproved(record);
  api.markExternalClientOpened(record, options.client || 'mailto');
  return record;
}

function confirmManual(history, lead, index, options = {}) {
  const record = pending(history, lead, index, options);
  api.confirmSent(record, {
    method: 'manual_explicit', confirmedBy: options.confirmedBy || 'user',
    confirmationId: options.confirmationId || `event-${index}`,
    confirmedAt: `2026-10-16T12:${String(index).padStart(2, '0')}:00.000Z`
  }, { history });
  return record;
}

const enrichedLead = makeLead();
const enrichedHistory = [];
const firstIdentity = api.deriveIdentities({ lead: enrichedLead, channel: 'email', target: enrichedLead.email });
for (let index = 1; index <= 5; index += 1) confirmManual(enrichedHistory, enrichedLead, index);
const restored = JSON.parse(JSON.stringify({ lead: enrichedLead, history: enrichedHistory }));
restored.lead.website = 'https://fincas-centro.test';
restored.lead.address = 'C/ Mayor, 15 - 28013 Madrid';
const enrichedIdentity = api.deriveIdentities({ lead: restored.lead, channel: 'email', target: restored.lead.email });
assert.equal(enrichedIdentity.companyId, firstIdentity.companyId);
assert.equal(enrichedIdentity.sequenceKey, firstIdentity.sequenceKey);
expectCode('COMMERCIAL_SEQUENCE_LIMIT_REACHED', () => pending(restored.history, restored.lead, 6));
pass('persistencia y enriquecimiento conservan identidad y limite');

const reimported = { ...restored.lead, id: 'lead-reimportado-c12' };
assert.equal(api.deriveIdentities({ lead: reimported, channel: 'email', target: reimported.email }).companyIdentityAnchor, firstIdentity.companyIdentityAnchor);
expectCode('COMMERCIAL_SEQUENCE_LIMIT_REACHED', () => pending(restored.history, reimported, 6, { sequenceId: 'sequence:editable' }));
pass('reimportacion con referencias persistentes no reinicia secuencia');

const staleKeys = restored.history.map(record => ({ ...record, sequenceKey: 'sequence:obsoleta', sequenceId: 'sequence:importada' }));
expectCode('COMMERCIAL_SEQUENCE_LIMIT_REACHED', () => pending(staleKeys, restored.lead, 6));
assert(staleKeys.every(record => record.sequenceKey === 'sequence:obsoleta'));
pass('claves historicas se conservan pero no prevalecen sobre identidad canonica');

const branchCompanyId = 'company:shared001';
const branchA = makeLead({ id: 'branch-a', address: 'Calle A 1', commercialRefs: { companyId: branchCompanyId, companyIdentityAnchor: 'company-anchor:shared001' } });
const branchB = makeLead({ id: 'branch-b', address: 'Calle B 2', commercialRefs: { companyId: branchCompanyId, companyIdentityAnchor: 'company-anchor:shared001' } });
const branchAIdentity = api.deriveIdentities({ lead: branchA, channel: 'email', target: branchA.email });
const branchBIdentity = api.deriveIdentities({ lead: branchB, channel: 'email', target: branchB.email });
assert.equal(branchAIdentity.companyId, branchBIdentity.companyId);
assert.notEqual(branchAIdentity.establishmentId, branchBIdentity.establishmentId);
pass('sucursales comparten empresa sin colapsar establecimientos');

const collisionHistory = [];
api.createDraft(collisionHistory, {
  lead: makeLead({ id: 'collision-a' }), companyId: 'company:collision01', companyIdentityAnchor: 'anchor:collision-a',
  channel: 'email', target: 'a@collision.test', subject: 'A', body: 'A'
});
expectCode('COMMERCIAL_IDENTITY_COLLISION', () => api.createDraft(collisionHistory, {
  lead: makeLead({ id: 'collision-b', email: 'b@collision.test' }), companyId: 'company:collision01', companyIdentityAnchor: 'anchor:collision-b',
  channel: 'email', target: 'b@collision.test', subject: 'B', body: 'B'
}));
pass('colision de companyId entre identidades distintas bloqueada');

const manualHistory = [];
confirmManual(manualHistory, makeLead(), 1, { confirmationId: 'manual-event-unique' });
const manualDuplicate = pending(manualHistory, makeLead(), 2);
expectCode('COMMERCIAL_CONFIRMATION_EVIDENCE_DUPLICATE', () => api.confirmSent(manualDuplicate, {
  method: 'manual_explicit', confirmedBy: 'user', confirmationId: 'manual-event-unique', confirmedAt: '2026-10-16T12:02:00.000Z'
}, { history: manualHistory }));
assert.equal(api.getConfirmedHistory(manualHistory).length, 1);
assert.equal(manualDuplicate.confirmationAttempts[0].outcome, 'duplicate_evidence_rejected');
assert.equal(manualDuplicate.commercialState, 'PENDING_SEND_CONFIRMATION');
pass('evidencia manual duplicada se traza sin segundo conteo');

const providerHistory = [];
const providerFirst = pending(providerHistory, makeLead(), 1, { client: 'provider' });
api.confirmSent(providerFirst, {
  method: 'provider_verified', provider: 'mock', providerAccountId: 'account-a',
  providerMessageId: 'provider-event-1', verifiedAt: '2026-10-16T12:01:00.000Z'
}, { history: providerHistory });
const providerDuplicate = pending(providerHistory, makeLead(), 2, { client: 'provider' });
expectCode('COMMERCIAL_CONFIRMATION_EVIDENCE_DUPLICATE', () => api.confirmSent(providerDuplicate, {
  method: 'provider_verified', provider: 'mock', providerAccountId: 'account-a',
  providerMessageId: 'provider-event-1', verifiedAt: '2026-10-16T12:02:00.000Z'
}, { history: providerHistory }));
const independentProvider = pending(providerHistory, makeLead(), 3, { client: 'provider' });
api.confirmSent(independentProvider, {
  method: 'provider_verified', provider: 'mock', providerAccountId: 'account-b',
  providerMessageId: 'provider-event-1', verifiedAt: '2026-10-16T12:03:00.000Z'
}, { history: providerHistory });
assert.equal(api.getConfirmedHistory(providerHistory).length, 2);
pass('evidencia de proveedor es unica por proveedor y cuenta');

const contract = JSON.parse(fs.readFileSync(path.join(root, 'data/commercial-communications.v1.json'), 'utf8'));
const priorities = fs.readFileSync(path.join(root, 'data/prospecting-priorities.v1.json'), 'utf8');
for (const mutate of [
  data => { data.identity.persistentReferencesRequired = false; },
  data => { data.sequencePolicy.storedKeyIsNotAuthority = false; },
  data => { data.confirmationEvidence.uniqueEventRequired = false; }
]) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'voltflow-c12-'));
  try {
    fs.mkdirSync(path.join(temporary, 'data'));
    const changed = JSON.parse(JSON.stringify(contract));
    mutate(changed);
    fs.writeFileSync(path.join(temporary, 'data/commercial-communications.v1.json'), JSON.stringify(changed));
    fs.writeFileSync(path.join(temporary, 'data/prospecting-priorities.v1.json'), priorities);
    assert.equal(validateCommercialCommunications({ root: temporary }).ok, false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
pass('quality gate bloquea contratos sin invariantes C1.2');

console.log(`Commercial communications C1.2 tests OK: ${passed}/${passed}`);
