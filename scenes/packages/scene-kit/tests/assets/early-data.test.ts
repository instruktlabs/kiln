import {expect,test} from 'bun:test';
import {Group,BoxGeometry,Mesh,MeshStandardMaterial} from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadPack,sha256Pure,disposeLoadedModels} from '../../src/assets';
import {DisposeRegistry} from '../../src/lifecycle/core';
import {SceneError} from '../../src/contract/core';
import {prepareSceneData} from '../../src/contract/prepare-data';
import type {SceneDefinition} from '../../src/contract/types';
const bytes=(s:string)=>new TextEncoder().encode(s);
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}
function fixture(){
 const json=bytes(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}]})),size=Math.ceil(json.length/4)*4,glb=new Uint8Array(20+size),view=new DataView(glb.buffer);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,glb.length,true);view.setUint32(12,size,true);view.setUint32(16,0x4e4f534a,true);glb.fill(32,20);glb.set(json,20);
 const paths=new Map([['model.glb',glb],['layout.json',bytes('{"layout":1}')],['grass.json',bytes('{"grass":2}')]]);
 const manifest={schema:'kiln.scene-pack/1',id:'early-data',release:'r1',three:'0.186.0',models:[{id:'model',path:'model.glb'}],data:{layout:'layout.json',grass:'grass.json'},files:[...paths].map(([path,b])=>({path,bytes:b.length,sha256:sha256Pure(b)}))};
 return{paths,manifest};
}
test('FARM-001 opt-in prioritizes verified data; existing consumers keep model-first order',async()=>{
 const original=globalThis.fetch;
 try{for(const optIn of [false,true]){const {paths,manifest}=fixture(),fetched:string[]=[],events:string[]=[],snapshots:ReadonlyMap<string,ArrayBuffer>[]=[];
  globalThis.fetch=async input=>{const path=new URL(String(input)).pathname.slice(1);fetched.push(path);return path==='pack.json'?Response.json(manifest):new Response(paths.get(path));};
  const pack=await loadPack('https://example.test/',{signal:new AbortController().signal,concurrency:1,onProgress:p=>{if(p.phase==='assets')events.push(p.text);},...(optIn?{onData:(data:ReadonlyMap<string,ArrayBuffer>)=>{snapshots.push(data);events.push(`data:${data.size}`);}}:{})});
  expect(fetched).toEqual(optIn?['pack.json','layout.json','grass.json','model.glb']:['pack.json','model.glb','layout.json','grass.json']);
  expect(events).toEqual(optIn?['data:1','Loaded layout','data:2','Loaded grass','Loaded model']:['Loaded model','Loaded layout','Loaded grass']);
  if(optIn){expect([...snapshots[0]!.keys()]).toEqual(['layout']);expect([...snapshots[1]!.keys()]).toEqual(['layout','grass']);expect(snapshots[0]).not.toBe(pack.data);expect(snapshots[1]).not.toBe(pack.data);(snapshots[0] as Map<string,ArrayBuffer>).clear();expect(pack.data.size).toBe(2);}
  disposeLoadedModels(pack.models.values());
 }}finally{globalThis.fetch=original;}
});
test('FARM-001 preparation runs while a model parse is pending and before its progress event',async()=>{
 const {paths,manifest}=fixture(),originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync;
 const parseStarted=deferred<void>(),releaseParse=deferred<void>(),releaseLayout=deferred<void>(),prepared=deferred<void>();let modelFinished=false,preparedBeforeModel=false;
 globalThis.fetch=async input=>{const path=new URL(String(input)).pathname.slice(1);if(path==='layout.json')await releaseLayout.promise;return path==='pack.json'?Response.json(manifest):new Response(paths.get(path));};
 GLTFLoader.prototype.parseAsync=async function(...args){parseStarted.resolve();await releaseParse.promise;return originalParse.apply(this,args);};
 let loading:ReturnType<typeof loadPack>|undefined;
 try{loading=loadPack('https://example.test/',{signal:new AbortController().signal,onData:data=>{if(data.has('layout')){preparedBeforeModel=!modelFinished;prepared.resolve();}},onProgress:p=>{if(p.text==='Loaded model')modelFinished=true;}});
  await parseStarted.promise;releaseLayout.resolve();await prepared.promise;expect(preparedBeforeModel).toBe(true);expect(modelFinished).toBe(false);
  releaseParse.resolve();const pack=await loading;expect(modelFinished).toBe(true);disposeLoadedModels(pack.models.values());
 }finally{releaseParse.resolve();releaseLayout.resolve();if(loading)await loading.catch(()=>{});globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
});
test('FARM-001 corrupted data never reaches preparation',async()=>{
 const {paths,manifest}=fixture(),original=globalThis.fetch;let notifications=0;
 paths.set('layout.json',bytes('tampered'));
 globalThis.fetch=async input=>String(input).endsWith('pack.json')?Response.json(manifest):new Response(paths.get(new URL(String(input)).pathname.slice(1)));
 try{await expect(loadPack('https://example.test/',{signal:new AbortController().signal,concurrency:1,onData:()=>{notifications++;}})).rejects.toMatchObject({code:'asset-hash'});expect(notifications).toBe(0);}finally{globalThis.fetch=original;}
});
test('FARM-001 abort inside preparation suppresses later callbacks and asset jobs',async()=>{
 const {paths,manifest}=fixture(),original=globalThis.fetch,controller=new AbortController(),reason=new Error('fixture cancellation');let notifications=0,progress=0;const fetched:string[]=[];
 globalThis.fetch=async input=>{const path=new URL(String(input)).pathname.slice(1);fetched.push(path);return path==='pack.json'?Response.json(manifest):new Response(paths.get(path));};
 try{await expect(loadPack('https://example.test/',{signal:controller.signal,concurrency:1,onData:()=>{notifications++;controller.abort(reason);},onProgress:p=>{if(p.phase==='assets')progress++;}})).rejects.toBe(reason);expect(notifications).toBe(1);expect(progress).toBe(0);expect(fetched).toEqual(['pack.json','layout.json']);}finally{globalThis.fetch=original;}
});
test('FARM-001 even falsy preparation failures remain fatal runtime errors',async()=>{
 const {paths,manifest}=fixture(),original=globalThis.fetch;
 globalThis.fetch=async input=>String(input).endsWith('pack.json')?Response.json(manifest):new Response(paths.get(new URL(String(input)).pathname.slice(1)));
 try{for(const failure of [undefined,false,0])await expect(loadPack('https://example.test/',{signal:new AbortController().signal,concurrency:1,onData:()=>{throw failure;}})).rejects.toMatchObject({code:'runtime',cause:failure});}finally{globalThis.fetch=original;}
});
test('FARM-001 preparation preserves runtime/error classification and registry cleanup after partial failure',async()=>{
 const registry=new DisposeRegistry(),controller=new AbortController(),geometry=new BoxGeometry(),failure=new Error('preparation fixture');let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
 const prepare:NonNullable<SceneDefinition['prepareData']>=(_data,context)=>{expect(context.signal).toBe(controller.signal);expect(context.registry).toBe(registry);context.registry.add(geometry);throw failure;};
 try{prepareSceneData(prepare,new Map(),{signal:controller.signal,registry});throw new Error('expected preparation failure');}catch(error){expect(error).toMatchObject({code:'runtime',cause:failure});}
 registry.disposeAll();registry.disposeAll();expect(disposed).toBe(1);expect(registry.size).toBe(0);
 const classified=new SceneError('pack-invalid','scene data fixture');expect(()=>prepareSceneData(()=>{throw classified;},new Map(),{signal:controller.signal,registry})).toThrow(classified);
 const cancelled=new AbortController(),reason=new Error('cancelled during CPU preparation');expect(()=>prepareSceneData(()=>cancelled.abort(reason),new Map(),{signal:cancelled.signal,registry})).toThrow(reason);
 controller.abort();let called=false;expect(()=>prepareSceneData(()=>{called=true;},new Map(),{signal:controller.signal,registry})).toThrow();expect(called).toBe(false);
});
test('FARM-001 failed preparation releases a model that finishes parsing after cancellation',async()=>{
 const {paths,manifest}=fixture(),originalFetch=globalThis.fetch,originalParse=GLTFLoader.prototype.parseAsync;
 const started=deferred<void>(),release=deferred<void>(),registry=new DisposeRegistry(),controller=new AbortController(),geometry=new BoxGeometry(),material=new MeshStandardMaterial(),scene=new Group();scene.add(new Mesh(geometry,material));
 let geometryDisposed=0,materialDisposed=0;geometry.addEventListener('dispose',()=>geometryDisposed++);material.addEventListener('dispose',()=>materialDisposed++);
 globalThis.fetch=async input=>{const path=new URL(String(input)).pathname.slice(1);if(path!=='model.glb'&&path!=='pack.json')await started.promise;return path==='pack.json'?Response.json(manifest):new Response(paths.get(path));};
 GLTFLoader.prototype.parseAsync=async()=>{started.resolve();await release.promise;return{scene,scenes:[scene]}as any;};
 let loading:Promise<unknown>|undefined;
 try{loading=loadPack('https://example.test/',{signal:controller.signal,onData:data=>{prepareSceneData(()=>{release.resolve();throw new Error('early CPU fixture');},data,{signal:controller.signal,registry});}});
  await expect(loading).rejects.toMatchObject({code:'runtime',message:'early CPU fixture'});expect(geometryDisposed).toBe(1);expect(materialDisposed).toBe(1);
 }finally{release.resolve();if(loading)await loading.catch(()=>{});registry.disposeAll();globalThis.fetch=originalFetch;GLTFLoader.prototype.parseAsync=originalParse;}
});
