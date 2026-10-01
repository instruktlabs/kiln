import {expect,test} from 'bun:test';
import {createPackReader,disposeLoadedModels,loadPack,sha256Pure} from '../../src/assets';

test('optional startup model selection makes no deferred request; defaults remain eager and lazy reads retain integrity',async()=>{
 const json=new TextEncoder().encode(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}]})),size=Math.ceil(json.length/4)*4,glb=new Uint8Array(20+size),v=new DataView(glb.buffer);
 v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,glb.length,true);v.setUint32(12,size,true);v.setUint32(16,0x4e4f534a,true);glb.fill(32,20);glb.set(json,20);
 const manifest={schema:'kiln.scene-pack/1',id:'lazy',release:'r1',three:'0.186.0',models:[{id:'outside',path:'outside.glb'},{id:'inside',path:'inside.glb'}],data:{},files:['outside.glb','inside.glb'].map(path=>({path,bytes:glb.length,sha256:sha256Pure(glb)}))};
 const original=globalThis.fetch;let corrupt=false;const requested:string[]=[];
 globalThis.fetch=async input=>{const path=new URL(String(input)).pathname.slice(1);requested.push(path);return path==='pack.json'?Response.json(manifest):new Response(corrupt?new Uint8Array(glb.length):glb);};
 try{
  for(const filtered of [false,true]){
   requested.length=0;const signal=new AbortController().signal;
   const pack=await loadPack('https://example.test/',{signal,concurrency:1,...(filtered?{startupModel:(m:{id:string})=>m.id==='outside'}:{})});
   expect(requested).toEqual(filtered?['pack.json','outside.glb']:['pack.json','outside.glb','inside.glb']);
   expect([...pack.models.keys()]).toEqual(filtered?['outside']:['outside','inside']);
   expect(pack.manifest.models).toHaveLength(2);
   if(filtered){const reader=createPackReader('https://example.test/',pack.manifest);const model=await reader.loadGlb('inside.glb',signal);disposeLoadedModels([model]);corrupt=true;await expect(reader.loadGlb('inside.glb',signal)).rejects.toMatchObject({code:'asset-hash'});}
   disposeLoadedModels(pack.models.values());
  }
 }finally{globalThis.fetch=original;}
});
