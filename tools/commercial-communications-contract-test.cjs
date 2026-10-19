#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const api = require('../modules/commercial-communications.js');
const { validateCommercialCommunications } = require('./validate-commercial-communications.cjs');

const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'data/commercial-communications.v1.json'), 'utf8'));
const priorities = JSON.parse(fs.readFileSync(path.join(root, 'data/prospecting-priorities.v1.json'), 'utf8'));
const legacy = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/commercial-communications/legacy-history.json'), 'utf8'));
const tempRoots = [];
const clone = value => JSON.parse(JSON.stringify(value));
let passed = 0;

function pass(name) { passed += 1; console.log(`PASS ${name}`); }
function expectError(name, code, run) {
  assert.throws(run, error => String(error.message).includes(code), name);
  pass(name);
}
function fixture(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voltflow-commercial-'));
  tempRoots.push(dir);
  const current = clone(contract);
  const currentPriorities = clone(priorities);
  if (mutate) mutate(current, currentPriorities);
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data/commercial-communications.v1.json'), `${JSON.stringify(current, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'data/prospecting-priorities.v1.json'), `${JSON.stringify(currentPriorities, null, 2)}\n`);
  return dir;
}
function expectInvalid(name, code, mutate) {
  const result = validateCommercialCommunications({ root: fixture(mutate) });
  assert.equal(result.ok, false, `${name}: contrato invalido aceptado`);
  assert(result.errors.some(error => error.code === code), `${name}: falta ${code}`);
  pass(name);
}

const lead = {
  id: 'lead-1',
  company: 'Estudio Norte',
  address: 'Calle Mayor 1, Madrid',
  postalCode: '28013',
  email: 'contacto@example.test',
  phone: '+34910000000',
  segment: 'Arquitectos',
  commercialContactPolicy: {
    legalBasisStatus: 'allowed_for_purpose',
    channels: {
      email: { verified: true, sourceId: 'web-corporativa' },
      whatsapp: { verified: true, sourceId: 'contacto-facilitado' },
    },
  },
};
const emailIdentity = api.deriveIdentities({ lead, channel: 'email', target: lead.email, purpose: 'b2b_prospecting' });
const whatsappIdentity = api.deriveIdentities({ lead, channel: 'whatsapp', target: lead.phone, purpose: 'b2b_prospecting' });
Object.assign(lead.commercialContactPolicy.channels.email, {
  target: api.normalizeTarget('email', lead.email), contactId: emailIdentity.contactId, purpose: 'b2b_prospecting'
});
Object.assign(lead.commercialContactPolicy.channels.whatsapp, {
  target: api.normalizeTarget('whatsapp', lead.phone), contactId: whatsappIdentity.contactId, purpose: 'b2b_prospecting'
});

