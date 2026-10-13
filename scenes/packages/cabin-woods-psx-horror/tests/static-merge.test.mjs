import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three/webgpu';
import {mergeStaticAsset} from '../src/game/static-merge.mjs';
test('consumer merge preserves world geometry, material identity and semantic frames without hiding excluded descendants',()=>{
 const root=new THREE.Group();root.position.set(3,0,2);root.rotation.y=.4;const material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry(1,2,1);
 const wall=new THREE.Mesh(geometry,material);wall.name='Wall';wall.position.set(1,1,0);root.add(wall);const second=new THREE.Mesh(geometry,material);second.position.set(-2,1,1);root.add(second);
 const excluded=new THREE.SkinnedMesh(geometry,material);excluded.boundingBox=new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));excluded.name='PreservedSkin';wall.add(excluded);root.updateMatrixWorld(true);
 const points=meshes=>meshes.flatMap(mesh=>{const a=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;return Array.from({length:index?.count??a.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld).toArray());}).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
 const before=points([wall,second]),frame=wall.matrixWorld.clone(),result=mergeStaticAsset(root);root.updateMatrixWorld(true);const after=points(root.children.filter(n=>n.name.startsWith('SceneMerged_')));
 assert.equal(result.before,2);assert.equal(result.after,1);assert.equal(before.length,after.length);for(let i=0;i<before.length;i++)assert(Math.hypot(...before[i].map((v,j)=>v-after[i][j]))<2e-6);assert(wall.matrixWorld.equals(frame));assert.equal(root.getObjectByName('Wall'),wall);
 assert.equal(wall.visible,true,'a merged mesh must not hide its preserved children');assert.equal(wall.layers.mask,0);assert.equal(excluded.layers.mask,1);assert.equal(excluded.visible,true);assert(root.children.some(n=>n.name.startsWith('SceneMerged_')&&n.material===material));result.dispose();geometry.dispose();material.dispose();
});
