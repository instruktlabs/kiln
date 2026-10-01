import { runSceneContractTests, waitForReady, waitFrames } from '../packages/scene-kit/src/testing/node';
import { assertDemoRigs } from '../packages/scene-kit/demo/browser-demo';
import { assertDemoInstances } from '../packages/scene-kit/demo/browser-instances';
import { assertDemoUi } from '../packages/scene-kit/demo/browser-ui';
const backend = process.argv.includes('--webgl') ? 'webgl2' : 'auto';
const labelIndex=process.argv.indexOf('--label'),label=labelIndex<0?'':process.argv[labelIndex+1];
if(label===undefined || (label && !/^[a-z0-9-]+$/.test(label)))throw new Error('A test label uses lowercase letters, numbers and hyphens');
const outDir=`evidence/m1/browser-${backend}${label?'-'+label:''}`;
const report=await runSceneContractTests({
  testRoot:'packages/scene-kit/dist/test',publicRoot:'packages/scene-kit/dist/standalone',devRoot:'packages/scene-kit/dist/dev',
  outDir,mountOptions:{backend},
  renderFailureOptions:{renderFailure:true},
  callbackFailureOptions:['graphics','pack','build','backend','tier'].map(name=>({name,options:{failCallback:name}})),
  async accessibilityFlow(page){
    const before=await page.evaluate(()=>(window as any).__kilnScene.demoRigState());
    await page.keyboard.down('KeyW');await waitFrames(page,20);await page.keyboard.up('KeyW');
    const after=await page.evaluate(()=>(window as any).__kilnScene.demoRigState());
    if(JSON.stringify(before.player)===JSON.stringify(after.player))throw new Error('Keyboard play must move the walking capsule');
    await page.keyboard.press('KeyE');await waitFrames(page,20);
    return{before,after};
  },
  async extraChecks({page,check}){await check('B-15',async()=>{
    await waitForReady(page);
    if(backend==='webgl2'){await page.evaluate(()=>(window as any).__kilnHarness.mount({backend:'webgl2'}));await waitForReady(page);}
    return{instances:await assertDemoInstances(page,outDir),rigs:await assertDemoRigs(page),ui:await assertDemoUi(page)};
  });},
});
console.log(JSON.stringify({results:report.results.map(({id,status,attempt})=>({id,status,attempt})),ledger:report.ledger,outDir}));
const latest=new Map(report.results.map(result=>[result.id,result]));
if([...latest.values()].some(result=>result.status==='fail'))process.exitCode=1;
