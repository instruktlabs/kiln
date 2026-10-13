import * as THREE from 'three/webgpu';

const finiteVector=p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
const isVisible=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;};

function prepare(mesh){
 const {position,skinIndex,skinWeight}=mesh.geometry.attributes,skeleton=mesh.skeleton;
 const record={mesh,position,skinIndex,skinWeight,boxes:null,sumMin:Infinity,sumMax:-Infinity,work:new THREE.Box3(),transform:new THREE.Matrix4(),point:new THREE.Vector3(),base:new THREE.Vector4(),term:new THREE.Vector4(),shaderPoint:new THREE.Vector4()};
 if(mesh.geometry.morphAttributes.position?.length||!position||!skinIndex||!skinWeight||skinIndex.itemSize!==4||skinWeight.itemSize!==4||skinIndex.count!==position.count||skinWeight.count!==position.count||!skeleton||skeleton.bones.length!==skeleton.boneInverses.length)return record;
 const boxes=skeleton.bones.map(()=>new THREE.Box3()),p=record.point;
 for(let vertex=0;vertex<position.count;vertex++){
  p.fromBufferAttribute(position,vertex).applyMatrix4(mesh.bindMatrix);if(!finiteVector(p))return record;
  let sum=0;
  for(let component=0;component<4;component++){
   const weight=skinWeight.getComponent(vertex,component),joint=skinIndex.getComponent(vertex,component);
   if(!Number.isFinite(weight)||weight<0||!Number.isInteger(joint)||joint<0||joint>=boxes.length)return record;
   sum+=weight;if(weight===0)continue;
   const local=p.clone().applyMatrix4(skeleton.boneInverses[joint]);if(!finiteVector(local))return record;boxes[joint].expandByPoint(local);
  }
  if(!Number.isFinite(sum)||Math.abs(sum-1)>1e-5)return record;
  record.sumMin=Math.min(record.sumMin,sum);record.sumMax=Math.max(record.sumMax,sum);
 }
 if(!position.count)return record;
 record.boxes=boxes;record.pose=new Float64Array((skeleton.bones.length+1)*16);record.pose.fill(NaN);return record;
}

/**
 * Consumer-only bounds for immutable geometry/bind data with arbitrary bone poses.
 * A positive weighted vertex lies in the union of its transformed per-bone boxes.
 * Refresh after world matrices and all animation/IK, before culling or raycasting.
 * Morphs and unsupported weights use exact posed vertices; invalid data fails visible.
 * This changes instance bounds only, never canonical attributes or culling defaults.
 */
export function createSkinBoundsUpdater(root){
 const records=[];root.traverse(mesh=>{if(mesh.isSkinnedMesh)records.push(prepare(mesh));});
 const diagnostics={conservative:records.filter(r=>r.boxes).length,exactFallback:records.filter(r=>!r.boxes).length,failVisible:0,recomputed:0,reused:0};
 const failVisible=record=>{
  const mesh=record.mesh;mesh.boundingBox??=new THREE.Box3();mesh.boundingBox.min.set(-Infinity,-Infinity,-Infinity);mesh.boundingBox.max.set(Infinity,Infinity,Infinity);
  mesh.boundingSphere??=new THREE.Sphere();mesh.boundingSphere.center.set(0,0,0);mesh.boundingSphere.radius=Infinity;
  if(!record.failed){record.failed=true;diagnostics.failVisible++;}
 };
 return {diagnostics,update(){for(const record of records){
  const {mesh,boxes,point,work,transform}=record;if(!isVisible(mesh))continue;
  if(record.pose){let changed=false,offset=0;const compare=matrix=>{for(const value of matrix.elements){if(record.pose[offset]!==value)changed=true;record.pose[offset++]=value;}};compare(mesh.bindMatrixInverse);for(const bone of mesh.skeleton.bones)compare(bone.matrixWorld);if(!changed&&mesh.boundingBox&&mesh.boundingSphere){diagnostics.reused++;continue;}}
  diagnostics.recomputed++;
  mesh.boundingBox??=new THREE.Box3();mesh.boundingSphere??=new THREE.Sphere();const bounds=mesh.boundingBox;bounds.makeEmpty();
  try{
   if(boxes){
    for(let joint=0;joint<boxes.length;joint++){
     if(boxes[joint].isEmpty())continue;
     transform.multiplyMatrices(mesh.bindMatrixInverse,mesh.skeleton.bones[joint].matrixWorld);
     work.copy(boxes[joint]).applyMatrix4(transform);bounds.union(work);
    }
    // CPU Vector3 skinning applies inverse-bind translation once, whereas the
    // shader propagates homogeneous weight sums through that translation.
    // Bound both paths when Float32 sums are close to, but not exactly, one.
    const e=mesh.bindMatrixInverse.elements;
    for(const [axis,index] of [['x',12],['y',13],['z',14]]){
     const sourceMin=bounds.min[axis],sourceMax=bounds.max[axis],min=sourceMin-e[index],max=sourceMax-e[index],lo=record.sumMin,hi=record.sumMax;
     const cpuMin=e[index]+Math.min(min*lo,min*hi,max*lo,max*hi),cpuMax=e[index]+Math.max(min*lo,min*hi,max*lo,max*hi);
     bounds.min[axis]=Math.min(cpuMin,sourceMin*lo,sourceMin*hi,sourceMax*lo,sourceMax*hi);
     bounds.max[axis]=Math.max(cpuMax,sourceMin*lo,sourceMin*hi,sourceMax*lo,sourceMax*hi);
    }
   }else{
    for(let vertex=0;vertex<(mesh.geometry.attributes.position?.count??0);vertex++){
     mesh.getVertexPosition(vertex,point);if(!finiteVector(point))throw Error('Non-finite posed vertex');bounds.expandByPoint(point);
     THREE.Mesh.prototype.getVertexPosition.call(mesh,vertex,point);
     record.base.set(point.x,point.y,point.z,1).applyMatrix4(mesh.bindMatrix);record.shaderPoint.set(0,0,0,0);
     for(let component=0;component<4;component++){
      const weight=record.skinWeight.getComponent(vertex,component),joint=record.skinIndex.getComponent(vertex,component);if(!Number.isFinite(weight))throw Error('Invalid skin weight');if(weight===0)continue;
      transform.multiplyMatrices(mesh.skeleton.bones[joint].matrixWorld,mesh.skeleton.boneInverses[joint]);record.shaderPoint.addScaledVector(record.term.copy(record.base).applyMatrix4(transform),weight);
     }
     record.shaderPoint.applyMatrix4(mesh.bindMatrixInverse);point.set(record.shaderPoint.x,record.shaderPoint.y,record.shaderPoint.z);if(!finiteVector(point))throw Error('Non-finite shader vertex');bounds.expandByPoint(point);
    }
   }
   if(bounds.isEmpty()||!finiteVector(bounds.min)||!finiteVector(bounds.max))throw Error('Invalid posed bounds');
   const magnitude=Math.max(bounds.min.length(),bounds.max.length());bounds.expandByScalar(1e-6+magnitude*2e-7);bounds.getBoundingSphere(mesh.boundingSphere);
  }catch{failVisible(record);}
 }} };
}
