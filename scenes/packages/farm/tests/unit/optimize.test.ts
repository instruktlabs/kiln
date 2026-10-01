import {expect,test} from 'bun:test';
import {AnimationClip,AnimationMixer,BoxGeometry,Float32BufferAttribute,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,Scene,StaticDrawUsage,Texture} from 'three/webgpu';
import type {FarmInstance} from '../../src/world/types';
await import('three');
const {DisposeRegistry,createFrameGraph}=await import('@kiln-scenes/scene-kit');
const {farmBatchPolicy,farmInstanceOwners,isFixedFarmOwner,countPlacementSources}=await import('../../src/world/optimize-policy');
const {optimizeFarmWorld}=await import('../../src/world/optimize');

function fixture(asset:string,geometry:BoxGeometry,material:MeshStandardMaterial,x=0,clips:AnimationClip[]=[]):FarmInstance{
 const object=new Group(),mesh=new Mesh(geometry,material);object.name=asset;object.position.x=x;object.add(mesh);
 return{id:asset+'-'+x,asset:{id:asset},object,mixer:new AnimationMixer(object),clips,action:null,clipIndex:''};
}
function woodland(root:Scene,geometry:BoxGeometry,material:MeshStandardMaterial){
 const meshes=[new InstancedMesh(geometry,material,2),new InstancedMesh(geometry,material,1)];
 for(const mesh of meshes){mesh.setMatrixAt(0,new Matrix4());mesh.computeBoundingSphere();root.add(mesh);}meshes[0]!.setMatrixAt(1,new Matrix4().makeTranslation(4,0,0));
 return{meshes,derivatives:0};
}
test('Farm policies preserve all seven exclusions, twelve fixed assets and clip-presence dynamics',()=>{
 const policy=farmBatchPolicy();expect(policy.cellSize).toBe(96);expect(policy.cellOffset).toBe(48);
 expect([...policy.excludeAssets]).toEqual(['farmer','tractor','trailer','farmhouse','barn','watermill','fence-gate']);
 const geometry=new BoxGeometry(),material=new MeshStandardMaterial();
 try{
  const assets=['fence-straight','fence-corner','barrel','hay-bale','cabbage-stage-1','cabbage-stage-2','cabbage-stage-3','cabbage-stage-4','wheat','pumpkin-plant','faceted-tree','rock-cluster'];
  const instances=[...assets.map(a=>fixture(a,geometry,material)),fixture('unknown',geometry,material),fixture('tractor',geometry,material),fixture('farmer',geometry,material),fixture('barrel',geometry,material,1,[new AnimationClip('unplayed',1,[])])];
  const owners=farmInstanceOwners(instances);expect(owners.map(o=>o.id)).toEqual(instances.map(i=>i.id));expect(owners.every((o,i)=>o.object===instances[i]!.object)).toBe(true);
  expect(owners.map(isFixedFarmOwner)).toEqual([...assets.map(()=>true),false,false,false,false]);expect(owners.slice(-4).map(o=>o.dynamic)).toEqual([false,true,true,true]);
  (policy.excludeAssets as Set<string>).clear();expect(farmBatchPolicy().excludeAssets.size).toBe(7);
 }finally{geometry.dispose();material.dispose();}
});
test('Farm source observations separate all visible meshes from policy-eligible meshes and batched groups',()=>{
 const root=new Scene(),geometry=new BoxGeometry(),material=new MeshStandardMaterial();
 try{
  const instances=[fixture('barrel',geometry,material),fixture('barrel',geometry,material,10),fixture('barn',geometry,material),fixture('barrel',geometry,material,500)];
  const hidden=new Mesh(geometry,material);hidden.visible=false;instances[0]!.object.add(hidden);
  const mirrored=new Mesh(geometry,material);mirrored.scale.x=-1;instances[0]!.object.add(mirrored);
  const transparent=material.clone();transparent.transparent=true;instances[0]!.object.add(new Mesh(geometry,transparent));
  const multi=new Mesh(geometry,[material,material]);instances[0]!.object.add(multi);
  for(const i of instances)root.add(i.object);root.updateMatrixWorld(true);
  const owners=farmInstanceOwners(instances);expect(countPlacementSources(owners,farmBatchPolicy())).toEqual({totalSourceMeshes:7,eligibleSourceMeshes:3});
  const optimized=optimizeFarmWorld(root,instances,{meshes:[],derivatives:0},{packWoodland:false});
  expect(optimized.stats.batching).toMatchObject({groups:1,dynamicGroups:0,sourceMeshes:2,totalSourceMeshes:7,eligibleSourceMeshes:3,tangentDerivatives:0});optimized.restore();transparent.dispose();
 }finally{geometry.dispose();material.dispose();}
});
test('Farm optimization restores graph, frozen flags, batches and woodland in ownership order without disposing pack resources',()=>{
 const outer=new Scene(),root=new Scene(),registry=new DisposeRegistry();outer.add(root);
 const geometry=new BoxGeometry(),material=new MeshStandardMaterial({normalMap:new Texture()});geometry.setAttribute('tangent',new Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*4),4));
 let sourceDisposed=0,materialDisposed=0;geometry.addEventListener('dispose',()=>sourceDisposed++);material.addEventListener('dispose',()=>materialDisposed++);
 const instances=[fixture('barrel',geometry,material),fixture('barrel',geometry,material,5)],forest=woodland(root,geometry,material),events:string[]=[];
 for(const instance of instances)root.add(instance.object);
 registry.add(()=>{expect(forest.meshes.every(mesh=>mesh.visible)).toBe(true);events.push('original forest');for(const mesh of forest.meshes){mesh.removeFromParent();mesh.dispose();}});
 const optimized=optimizeFarmWorld(root,instances,forest,{packWoodland:true});registry.add(optimized.restore);
 expect(optimized.stats.woodland).toMatchObject({packed:true,groups:1,instances:3,sourceMeshes:2});expect(optimized.stats.batching.tangentDerivatives).toBe(1);expect(optimized.stats.frozen).toEqual({placements:2,nodes:4});
 const graph=createFrameGraph({scene:outer,worldRoot:root,owners:optimized.owners,batches:optimized.batches,isFixed:optimized.isFixed});registry.add(()=>{events.push('graph');graph.restore();});
 const derived=optimized.batches.batches[0]!.mesh.geometry;let derivedDisposals=0,batchDisposals=0;derived.addEventListener('dispose',()=>derivedDisposals++);
 optimized.batches.batches[0]!.mesh.addEventListener('dispose',()=>{events.push('batch');batchDisposals++;expect(instances.every(i=>i.object.visible&&i.object.matrixAutoUpdate&&i.object.matrixWorldAutoUpdate)).toBe(true);});
 expect(graph.stats.hiddenRoots).toBe(2);expect(outer.matrixWorldAutoUpdate).toBe(false);registry.disposeAll();registry.disposeAll();optimized.restore();
 expect(events).toEqual(['graph','batch','original forest']);expect(registry.errors).toEqual([]);expect(outer.matrixWorldAutoUpdate).toBe(true);expect(derivedDisposals).toBe(1);expect(batchDisposals).toBe(1);expect(sourceDisposed).toBe(0);expect(materialDisposed).toBe(0);expect(geometry.hasAttribute('tangent')).toBe(true);expect(root.children.filter(o=>(o as InstancedMesh).isInstancedMesh).length).toBe(0);
 geometry.dispose();material.normalMap!.dispose();material.dispose();
});
test('Farm minimal skips woodland packing while placement batching stays enabled',()=>{
 const root=new Scene(),geometry=new BoxGeometry(),material=new MeshStandardMaterial(),forest=woodland(root,geometry,material),instances=[fixture('barrel',geometry,material),fixture('barrel',geometry,material,5)];for(const i of instances)root.add(i.object);
 const optimized=optimizeFarmWorld(root,instances,forest,{packWoodland:false});expect(optimized.stats.woodland).toMatchObject({packed:false,groups:0,sourceMeshes:2,instances:3});expect(forest.meshes.every(m=>m.visible)).toBe(true);expect(optimized.stats.batching.groups).toBe(1);optimized.restore();for(const mesh of forest.meshes)mesh.dispose();geometry.dispose();material.dispose();
});
test('Farm rejects detached owners before hiding or allocating optimization resources',()=>{
 const root=new Scene(),geometry=new BoxGeometry(),material=new MeshStandardMaterial(),forest=woodland(root,geometry,material),detached=fixture('barrel',geometry,material);
 expect(()=>optimizeFarmWorld(root,[detached],forest,{packWoodland:true})).toThrow('direct');expect(forest.meshes.every(m=>m.visible)).toBe(true);expect(root.children.length).toBe(2);for(const mesh of forest.meshes)mesh.dispose();geometry.dispose();material.dispose();
});

