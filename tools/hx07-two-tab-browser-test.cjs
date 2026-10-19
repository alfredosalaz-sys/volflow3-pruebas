'use strict';
const fs=require('fs'),http=require('http'),os=require('os'),path=require('path');
const {spawn}=require('child_process');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if(!fs.existsSync(chrome))throw new Error('Chrome no disponible');
const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\/+/, '');const file=path.resolve(root,rel||'app.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':path.extname(file)==='.html'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const webPort=server.address().port,debugPort=9677,profile=fs.mkdtempSync(path.join(os.tmpdir(),'voltflow-hx07-two-tab-'));
  const base=`http://127.0.0.1:${webPort}/tools/hx07-two-tab-harness.html`;
  const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--remote-allow-origins=*',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,`${base}?role=writer`],{windowsHide:true,stdio:'ignore'});
  try{
    for(let i=0;i<120;i++){try{const response=await fetch(`http://127.0.0.1:${debugPort}/json/version`);if(response.ok)break;}catch{}await wait(100);}
    const created=await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`${base}?role=importer`)}`,{method:'PUT'});
    if(!created.ok)throw new Error(`No se pudo crear la segunda pestana: ${created.status}`);
    let importer;
    for(let i=0;i<120;i++){try{const tabs=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();importer=tabs.find(tab=>tab.type==='page'&&tab.url.includes('role=importer'));if(importer)break;}catch{}await wait(100);}
    if(!importer)throw new Error('No se encontro la pestana importadora');
    const ws=new WebSocket(importer.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}};const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>reject(new Error('CDP timeout')),30000);pending.set(n,{resolve:v=>{clearTimeout(t);resolve(v);},reject});ws.send(JSON.stringify({id:n,method,params}));});
    await send('Runtime.enable');await send('Emulation.setCPUThrottlingRate',{rate:4});await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*/*']});
    let raw='';for(let i=0;i<600;i++){const r=await send('Runtime.evaluate',{expression:"document.getElementById('result')?.textContent||''",returnByValue:true});raw=r.result.value||'';if(raw.startsWith('RESULT:'))break;await wait(100);}ws.close();if(!raw.startsWith('RESULT:'))throw new Error('Harness HX07 sin resultado');
    const result=JSON.parse(Buffer.from(raw.slice(7),'base64').toString('utf8'));if(!result.ok)throw new Error(JSON.stringify(result));
    fs.writeFileSync(path.join(root,'RESULTADOS_NAVEGADOR_HX07_DOS_PESTANAS.json'),JSON.stringify({generatedAt:new Date().toISOString(),browser:'Google Chrome headless',profiles:'isolated temporary',tabs:2,cpuThrottling:4,externalNetworkBlocked:true,result},null,2)+'\n');
    console.log(`HX07 browser PASS: dos pestanas, autosave concurrente, localStorage e IndexedDB preservados (${result.localIds.join(', ')}).`);
  }finally{child.kill();server.close();await wait(400);try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{}}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
