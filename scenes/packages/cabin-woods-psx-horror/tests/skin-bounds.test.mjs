import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createSkinBoundsUpdater} from '../src/game/skin-bounds.mjs';

function fixture(){
 const root=new THREE.Group(),a=new THREE.Bone(),b=new THREE.Bone();a.add(b);b.position.x=1;
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,1,.2,0,0,.2,0],3));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0],4));
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,.3,.7,0,0,0,1,0,0,.5,.5,0,0],4));
 const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial());mesh.add(a);root.add(mesh);root.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton([a,b]));mesh.computeBoundingSphere();
 return {root,mesh,a,b,geometry};
}
function enclosed(mesh){
 const point=new THREE.Vector3();for(let i=0;i<mesh.geometry.attributes.position.count;i++){
  mesh.getVertexPosition(i,point);assert.ok(mesh.boundingBox.containsPoint(point),`box excludes vertex ${i}: ${point.toArray()}`);
  assert.ok(point.distanceTo(mesh.boundingSphere.center)<=mesh.boundingSphere.radius+1e-9,`sphere excludes vertex ${i}`);
 }
}
test('unchanged conservative poses reuse bounds but changed joints and hidden-to-visible poses refresh',()=>{
 const f=fixture(),bounds=createSkinBoundsUpdater(f.root);bounds.update();const initial=f.mesh.boundingBox.clone();bounds.update();assert.equal(bounds.diagnostics.recomputed,1);assert.equal(bounds.diagnostics.reused,1);
 f.mesh.visible=false;f.b.position.x=4;f.root.updateMatrixWorld(true);bounds.update();f.mesh.visible=true;bounds.update();assert.equal(bounds.diagnostics.recomputed,2);assert(!f.mesh.boundingBox.equals(initial));enclosed(f.mesh);
});
test('posed bounds contain extension beyond the resting sphere without disabling culling',()=>{
 const f=fixture(),rest=f.mesh.boundingSphere.clone(),bounds=createSkinBoundsUpdater(f.root);
 f.b.position.x=5;f.root.updateMatrixWorld(true);const tip=f.mesh.getVertexPosition(2,new THREE.Vector3());assert.ok(!rest.containsPoint(tip));
 bounds.update();enclosed(f.mesh);assert.equal(f.mesh.frustumCulled,true);assert.equal(bounds.diagnostics.conservative,1);
});
test('weighted posed bounds contain all vertices under rotating bones and a transformed parent',()=>{
 const f=fixture(),weights=Array.from(f.geometry.attributes.skinWeight.array),positions=Array.from(f.geometry.attributes.position.array),bounds=createSkinBoundsUpdater(f.root);
 for(let phase=0;phase<=120;phase++){
  f.root.position.set(34,-2,-26);f.root.rotation.set(.2,phase*.053,-.3);f.root.scale.set(1.2,.9,1.1);
  f.a.rotation.z=Math.sin(phase*.17)*1.7;f.b.rotation.y=Math.cos(phase*.11)*2;f.b.position.x=1+phase*.02;
  f.root.updateMatrixWorld(true);bounds.update();enclosed(f.mesh);
 }
 assert.deepEqual(Array.from(f.geometry.attributes.skinWeight.array),weights);assert.deepEqual(Array.from(f.geometry.attributes.position.array),positions);
});
test('morph targets use actual posed vertex bounds',()=>{
 const f=fixture();f.geometry.morphAttributes.position=[new THREE.Float32BufferAttribute([0,0,0,3,0,0,3,.2,0,0,.2,0],3)];f.mesh.updateMorphTargets();f.mesh.morphTargetInfluences[0]=1;
 const bounds=createSkinBoundsUpdater(f.root);f.root.updateMatrixWorld(true);bounds.update();enclosed(f.mesh);assert.equal(bounds.diagnostics.exactFallback,1);
});
test('hidden parent skips work and restoration updates bounds before drawing',()=>{
 const f=fixture(),bounds=createSkinBoundsUpdater(f.root),before=f.mesh.boundingSphere.clone();f.root.visible=false;f.b.position.x=6;f.root.updateMatrixWorld(true);bounds.update();assert.deepEqual(f.mesh.boundingSphere,before);
 f.root.visible=true;bounds.update();enclosed(f.mesh);
});
test('unsupported signed weights fall back to actual vertices, malformed joints fail visible',()=>{
 const signed=fixture();signed.geometry.attributes.skinWeight.setXYZW(1,-.5,1.5,0,0);const exact=createSkinBoundsUpdater(signed.root);signed.b.position.x=3;signed.root.updateMatrixWorld(true);exact.update();enclosed(signed.mesh);assert.equal(exact.diagnostics.exactFallback,1);
 const malformed=fixture();malformed.geometry.attributes.skinIndex.setXYZW(2,0,999,0,0);const safe=createSkinBoundsUpdater(malformed.root);safe.update();assert.equal(malformed.mesh.boundingSphere.radius,Infinity);assert.equal(safe.diagnostics.failVisible,1);
});
test('near-unit Float32 weights cover both CPU and actual homogeneous shader skin equations',()=>{
 const f=fixture();f.root.position.x=100;f.root.updateMatrixWorld(true);
 for(let i=0;i<4;i++)f.geometry.attributes.skinWeight.setXYZW(i,.5000045,.5000045,0,0);
 const bounds=createSkinBoundsUpdater(f.root);bounds.update();enclosed(f.mesh);
 const base=new THREE.Vector4(),sum=new THREE.Vector4(),term=new THREE.Vector4(),matrix=new THREE.Matrix4();
 for(let i=0;i<4;i++){
  const p=f.geometry.attributes.position;base.set(p.getX(i),p.getY(i),p.getZ(i),1).applyMatrix4(f.mesh.bindMatrix);sum.set(0,0,0,0);
  for(let j=0;j<4;j++){
   const weight=f.geometry.attributes.skinWeight.getComponent(i,j),joint=f.geometry.attributes.skinIndex.getComponent(i,j);if(!weight)continue;
   matrix.multiplyMatrices(f.mesh.skeleton.bones[joint].matrixWorld,f.mesh.skeleton.boneInverses[joint]);sum.addScaledVector(term.copy(base).applyMatrix4(matrix),weight);
  }
  sum.applyMatrix4(f.mesh.bindMatrixInverse);const shaderPoint=new THREE.Vector3(sum.x,sum.y,sum.z);
  assert.ok(f.mesh.boundingBox.containsPoint(shaderPoint),`shader vertex ${i} excluded`);
 }
});
