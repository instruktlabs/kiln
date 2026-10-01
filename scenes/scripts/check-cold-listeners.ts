import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {launchChrome,serveOwned,waitForReady,CORRECTNESS_TIMEOUT} from '../packages/scene-kit/src/testing/node';

const out=resolve('evidence/m1/cold-listeners-c03');await mkdir(out,{recursive:true});
const report:any={note:'C-03 same-document listener audit before importing React/scene code and after owned teardown; historical STOP-03 proof is retained separately; no performance timing.',messages:[],ledger:{browserClosed:false,serverClosed:false}};
let browser:Awaited<ReturnType<typeof launchChrome>>|undefined,server:Awaited<ReturnType<typeof serveOwned>>|undefined;
try{
  const root=resolve('packages/scene-kit/dist/test'),html=await readFile(resolve(root,'index.html'),'utf8');
  const script=html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
  if(!script)throw new Error('Expected one built module script');
  server=await serveOwned(root);report.ledger.port=server.port;
  browser=await launchChrome({name:'cold-listeners'});report.ledger.browserPid=browser.process()?.pid;
  const page=await browser.newPage();await page.setViewport({width:960,height:720});
  page.on('console',message=>{if(message.type()==='error'||message.type()==='warn')report.messages.push({kind:message.type(),text:message.text()});});
  page.on('pageerror',error=>report.messages.push({kind:'pageerror',text:String(error)}));
  await page.setRequestInterception(true);
  page.on('request',async request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())await request.respond({status:200,contentType:'text/html',body:html.replace(script[0],'')});else await request.continue();});
  await page.goto(server.url,{waitUntil:'load',timeout:CORRECTNESS_TIMEOUT});
  const client=await page.createCDPSession();
  async function listeners(){
    const result:Record<string,unknown>={};
    for(const expression of ['window','document']){
      const object=await client.send('Runtime.evaluate',{expression,objectGroup:'listener-audit'});
      result[expression]=(await client.send('DOMDebugger.getEventListeners',{objectId:object.result.objectId!})).listeners.map(({type,useCapture,passive,once})=>({type,useCapture,passive,once}));
    }
    await client.send('Runtime.releaseObjectGroup',{objectGroup:'listener-audit'});
    result.reactMarkers=await page.evaluate(()=>Object.getOwnPropertyNames(document).filter(name=>name.startsWith('_reactListening')&&(document as any)[name]===true));return result;
  }
  report.before=await listeners();
  await page.addScriptTag({type:'module',url:new URL(script[1]!,server.url).href});await waitForReady(page);
  report.mounted=await listeners();
  await page.evaluate(()=>(window as any).__kilnHarness.unmount());
  await page.waitForFunction(()=>{const h=(window as any).__kilnHarness.snapshot();return h.disposals.length>0&&h.fiberRoots===0;},{timeout:CORRECTNESS_TIMEOUT});
  report.after=await listeners();report.disposal=await page.evaluate(()=>(window as any).__kilnHarness.snapshot());await client.detach();
  assert.deepEqual(report.before,{window:[],document:[],reactMarkers:[]});
  assert.deepEqual(report.after.window,[]);
  assert.deepEqual(report.after.document,[{type:'selectionchange',useCapture:false,passive:false,once:false}]);
  assert.equal(report.after.reactMarkers.length,1);assert.deepEqual(report.after.reactMarkers,report.mounted.reactMarkers);
  assert.deepEqual(report.messages,[]);report.status='pass';
  console.log(JSON.stringify({before:report.before,mounted:report.mounted,after:report.after}));
}catch(error){report.status='fail';report.error=String(error);throw error;}
finally{
  try{await browser?.close();report.ledger.browserClosed=true;}finally{await server?.close();report.ledger.serverClosed=true;}
  await writeFile(resolve(out,'results.json'),JSON.stringify(report,null,2)+'\n');
}
