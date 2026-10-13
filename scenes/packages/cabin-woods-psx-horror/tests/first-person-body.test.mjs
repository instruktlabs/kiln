import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';
import {createFirstPersonBodyPlacement} from '../src/game/first-person-body.mjs';
test('upright local body aligns its rest eye under the fixed camera through every heading without following head animation',()=>{
 const root=new THREE.Group(),eye=new THREE.Object3D();eye.name='camera_eye';eye.position.set(.19,1.61,.01);root.add(eye);const placement=createFirstPersonBodyPlacement(root),position=[4,.1,-3],point=new THREE.Vector3();
 for(let angle=0;angle<6.3;angle+=.2){placement.place(position,angle);root.updateMatrixWorld(true);eye.getWorldPosition(point);assert(Math.abs(point.x-position[0])<1e-10);assert(Math.abs(point.z-position[2])<1e-10);assert.equal(root.position.y,position[1]);assert.equal(root.rotation.x,0);assert.equal(root.rotation.z,0);}
 placement.place(position,.7);const before=root.position.clone();eye.position.x+=.1;eye.position.y+=.1;placement.place(position,.7);assert(root.position.equals(before),'animated eye motion must not move the local body or fixed camera');
});
test('missing eye marker retains the legacy body origin',()=>{const root=new THREE.Group(),placement=createFirstPersonBodyPlacement(root);placement.place([1,2,3],.5);assert.deepEqual(root.position.toArray(),[1,2,3]);});
