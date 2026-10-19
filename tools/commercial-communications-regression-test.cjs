#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../modules/commercial-communications.js');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const leadsSource = read('modules/leads.js');
const aiEmailSource = read('modules/ai-email.js');
const routerSource = read('modules/ai-router.js');
const dashboardSource = read('modules/dashboard.js');
const appSource = read('app.html');
let passed = 0;
const pass = name => { passed += 1; console.log(`PASS ${name}`); };

const oldHistory = [];
oldHistory.unshift({ status: 'Enviado', externalAction: 'mailto_opened' });
assert.equal(oldHistory.length, 1);
assert.equal(api.getConfirmedHistory(oldHistory).length, 0);
pass('defecto reproducido: la apertura legacy parecia envio pero no constituye confirmacion');

assert(appSource.includes('modules/commercial-communications.js'));
pass('modulo C0-C1 cargado antes de los flujos comerciales');

for (const [name, source] of [['plantillas', leadsSource], ['IA y WhatsApp', aiEmailSource], ['respuestas', routerSource]]) {
  assert(source.includes('prepareCommercialMessageAndOpen'), `${name}: falta pasarela comercial`);
}
pass('mailto Outlook WhatsApp IA y respuestas usan la pasarela');

assert(!leadsSource.includes("status: 'Enviado'"));
assert(!aiEmailSource.includes("status: 'Enviado'"));
assert(!aiEmailSource.includes("status: 'Enviado (IA)'"));
assert(!/window\.open\(url, '_blank'\);\s*registerWaSent\(\)/.test(aiEmailSource));
pass('ninguna apertura conserva el registro automatico defectuoso');

assert(aiEmailSource.includes('recordCommercialDraft'));
assert(!/copyHtmlEmail[\s\S]{0,2500}lead\.status\s*=\s*'Contactado'/.test(aiEmailSource));
pass('copiar o aprobar borrador no cambia el lead a contactado');

assert(dashboardSource.includes('getConfirmedCommercialHistory'));
assert(dashboardSource.includes('getCampaignSentCount'));
pass('contadores y campanas consumen solo envios confirmados');

const contract = JSON.parse(read('data/commercial-communications.v1.json'));
const priorities = JSON.parse(read('data/prospecting-priorities.v1.json'));
assert.equal(contract.prospectingProfileVersion, priorities.profileVersion);
assert.equal(contract.taxonomyVersion, priorities.taxonomyVersion);
assert.equal(priorities.runtimeEnabled, false);
pass('compatibilidad con contrato de prospeccion sin activar mappings');

assert(!/api[_-]?key|AIza[0-9A-Za-z_-]{20,}/i.test(JSON.stringify(contract)));
assert(!/api[_-]?key|AIza[0-9A-Za-z_-]{20,}/i.test(read('tests/fixtures/commercial-communications/legacy-history.json')));
pass('contrato y fixtures no contienen claves');

console.log(`Commercial communications regressions OK: ${passed}/${passed}`);
