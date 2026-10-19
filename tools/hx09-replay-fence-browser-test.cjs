'use strict';
const fs=require('fs'),http=require('http'),os=require('os'),path=require('path');
const{spawn}=require('child_process');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if(!fs.existsSync(chrome))throw new Error('Chrome no disponible');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).replace(/^\/+/,''),file=path.resolve(root,rel||'app.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':path.extname(file)==='.html'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port,debug=9691,profile=fs.mkdtempSync(path.join(os.tmpdir(),'voltflow-hx09-'));
  const base=`http://127.0.0.1:${port}/tools/hx09-replay-fence-harness.html`;
  const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--remote-allow-origins=*',`--remote-debugging-port=${debug}`,`--user-data-dir=${profile}`,`${base}?role=contender`],{windowsHide:true,stdio:'ignore'});
  try{
    for(let i=0;i<120;i++){try{if((await fetch(`http://127.0.0.1:${debug}/json/version`)).ok)break;}catch{}await wait(100);}
    await fetch(`http://127.0.0.1:${debug}/json/new?${encodeURIComponent(`${base}?role=controller`)}`,{method:'PUT'});
    let controller;
    for(let i=0;i<120;i++){const tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();controller=tabs.find(tab=>tab.url.includes('role=controller'));if(controller)break;await wait(50);}
    if(!controller)throw new Error('No se creo la pestana controladora');
    const ws=new WebSocket(controller.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let id=0;const pending=new Map();ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});ws.send(JSON.stringify({id:requestId,method,params}));});
    await send('Runtime.enable');await send('Emulation.setCPUThrottlingRate',{rate:4});await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*/*']});
    let raw='';for(let i=0;i<400;i++){const response=await send('Runtime.evaluate',{expression:"document.getElementById('result')?.textContent||''",returnByValue:true});raw=response.result.value||'';if(raw.startsWith('RESULT:'))break;await wait(25);}
    ws.close();if(!raw.startsWith('RESULT:'))throw new Error('Harness HX09 sin resultado');
    const result=JSON.parse(Buffer.from(raw.slice(7),'base64').toString('utf8'));if(!result.ok)throw new Error(JSON.stringify(result));
    fs.writeFileSync(path.join(root,'RESULTADOS_NAVEGADOR_HX09_REPLAY_FENCE.json'),JSON.stringify({generatedAt:new Date().toISOString(),browser:'Google Chrome headless',profile:'isolated temporary',tabs:2,cpuThrottling:4,externalNetworkBlocked:true,result},null,2)+'\n');
    console.log('HX09 browser PASS: fence readquirido conserva el evento y el replay posterior lo aplica.');
  }finally{child.kill();server.close();await wait(400);try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{}}
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
