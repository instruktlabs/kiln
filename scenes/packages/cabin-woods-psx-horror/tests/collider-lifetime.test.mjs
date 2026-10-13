import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createWorldModels} from '../src/game/world-models.mjs';

test('world collision records are reused and moving door proxies follow the actual leaf transform',()=>{
 const leafDefinition={node:'leaf',center:[0,1,.4],size:[.12,2,.8]},source=new THREE.Group(),hinge=new THREE.Group(),leaf=new THREE.Group();hinge.name='hinge';leaf.name='leaf';hinge.add(leaf);source.add(hinge);
 const collection={manifest:{interfaces:{cabin:{sockets:[],door:{hingeNode:'hinge',leafCollider:leafDefinition}}}},masters:new Map([['door',source]]),surfaceMaterials:new Map(),instantiate(key){const root=source.clone(true);return {root,entry:{key},animations:[],mixer:new THREE.AnimationMixer(root)};}};
 const models=createWorldModels(collection,{}, {optimized:false}),first=models.colliders(),door=models.layout.doors.find(d=>models.byId.has(d.id)),instance=models.byId.get(door.id),proxy=first.find(c=>c.id===door.id+'-leaf'),before={...proxy};assert(proxy);
 assert(models.colliders()===first,'collision array should be retained between frames');
 instance.root.getObjectByName('hinge').rotation.y=.7;
 const next=models.colliders();assert(next===first);assert(next.find(c=>c.id===proxy.id)===proxy);
 const node=instance.root.getObjectByName('leaf'),center=new THREE.Vector3().fromArray(leafDefinition.center).applyMatrix4(node.matrixWorld),bounds=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3().fromArray(leafDefinition.center),new THREE.Vector3().fromArray(leafDefinition.size)).applyMatrix4(node.matrixWorld),e=node.matrixWorld.elements;
 assert(Math.abs(proxy.x-center.x)<1e-10);assert(Math.abs(proxy.z-center.z)<1e-10);assert(Math.abs(proxy.angle-Math.atan2(e[2],e[0]))<1e-10);assert.equal(proxy.minY,bounds.min.y);assert.equal(proxy.maxY,bounds.max.y);assert.notEqual(proxy.angle,before.angle);
 const moved={...proxy};for(let i=0;i<100;i++)assert(models.colliders()===first);assert.deepEqual(proxy,moved);
 instance.root.getObjectByName('hinge').rotation.y=0;models.colliders();assert.deepEqual(proxy,before);
 const liveHinge=instance.root.getObjectByName('hinge'),leafMatrix=node.matrixWorld.clone();
 assert.equal(models.canToggleDoor(door.id,[100,0,100],true),true);
 assert.equal(liveHinge.rotation.y,0);assert(node.matrixWorld.equals(leafMatrix));
 assert.deepEqual(proxy,before,'clearance queries must leave the retained live collision record unchanged');
 assert.equal(models.canToggleDoor(door.id,[before.x,0,before.z],true),false);
 assert.deepEqual(proxy,before);models.dispose();
});
