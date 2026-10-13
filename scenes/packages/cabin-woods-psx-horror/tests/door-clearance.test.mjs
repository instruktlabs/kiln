import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {createDoorClearanceQuery} from '../src/game/door-collision.mjs';
import {resolvePlayer} from '../src/game/collision.mjs';

test('independent clearance query matches live hinge poses without moving the live door',()=>{
 const parent=new THREE.Group(),hinge=new THREE.Group(),offset=new THREE.Group(),leaf=new THREE.Group();parent.add(hinge);hinge.add(offset);offset.add(leaf);
 parent.position.set(4,.1,-3);parent.rotation.y=.61;parent.scale.setScalar(1.2);hinge.position.set(.15,0,-.4);hinge.pivot=new THREE.Vector3(.03,0,.06);offset.position.z=.08;offset.rotation.y=.12;
 const definition={center:[0,1,.4],size:[.12,2,.8]},query=createDoorClearanceQuery(hinge,leaf,definition),local=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3().fromArray(definition.center),new THREE.Vector3().fromArray(definition.size));
 let blocked=0,clear=0;
 for(const start of [0,-.6,-1.6])for(const end of [0,-1.65]){
  hinge.rotation.y=start;parent.updateMatrixWorld(true);
  for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++){
   const position=[4+x*.25,0,-3+z*.25],rotation=hinge.rotation.toArray(),matrix=leaf.matrixWorld.clone();
   const actual=query(position,end);assert.deepEqual(hinge.rotation.toArray(),rotation);assert(leaf.matrixWorld.equals(matrix));
   let expected=true;
   for(let step=0;step<=24;step++){
    hinge.rotation.y=start+(end-start)*step/24;parent.updateMatrixWorld(true);
    const bounds=local.clone().applyMatrix4(leaf.matrixWorld),center=new THREE.Vector3().fromArray(definition.center).applyMatrix4(leaf.matrixWorld),e=leaf.matrixWorld.elements;
    const proxy={type:'obb',x:center.x,z:center.z,angle:Math.atan2(e[2],e[0]),halfX:.06*Math.hypot(e[0],e[2]),halfZ:.4*Math.hypot(e[8],e[10]),minY:bounds.min.y,maxY:bounds.max.y};
    const resolved=resolvePlayer(position,[0,0,0],[proxy]);
    if(Math.hypot(resolved[0]-position[0],resolved[2]-position[2])>.001){expected=false;break;}
   }
   hinge.rotation.y=start;parent.updateMatrixWorld(true);assert.equal(actual,expected,`clearance at ${position}, ${start} to ${end}`);if(actual)clear++;else blocked++;
  }
 }
 assert(clear>0&&blocked>0);
});

test('a leaf outside the hinge hierarchy is rejected',()=>{
 assert.throws(()=>createDoorClearanceQuery(new THREE.Group(),new THREE.Group(),{center:[0,1,.4],size:[.12,2,.8]}),/descend/);
});
