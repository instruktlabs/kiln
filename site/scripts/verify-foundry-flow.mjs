import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { chromeExecutable } from './build-site-media.mjs';
import { hashBytes } from './mirror-core.mjs';
const [base, destination='.cache/round-4/ff3-site-flow']=process.argv.slice(2);
if(!base)throw new Error('Usage: bun scripts/verify-foundry-flow.mjs <site-url> [report-directory]');
const out=resolve(destination);await mkdir(out,{recursive:true});
const runtime=JSON.parse(await readFile('dist/scene-runtime/foundry-floor/runtime.json','utf8'));
assert.ok(runtime.initialLoad,'The full FF3 runtime with verified initial closure is required');
const report={runtimeSha256:runtime.sha256,initialLoad:runtime.initialLoad,checks:[],scenarios:[],errors:[]};
const browser=await puppeteer.launch({executablePath:chromeExecutable(),headless:true,pipe:true,args:['--no-sandbox'],defaultViewport:{width:1440,height:900}});
report.browser=await browser.version();
async function clickText(frame,text){const handles=await frame.$$('button');for(const handle of handles)if(await handle.evaluate((button,label)=>button.textContent.trim()===label,text)){await handle.click();return;}throw new Error(`No visible control ${text}`);}
try{
 for(const backend of ['auto','webgl2']){
  const page=await browser.newPage(),received=new Map(),pending=[];const observed=[];
  // Each backend qualification verifies response bytes, so it must fetch bodies rather than reuse 304s.
  await page.setCacheEnabled(false);
  page.on('pageerror',error=>report.errors.push({backend,error:error.message}));
  page.on('response',response=>{
   const pathname=new URL(response.url()).pathname;
   if(!pathname.startsWith('/scene-runtime/foundry-floor/')||!pathname.endsWith('.js'))return;
   const task=(async()=>{const bytes=Buffer.from(await response.buffer());const file=pathname.split('/').at(-1);const pin=runtime.chunks.find(chunk=>chunk.file===file);assert.ok(pin,file);assert.equal(response.status(),200);assert.equal(bytes.length,pin.bytes);assert.equal(hashBytes(bytes),pin.sha256);received.set(file,{file,bytes:bytes.length,sha256:pin.sha256});})();pending.push(task);task.catch(error=>report.errors.push({backend,error:String(error)}));
  });
  page.on('request',request=>observed.push(new URL(request.url()).pathname));
  if(backend==='webgl2')await page.evaluateOnNewDocument(()=>Object.defineProperty(navigator,'gpu',{configurable:true,value:undefined}));
  await page.goto(new URL('/scenes/foundry-floor/',base).href,{waitUntil:'networkidle0'});
  assert.equal(observed.some(path=>path.startsWith('/scene-runtime/foundry-floor/')),false,'No scene runtime before Explore');
  await page.click('[data-explore]');
  await page.waitForFunction(()=>document.querySelector('scene-shell')?.dataset.sceneState==='ready',{timeout:60000});
  const iframe=await page.$('[data-mount] iframe');const frame=await iframe.contentFrame();assert.ok(frame);
  await page.waitForNetworkIdle({idleTime:500,timeout:30000});await Promise.all(pending);
  assert.deepEqual([...received.keys()].sort(),[...runtime.initialLoad.files].sort(),'Only initial campus code loads before entry');
  await clickText(frame,'Arrival');
  await frame.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Enter the fab'&&!button.disabled),{timeout:30000});
  await clickText(frame,'Enter the fab');
  await frame.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Exit to campus'&&!button.disabled),{timeout:60000});
  await page.waitForNetworkIdle({idleTime:500,timeout:30000});await Promise.all(pending);
  assert.deepEqual([...received.keys()].sort(),runtime.chunks.map(chunk=>chunk.file).sort(),'Entering fetches all deferred interior code with exact hashes');
  const status=await frame.evaluate(()=>({backend:document.querySelector('.ks-root')?.getAttribute('data-kiln-backend'),hud:document.querySelector('.ff-hud')?.textContent,canvases:document.querySelectorAll('canvas').length}));
  assert.equal(status.canvases,1);assert.match(status.hud,/Wafer|wafer|lot|Lot/);if(backend==='webgl2')assert.equal(status.backend,'webgl2');
  await page.screenshot({path:join(out,`${backend}-interior.png`)});
  await clickText(frame,'Exit to campus');
  await frame.waitForFunction(()=>Boolean(document.querySelector('.fc-hud')),{timeout:30000});
  await page.click('[data-exit]');
  await page.waitForFunction(()=>document.querySelector('scene-shell')?.dataset.sceneState==='idle',{timeout:10000});
  assert.equal(await page.$eval('[data-explore]',button=>button===document.activeElement),true);
  report.scenarios.push({backend,renderedBackend:status.backend,chunks:[...received.values()],interiorHud:status.hud,entryAndReturn:true});
  await page.close();
 }
 report.checks.push('No scene code before Explore; exact initial closure only before Enter; all deferred chunks after Enter; real interior HUD/canvas; return to campus, exit and focus restore on both backends.');
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));
}finally{await browser.close();await writeFile(join(out,'flow.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({scenarios:report.scenarios.length,errors:report.errors.length,checks:report.checks}));
