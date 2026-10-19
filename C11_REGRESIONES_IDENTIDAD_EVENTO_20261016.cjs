#!/usr/bin/env node
'use strict';
// Auditoria independiente C1.1, sin red y sin modificar la aplicacion.
const path = require('path');
const root = path.resolve(process.argv[2] || process.cwd());
const api = require(path.join(root, 'modules/commercial-communications.js'));
let failed = 0;
function check(name, exercise) {
  try { exercise(); console.log('PASS', name); }
  catch (e) { failed += 1; console.error('FAIL', name, '-', e.message); }
}
function lead() { return { id: 'original-lead-1', company: 'Administracion Fincas Prueba', address: 'Calle Mayor 15, Madrid', email: 'info@prueba.example' }; }
function sent(history, l, index, extra = {}) {
  const {record} = api.createDraft(history, {lead:l, channel:'email',target:l.email,purpose:'b2b_prospecting',subject:`Asunto ${index}`,body:`Contenido ${index}`,sequenceId:extra.sequenceId || `sequence-random-${index}`});
  api.markReviewed(record); api.markApproved(record); api.markExternalClientOpened(record,'mailto');
  return api.confirmSent(record,{method:'manual_explicit',confirmedBy:'user',confirmationId:extra.confirmationId || `send-event-${index}`,confirmedAt:`2026-10-16T10:${String(index).padStart(2,'0')}:00Z`},{history});
}
function five(history, l) { for (let i=1;i<=5;i++)sent(history,l,i); }
function mustBlock(fn) { let blocked=false;try {fn()}catch(e){if(String(e.message).includes('COMMERCIAL_SEQUENCE_LIMIT_REACHED'))blocked=true;else throw e}if(!blocked) throw new Error('Se admitio un sexto envio confirmado'); }
check('E1 — Enriquecer la web de la misma empresa no reinicia la secuencia',()=>{
  const original=lead(),hist=[];five(hist,original);
  mustBlock(()=>sent(hist,{...original,website:'https://administracion-prueba.example'},6));
});
check('E2 — Importar cinco confirmados con sequenceKey antiguo no permite sexto envio',()=>{
  const original=lead(),hist=[];five(hist,original);
  const imported=hist.map(x=>({...x,sequenceKey:'sequence:identificador-importado-no-canonico'}));
  mustBlock(()=>sent(imported,original,6));
});
check('E3 — Un mismo confirmationId no puede contabilizar dos eventos distintos',()=>{
  const original=lead(),hist=[];
  sent(hist,original,1,{confirmationId:'evento-externo-unico'});
  let duplicated=false;
  try {sent(hist,original,2,{confirmationId:'evento-externo-unico'})} catch(e) {duplicated=true;}
  if(api.getConfirmedHistory(hist).length!==1 || !duplicated) throw new Error('La misma evidencia confirmo dos registros distintos');
});
console.log(`Auditoria ampliada C1.1: ${3-failed}/3 PASS`);
if(failed)process.exitCode=1;
