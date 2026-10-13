import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';import {createRoleLookup,findRole} from '../src/game/assets.mjs';
test('retained role lookup preserves first depth-first aliases without later traversal',()=>{
 const root=new THREE.Group(),a=new THREE.Object3D(),b=new THREE.Object3D();a.name='Mesh_hand';a.userData.role='grip';b.name='hand';root.add(a,b);
 const expected=['hand','Mesh_hand','grip','missing'].map(name=>findRole(root,name)),lookup=createRoleLookup(root);root.traverse=()=>{throw Error('Repeated traversal');};
 assert.deepEqual(['hand','Mesh_hand','grip','missing'].map(lookup),expected);
});
