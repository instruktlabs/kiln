import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';
import {batchRigidAssemblies} from '../src/game/assembly-batching.mjs';
import {pickInteractionTarget} from '../src/game/interaction-target.mjs';
test('merged window hits retain the original window interaction after board compaction',()=>{
 const parent=new THREE.Group(),geometry=new THREE.BoxGeometry(1,.1,.1),material=new THREE.MeshStandardMaterial(),instances=[];
 for(let i=0;i<2;i++){
  const root=new THREE.Group();root.name='window-'+i;root.position.x=i*2;root.userData.interaction={kind:'window',id:root.name};parent.add(root);
  for(let j=0;j<3;j++){const board=new THREE.Mesh(geometry,material);board.name='Board_'+(j+1);board.position.y=j*.3;root.add(board);}
  instances.push({root,animations:[],entry:{key:'windowAssembly'}});
 }
 const batch=batchRigidAssemblies(instances,{enabled:true,parent}),ray=new THREE.Raycaster(new THREE.Vector3(2,.3,3),new THREE.Vector3(0,0,-1));parent.updateMatrixWorld(true);
 assert.equal(pickInteractionTarget(ray,parent)?.id,'window-1');
 instances[0].root.visible=false;batch.sync();assert.equal(pickInteractionTarget(ray,parent)?.id,'window-1');
 instances[1].root.getObjectByName('Board_2').visible=false;batch.sync();assert.equal(pickInteractionTarget(ray,parent),null);
 batch.dispose();geometry.dispose();material.dispose();
});
