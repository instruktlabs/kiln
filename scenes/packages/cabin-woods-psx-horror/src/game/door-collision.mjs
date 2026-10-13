import * as THREE from 'three/webgpu';
import {resolvePlayer} from './collision.mjs';

/** A retained yaw-oriented box, separate from render geometry. */
export function createDoorCollisionShape(definition,id){
 const localBounds=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3().fromArray(definition.center),new THREE.Vector3().fromArray(definition.size));
 const bounds=new THREE.Box3(),center=new THREE.Vector3(),collider={id,type:'obb',x:0,z:0,halfX:0,halfZ:0,angle:0,minY:0,maxY:0};
 return {collider,update(matrix){
  bounds.copy(localBounds).applyMatrix4(matrix);center.fromArray(definition.center).applyMatrix4(matrix);const e=matrix.elements;
  collider.x=center.x;collider.z=center.z;collider.halfX=definition.size[0]*Math.hypot(e[0],e[2])*.5;collider.halfZ=definition.size[2]*Math.hypot(e[8],e[10])*.5;collider.angle=Math.atan2(e[2],e[0]);collider.minY=bounds.min.y;collider.maxY=bounds.max.y;
  return collider;
 }};
}

/** Event-time clearance query. Trial poses never enter the live scene or collider
 * cache. Retains the existing 24 angular intervals and player clearance rules. */
export function createDoorClearanceQuery(hinge,leaf,definition){
 let ancestor=leaf;while(ancestor&&ancestor!==hinge)ancestor=ancestor.parent;
 if(!ancestor)throw new TypeError('Door collision leaf must descend from its hinge');
 const trial=new THREE.Object3D(),relative=new THREE.Matrix4(),world=new THREE.Matrix4(),shape=createDoorCollisionShape(definition,'door-clearance'),colliders=[shape.collider],zero=[0,0,0];
 return (position,targetAngle)=>{
  leaf.updateWorldMatrix(true,false);relative.copy(hinge.matrixWorld).invert().multiply(leaf.matrixWorld);
  trial.position.copy(hinge.position);trial.rotation.copy(hinge.rotation);trial.scale.copy(hinge.scale);trial.pivot=hinge.pivot;
  const start=hinge.rotation.y;
  for(let step=0;step<=24;step++){
   trial.rotation.y=start+(targetAngle-start)*step/24;trial.updateMatrix();
   if(hinge.parent)world.copy(hinge.parent.matrixWorld);else world.identity();
   world.multiply(trial.matrix).multiply(relative);shape.update(world);
   const resolved=resolvePlayer(position,zero,colliders);
   if(Math.hypot(resolved[0]-position[0],resolved[2]-position[2])>.001)return false;
  }
  return true;
 };
}
