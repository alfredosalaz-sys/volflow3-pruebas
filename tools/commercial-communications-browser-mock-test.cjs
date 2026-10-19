#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'modules/commercial-communications.js'), 'utf8');
const timers = [];
const confirmations = [];
const persisted = [];
const lead = {
  id: 'lead-browser-1',
  company: 'Arquitectura Prueba',
  address: 'Madrid',
  email: 'contacto@example.test',
  phone: '+34910000000',
  segment: 'Arquitectos',
  status: 'Pendiente',
  date: '2026-10-01T00:00:00.000Z',
  commercialContactPolicy: {
    legalBasisStatus: 'allowed_for_purpose',
    channels: {
      email: { verified: true, sourceId: 'fixture-web' },
      whatsapp: { verified: true, sourceId: 'fixture-contact' },
    },
  },
};

const context = {
  document: {},
  emailHistory: [],
  leads: [lead],
  confirm: () => confirmations.shift() === true,
  prompt: () => '',
  setTimeout: callback => { timers.push(callback); return timers.length; },
  persistEmailHistory: async label => { persisted.push(label); },
  saveLeads: async () => { persisted.push('leads'); },
  showToast: () => {},
  addActivityLog: () => {},
  renderAll: () => {},
  renderTracking: () => {},
  updateStreakData: () => {},
  console,
  Date,
  Math,
  Object,
  Array,
  String,
  Number,
  Set,
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'commercial-communications.js' });
for (const [channel, target, sourceId] of [
  ['email', lead.email, 'fixture-web'],
  ['whatsapp', lead.phone, 'fixture-contact'],
]) {
  const identity = context.CommercialCommunications.deriveIdentities({ lead, channel, target, purpose: 'b2b_prospecting' });
  Object.assign(lead.commercialContactPolicy.channels[channel], {
    target: context.CommercialCommunications.normalizeTarget(channel, target),
    contactId: identity.contactId,
    purpose: 'b2b_prospecting',
    sourceId,
  });
}

(async () => {
  confirmations.push(true, true);
  let opened = 0;
  const outlook = await context.prepareCommercialMessageAndOpen({
    lead,
    channel: 'email',
    target: lead.email,
    subject: 'Prueba Outlook',
    body: 'Contenido',
    externalClient: 'mailto',
    openExternal: () => { opened += 1; },
  });
  assert.equal(opened, 1);
  assert.equal(outlook.record.commercialState, 'PENDING_SEND_CONFIRMATION');
  assert.equal(context.getConfirmedCommercialHistory().length, 0);
  assert.equal(lead.status, 'Pendiente');
  console.log('PASS abrir Outlook no registra envio ni cambia el lead');

  confirmations.push(false);
  timers.shift()();
  assert.equal(outlook.record.commercialState, 'PENDING_SEND_CONFIRMATION');
  assert.equal(context.getConfirmedCommercialHistory().length, 0);
  console.log('PASS cerrar o no confirmar Outlook mantiene pendiente');

  await context.confirmCommercialSend(outlook.record.id, { method: 'manual_explicit', confirmationId: 'manual-browser-1' });
  assert.equal(context.getConfirmedCommercialHistory().length, 1);
  assert.equal(lead.status, 'Contactado');
  console.log('PASS confirmacion manual explicita registra un envio');
  await context.confirmCommercialSend(outlook.record.id, { method: 'manual_explicit', confirmationId: 'manual-browser-1' });
  assert.equal(context.getConfirmedCommercialHistory().length, 1);
  console.log('PASS segunda confirmacion es idempotente');

  confirmations.push(true, true);
  const whatsapp = await context.prepareCommercialMessageAndOpen({
    lead,
    channel: 'whatsapp',
    target: lead.phone,
    subject: 'WhatsApp comercial',
    body: 'Mensaje',
    externalClient: 'whatsapp_web',
    openExternal: () => { opened += 1; },
  });
  assert.equal(whatsapp.record.commercialState, 'PENDING_SEND_CONFIRMATION');
  assert.equal(context.getConfirmedCommercialHistory().length, 1);
  console.log('PASS abrir WhatsApp no incrementa contactos confirmados');

  assert(persisted.includes('borrador comercial'));
  assert(persisted.includes('cliente externo abierto'));
  assert(persisted.includes('envio confirmado'));
  console.log('PASS cada estado critico se persiste antes o despues de la accion correspondiente');
  console.log('Commercial communications browser mock OK: 6/6');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
