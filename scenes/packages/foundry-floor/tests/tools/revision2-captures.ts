import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {ff3OutputFor} from './build-ff3';
import {launchHeadless,PACKAGE_ROOT,serveOwned,writeJson} from './owned';
const final=process.argv.includes('--final');
const evidence=process.argv.includes('--final-intake')?'evidence/revision2/final-intake':'evidence/revision2';
const out=resolve(PACKAGE_ROOT,evidence,final?'captures-final':'captures');mkdirSync(out,{recursive:true});
const chrome=await launchHeadless('ff-review2-frames',1280,720),results:unknown[]=[];
try{for(const revised of final?[true]:[false,true]){
 const server=await serveOwned(ff3OutputFor('test',revised));
 try{for(const backend of ['auto','webgl2']){
  const p=await chrome.browser.newPage(),label=revised?'after':'before';
  const invoke=(n:string,...a:unknown[])=>p.evaluate((n,a)=>(window as any).__kilnScene.invoke(n,...a),n,a);
  const frames=(n=30)=>p.evaluate(n=>(window as any).__kilnScene.waitFrames(n),n);
  const click=(t:string)=>p.evaluate(t=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===t)!.click(),t);
  try{
   await p.goto(`${server.url}/?backend=${backend}&tier=balanced&freeze=1`);await p.waitForFunction(()=>document.querySelector<HTMLElement>('#page-status')?.dataset.state==='ready',{timeout:180000});
   await click('Drive the sedan');await p.waitForFunction(()=>(window as any).__kilnScene.invoke('driveState')!==null);await frames();
   await p.evaluate(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Close controls')?.click());
   for(const x of [-3920,-3885,-3855]){
    await invoke('placeCar',x,7.25,0,28);await frames(50);const state=await invoke('driveState');assert(state);
    const image=`${label}-${backend}-avenue-${Math.abs(x)}.png`;await p.screenshot({path:resolve(out,image)});results.push({label,backend,image,car:state,vegetation:(await invoke('campusState')).vegetation});
   }
   if(revised){await click('Enter the fab');await p.waitForFunction(()=>(window as any).__kilnScene.invoke('campusPlace').interiorReady,{timeout:120000});await frames();
    for(const view of ['overview','section']){await invoke('ffSetView',view);await frames(90);const image=`after-${backend}-registered-${view}.png`;await p.screenshot({path:resolve(out,image)});results.push({label,backend,image,camera:await invoke('ffCamera'),resources:await invoke('campusResources')});}
   }
   console.log(JSON.stringify({label,backend,captured:true}));
  }finally{await p.close();}
 }}finally{await server.close();}
}writeJson(resolve(out,'captures.json'),{results,note:'Same 1280x720 chase recipe and car placements. Appearance evidence, not performance. Initial sealed candidate is the before source; repaired vehicle bytes and controls also differ in revision2.'});}finally{await chrome.close();}
