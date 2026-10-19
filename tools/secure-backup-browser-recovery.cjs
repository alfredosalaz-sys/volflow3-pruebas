'use strict';
const fs=require('fs'),http=require('http'),os=require('os'),path=require('path');
const {spawn}=require('child_process');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir=path.join(root,'tests','artifacts','secure-backup');
const artifact=path.join(artifactDir,'browser-synthetic.vfbackup');
let debugPort=9460;
if(!fs.existsSync(chrome)) throw new Error('Chrome no está disponible');
fs.mkdirSync(artifactDir,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.vfbackup':'application/json'};
const server=http.createServer((request,response)=>{
  const relative=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname).replace(/^\/+/, '');
  const file=path.resolve(root,relative||'app.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){response.writeHead(404);response.end('Not found');return;}
  response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(response);
});
function decodeResult(stdout){const match=stdout.match(/RESULT:([A-Za-z0-9+/=]+)/);if(!match)throw new Error('Chrome no devolvió resultado');return JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));}
async function runChrome(profile,url){
  const port=debugPort++;
  const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--remote-allow-origins=*','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,url],{windowsHide:true,stdio:'ignore'});
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let target=null;
  try{
    for(let i=0;i<100;i++){
      try{const list=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();target=list.find(item=>item.type==='page'&&item.url.includes('secure-backup-browser-harness.html'));if(target)break;}catch{}
      await wait(100);
    }
    if(!target)throw new Error('No se encontró el target de prueba de Chrome');
    const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let id=0;const pending=new Map();
    ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const commandId=++id;const timer=setTimeout(()=>{pending.delete(commandId);reject(new Error(`CDP timeout: ${method}`));},30000);pending.set(commandId,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id:commandId,method,params}));});
    await send('Runtime.enable');await send('Network.enable');await send('Emulation.setCPUThrottlingRate',{rate:4});
    await send('Network.setBlockedURLs',{urls:['https://api.github.com/*','https://api.jsonbin.io/*','https://generativelanguage.googleapis.com/*','https://api.groq.com/*','https://openrouter.ai/*','https://gmail.googleapis.com/*','https://sheets.googleapis.com/*']});
    let raw='';
    for(let i=0;i<600;i++){
      const evaluated=await send('Runtime.evaluate',{expression:"document.getElementById('result')?.textContent||''",returnByValue:true});raw=evaluated.result.value||'';
      if(raw.startsWith('RESULT:'))break;await wait(100);
    }
    ws.close();if(!raw.startsWith('RESULT:'))throw new Error('La prueba de navegador no finalizó');
    return decodeResult(raw);
  }finally{
    child.kill();await Promise.race([new Promise(resolve=>child.once('exit',resolve)),wait(2000)]);
  }
}
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const profileA=fs.mkdtempSync(path.join(os.tmpdir(),'voltflow-profile-source-'));
  const profileB=fs.mkdtempSync(path.join(os.tmpdir(),'voltflow-profile-clean-'));
  const evidence={generatedAt:new Date().toISOString(),browser:'Google Chrome headless',profiles:'isolated temporary',runs:[]};
  try{
    const base=`http://127.0.0.1:${port}/tools/secure-backup-browser-harness.html`;
    console.log('Creando copia en perfil fuente aislado...');
    const created=await runChrome(profileA,`${base}?phase=create`);if(!created.ok||!created.container)throw new Error(created.error||'No se creó la copia');
    fs.writeFileSync(artifact,JSON.stringify(created.container));evidence.runs.push({phase:'create',durationMs:created.ms,diskBytes:fs.statSync(artifact).size});
    console.log('Restaurando archivo en perfil Chrome limpio...');
    const restored=await runChrome(profileB,`${base}?phase=restore`);if(!restored.ok)throw new Error(restored.error||`Restauración no equivalente: ${JSON.stringify(restored)}`);
    evidence.runs.push({...restored,secretPresence:restored.secretPresence.map(Boolean)});
    console.log('Simulando corte entre stores y verificando rollback...');
    const rollback=await runChrome(profileB,`${base}?phase=rollback`);if(!rollback.ok)throw new Error(`Rollback no recuperable: ${JSON.stringify(rollback)}`);evidence.runs.push(rollback);
    for(let i=1;i<=3;i++){
      console.log(`Verificando reinicio ${i}/3...`);const verification=await runChrome(profileB,`${base}?phase=verify&restart=${i}`);
      if(!verification.ok)throw new Error(`Persistencia falló en reinicio ${i}`);verification.secretPresent=verification.secretPresent?'[PRESENT_REDACTED]':false;evidence.runs.push({...verification,restart:i});
    }
    evidence.pass=true;evidence.notes=['Archivo escrito en disco y leído por un perfil Chrome distinto mediante HTTP local.','Perfil habitual intacto; ninguna petición a servicios externos.'];
    fs.writeFileSync(path.join(root,'RESULTADOS_NAVEGADOR_RESTAURACION.json'),JSON.stringify(evidence,null,2)+'\n');
    console.log(`Chrome recovery PASS: ${evidence.runs.length} etapas, ${fs.statSync(artifact).size} bytes.`);
  }finally{
    server.close();
    for(const profile of [profileA,profileB]){const resolved=path.resolve(profile);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&/^voltflow-profile-(source|clean)-/.test(path.basename(resolved))){try{fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:250});}catch(error){console.warn(`Perfil temporal pendiente de limpieza: ${path.basename(resolved)} (${error.code})`);}}}
  }
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
