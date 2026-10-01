// Actual before/after road-marking contrast and opaque occlusion on both graphics backends.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { launchHeadless, PACKAGE_ROOT, serveOwned, unexpectedMessages, writeJson, type ConsoleRecord } from './owned';
const before=process.argv.includes('--before'),label=before?'before':'after';
const input=resolve(PACKAGE_ROOT,before?'.tmp/markings-before-20260930/test':'dist/ff3/test');
const receipt=JSON.parse(readFileSync(resolve(PACKAGE_ROOT,`evidence/build/${before?'ff3-before-marking-filter':'ff3'}/bundle-test.json`),'utf8'));
const entry=receipt.chunks.find((c:any)=>c.role==='startup').name,source=readFileSync(resolve(input,entry),'utf8');
const roots=/fiberRoots:([\w$]+)\.size/.exec(source)?.[1];assert(roots);
// Expose only the existing root map in this disposable test response. Canonical files stay unchanged.
const instrumented=source.replace('window.__kilnHarness=',`window.__markingRoots=${roots};window.__kilnHarness=`);assert.notEqual(source,instrumented);
const out=resolve(PACKAGE_ROOT,'evidence/captures/ff3-road-filter',label);mkdirSync(out,{recursive:true});
const server=await serveOwned(input),chrome=await launchHeadless(`ff3-markings-${label}`,1280,720),results:any[]=[];
try{for(const backend of ['webgpu','webgl2']){
  const p=await chrome.browser.newPage(),messages:ConsoleRecord[]=[];
  p.on('console',m=>messages.push({kind:'console',type:m.type(),text:m.text()}));p.on('pageerror',e=>messages.push({kind:'pageerror',text:String(e)}));
  await p.setRequestInterception(true);p.on('request',r=>{if(new URL(r.url()).pathname===`/${entry}`)void r.respond({status:200,contentType:'text/javascript',body:instrumented});else void r.continue();});
  await p.goto(`${server.url}/?capture=1&freeze=1&tier=high&backend=${backend}`,{waitUntil:'load'});
  await p.waitForFunction(()=>document.querySelector<HTMLElement>('#page-status')?.dataset.state==='ready',{timeout:180000});
  await p.waitForFunction(()=>(window as any).__kilnScene.invoke('driveTraffic',1)!==null);
  assert.equal(await p.evaluate(()=>(window as any).__kilnHarness.snapshot().backend.backend),backend);
  await p.evaluate(()=>{(window as any).__markingState=[...(window as any).__markingRoots.values()][0].store.getState();});
  const invoke=(n:string,...a:any[])=>p.evaluate((n,a)=>(window as any).__kilnScene.invoke(n,...a),n,a);
  const frames=()=>p.evaluate(()=>(window as any).__kilnScene.waitFrames(18));
  const shots:any[]=[];
  const shot=async(name:string)=>{await frames();const bytes=await p.screenshot({type:'png'});writeFileSync(resolve(out,`${backend}-${name}.png`),bytes);shots.push({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),camera:await invoke('campusState')});return PNG.sync.read(Buffer.from(bytes));};
  for(const view of ['roundabout','canopy','split','bridge']){await invoke('campusView',view);await shot(view);}
  // Real drive mode, same paused traffic and car placements before/after.
  await invoke('campusView','split');
  await p.evaluate(()=>[...document.querySelectorAll<HTMLButtonElement>('.ks-hud button')].find(b=>b.textContent==='Drive the sedan')?.click());
  await p.waitForFunction(()=>(window as any).__kilnScene.invoke('driveState')!==null);
  const occlusion:any[]=[];
  for(const pose of [{name:'drive-split',u:-2800,v:7.25,heading:0},{name:'drive-roundabout',u:0,v:92.5,heading:0},{name:'drive-end',u:-4100,v:7.25,heading:0}]){
    await invoke('placeCar',pose.u,pose.v,pose.heading,0);await invoke('setDriveInput',{brake:true});
    const visible=await shot(pose.name);
    const samples=await p.evaluate(()=>{
      const s=(window as any).__markingState,structures=s.scene.getObjectByName('campus-structures'),points:number[][]=[];
      const displayed=(o:any):boolean=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
      for(let y=180;y<520;y+=20)for(let x=40;x<1240;x+=30){s.raycaster.setFromCamera({x:x/640-1,y:1-y/360},s.camera);const hits=s.raycaster.intersectObject(structures,true);if(hits.some((h:any)=>displayed(h.object)))points.push([x,y]);}
      const car=(window as any).__kilnScene.invoke('driveState'),roof=s.camera.position.clone().set(car.centre[0],1.3,car.centre[1]).project(s.camera);
      return {buildings:points,car:[Math.round((roof.x+1)*640),Math.round((1-roof.y)*360)]};
    });
    await p.evaluate(()=>{(window as any).__markingState.scene.getObjectByName('ground-markings').visible=false;});await frames();
    const hidden=PNG.sync.read(Buffer.from(await p.screenshot({type:'png'})));
    await p.evaluate(()=>{(window as any).__markingState.scene.getObjectByName('ground-markings').visible=true;});
    let compared=0;for(const [x,y]of [...samples.buildings,samples.car]){if(x!<0||x!>=1280||y!<0||y!>=720)continue;const i=(y!*1280+x!)*4;assert.deepEqual([...visible.data.subarray(i,i+4)],[...hidden.data.subarray(i,i+4)],`${backend} ${pose.name}: paint cannot overwrite opaque pixel ${x},${y}`);compared++;}
    assert(compared>10);occlusion.push({view:pose.name,comparedOpaquePixels:compared,carPixel:samples.car});
  }
  assert.deepEqual(unexpectedMessages(messages),[]);results.push({backend,shots,occlusion,unexpected:[]});await p.close();console.log(JSON.stringify({backend,label,ok:true}));
}
writeJson(resolve(out,'receipt.json'),{ok:true,label,packSha256:receipt.packSha256,entry,entrySha256:createHash('sha256').update(source).digest('hex'),results});
}finally{await chrome.close();await server.close();}
