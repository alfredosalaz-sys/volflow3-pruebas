#!/usr/bin/env node
'use strict';
// Independent, offline, read-only regression tests. Does not connect to any API.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(process.argv[2] || process.cwd());
const requireFromProject = createRequire(path.join(root, 'modules', 'commercial-communications.js'));
const api = requireFromProject(path.join(root, 'modules', 'commercial-communications.js'));
const problems = [];
function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (e) { problems.push(name); console.log(`FAIL ${name}: ${e.message}`); }
}
function leadFixture() {return {
  id:'independent-lead-1', company:'Empresa demostracion', address:'Calle Mayor 1, Madrid', email:'oficina@empresa.test',
  commercialContactPolicy:{legalBasisStatus:'allowed_for_purpose',channels:{email:{verified:true,sourceId:'fixture-public-source',target:'oficina@empresa.test'}}}
};}
function confirmedRecord(history, lead, index){
  const {record}=api.createDraft(history,{lead,channel:'email',target:lead.email,subject:`Seguimiento ${index}`,body:`Texto distinto ${index}`,sequenceId:'sequence:test-one',sequenceStep:1});
  api.markReviewed(record); api.markApproved(record); api.markExternalClientOpened(record,'outlook');
  api.confirmSent(record,{method:'manual_explicit',confirmedBy:'user',confirmationId:`confirmed-${index}`,confirmedAt:'2026-10-15T12:00:00.000Z'});
  return record;
}

test('No aceptar un destinatario diferente del verificado para el mismo canal', ()=>{
 const lead=leadFixture();
 const authorized=api.checkCommercialRestrictions({lead,channel:'email',target:'administracion@otra-empresa.test'});
 assert.equal(authorized.ok,false,'Se aprobó un correo distinto al destino verificado');
});

test('No permitir más de cinco envíos confirmados en una única secuencia',()=>{
 const history=[];const lead=leadFixture();
 for(let i=1;i<=5;i++)confirmedRecord(history,lead,i);
 try{confirmedRecord(history,lead,6);}catch(e){/* rejection is acceptable */}
 const sent=api.getConfirmedHistory(history).filter(r=>r.sequenceId==='sequence:test-one');
 assert.ok(sent.length<=5,`Se registraron ${sent.length} envíos confirmados en una secuencia de máximo 5`);
});

test('No contabilizar confirmaciones sin datos de evidencia obligatorios',()=>{
 const items=[
  {commercialState:'SENT_CONFIRMED',sendConfirmation:{}},
  {commercialState:'SENT_CONFIRMED',sendConfirmation:{method:'manual_explicit'}},
  {commercialState:'SENT_CONFIRMED',sendConfirmation:{method:'provider_verified',provider:'mock'}},
  {commercialState:'SENT_CONFIRMED',sendConfirmation:'yes'}
 ];
 const counted=api.getConfirmedHistory(items);
 assert.equal(counted.length,0,`Se contabilizaron ${counted.length} registros sin evidencia válida`);
});
console.log(`\nResultado: ${3-problems.length}/3 PASS; ${problems.length} regresiones pendientes`);
if(problems.length)process.exitCode=1;
