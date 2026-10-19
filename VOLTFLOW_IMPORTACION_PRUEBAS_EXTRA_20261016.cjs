'use strict';
// Auditoría independiente sintética; nunca usa Chrome real ni realiza operaciones de red.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = path.resolve(process.argv[2] || process.cwd());
const imp = require(path.join(base, 'modules/historical-import.js'));
const results=[];
const lead = id => ({id, name:id, company:id});
const collection = ids => ({gordi_leads:JSON.stringify(ids.map(lead))});
async function check(id,name,fn){try{await fn();results.push({id,pass:true});console.log(`${id} PASS: ${name}`);}catch(e){results.push({id,pass:false});console.log(`${id} FAIL: ${name}\n  ${e.message}`);}}
async function main(){
 await check('HX05','La fusión no pierde un lead creado después de la vista previa',async()=>{
  const atPreview=collection(['existente']);
  const atSafetyBackup=collection(['existente','creado_tras_vista_previa']);
  let live={app:{version:'2.9.4',build:'2026.10.15.0300',origin:'https://example.invalid'},data:{localStorage:atSafetyBackup,sessionStorage:{},indexedDB:null,incorporatedFiles:[],referencedFiles:[]}};
  const fakeSecure={
   captureBrowserPayload:async()=>structuredClone(live),
   buildPayload:async inp=>({app:{version:inp.version,build:inp.build,origin:inp.origin},data:{localStorage:inp.localStorage,sessionStorage:inp.sessionStorage,indexedDB:inp.indexedDB,incorporatedFiles:inp.incorporatedFiles,referencedFiles:inp.referencedFiles}}),
   restoreBrowserPayload:async payload=>{live=structuredClone(payload);return {transactionId:'synthetic-id'};}
  };
  const plan=await imp.analyze(atPreview,{leads:[lead('historico')]},{secure:fakeSecure});
  const proof={verifiedFromDisk:true,currentFingerprint:await imp._internals.currentFingerprint(live,fakeSecure)};
  const outcome=await imp.commit(plan,'PRUEBA_NO_ES_UNA_CLAVE_REAL',proof,{secure:fakeSecure});
  const after=JSON.parse(live.data.localStorage.gordi_leads).map(v=>v.id);
  // Es admisible rechazar el plan como obsoleto, o reconstruirlo. NO aceptar y perder un dato nuevo.
  assert.ok(!outcome.ok || after.includes('creado_tras_vista_previa'), `commit indicó éxito pero perdió el lead creado después de la vista previa: ${JSON.stringify(after)}`);
 });
 await check('HX06','La versión importada no llega sin escapar a innerHTML',async()=>{
  const injected='<img src=x onerror="alert(1)">';
  const plan=await imp.analyze({}, {type:'voltflow-portable',version:injected,snapshot:{gordi_leads:'[]'}},{});
  const ui=fs.readFileSync(path.join(base,'modules/ui.js'),'utf8');
  const rawSink=/\$\{report\.sourceVersion\s*\|\|\s*['"]desconocida['"]\s*\}/.test(ui) && /modal\.innerHTML\s*=/.test(ui);
  assert.ok(!rawSink || !plan.sourceVersion.includes('<'), 'sourceVersion del backup contiene HTML y se inserta sin escapar en modal.innerHTML (riesgo de XSS)');
 });
 console.log(`Auditoría adicional: ${results.filter(x=>x.pass).length}/${results.length} PASS`);
 if(results.some(x=>!x.pass))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