try {
  const valid = validateCommercialCommunications({ root });
  assert.equal(valid.ok, true, valid.errors.map(error => error.code).join(', '));
  assert.deepEqual(valid.checked, { states: 9, transitions: 9, confirmationMethods: 2, maxSequence: 5 });
  pass('contrato C0 valido');

  const history = [];
  const created = api.createDraft(history, { lead, channel: 'email', target: lead.email, subject: 'Propuesta', body: 'Contenido revisable' }, { now: '2026-10-15T10:00:00.000Z' });
  assert.equal(created.record.commercialState, api.STATES.DRAFT_CREATED);
  assert.equal(api.getConfirmedHistory(history).length, 0);
  pass('borrador creado no contabiliza envio');

  const reused = api.createDraft(history, { lead, channel: 'email', target: lead.email, subject: 'Propuesta', body: 'Contenido revisable' }, { now: '2026-10-15T10:01:00.000Z' });
  assert.equal(reused.reused, true);
  assert.equal(history.length, 1);
  pass('creacion de borrador idempotente');

  api.markReviewed(created.record, { now: '2026-10-15T10:02:00.000Z' });
  assert.equal(api.getConfirmedHistory(history).length, 0);
  pass('revision no contabiliza envio');
  api.markApproved(created.record, { now: '2026-10-15T10:03:00.000Z' });
  assert.equal(api.getConfirmedHistory(history).length, 0);
  pass('aprobacion no contabiliza envio');
  api.markExternalClientOpened(created.record, 'outlook', { now: '2026-10-15T10:04:00.000Z' });
  assert.equal(created.record.commercialState, api.STATES.PENDING_SEND_CONFIRMATION);
  assert.equal(api.getConfirmedHistory(history).length, 0);
  pass('abrir Outlook o cerrarlo sin enviar no contabiliza contacto');

  const firstConfirm = api.confirmSent(created.record, { method: 'manual_explicit', confirmedBy: 'user', confirmationId: 'manual-1', confirmedAt: '2026-10-15T10:05:00.000Z' });
  assert.equal(firstConfirm.duplicate, false);
  assert.equal(api.getConfirmedHistory(history).length, 1);
  pass('confirmacion manual registra exactamente un envio');
  const duplicate = api.confirmSent(created.record, { method: 'manual_explicit', confirmedBy: 'user', confirmationId: 'manual-1', confirmedAt: '2026-10-15T10:06:00.000Z' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(created.record.stateHistory.filter(item => item.state === api.STATES.SENT_CONFIRMED).length, 1);
  pass('doble confirmacion no duplica historial');

  const waHistory = [];
  const wa = api.createDraft(waHistory, { lead, channel: 'whatsapp', target: lead.phone, subject: 'WhatsApp comercial', body: 'Mensaje' }).record;
  api.markReviewed(wa); api.markApproved(wa); api.markExternalClientOpened(wa, 'whatsapp_web');
  assert.equal(api.getConfirmedHistory(waHistory).length, 0);
  pass('abrir WhatsApp no registra envio');

  assert.equal(api.getConfirmedHistory(legacy).length, 0);
  assert.deepEqual(legacy.map(item => item.status), ['Enviado', 'Enviado (IA)', 'Respuesta recibida']);
  assert.equal(api.preserveLegacyRecord(legacy[0]).effectiveCommercialState, api.STATES.LEGACY_SENT_UNVERIFIED);
  pass('datos legacy accesibles y ambiguos no convertidos');

  const ids1 = api.deriveIdentities({ lead, channel: 'email', target: lead.email });
  const ids2 = api.deriveIdentities({ lead, channel: 'email', target: lead.email });
  const ids3 = api.deriveIdentities({ lead, channel: 'email', target: 'otra@example.test' });
  assert.deepEqual(ids1, ids2);
  assert.notEqual(ids1.contactId, ids3.contactId);
  assert.equal(ids1.companyId, ids3.companyId);
  pass('IDs estables distinguen empresa establecimiento y varios contactos');

  assert.equal(api.checkCommercialRestrictions({ lead, channel: 'email' }).ok, true);
  assert.equal(api.checkCommercialRestrictions({ lead: { ...lead, doNotContact: true }, channel: 'email' }).reason, 'DO_NOT_CONTACT');
  assert.equal(api.checkCommercialRestrictions({ lead: { ...lead, commercialContactPolicy: { legalBasisStatus: 'unknown', channels: {} } }, channel: 'email' }).reason, 'LEGAL_BASIS_NOT_ALLOWED');
  pass('oposicion y ausencia de condicion habilitante bloquean');

  for (let step = 1; step <= 5; step += 1) {
    const item = api.createDraft([], { lead, channel: 'email', target: lead.email, subject: `Paso ${step}`, body: 'Mensaje', sequenceId: 'sequence:abc123', sequenceStep: step }).record;
    assert.equal(item.sequenceStep, step);
  }
  expectError('sexto contacto rechazado', 'COMMERCIAL_SEQUENCE_STEP_INVALID', () => api.createDraft([], { lead, channel: 'email', target: lead.email, subject: 'Paso 6', body: 'Mensaje', sequenceStep: 6 }));
  expectError('transicion directa de borrador a enviado bloqueada', 'COMMERCIAL_TRANSITION_BLOCKED', () => api.transition(api.createDraft([], { lead, channel: 'email', target: lead.email }).record, api.STATES.SENT_CONFIRMED));
  expectError('confirmacion sin procedencia bloqueada', 'COMMERCIAL_MANUAL_CONFIRMATION_INCOMPLETE', () => {
    const item = api.createDraft([], { lead, channel: 'email', target: lead.email }).record;
    api.markReviewed(item); api.markApproved(item); api.markExternalClientOpened(item, 'mailto');
    api.confirmSent(item, { method: 'manual_explicit' });
  });
  expectError('confirmacion de proveedor sin evidencia bloqueada', 'COMMERCIAL_PROVIDER_CONFIRMATION_INCOMPLETE', () => {
    const item = api.createDraft([], { lead, channel: 'email', target: lead.email }).record;
    api.markReviewed(item); api.markApproved(item); api.markExternalClientOpened(item, 'provider');
    api.confirmSent(item, { method: 'provider_verified', provider: 'mock', providerMessageId: 'message-1' });
  });

  const backup = JSON.stringify({ leads: [lead], emailHistory: [...legacy, ...history], campaigns: [{ id: 1 }] });
  const restored = JSON.parse(backup);
  assert.deepEqual(restored.emailHistory, [...legacy, ...history]);
  assert.equal(api.getConfirmedHistory(restored.emailHistory).length, 1);
  pass('backup y restauracion conservan legacy y estados C1');

  expectInvalid('estado obligatorio ausente', 'STATE_MISSING', data => { data.states = data.states.filter(state => state !== 'PENDING_SEND_CONFIRMATION'); delete data.transitions.PENDING_SEND_CONFIRMATION; });
  expectInvalid('destino de transicion inexistente', 'UNKNOWN_TRANSITION_TARGET', data => { data.transitions.DRAFT_CREATED.push('INVENTED'); });
  expectInvalid('apertura confirma envio', 'OPEN_CONFIRMS_SEND', data => { data.transitions.EXTERNAL_CLIENT_OPENED.push('SENT_CONFIRMED'); });
  expectInvalid('conteo incluye borradores', 'COUNTING_STATES', data => { data.sentCountingStates.push('DRAFT_APPROVED'); });
  expectInvalid('limite distinto de cinco', 'SEQUENCE_LIMIT', data => { data.maxConfirmedContactsPerSequence = 6; });
  expectInvalid('version de prospeccion incoherente', 'PROSPECTING_VERSION', data => { data.prospectingProfileVersion = '9.9.9'; });
  expectInvalid('oposicion no bloqueante', 'COMMERCIAL_RESTRICTIONS', data => { data.commercialRestrictions.doNotContactAlwaysBlocks = false; });
  expectInvalid('envio automatico habilitado', 'HUMAN_CONTROL', data => { data.humanControl.automaticSendAllowed = true; });
  expectInvalid('legacy contado como confirmado', 'LEGACY_POLICY', data => { data.legacyCompatibility.countAsConfirmed = true; });

  console.log(`Commercial communications contract tests OK: ${passed}/${passed}`);
} finally {
  for (const dir of tempRoots) fs.rmSync(dir, { recursive: true, force: true });
}