test('M4: dynamic batches take static usage and upload only when one of their matrices changes',()=>{
 const outer=new Scene(),root=new Scene(),geometry=new BoxGeometry(),material=new MeshStandardMaterial(),clips=[new AnimationClip('unplayed',1,[])];outer.add(root);
 try{
  const instances=[fixture('barrel',geometry,material,0,clips),fixture('barrel',geometry,material,5,clips)];for(const i of instances)root.add(i.object);
  const optimized=optimizeFarmWorld(root,instances,{meshes:[],derivatives:0},{packWoodland:false}),batch=optimized.batches.batches.find(b=>b.dynamic)!;
  // three's renderer uploads a DynamicDrawUsage buffer every frame; static usage uploads when the version changes.
  expect(batch.sources.length).toBe(2);expect(batch.mesh.instanceMatrix.usage).toBe(StaticDrawUsage);
  const graph=createFrameGraph({scene:outer,worldRoot:root,owners:optimized.owners,batches:optimized.batches,isFixed:optimized.isFixed});
  graph.update();const settled=batch.mesh.instanceMatrix.version;graph.update();graph.update();expect(batch.mesh.instanceMatrix.version).toBe(settled);
  instances[1]!.object.position.x=7;graph.update();expect(batch.mesh.instanceMatrix.version).toBe(settled+1);graph.update();expect(batch.mesh.instanceMatrix.version).toBe(settled+1);
  graph.restore();optimized.restore();
 }finally{geometry.dispose();material.dispose();}
});

if(process.env.ORACLE==='1')test('B-07 count-only sealed r33 oracle matches Farm optimization and the frozen historical/current counts',async()=>{
 await import('../../scripts/audit-optimization-counts');
});
