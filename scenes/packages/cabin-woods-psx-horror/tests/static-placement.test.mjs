import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import * as assets from '../src/game/assets.mjs';
import {batchStaticVegetation} from '../src/game/scene-optimization.mjs';
import {convexHullXZ} from '../src/game/convex-footprint.mjs';
import * as footprints from '../src/game/convex-footprint.mjs';
import {createWorldModels} from '../src/game/world-models.mjs';
function master(){const scene=new THREE.Group(),part=new THREE.Mesh(new THREE.BoxGeometry(.7,1.1,.4),new THREE.MeshStandardMaterial({alphaTest:.5}));part.position.set(.3,.7,-.2);part.rotation.y=.3;part.name='AuthoredRock';scene.add(part);scene.updateMatrixWorld(true);return {scene,animations:[],entry:{key:'rock',sha256:'fixture'}};}
function placement(m,x){const i=assets.createStaticPlacement(m);i.root.name='rock-'+x;i.root.position.set(x,.2,-2);i.root.rotation.y=.7;i.root.scale.setScalar(1.4);return i;}
test('compact placement requires the non-renderable container returned by GLTFLoader',()=>{
 const m=master();assert.throws(()=>assets.createStaticPlacement({...m,scene:m.scene.children[0]}),/container/i);
});
test('world source fallback stays attached and disposes only its owned material once',()=>{
 const m=master();m.entry.key='pine';
 const collection={manifest:{},masters:new Map([['pine',m]]),surfaceMaterials:new Map(),instantiate(key,options){
  if(options.staticPlacement)return assets.createStaticPlacement(m);
  const root=m.scene.clone(true);root.traverse(n=>{if(n.isMesh)n.material=n.material.clone();});return {root,entry:m.entry,animations:[],mixer:new THREE.AnimationMixer(root)};
 }};
 const models=createWorldModels(collection,{}, {vegetationStrategy:'cells'}),batch=models.merges.find(h=>h.stats.strategy==='cells');
 const instance=models.instances.find(i=>i.sourceRoot);assert(instance);
 batch.setEnabled(false);assert(instance.root.parent===models.root,'source fallback must be in the render tree');
 let disposed=0,canonicalDisposed=0;instance.root.children[0].material.addEventListener('dispose',()=>disposed++);m.scene.children[0].material.addEventListener('dispose',()=>canonicalDisposed++);
 models.dispose();assert.equal(disposed,1);assert.equal(canonicalDisposed,0);
});
test('static placement retains one canonical graph and materializes independent inspection copies on demand',()=>{
 const m=master(),i=placement(m,4);assert.equal(i.root.children.length,0);assert.equal(i.sourceRoot,m.scene);assert.equal(i.entry,m.entry);
 i.materialize();assert.equal(i.root.children.length,1);assert.notEqual(i.root.children[0],m.scene.children[0]);assert.equal(i.root.children[0].geometry,m.scene.children[0].geometry);assert.notEqual(i.root.children[0].material,m.scene.children[0].material);
 i.root.children[0].material.roughness=.1;assert.equal(m.scene.children[0].material.roughness,1);const transform=i.root.matrix.clone();i.releaseSource();assert.equal(i.root.children.length,0);assert(i.root.matrix.equals(transform));assert.equal(m.scene.children[0].layers.mask,1);
 assert.throws(()=>assets.createStaticPlacement({...m,animations:[new THREE.AnimationClip('moving',1,[])]}),/static/i);
});
test('shared static sources produce identical transformed triangles and reversible whole-placement visibility',()=>{
 const m=master(),parent=new THREE.Group(),a=placement(m,4),b=placement(m,7);parent.position.set(2,0,3);parent.rotation.y=-.2;parent.add(a.root,b.root);parent.updateMatrixWorld(true);
 const expected=[];for(const i of [a,b]){i.materialize();i.root.updateMatrixWorld(true);i.root.traverse(n=>{if(n.isMesh){const p=n.geometry.attributes.position;for(let k=0;k<p.count;k++)expected.push([...new THREE.Vector3().fromBufferAttribute(p,k).applyMatrix4(n.matrixWorld).toArray(),...new THREE.Vector3().fromBufferAttribute(n.geometry.attributes.normal,k).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(n.matrixWorld)).toArray(),n.geometry.attributes.uv.getX(k),n.geometry.attributes.uv.getY(k)]);}});i.releaseSource();}
 const h=batchStaticVegetation([a,b],{enabled:true,parent,strategy:'family-frustum'});assert.equal(h.stats.acceptedInstances,2);assert.equal(h.meshes.length,1);assert.equal(a.root.children.length,0);assert.equal(m.scene.children[0].layers.mask,1);
 parent.updateMatrixWorld(true);const actual=[],mesh=h.meshes[0],matrix=new THREE.Matrix4();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);const p=mesh.geometry.attributes.position;for(let k=0;k<p.count;k++)actual.push([...new THREE.Vector3().fromBufferAttribute(p,k).applyMatrix4(matrix).toArray(),...new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal,k).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix)).toArray(),mesh.geometry.attributes.uv.getX(k),mesh.geometry.attributes.uv.getY(k)]);}
 const key=p=>p.map(v=>v.toFixed(5)).join(',');assert.deepEqual([...new Set(actual.map(key))].sort(),[...new Set(expected.map(key))].sort());
 a.root.visible=false;h.sync();assert.equal(mesh.count,1);h.setEnabled(false);assert.equal(b.root.children.length,1);assert.equal(h.group.visible,false);h.setEnabled(true);assert.equal(b.root.children.length,0);assert.equal(mesh.count,1);h.dispose();assert.equal(m.scene.children.length,1);assert.equal(m.scene.children[0].layers.mask,1);
});
test('unsupported static source parts fall back to full source rendering without disappearing',()=>{
 const m=master();m.scene.children[0].material.transparent=true;const i=placement(m,4),parent=new THREE.Group();parent.add(i.root);const h=batchStaticVegetation([i],{enabled:true,parent});assert.equal(h.stats.acceptedInstances,0);assert.equal(i.root.children.length,1);assert.equal(i.root.children[0].layers.mask,1);h.dispose();i.releaseSource();
});
test('repeated frustum culling reuses batch resources and never materializes or disposes source assets',()=>{
 const m=master(),i=placement(m,4),parent=new THREE.Group();parent.add(i.root);
 const h=batchStaticVegetation([i],{enabled:true,parent,strategy:'family-frustum'}),mesh=h.meshes[0],geometry=mesh.geometry,material=mesh.material,attribute=mesh.instanceMatrix;
 const camera=new THREE.PerspectiveCamera(60,1,.1,100);camera.position.set(4,2,8);let disposals=0;
 for(const resource of [mesh,geometry,material,m.scene.children[0].geometry])resource.addEventListener('dispose',()=>disposals++);
 for(let pass=0;pass<20;pass++){
  camera.lookAt(4,.7,-2);camera.updateMatrixWorld(true);h.cull(camera);assert.equal(mesh.count,1);
  camera.lookAt(4,2,18);camera.updateMatrixWorld(true);h.cull(camera);assert.equal(mesh.count,0);
  assert(h.meshes[0]===mesh&&mesh.geometry===geometry&&mesh.material===material&&mesh.instanceMatrix===attribute);
  assert.equal(i.root.children.length,0);assert.equal(disposals,0);
 }
 h.dispose();
});
test('compact rock placement preserves the full-clone hull and vertical bounds',()=>{
 const m=master(),i=placement(m,4);i.root.updateMatrixWorld(true);const compact=footprints.staticInstanceFootprint(i);i.materialize();i.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(i.root),points=[];i.root.traverse(n=>{if(n.isMesh){const a=n.geometry.attributes.position;for(let j=0;j<a.count;j++){const p=new THREE.Vector3().fromBufferAttribute(a,j).applyMatrix4(n.matrixWorld);points.push([p.x,p.z]);}}});const expected=convexHullXZ(points);assert.equal(compact.points.length,expected.length);for(let j=0;j<expected.length;j++)for(let k=0;k<2;k++)assert(Math.abs(compact.points[j][k]-expected[j][k])<1e-10);for(const axis of ['X','Y','Z']){assert(Math.abs(compact['min'+axis]-box.min[axis.toLowerCase()])<1e-10);assert(Math.abs(compact['max'+axis]-box.max[axis.toLowerCase()])<1e-10);}i.releaseSource();
});
