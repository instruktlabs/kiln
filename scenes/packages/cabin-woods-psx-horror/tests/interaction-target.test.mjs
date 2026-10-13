import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {pickInteractionTarget} from '../src/game/interaction-target.mjs';
test('sparse rack can be used through its empty center while nearer solid geometry blocks it',()=>{
 const root=new THREE.Group(),rack=new THREE.Group();rack.userData.interaction={kind:'storage',id:'storage'};root.add(rack);
 const material=new THREE.MeshBasicMaterial();for(const x of [-.45,.45]){const rail=new THREE.Mesh(new THREE.BoxGeometry(.1,1,.1),material);rail.position.set(x,0,-2);rack.add(rail);}
 const wall=new THREE.Mesh(new THREE.PlaneGeometry(3,3),material);wall.position.z=-4;root.add(wall);root.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,0,-1),0,3),volumes=[{root:rack,bounds:new THREE.Box3().setFromObject(rack)}];
 assert.equal(pickInteractionTarget(ray,root),null);
 assert.equal(pickInteractionTarget(ray,root,volumes)?.id,'storage');
 wall.position.z=-1;root.updateMatrixWorld(true);assert.equal(pickInteractionTarget(ray,root,volumes),null);
 wall.material=new THREE.MeshBasicMaterial({alphaTest:.5});assert.equal(pickInteractionTarget(ray,root,volumes)?.id,'storage');
});
