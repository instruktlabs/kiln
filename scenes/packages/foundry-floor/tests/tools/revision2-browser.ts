import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Page} from 'puppeteer-core';
import {ff3OutputFor} from './build-ff3';
import {launchHeadless,PACKAGE_ROOT,serveOwned,unexpectedMessages,writeJson,type ConsoleRecord} from './owned';
const evidence=process.argv.includes('--final-intake')?'evidence/revision2/final-intake':'evidence/revision2';
const out=resolve(PACKAGE_ROOT,evidence,process.argv.includes('--final')?'browser-final':'browser');mkdirSync(out,{recursive:true});
const server=await serveOwned(ff3OutputFor('test',true)),chrome=await launchHeadless('ff-review2-controls',1280,900);
const bundle=JSON.parse(readFileSync(resolve(PACKAGE_ROOT,evidence,'build/bundle-test.json'),'utf8'));
const invoke=(p:Page,n:string,...a:unknown[])=>p.evaluate((n,a)=>(window as any).__kilnScene.invoke(n,...a),n,a);
const frames=(p:Page,n=15)=>p.evaluate(n=>(window as any).__kilnScene.waitFrames(n),n);
async function button(p:Page,text:string){const h=await p.evaluateHandle(t=>[...document.querySelectorAll<HTMLButtonElement>('.ks-hud button')].find(b=>b.textContent?.trim()===t),text);assert(h.asElement(),text);await h.asElement()!.click();await h.dispose();}
async function ready(p:Page){await p.waitForFunction(()=>['ready','error'].includes(document.querySelector<HTMLElement>('#page-status')?.dataset.state??''),{timeout:180000});assert.equal(await p.$eval('#page-status',e=>(e as HTMLElement).dataset.state),'ready',await p.$eval('#page-status',e=>e.textContent));}
async function enter(p:Page){await button(p,'Enter the fab');await p.waitForFunction(()=>(window as any).__kilnScene.invoke('campusPlace').interiorReady,{timeout:120000});await frames(p,20);}
const results:unknown[]=[];
try{for(const backend of ['auto','webgl2'])for(const mobile of [false,true]){
 const name=`${backend}-${mobile?'mobile':'desktop'}`,p=await chrome.browser.newPage(),messages:ConsoleRecord[]=[],requests:string[]=[];
 p.on('console',m=>messages.push({kind:'console',type:m.type(),text:m.text()}));p.on('pageerror',e=>messages.push({kind:'pageerror',text:String(e)}));p.on('request',r=>requests.push(new URL(r.url()).pathname));
 await p.setViewport(mobile?{width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true}:{width:1280,height:900,deviceScaleFactor:1});
 try{
  await p.goto(`${server.url}/?backend=${backend}&tier=balanced`,{waitUntil:'load'});await ready(p);await frames(p);
  const before=await invoke(p,'campusResources');assert.equal(before.models.length,31);assert(before.exterior&&!before.context);
  assert(!requests.some(path=>/\/models\/[^/]+\.glb$/.test(path)),'zero interior GLB requests before entry');
  assert(bundle.chunks.filter((c:any)=>c.role==='interior').every((c:any)=>!requests.some(p=>p.endsWith(c.name))));
  await p.screenshot({path:resolve(out,`${name}-campus.png`)});
  await button(p,'Drive the sedan');await p.waitForFunction(()=>(window as any).__kilnScene.invoke('driveState')!==null);await frames(p);
  await p.evaluate(()=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Close controls')?.click());
  await invoke(p,'placeCar',-3700,7.25,0,28);await frames(p,30);
  if(mobile){
   const points=await p.evaluate(()=>{const find=(t:string)=>{const e=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===t)!,b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};};const r=document.querySelector('.ks-joystick')!.getBoundingClientRect();return{throttle:find('Throttle'),boost:find('Boost'),reverse:find('Brake / reverse'),steer:{x:r.x+r.width*.68,y:r.y+r.height/2}};});
   for(const pos of Object.values(points)){assert(pos.x>=0&&pos.x<=390&&pos.y>=0&&pos.y<=844,'touch controls are on screen');}
   const cdp=await p.createCDPSession();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points.throttle,id:1},{...points.boost,id:2},{...points.steer,id:3}]});await frames(p,15);
   const held=await invoke(p,'driveState');assert.equal(held.controls.throttle,1);assert.equal(held.controls.boost,true);assert(Math.abs(held.controls.steer)>.1);
   await p.screenshot({path:resolve(out,`${name}-drive.png`)});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await frames(p,3);assert.deepEqual((await invoke(p,'driveState')).controls,{throttle:0,reverse:0,steer:0,brake:0,handbrake:false,boost:false});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points.reverse,id:1}]});await frames(p,4);assert.equal((await invoke(p,'driveState')).controls.reverse,1);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{
   await p.focus('.ks-root');await p.keyboard.down('w');await p.keyboard.down('ShiftLeft');await p.waitForFunction(()=>(window as any).__kilnScene.invoke('driveState').speed>29,{timeout:15000});assert.equal((await invoke(p,'driveState')).controls.boost,true);
   await p.screenshot({path:resolve(out,`${name}-drive.png`)});await p.keyboard.up('ShiftLeft');await p.keyboard.up('w');await frames(p,2);assert.equal((await invoke(p,'driveState')).controls.boost,false);
  }
  await enter(p);const inside=await invoke(p,'campusResources');assert.equal(inside.models.length,62);assert(inside.context&&!inside.exterior);
  assert(await p.$('.fc-interior-location'),'persistent Exit and location context');await p.screenshot({path:resolve(out,`${name}-registered-floor.png`)});
  await button(p,'Exit to campus');await p.waitForFunction(()=>{const p=(window as any).__kilnScene.invoke('campusPlace');return p.place==='exterior'&&!p.moving;},{timeout:60000});await frames(p,20);
  const after=await invoke(p,'campusResources');assert.equal(after.models.length,31);assert(after.exterior&&!after.context);
  await enter(p);await frames(p,10);assert.equal((await invoke(p,'campusResources')).models.length,62);
  assert.deepEqual(unexpectedMessages(messages),[]);results.push({name,ok:true,before,inside,after,requests,messages});console.log(JSON.stringify({name,ok:true}));
 }catch(error){await p.screenshot({path:resolve(out,`${name}-failure.png`)}).catch(()=>{});writeJson(resolve(out,`${name}-failure.json`),{error:String(error),messages,requests,state:await p.evaluate(()=>(window as any).__kilnHarness?.snapshot()).catch(()=>null)});throw error;}
 finally{await p.close();}
}writeJson(resolve(out,'controls.json'),{ok:true,results});}finally{await chrome.close();await server.close();}
