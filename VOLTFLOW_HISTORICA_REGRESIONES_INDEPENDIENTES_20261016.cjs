'use strict';
// Pruebas sinteticas independientes de importacion historica (no acceden al perfil de Chrome).
// Uso: node VOLTFLOW_HISTORICA_REGRESIONES_INDEPENDIENTES_20261016.cjs "RUTA_RAIZ_VOLTFLOW3"
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(process.argv[2] || __dirname);
const secure = require(path.join(root, 'modules', 'secure-backup.js'));
const history = require(path.join(root, 'modules', 'historical-import.js'));
const commercial = require(path.join(root, 'modules', 'commercial-communications.js'));
const pass = 'ONLY-SYNTHETIC-TEST-Password-2026!';
const results = [];
function db(leads = [], mails = [], extras = []) {
  return { database: 'VoltiumCRM', version: 1, stores: {
    leads: { keyPath: '_id', autoIncrement: false, records: leads },
    emailHistory: { keyPath: '_id', autoIncrement: false, records: mails },
    custom: { keyPath: 'id', autoIncrement: false, records: extras },
    kv: { keyPath: 'key', autoIncrement: false, records: [] }
  }};
}
async function payload(localStorage = {}, indexedDB = db(), incorporatedFiles = []) {
  return secure.buildPayload({ localStorage, sessionStorage: {}, indexedDB, incorporatedFiles,
    referencedFiles: [], version: '2.9.4', build: '2026.10.15.0300', origin: 'https://example.invalid',
    consistency: {pendingWritesDrained: true, tabsCoordinated: true} });
}
async function check(id, label, fn) {
  try { await fn();results.push(true);console.log(`${id} PASS ${label}`); }
  catch(e) { results.push(false);console.error(`${id} FAIL ${label}: ${e.message}`); }
}
(async()=>{
  await check('HX01', 'backup cifrado: recupera datos IDB-only, stores auxiliares y archivos incorporados', async()=>{
    const old = await payload({}, db(
      [{_id:'old-lead',id:'old-lead',name:'Empresa historica IDB'}],
      [{_id:'old-mail',id:'old-mail',leadId:'old-lead',subject:'Mensaje antiguo'}],
      [{id:'old-extra',value:'debe persistir'}]
    ), [{name:'presupuesto.pdf',data:'contenido-sintetico'}]);
    const encoded = await secure.encryptPayload(old,pass,{iterations:100000});
    const plan = await history.analyze({},encoded,{secure,commercial,sourcePassword:pass});
    const before = await payload();
    const fp = await secure._internals.sha256Hex(secure._internals.stableStringify(before.data.localStorage));
    let installed=null;
    const mockSecure={...secure,
      restoreBrowserPayload: async (p)=>{installed=p;return {transactionId:'synthetic'};},
      captureBrowserPayload: async ()=>installed };
    const result=await history.commit(plan,pass,{verifiedFromDisk:true,currentFingerprint:fp},{secure:mockSecure,currentPayload:before});
    assert.equal(result.ok,true);
    assert.ok(installed.data.indexedDB.stores.leads.records.some(x=>x.id==='old-lead'),'lead IDB solo perdido');
    assert.ok(installed.data.indexedDB.stores.emailHistory.records.some(x=>x.id==='old-mail'),'email IDB solo perdido');
    assert.ok(installed.data.indexedDB.stores.custom.records.some(x=>x.id==='old-extra'),'store desconocido perdido');
    assert.ok(installed.data.incorporatedFiles.some(x=>x.name==='presupuesto.pdf'),'archivo incorporado perdido');
  });
  await check('HX02','verificacion previa exige igualdad del backup completo, incluido IndexedDB', async()=>{
    const saved=await payload({gordi_leads:'[]'},db([{_id:'first',id:'first'}]));
    const now=await payload({gordi_leads:'[]'},db([{_id:'second',id:'second'}]));
    const file={name:'test.vfbackup',text:async()=>JSON.stringify(await secure.encryptPayload(saved,pass,{iterations:100000}))};
    await assert.rejects(()=>history.verifySafetyBackupFile(file,pass,{secure,currentPayload:now}),/DOES_NOT_MATCH_CURRENT_STATE|BACKUP.*DIFFERENT|MISMATCH/);
  });
  await check('HX03','importar dos veces lead historico sin id no crea duplicado',async()=>{
    const old={type:'voltflow-portable',snapshot:{gordi_leads:JSON.stringify([{name:'Empresa sin ID',address:'Calle Uno 1',email:'info@ejemplo.invalid'}])}};
    const first=await history.analyze({},old,{secure,commercial});
    const second=await history.analyze(first.mergedLocalStorage,old,{secure,commercial});
    assert.equal(first.after.arrays.gordi_leads,1);
    assert.equal(second.after.arrays.gordi_leads,1);
    const ids=JSON.parse(second.mergedLocalStorage.gordi_leads).map(l=>l.id);
    assert.equal(new Set(ids).size,ids.length,'identificadores repetidos');
  });
  await check('HX04','formato reconocido con JSON interno corrupto se rechaza sin convertirlo silenciosamente en cero',async()=>{
    const malformed={type:'voltflow-portable',snapshot:{gordi_leads:'[{'}};
    await assert.rejects(()=>history.analyze({},malformed,{secure,commercial}));
  });
  const passed=results.filter(Boolean).length;
  console.log(`\nAuditoria adicional: ${passed}/${results.length} PASS`);
  if(passed!==results.length) process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
