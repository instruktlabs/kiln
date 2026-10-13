import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';
import {mergeStaticFurnishings,resolveFurnishingHit} from '../src/game/furnishing-merge.mjs';
function fixture(){const parent=new THREE.Group(),material=new THREE.MeshStandardMaterial(),instances=[];for(let i=0;i<2;i++){const root=new THREE.Group();root.name='prop'+i;root.position.set(i*2,0,-4);root.userData.interaction={id:root.name,kind:'storage'};const m=material.clone();m.name='authored'+i;const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),m);mesh.name='part';root.add(mesh);parent.add(root);instances.push({root,assetKey:'prop'+i,animations:[]});}parent.updateMatrixWorld(true);return {parent,instances};}
test('compatible static furnishings merge across families with exact source hit identity and reversible layers',()=>{
 const f=fixture(),source=f.instances[1].root.children[0],ray=new THREE.Raycaster(new THREE.Vector3(2,0,0),new THREE.Vector3(0,0,-1)),before=ray.intersectObjects(f.parent.children,true)[0];
 const h=mergeStaticFurnishings(f.instances,{parent:f.parent});assert.equal(h.meshes.length,1);assert.equal(h.stats.before,2);assert.equal(h.stats.after,1);
 const after=resolveFurnishingHit(ray.intersectObjects(f.parent.children,true)[0]);assert.equal(after.object,source);assert(after.point.distanceTo(before.point)<1e-6);assert(after.normal.distanceTo(before.normal)<1e-6);assert.deepEqual(after.face,before.face);
 assert.equal(source.layers.mask,0);h.dispose();assert.equal(source.layers.mask,1);assert.equal(h.meshes[0].parent,null);
});
test('animated, controlled, blended, and unequal render state parts retain independent draws',()=>{
 for(const change of [f=>f.instances[1].animations.push({}),f=>f.instances[1].root.children[0].userData.dynamic=true,f=>f.instances[1].root.children[0].material.transparent=true,f=>f.instances[1].root.children[0].receiveShadow=true,f=>f.instances[1].root.children[0].material.roughness=.3]){
  const f=fixture();change(f);const h=mergeStaticFurnishings(f.instances,{parent:f.parent});assert.equal(h.meshes.length,0);assert.equal(f.instances[1].root.children[0].layers.mask,1);h.dispose();
 }
});
test('different texture identity and UV state never merge, even with equal material names',()=>{
 const f=fixture();for(const i of f.instances)i.root.children[0].material.map=new THREE.Texture();const h=mergeStaticFurnishings(f.instances,{parent:f.parent});assert.equal(h.meshes.length,0);h.dispose();
});
test('rotated uniformly scaled furniture preserves source ray normals and UVs',()=>{
 const f=fixture();f.parent.position.set(3,1,2);f.parent.rotation.y=.3;f.instances[1].root.rotation.y=.6;f.instances[1].root.scale.setScalar(1.4);f.parent.updateMatrixWorld(true);
 const source=f.instances[1].root.children[0],position=source.getWorldPosition(new THREE.Vector3()),direction=new THREE.Vector3(0,0,-1).transformDirection(source.matrixWorld),ray=new THREE.Raycaster(position.clone().addScaledVector(direction,-3),direction),before=ray.intersectObjects(f.parent.children,true)[0];
 const h=mergeStaticFurnishings(f.instances,{parent:f.parent}),after=resolveFurnishingHit(ray.intersectObjects(f.parent.children,true)[0]);assert.equal(h.meshes.length,1);assert.equal(after.object,before.object);assert(after.point.distanceTo(before.point)<1e-5);assert(after.uv.distanceTo(before.uv)<1e-5);assert(after.normal.distanceTo(before.normal)<1e-5);h.dispose();
});
