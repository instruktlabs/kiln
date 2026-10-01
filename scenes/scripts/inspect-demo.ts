import { launchChrome, serveOwned } from '../packages/scene-kit/src/testing/node';
import { mkdir, writeFile } from 'node:fs/promises';
const out='evidence/m1/boot-inspection';await mkdir(out,{recursive:true});
const server=await serveOwned('packages/scene-kit/dist/test');let browser;const messages:unknown[]=[];
try{
  browser=await launchChrome({name:'demo-inspection'});const page=await browser.newPage();await page.setViewport({width:960,height:720,deviceScaleFactor:1});
  page.on('console',m=>{messages.push({kind:m.type(),text:m.text()});});page.on('pageerror',e=>messages.push({kind:'pageerror',text:String(e)}));
  await page.goto(server.url+(process.argv.includes('--webgl')?'/?backend=webgl2':'/'));
  await page.waitForFunction(()=>{const s=(window as any).__kilnHarness?.snapshot();return s&&(s.readyCount||s.errors.length);},{timeout:120000});
  const snapshot=await page.evaluate(()=>({harness:(window as any).__kilnHarness.snapshot(),stats:(window as any).__kilnScene?.stats(),html:document.querySelector('#page-status')?.textContent}));
  await page.screenshot({path:out+'/page.png'});console.log(JSON.stringify({snapshot,messages}));
}catch(error){messages.push({error:String(error)});console.log(JSON.stringify(messages));}
finally{await browser?.close();await server.close();await writeFile(out+'/results.json',JSON.stringify({messages,browserClosed:true,serverClosed:true,port:server.port},null,2));}
