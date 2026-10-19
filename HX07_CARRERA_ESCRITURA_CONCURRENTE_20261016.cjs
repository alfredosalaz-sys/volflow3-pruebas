'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const historical = require(path.join(root, 'modules/historical-import.js'));
const secure = require(path.join(root, 'modules/secure-backup.js'));
const clone = structuredClone;
const lead = (id) => ({id,name:`Empresa ${id}`,address:`Calle ${id}, Madrid`,city:'Madrid'});
(async()=>{
  const ls = {gordi_leads:JSON.stringify([lead('original')])};
  let live = await secure.buildPayload({localStorage:ls, sessionStorage:{}, indexedDB:null,incorporatedFiles:[],referencedFiles:[],version:'2.9.4',build:'test',origin:'https://example.invalid'});
  const source = {type:'voltflow-portable',snapshot:{gordi_leads:JSON.stringify([lead('historic')])}};
  let injected = false;
  const wrapper = Object.assign({},secure,{
    captureBrowserPayload: async()=>clone(live),
    buildPayload: async(input)=>{
      if(!injected){
        injected = true;
        // Otra pestaña guarda un lead después de la última comprobación de estado, antes de restaurar.
        live.data.localStorage.gordi_leads = JSON.stringify([lead('original'),lead('created-in-another-tab')]);
      }
      return secure.buildPayload(input);
    },
    restoreBrowserPayload: async (payload)=>{live=clone(payload);return {transactionId:'synthetic-restore'};}
  });
  const plan = await historical.analyze(ls,source,{secure:wrapper,currentPayload:clone(live)});
  const proof={verifiedFromDisk:true,currentFingerprint:await historical._internals.currentFingerprint(live,wrapper)};
  const result=await historical.commit(plan,'TEST_PASSWORD_ONLY',proof,{secure:wrapper});
  const ids=JSON.parse(live.data.localStorage.gordi_leads).map(x=>x.id);
  console.log({result,ids,injected});
  assert.equal(injected,true);
  // Criterio requerido: o se rechaza por cambio concurrente o conserva también el lead nuevo.
  assert.ok(result.ok===false || ids.includes('created-in-another-tab'), 'LOSS: commit succeeded but overwritten lead added by another tab during commit');
})().catch(e=>{console.error(e.message);process.exitCode=1});
