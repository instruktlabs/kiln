// Read-only trace of the sealed first-review runtime; no source or bundle mutation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchHeadless, PACKAGE_ROOT, serveOwned, writeJson } from './owned';
const receipt=JSON.parse(readFileSync(resolve(PACKAGE_ROOT,'evidence/build/ff3/bundle-test.json'),'utf8'));
const input=resolve(PACKAGE_ROOT,'dist/ff3/test'),entry=receipt.chunks.find((c:any)=>c.role==='startup').name;
const source=readFileSync(resolve(input,entry),'utf8'),roots=/fiberRoots:([\w$]+)\.size/.exec(source)?.[1];assert(roots);
const instrumented=source.replace('window.__kilnHarness=',`window.__diagnosticRoots=${roots};window.__kilnHarness=`);
const out=resolve(PACKAGE_ROOT,'evidence/revision2/diagnosis');mkdirSync(out,{recursive:true});
const server=await serveOwned(input),chrome=await launchHeadless('ff-review2-diagnose',1280,720),results:any[]=[];
try{for(const tier of ['balanced']){
  const p=await chrome.browser.newPage();await p.setRequestInterception(true);
  p.on('request',r=>{if(new URL(r.url()).pathname===`/${entry}`)void r.respond({status:200,contentType:'text/javascript',body:instrumented});else void r.continue();});
  await p.goto(`${server.url}/?backend=webgpu&tier=${tier}`,{waitUntil:'load'});
  await p.waitForFunction(()=>document.querySelector<HTMLElement>('#page-status')?.dataset.state==='ready',{timeout:180000});
  await p.waitForFunction(()=>(window as any).__kilnScene.invoke('driveTraffic',1)!==null);
  const initial=await p.evaluate(()=>({state:(window as any).__kilnScene.invoke('campusState'),buttons:[...document.querySelectorAll('button')].map(b=>b.textContent)}));
  await p.evaluate(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Drive the sedan')!.click());
  await p.waitForFunction(()=>(window as any).__kilnScene.invoke('driveState')!==null);
  await p.evaluate(()=>{(window as any).__kilnScene.invoke('placeCar',-3900,7.25,0,24);[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Close controls')?.click();});
  await p.focus('.ks-root');await p.keyboard.down('w');
  const samples=await p.evaluate(async()=>{
    const w=window as any,state=[...w.__diagnosticRoots.values()][0].store.getState(),out:any[]=[];
    const started=performance.now(); for(let i=0;performance.now()-started<20000;i++){
      await new Promise(requestAnimationFrame);if(i%4)continue;
      const plants=state.scene.getObjectByName('campus-planting'),levels:Record<string,number>={};
      plants?.traverse((m:any)=>{const match=/^(.+)-lod([0-2])-/.exec(m.name);if(!match||!m.visible||!m.isInstancedMesh)return;for(let j=0;j<m.count;j++){const a=m.instanceMatrix.array;levels[`${match[1]}:${a[j*16+12].toFixed(2)}:${a[j*16+14].toFixed(2)}`]=Number(match[2]);}});
      out.push({frame:i,at:performance.now(),camera:state.camera.position.toArray(),fov:state.camera.fov,drive:w.__kilnScene.invoke('driveState'),vegetation:w.__kilnScene.invoke('campusState').vegetation,levels});
    }return out;
  });
  await p.keyboard.up('w');await p.screenshot({path:resolve(out,`${tier}-drive-avenue.png`)});
  results.push({tier,initial,samples});await p.close();console.log(JSON.stringify({tier,samples:samples.length}));
}writeJson(resolve(out,'drive-lod-original-avenue.json'),{entry,entrySha256:createHash('sha256').update(source).digest('hex'),results,note:'Actual driving and camera trace. Shared-machine timestamps describe transition order only, not performance.'});
}finally{await chrome.close();await server.close();}
