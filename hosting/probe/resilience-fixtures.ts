import { nativeFixtures } from './fixtures';

const prefix = 'import fs from "node:fs";fs.readFileSync(0);';
const ready = 'fs.writeSync(1,"KILN_PROBE_READY\\n");';
const busy = `${prefix}
  const {spawn}=await import('node:child_process');
  const child=spawn(process.execPath,['-e','process.title="kiln-resilience-child";for(;;){}'],{detached:true,stdio:'ignore',env:{},cwd:'/tmp'});
  child.unref();await new Promise(resolve=>setTimeout(resolve,100));
  if(!Number.isSafeInteger(child.pid))throw new Error('Missing child');
  process.kill(child.pid,0);${ready}for(;;){}`;
const renderPrefix = `${prefix}
  const {createEvaluatorRequestV2,evaluateEvaluatorRequestV2,decodeEvaluatorResultV2}=await import('/opt/kiln/node_modules/@instruktlabs/kiln/lib/evaluator/index.js');
  const {createRequire}=await import('node:module');
  const {PNG}=createRequire('/opt/kiln/node_modules/@instruktlabs/kiln/package.json')('pngjs');
  const finishJson=value=>new Promise((resolve,reject)=>process.stdout.write(JSON.stringify(value),error=>error?reject(error):resolve()));
  async function evaluate(code){
    const {json}=createEvaluatorRequestV2({requestId:'resilience-render',code,maxGlbBytes:2097152});
    const wire=await evaluateEvaluatorRequestV2(json,{}, {deadlineMs:60000,maxResponseBytes:8*1024*1024});
    const result=decodeEvaluatorResultV2(wire,2097152,'resilience-render');
    if(!result.ok)throw new Error('Evaluation failed');return result.render.glb;
  }`;

/** Fixed native code only, never user input or an engine security-boundary claim. */
export const resilienceFixtures: Record<string, string> = {
  ...nativeFixtures,
  'native-deadline': busy,
  'native-cancel': busy,
  'alarm-recovery': busy,
  'stdout-flood': `${prefix}${ready}await new Promise(r=>setTimeout(r,100));const chunk=Buffer.alloc(8192,120);for(;;)fs.writeSync(1,chunk);`,
  'stderr-flood': `${prefix}${ready}await new Promise(r=>setTimeout(r,100));const chunk=Buffer.alloc(8192,120);for(;;)fs.writeSync(2,chunk);`,
  'memory-limit': `${prefix}
    const {spawn}=await import('node:child_process');
    let counterSource='cgroup';
    const counter=()=>{
      if(counterSource==='cgroup'){
        try{const text=fs.readFileSync('/sys/fs/cgroup/memory.events','utf8');const m=text.match(/^oom_kill (\\d+)$/m);if(m)return Number(m[1]);}catch{}
        counterSource='vmstat';
      }
      const m=fs.readFileSync('/proc/vmstat','utf8').match(/^oom_kill (\\d+)$/m);if(!m)throw new Error('No OOM counter');return Number(m[1]);
    };
    const before=counter();
    const child=spawn(process.execPath,['-e', 'require("node:fs").writeFileSync("/proc/self/oom_score_adj","500");const allocated=[];for(let n=0;n<256;n++)allocated.push(Buffer.alloc(64*1024*1024,1));process.exit(2);'],{stdio:'ignore',env:{},cwd:'/tmp'});
    const ended=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    const oomKills=counter()-before;
    if(oomKills<1||ended.signal!=='SIGKILL')throw new Error('Memory exhaustion not observed');
    fs.writeSync(1,JSON.stringify({ok:true,oomKills,signal:ended.signal,counterSource}));process.exit(0);`,
  'cpu-preview': `${renderPrefix}
    const glb=await evaluate('function build(){return new THREE.Mesh(boxGeo(1,1,1),gameMaterial(0x8899aa));}');
    const {renderGlbViewCell}=await import('/opt/kiln/node_modules/@instruktlabs/kiln/lib/views/index.js');
    const view=await renderGlbViewCell(glb,{name:'qualification',dir:[1,0.4,1]},{size:128});
    const decoded=PNG.sync.read(Buffer.from(view.png));
    if(decoded.width!==128||decoded.height!==128)throw new Error('Invalid dimensions');
    await finishJson({ok:true,views:[{backdrop:'neutral',index:0,pngBase64:Buffer.from(view.png).toString('base64')}]});process.exit(0);`,
  'software-views': `${renderPrefix}
    process.env.VK_ICD_FILENAMES='/opt/kiln/lvp-icd.json';
    const glb=await evaluate("function build(){const root=createRoot('Root');const albedo=proceduralTexture({schemaVersion:2,size:32,usage:'albedo',layers:[{op:'checker',colorA:0xcc2211,colorB:0x22bb33,squares:4}]});createPart('Textured',boxGeo(1,1,1),pbrMaterial({albedo,roughness:0.7,metalness:0.1}),{parent:root});createPart('Blue',sphereGeo(0.35),pbrMaterial({albedo:0x2233dd,roughness:0.25,metalness:0.4}),{parent:root,position:[0,0.2,0.85]});return root;}");
    await import('/opt/kiln/node_modules/@instruktlabs/kiln/render-service/src/register-hooks.mjs');
    const {initRenderer,renderGlb}=await import('/opt/kiln/node_modules/@instruktlabs/kiln/render-service/src/renderer.mjs');
    const gpu=await import('/opt/kiln/node_modules/@instruktlabs/kiln/render-service/src/gpu.mjs');
    await initRenderer({allowSoftware:true});const device=await gpu.acquireGpu();
    if(device.software!==true)throw new Error('Expected software adapter');
    const views=[];
    for(const backdrop of ['neutral','dark','light']){
      const result=await renderGlb(glb,{size:128,viewDirs:[[1,0.4,1],[0,0,1]],backdrop});
      if(result.views.length!==2)throw new Error('Invalid views');
      for(const [index,png] of result.views.entries()){
        const decoded=PNG.sync.read(Buffer.from(png));if(decoded.width!==128||decoded.height!==128)throw new Error('Invalid dimensions');
        let red=0,green=0;
        for(let n=0;n<decoded.data.length;n+=4){const [r,g,b]=decoded.data.subarray(n,n+3);if(r>g+12&&r>b+12)red++;if(g>r+12&&g>b+12)green++;}
        if(red<21||green<21)throw new Error('Missing texture evidence');
        views.push({backdrop,index,red,green,pngBase64:Buffer.from(png).toString('base64')});
      }
    }
    gpu.markGpuShutdown();device.device.destroy();
    await finishJson({ok:true,software:true,views});process.exit(0);`,
};
