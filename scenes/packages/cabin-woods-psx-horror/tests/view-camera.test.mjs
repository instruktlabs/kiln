import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {OVERVIEW_CAMERA,applyOverviewCamera,initialCameraMode} from '../src/game/view-camera.mjs';

test('public entry is a fixed aerial; benchmark navigation is explicit and closed',()=>{
 assert.equal(initialCameraMode({benchmark:false}),'overview');
 assert.equal(initialCameraMode({benchmark:true}),'caretaker');
 assert.equal(initialCameraMode({benchmark:true,camera:'overview'}),'overview');
 assert.throws(()=>initialCameraMode({benchmark:true,camera:'unknown'}),/camera/);
});
test('fixed aerial owns actual camera pose and retains it across repeated frames',()=>{
 const camera=new THREE.PerspectiveCamera(70,16/9,.025,76);
 applyOverviewCamera(camera,'game');
 assert.deepEqual(camera.position.toArray(),OVERVIEW_CAMERA.position);
 assert.equal(camera.fov,50);assert.equal(camera.near,.1);assert.equal(camera.far,76);
 const direction=new THREE.Vector3().fromArray(OVERVIEW_CAMERA.target).sub(camera.position).normalize();
 assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction)<1e-12);
 const q=camera.quaternion.toArray();
 for(let i=0;i<200;i++)applyOverviewCamera(camera,'game');
 assert.deepEqual(camera.quaternion.toArray(),q);
 applyOverviewCamera(camera,'neutral');assert.equal(camera.far,125);
});
