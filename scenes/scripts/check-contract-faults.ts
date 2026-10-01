import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {launchChrome,serveOwned,waitForReady,CORRECTNESS_TIMEOUT} from '../packages/scene-kit/src/testing/node';

const out=resolve('evidence/m1/contract-faults');await mkdir(out,{recursive:true});
const report:any={note:'Scoped callback and render-error correctness only; no performance measurements.',cases:[],messages:[],ledger:{browserClosed:false,serverClosed:false}};
let browser:Awaited<ReturnType<typeof launchChrome>>|undefined,server:Awaited<ReturnType<typeof serveOwned>>|undefined;
try{
  server=await serveOwned(resolve('packages/scene-kit/dist/test'));report.ledger.port=server.port;
  browser=await launchChrome({name:'contract-faults'});report.ledger.browserPid=browser.process()?.pid;
  const page=await browser.newPage();await page.setViewport({width:960,height:720});
  page.on('console',message=>{if(message.type()==='error'||message.type()==='warn')report.messages.push({kind:message.type(),text:message.text()});});
  page.on('pageerror',error=>report.messages.push({kind:'pageerror',text:String(error)}));
  await page.goto(server.url,{waitUntil:'load',timeout:CORRECTNESS_TIMEOUT});await waitForReady(page);
  for(const name of ['graphics','pack','backend','tier','build','react-render']){
    await page.evaluate(options=>(window as any).__kilnHarness.mount(options),name==='react-render'?{renderFailure:true}:{failCallback:name});
    await page.waitForFunction(()=>{const s=(window as any).__kilnHarness.snapshot();return s.errors.length>0&&s.fiberRoots===0;},{timeout:CORRECTNESS_TIMEOUT});
    const value=await page.evaluate(()=>(window as any).__kilnHarness.snapshot());
    report.cases.push({name,value});assert.equal(value.errors.length,1);assert.equal(value.errors[0].code,'runtime');assert.equal(value.readyCount,0);assert.equal(value.callbacksAfterUnmount,0);
    console.log(`${name}: scoped failure and complete root teardown pass`);
  }
  assert.deepEqual(report.messages,[]);report.status='pass';
}catch(error){report.status='fail';report.error=String(error);throw error;}
finally{
  try{await browser?.close();report.ledger.browserClosed=true;}finally{await server?.close();report.ledger.serverClosed=true;}
  await writeFile(resolve(out,'results.json'),JSON.stringify(report,null,2)+'\n');
}
