'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const source=fs.readFileSync(path.join(root,'modules','write-coordinator.js'),'utf8');

function createScenario(){
  const db=new Map();
  let injectAfterFirst=false;
  class Storage{
    getItem(key){
      key=String(key);
      const journalRaw=[...db.entries()].find(([entryKey])=>entryKey.startsWith('__voltflow_coord_journal_'))?.[1];
      const firstAcknowledged=journalRaw&&!JSON.parse(journalRaw).some(item=>item.id==='event-1');
      if(injectAfterFirst&&key==='__voltflow_coord_fence'&&db.get('gordi_hx09_1')==='one'&&firstAcknowledged&&!db.has(key)){
        db.set(key,JSON.stringify({id:'foreign-fence',tabId:'foreign-tab',label:'restore',expiresAt:Date.now()+30000}));
      }
      return db.get(key)??null;
    }
    setItem(key,value){db.set(String(key),String(value));}
    removeItem(key){db.delete(String(key));}
    clear(){db.clear();}
    get length(){return db.size;}
    key(index){return [...db.keys()][index]??null;}
  }
  const storage=new Storage();
  const win={Storage,localStorage:storage,document:{},navigator:{},JSON,Date,Math,Promise,CustomEvent:class{},dispatchEvent(){},addEventListener(){},showToast(){},setTimeout(){return 1;},setInterval(){return 1;},clearInterval(){}};
  win.globalThis=win;
  vm.runInNewContext(source,win,{filename:'write-coordinator.js'});
  return {db,storage,api:win.VoltflowWriteCoordinator,startInjection(){injectAfterFirst=true;},stopInjection(){injectAfterFirst=false;}};
}

const scenario=createScenario();
const {db,storage,api}=scenario;
const journal=api._internals.journalKey;
const entries=[
  {id:'event-1',operation:'set',key:'gordi_hx09_1',value:'one',createdAt:'2026-10-16T10:00:00.000Z'},
  {id:'event-2',operation:'set',key:'gordi_hx09_2',value:'two',createdAt:'2026-10-16T10:00:01.000Z'},
  {id:'event-3',operation:'remove',key:'gordi_hx09_remove',value:null,createdAt:'2026-10-16T10:00:02.000Z'}
];
storage.setItem('gordi_hx09_remove','old');
db.set(journal,JSON.stringify(entries));
db.set(api.JOURNAL_REGISTRY_KEY,JSON.stringify([journal]));
scenario.startInjection();

const firstReplay=api._internals.replayQueued();
assert.equal(firstReplay,1,'solo el primer evento debe quedar aplicado antes del fence');
assert.equal(storage.getItem('gordi_hx09_1'),'one');
assert.equal(storage.getItem('gordi_hx09_2'),null);
const pending=JSON.parse(storage.getItem(journal));
assert.deepEqual(pending.map(item=>item.id),['event-2','event-3'],'solo se reconocen eventos realmente aplicados');
console.log('PASS replay parcial conserva duraderamente cada evento no aplicado');

scenario.stopInjection();
storage.removeItem(api.FENCE_KEY);
const secondReplay=api._internals.replayQueued();
assert.equal(secondReplay,2);
assert.equal(storage.getItem('gordi_hx09_2'),'two');
assert.equal(storage.getItem('gordi_hx09_remove'),null);
assert.equal(storage.getItem(journal),null);
assert.equal(api._internals.journalKeys().length,0);
console.log('PASS replay posterior aplica y reconoce exclusivamente los eventos pendientes');
console.log('Write coordinator HX09 extended: 2/2 PASS');
