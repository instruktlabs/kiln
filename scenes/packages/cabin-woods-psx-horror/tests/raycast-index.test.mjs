import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';import {createRaycastIndex} from '../src/game/raycast-index.mjs';
test('bounded flat targets preserve sorted nearest hits and skip distant decorative trees',()=>{
 const root=new THREE.Group(),near=new THREE.Group(),far=new THREE.Group(),a=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),b=a.clone();a.position.z=-3;b.position.set(50,0,-3);near.add(a);far.add(b);root.add(near,far);root.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,0,-1),0,5),expected=ray.intersectObjects(root.children,true),index=createRaycastIndex(root);
 index.intersect(ray); // Build once; subsequent queries must use the retained flat index.
 root.traverse=()=>{throw Error('World traversal');};far.traverse=()=>{throw Error('Decorative traversal');};b.raycast=()=>{throw Error('Distant raycast');};
 const hits=index.intersect(ray);assert.equal(hits[0].object,expected[0].object);assert.equal(hits[0].distance,expected[0].distance);
});
test('dynamic bounds, added pickup roots, layer changes and inside-box rays remain correct',()=>{
 const root=new THREE.Group(),a=new THREE.Mesh(new THREE.BoxGeometry(10,10,10),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));root.add(a);root.updateMatrixWorld(true);const index=createRaycastIndex(root,{dynamic:()=>true}),ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,0,-1),0,6);
 assert(index.intersect(ray).length>0);a.position.x=20;root.updateMatrixWorld(true);assert.equal(index.intersect(ray).length,0);
 const pickup=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());pickup.position.z=-2;root.add(pickup);root.updateMatrixWorld(true);assert.equal(index.intersect(ray)[0].object,pickup);pickup.layers.mask=0;assert.equal(index.intersect(ray).length,0);
});
