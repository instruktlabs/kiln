import type { Page } from 'puppeteer-core';
import { waitFrames } from '../src/testing/node';
const assert = (on: unknown, message: string) => { if(!on)throw new Error(message); };
export async function assertDemoUi(page: Page) {
  await page.emulateMediaFeatures([]);
  // Rig checks can trigger first-play help. Close existing panels through their
  // real controls so this proof starts identically on fresh and reused profiles.
  for (const selector of ['.ks-help', '.ks-credits']) {
    if (await page.$(selector)) { await page.click(`${selector} button`); await page.waitForSelector(selector, { hidden: true }); }
  }
  await page.focus('.ks-credits-button');await page.keyboard.press('Enter');
  await page.waitForSelector('.ks-credits');
  assert((await page.$eval('.ks-credits', e=>e.textContent))?.includes('MIT'),'Keyboard opens actual credit/licence data');
  await page.click('.ks-credits button');assert(!(await page.$('.ks-credits')),'Pointer closes credits');
  await page.click('.ks-help-button');await page.waitForSelector('.ks-help');
  await page.focus('.ks-help button');await page.keyboard.press('Enter');assert(!(await page.$('.ks-help')),'Keyboard closes controls help');
  await page.focus('[role="radiogroup"][aria-label="Lighting"] [role="radio"]');
  await page.keyboard.press('End');await waitFrames(page,3);
  assert(await page.$eval('[role="radiogroup"][aria-label="Lighting"] [role="radio"]:last-child',e=>e.getAttribute('aria-checked'))==='true','Segmented keyboard selects Sunset');
  await page.click('[role="radiogroup"][aria-label="Lighting"] [role="radio"]:first-child');await waitFrames(page,3);
  assert(await page.$eval('[role="radiogroup"][aria-label="Lighting"] [role="radio"]:first-child',e=>e.getAttribute('aria-checked'))==='true','Segmented pointer selects Day');
  await page.evaluate(()=>{
    const overlay=document.querySelector<HTMLElement>('.ks-fade')!;
    (window as any).__fadeProof={max:0,done:false};
    const observer=new MutationObserver(()=>{const value=Number(overlay.style.opacity);const proof=(window as any).__fadeProof;proof.max=Math.max(proof.max,value);if(value===0&&proof.max>0){proof.done=true;observer.disconnect();}});
    observer.observe(overlay,{attributes:true,attributeFilter:['style']});
    const button=Array.from(document.querySelectorAll<HTMLButtonElement>('.ks-hud button')).find(e=>e.textContent==='Fade')!;button.focus();
  });
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>(window as any).__fadeProof.done,{timeout:120000});
  const fade=await page.evaluate(()=>{const proof=(window as any).__fadeProof;delete(window as any).__fadeProof;return proof;});assert(fade.max===1,'Fade reaches opaque and returns clear');
  await page.evaluate(()=>(window as any).__kilnScene.demoSetMode('drive'));await waitFrames(page,3);
  const client=await page.createCDPSession();await client.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  try{
    const canvas=(await (await page.$('canvas'))!.boundingBox())!;
    const touchCanvas=()=>page.touchscreen.tap(canvas.x+canvas.width*.5,canvas.y+canvas.height*.6);
    await touchCanvas();await page.waitForSelector('.ks-touch-buttons');
    const lights=await page.$('.ks-touch-buttons button[aria-label="Lights"]');assert(lights,'Named touch edge button exists');
    const before=await page.evaluate(()=>(window as any).__kilnScene.demoActionState());const rect=(await lights!.boundingBox())!;
    await page.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);await waitFrames(page,2);
    const pointer=await page.evaluate(()=>(window as any).__kilnScene.demoActionState());assert(pointer.lights!==before.lights,'Touch edge action fires once');
    await page.focus('.ks-touch-buttons button[aria-label="Lights"]');await page.keyboard.press('Enter');await waitFrames(page,2);
    const keyboard=await page.evaluate(()=>(window as any).__kilnScene.demoActionState());assert(keyboard.lights===before.lights,'Keyboard operates the same edge action');
    await touchCanvas();await page.waitForSelector('.ks-touch-buttons');
    const pedal=(await (await page.$('.ks-touch-buttons button[aria-label="Accelerate"]'))!.boundingBox())!;
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pedal.x+pedal.width/2,y:pedal.y+pedal.height/2}]});await waitFrames(page,2);
    assert((await page.evaluate(()=>(window as any).__kilnScene.demoActionState())).throttle===1,'Pedal is held');
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitFrames(page,2);
    assert((await page.evaluate(()=>(window as any).__kilnScene.demoActionState())).throttle===0,'Pedal releases without sticking');
    return{credits:'keyboard/pointer',segments:'keyboard/pointer',fade,touch:{before,pointer,keyboard,heldAndReleased:true}};
  }finally{await client.send('Emulation.setTouchEmulationEnabled',{enabled:false});await client.detach();await page.evaluate(()=>(window as any).__kilnScene.demoSetMode('orbit'));}
}
