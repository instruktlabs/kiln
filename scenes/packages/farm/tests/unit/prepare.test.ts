import {expect,test} from 'bun:test';
import type {BufferGeometry} from 'three/webgpu';
import layout from '../../fixtures/layout.json';
import golden from '../../fixtures/world.json';
import type {PreparedFarm} from '../../src/world/prepare';

// Bun's Node resolver selects R3F's CJS main. Initialize three's ESM entry before
// that dependency requires it; production Vite already resolves R3F's ESM entry.
// This creates no renderer and leaves all Farm objects on three/webgpu.
await import('three');
const {DisposeRegistry}=await import('@kiln-scenes/scene-kit');
const {prepareFarmData}=await import('../../src/world/prepare');

const layoutBytes=new TextEncoder().encode(JSON.stringify(layout)).buffer;
const data=new Map<string,ArrayBuffer>([['layout',layoutBytes]]);
function mount(){return{signal:new AbortController().signal,registry:new DisposeRegistry()};}
function watch(prepared:PreparedFarm){
 const geometries:BufferGeometry[]=[prepared.terrain,prepared.surrounding,prepared.stream,prepared.groundCollision],counts=[0,0,0,0];
 geometries.forEach((geometry,index)=>geometry.addEventListener('dispose',()=>{counts[index]++;}));return counts;
}
test('FARM-001 Farm preparation skips missing layout and already-aborted mounts without allocating',()=>{
 const holder:{prepared:PreparedFarm|null}={prepared:null},context=mount();
 prepareFarmData(holder,new Map(),context);expect(holder.prepared).toBeNull();expect(context.registry.size).toBe(0);
 const controller=new AbortController();controller.abort();
 prepareFarmData(holder,data,{signal:controller.signal,registry:context.registry});expect(holder.prepared).toBeNull();expect(context.registry.size).toBe(0);
 context.registry.disposeAll();
});
test('FARM-001 Farm preparation is reused only within one mount and each owned geometry releases once',()=>{
 const holder:{prepared:PreparedFarm|null}={prepared:null},context=mount();
 try{
  prepareFarmData(holder,data,context);const prepared=holder.prepared!;expect(prepared).not.toBeNull();expect(context.registry.size).toBe(1);
  const disposed=watch(prepared);
  prepareFarmData(holder,new Map([['layout',new TextEncoder().encode('invalid replacement data').buffer]]),context);
  expect(holder.prepared).toBe(prepared);expect(context.registry.size).toBe(1);
  context.registry.disposeAll();context.registry.disposeAll();prepared.dispose();
  expect(disposed).toEqual([1,1,1,1]);expect(holder.prepared).toBeNull();expect(context.registry.size).toBe(0);
 }finally{context.registry.disposeAll();}
});
test('FARM-001 prepared ground collision soup preserves every indexed terrain triangle and position',()=>{
 const holder:{prepared:PreparedFarm|null}={prepared:null},context=mount();
 try{
  prepareFarmData(holder,data,context);const prepared=holder.prepared!,terrain=prepared.terrain,collision=prepared.groundCollision;
  const source=terrain.getAttribute('position'),index=terrain.index!,positions=collision.getAttribute('position');
  expect(collision.index).toBeNull();expect(Object.keys(collision.attributes)).toEqual(['position']);
  expect(positions.count).toBe(index.count);expect(positions.count/3).toBe(golden.geometries.terrain.triangles);
  let mismatches=0;
  for(let i=0;i<positions.count;i++){const vertex=index.getX(i);if(positions.getX(i)!==source.getX(vertex)||positions.getY(i)!==source.getY(vertex)||positions.getZ(i)!==source.getZ(vertex))mismatches++;}
  expect(mismatches).toBe(0);expect(prepared.woodland.length).toBe(843);expect(prepared.meadow.color.length).toBe(256*256*4);
 }finally{context.registry.disposeAll();}
});
test('FARM-001 a new mount replaces the cache and late cleanup from the old generation preserves it',()=>{
 const holder:{prepared:PreparedFarm|null}={prepared:null},oldMount=mount(),newMount=mount();
 try{
  prepareFarmData(holder,data,oldMount);const previous=holder.prepared!,oldDisposals=watch(previous);
  // R3F can defer old renderer cleanup while the next mount has already received its layout.
  prepareFarmData(holder,data,newMount);const current=holder.prepared!;
  expect(current!==previous).toBe(true);expect(newMount.registry.size).toBe(1);const newDisposals=watch(current);
  oldMount.registry.disposeAll();expect(oldDisposals).toEqual([1,1,1,1]);expect(newDisposals).toEqual([0,0,0,0]);expect(holder.prepared).toBe(current);
  newMount.registry.disposeAll();expect(newDisposals).toEqual([1,1,1,1]);expect(holder.prepared).toBeNull();
 }finally{oldMount.registry.disposeAll();newMount.registry.disposeAll();}
});
test('FARM-001 an already-terminal mount registry immediately releases and clears newly prepared resources',()=>{
 const holder:{prepared:PreparedFarm|null}={prepared:null},context=mount();context.registry.disposeAll();
 prepareFarmData(holder,data,context);expect(holder.prepared).toBeNull();expect(context.registry.size).toBe(0);expect(context.registry.errors).toEqual([]);
});
