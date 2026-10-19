'use strict';
// HX08: prueba independiente sobre modules/write-coordinator.js REAL.
// Simula dos contextos de pestaña con Storage compartido, sin datos ni claves reales.
// Esperado: un guardado no debe devolver aparente éxito si puede perderse al cerrar pestaña.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.argv[2] || __dirname);
const source = fs.readFileSync(path.join(root,'modules/write-coordinator.js'),'utf8');
const backing = new Map(), subscribers = new Set();
function newTab(){
  const channels=[];
  class Storage {
    getItem(k){return backing.has(String(k))?backing.get(String(k)):null;}
    setItem(k,v){backing.set(String(k),String(v));}
    removeItem(k){backing.delete(String(k));}
    clear(){backing.clear();}
  }
  class BroadcastChannel {
    constructor(){this.onmessage=null;subscribers.add(this);channels.push(this);}
    postMessage(data){for(const sub of subscribers){if(sub!==this)sub.onmessage?.({data});}}
    close(){subscribers.delete(this);}
  }
  const storage = new Storage();
  let seq=0;
  const fakeIntervals=new Map();
  const win={Storage,localStorage:storage,BroadcastChannel,document:{},navigator:{},Date,Math,Promise,JSON,console,
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    dispatchEvent(){},addEventListener(){},showToast(){},setTimeout,
    setInterval(fn,ms){const id=++seq;fakeIntervals.set(id,{fn,ms});return id;},
    clearInterval(id){fakeIntervals.delete(id);}};
  win.globalThis=win;
  vm.runInNewContext(source,win,{filename:'modules/write-coordinator.js'});
  return {coordinator:win.VoltflowWriteCoordinator,read:k=>storage.getItem(k),write:(k,v)=>storage.setItem(k,v),
    close(){for(const c of channels)c.close();}};
}
async function main(){
  // Control: si ambas pestañas sobreviven, las escrituras pendientes se reproducen.
  let importer=newTab(),writer=newTab();
  let lock=await importer.coordinator.acquireExclusive('hx08-control');
  writer.write('gordi_hx08_control','control-lead');
  assert.equal(writer.read('gordi_hx08_control'),null);
  importer.coordinator.release(lock);
  assert.equal(importer.read('gordi_hx08_control'),'control-lead');
  console.log('Control PASS: con pestaña abierta, la cola se reproduce tras liberar el cerco.');
  importer.close();writer.close();
  // Escenario de pérdida: se guarda en otra pestaña, pero el usuario la cierra mientras se restaura.
  importer=newTab();writer=newTab();
  lock=await importer.coordinator.acquireExclusive('hx08-volatile-queue');
  let explicitlyRejected=false;
  try{writer.write('gordi_hx08_new_lead','lead-created-during-import');}catch(err){explicitlyRejected=true;}
  if (!explicitlyRejected){
    const queued=writer.coordinator._internals.queued.length;
    assert.ok(queued>0,'La operación debe estar explícitamente rechazado o registrada.');
    assert.equal(writer.read('gordi_hx08_new_lead'),null);
    writer.close(); // La cola en memoria desaparece al cerrar pestaña; se desuscribe del canal.
    importer.coordinator.release(lock);
    const after=importer.read('gordi_hx08_new_lead');
    assert.equal(after,'lead-created-during-import',
      'HX08 FALLO: setItem aparentó éxito; el dato se perdió al cerrar la pestaña antes del replay.');
  } else {
    importer.coordinator.release(lock);
    console.log('Escritura bloqueada explícitamente; la UI deberá mostrar el error y pedir reintento.');
  }
  console.log('HX08 PASS: no hay pérdida silenciosa al cerrar otra pestaña.');
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
