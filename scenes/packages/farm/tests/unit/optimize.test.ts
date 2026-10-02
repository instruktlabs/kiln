import {expect,test} from 'bun:test';
import {AnimationClip,AnimationMixer,BoxGeometry,Float32BufferAttribute,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,QuaternionKeyframeTrack,Scene,StaticDrawUsage,Texture,Vector3,VectorKeyframeTrack} from 'three/webgpu';
import type {BufferGeometry,Material,Object3D} from 'three/webgpu';
import type {FarmInstance} from '../../src/world/types';
await import('three');
const {DisposeRegistry,createFrameGraph}=await import('@kiln-scenes/scene-kit');
const {farmBatchPolicy,farmInstanceOwners,isFixedFarmOwner,countPlacementSources}=await import('../../src/world/optimize-policy');
const {optimizeFarmWorld}=await import('../../src/world/optimize');
const {findDoor,doorCenter}=await import('../../src/play/doors');
const {FARM_SHADOW}=await import('../../src/constants');

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

// S4b/S4: a farmhouse-like hero (root parts sharing materials, a glass pane, Joint_FrontDoor with leaf, hardware and a 1 cm
// pin), two fence gates (posts, a clip-targeted Latch that is not a Joint_, Joint_GateLeaf), two fixed barrels and a herd of
// two cows with a large hide and a tiny eye. Geometry and materials are shared like pack resources.
// Glb primitives carry no draw groups (a BoxGeometry has six, which the merge leaves alone).
const shared=(()=>{const m=(name:string,o={})=>new MeshStandardMaterial({name,...o}),g=(s:number)=>{const b=new BoxGeometry(s,s,s);b.clearGroups();return b;};return{unit:g(1),pin:g(.01),masonry:m('masonry'),trim:m('trim'),glass:m('glass',{transparent:true}),leaf:m('leaf'),iron:m('iron'),brass:m('brass'),post:m('post'),hide:m('hide'),eye:m('eye')};})();
function hero(asset:string,x:number,parts:[string,MeshStandardMaterial,number,string?][],pivots:string[],clips:AnimationClip[]=[]):FarmInstance{
 const object=new Group(),clone=new Group();object.name=`${asset}-${x}`;clone.name=asset;object.position.set(x,0,3);object.rotation.y=.4;object.add(clone);
 for(const name of pivots){const p=new Group();p.name=name;p.position.set(1,0,.5);clone.add(p);}
 for(const[name,material,at,parent]of parts){const m=new Mesh(name==='pin'?shared.pin:shared.unit,material);m.name=name;m.position.set(at,.25,0);(parent?clone.getObjectByName(parent)!:clone).add(m);}
 return{id:object.name,asset:{id:asset},object,mixer:new AnimationMixer(clone),clips,action:null,clipIndex:''};
}
function heroWorld(){
 const outer=new Scene(),root=new Scene();outer.add(root);
 const house=hero('farmhouse',0,[['wall-a',shared.masonry,0],['wall-b',shared.masonry,2],['wall-c',shared.masonry,4],['trim-a',shared.trim,1],['trim-b',shared.trim,3],['pane',shared.glass,5],['door-leaf',shared.leaf,0,'Joint_FrontDoor'],['door-hardware',shared.iron,.5,'Joint_FrontDoor'],['pin',shared.brass,.8,'Joint_FrontDoor']],['Joint_FrontDoor']);
 const open=()=>[new AnimationClip('Open',1,[new QuaternionKeyframeTrack('Joint_GateLeaf.quaternion',[0,1],[0,0,0,1,0,.7071,0,.7071]),new VectorKeyframeTrack('Latch.position',[0,1],[1,0,.5,1,.2,.5])])];
 const gates=[10,20].map(x=>hero('fence-gate',x,[['post-a',shared.post,0],['post-b',shared.post,3],['latch-a',shared.post,0,'Latch'],['latch-b',shared.post,.3,'Latch'],['gate-leaf',shared.leaf,1,'Joint_GateLeaf'],['keeper',shared.iron,2,'Joint_GateLeaf']],['Latch','Joint_GateLeaf'],open()));
 const barrels=[30,31].map(x=>fixture('barrel',shared.unit,shared.masonry,x));
 const cows=[40,42].map(x=>{const cow=fixture('cow',shared.unit,shared.hide,x,[new AnimationClip('Graze',1,[])]),eye=new Mesh(shared.pin,shared.eye);eye.position.y=1;cow.object.add(eye);return cow;});
 const instances=[house,...gates,...barrels,...cows];for(const i of instances)root.add(i.object);
 // Every placement mesh casts and receives (placements.ts).
 root.traverse(n=>{if((n as Mesh).isMesh)n.castShadow=n.receiveShadow=true;});root.updateMatrixWorld(true);
 return{outer,root,instances,house,gates,cows};
}
const meshes=(o:Object3D)=>{const out:Mesh[]=[];o.traverseVisible(n=>{if((n as Mesh).isMesh)out.push(n as Mesh);});return out;};
const graphStats=(w:ReturnType<typeof heroWorld>,o:ReturnType<typeof optimizeFarmWorld>)=>{const g=createFrameGraph({scene:w.outer,worldRoot:w.root,owners:o.owners,batches:o.batches,isFixed:o.isFixed});const s={...g.stats};g.restore();return s;};
test('S4b: hero anchor merge keeps doors, pivots and B-07 counts, shares gate geometry and restores',()=>{
 const off=heroWorld(),plain=optimizeFarmWorld(off.root,off.instances,{meshes:[],derivatives:0},{packWoodland:false,heroMerge:false});
 const w=heroWorld(),house=w.house,pivot=house.object.getObjectByName('Joint_FrontDoor')!,center=doorCenter(findDoor(house)!,new Vector3());
 const geometries=new Set<BufferGeometry>(),o=optimizeFarmWorld(w.root,w.instances,{meshes:[],derivatives:0},{packWoodland:false});
 expect(plain.stats.heroes).toBeNull();
 expect(o.stats.heroes).toEqual({owners:3,sourceMeshes:13,mergedMeshes:6,keptMeshes:8,groups:13});
 expect(o.heroes).toEqual([house,...w.gates]);
 // B-07: batching, frozen and frame-graph counts are taken before and around the merge, so they do not move.
 expect([o.stats.batching,o.stats.frozen,graphStats(w,o)]).toEqual([plain.stats.batching,plain.stats.frozen,graphStats(off,plain)]);
 expect(meshes(house.object).map(m=>m.name).sort()).toEqual(['Merged farmhouse/masonry','Merged farmhouse/trim','door-hardware','door-leaf','pane','pin']);
 // Doors: the same pivot, the same interaction centre, and apply still swings the leaf.
 const door=findDoor(house)!,leaf=house.object.getObjectByName('door-leaf')!,before=leaf.matrixWorld.clone();
 expect(door.pivots[0]).toBe(pivot);expect(doorCenter(door,new Vector3()).distanceTo(center)).toBeLessThan(1e-9);
 door.apply(1);expect(leaf.matrixWorld.equals(before)).toBe(false);expect(leaf.parent).toBe(pivot);door.apply(0);
 // Gates: the clip-targeted Latch is an anchor of its own, and both gates draw one shared geometry per anchor and material.
 const latch=w.gates.map(g=>g.object.getObjectByName('Merged Latch/post') as Mesh),posts=w.gates.map(g=>g.object.getObjectByName('Merged fence-gate/post') as Mesh);
 expect(latch.map(m=>m.parent?.name)).toEqual(['Latch','Latch']);expect(latch[0]!.geometry).toBe(latch[1]!.geometry);expect(posts[0]!.geometry).toBe(posts[1]!.geometry);
 for(const m of [...latch,...posts])geometries.add(m.geometry);let disposed=0;for(const g of geometries)g.addEventListener('dispose',()=>disposed++);
 o.restore();expect(disposed).toBe(2);expect(meshes(w.root).some(m=>m.name.startsWith('Merged'))).toBe(false);expect(meshes(house.object).length).toBe(9);plain.restore();
});
test('S4: shadow tiers build hero depth stand-ins and drop herd batches under two texels, leaving frozen and graph counts alone',()=>{
 const off=heroWorld(),plain=optimizeFarmWorld(off.root,off.instances,{meshes:[],derivatives:0},{packWoodland:false});
 const w=heroWorld(),o=optimizeFarmWorld(w.root,w.instances,{meshes:[],derivatives:0},{packWoodland:false,shadow:{mapSize:2048,standIns:true,minCasterTexels:2}});
 expect(plain.stats.shadow).toBeNull();
 expect(o.stats.shadow).toMatchObject({proxies:8,dropped:1,smallCasters:1});expect(o.stats.shadow!.texel).toBeCloseTo(88/2048,12);
 expect([o.stats.frozen,graphStats(w,o)]).toEqual([plain.stats.frozen,graphStats(off,plain)]);
 const proxies:Mesh[]=[];w.root.traverse(n=>{if(n.userData.kilnShadowStandIn)proxies.push(n as Mesh);});
 expect(proxies.map(p=>p.parent!.name).sort()).toEqual(['Joint_FrontDoor','Joint_GateLeaf','Joint_GateLeaf','Latch','Latch','farmhouse','fence-gate','fence-gate']);
 expect(proxies.every(p=>p.layers.mask===1<<FARM_SHADOW.standInLayer&&p.castShadow)).toBe(true);
 // Main-pass meshes stop casting (the pane too: one opaque depth draw); the 1 cm pin is under two texels and drops.
 expect(meshes(w.house.object).filter(m=>!m.userData.kilnShadowStandIn).every(m=>!m.castShadow)).toBe(true);
 const herd=o.batches.batches.filter(b=>b.dynamic).map(b=>[(b.mesh.material as Material).name,b.mesh.castShadow]);
 expect(herd.sort()).toEqual([['eye',false],['hide',true]]);
 o.restore();expect(meshes(w.root).every(m=>m.castShadow)).toBe(true);expect(proxies.every(p=>!p.parent)).toBe(true);plain.restore();
});

if(process.env.ORACLE==='1')test('B-07 count-only sealed r33 oracle matches Farm optimization and the frozen historical/current counts',async()=>{
 await import('../../scripts/audit-optimization-counts');
});
