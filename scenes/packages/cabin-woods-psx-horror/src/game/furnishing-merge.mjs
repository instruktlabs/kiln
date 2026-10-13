import * as THREE from 'three/webgpu';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {renderMaterialKey} from './resource-sharing.mjs';
const records=new WeakMap();
const visible=n=>{for(;n;n=n.parent)if(!n.visible)return false;return true;};
function uniform(m){const e=m.elements,x=new THREE.Vector3(e[0],e[1],e[2]),y=new THREE.Vector3(e[4],e[5],e[6]),z=new THREE.Vector3(e[8],e[9],e[10]),s=x.lengthSq();return e.every(Number.isFinite)&&m.determinant()>0&&s>1e-16&&Math.abs(y.lengthSq()-s)<s*1e-6&&Math.abs(z.lengthSq()-s)<s*1e-6&&Math.abs(x.dot(y))+Math.abs(x.dot(z))+Math.abs(y.dot(z))<s*1e-6;}
function eligible(n){const g=n.geometry,m=n.material;return n.isMesh&&!n.isSkinnedMesh&&!n.isInstancedMesh&&!n.isBatchedMesh&&visible(n)&&n.layers.mask&&m?.isMeshStandardMaterial&&!m.isNodeMaterial&&!m.transparent&&!m.transmission&&!m.displacementMap&&m.visible&&!n.customDepthMaterial&&!n.customDistanceMaterial&&!n.userData.sceneOptimization&&n.onBeforeRender===THREE.Object3D.prototype.onBeforeRender&&n.onAfterRender===THREE.Object3D.prototype.onAfterRender&&n.raycast===THREE.Mesh.prototype.raycast&&m.onBeforeCompile===THREE.Material.prototype.onBeforeCompile&&m.customProgramCacheKey===THREE.Material.prototype.customProgramCacheKey&&g?.attributes.position&&g.attributes.normal&&g.attributes.uv&&!Object.keys(g.morphAttributes??{}).length&&g.drawRange.start===0&&g.drawRange.count===Infinity&&!Object.values(g.attributes).some(a=>a.isInstancedBufferAttribute)&&uniform(n.matrixWorld);}
function layout(g){return Object.keys(g.attributes).sort().map(k=>{const a=g.attributes[k];return[k,a.itemSize,a.normalized,a.isInterleavedBufferAttribute?a.data.array.constructor.name:a.array.constructor.name,a.gpuType??THREE.FloatType].join('/');}).join('|');}
/** Explicit stationary furnishing instances only, before any per-asset merge.
 * Canonical meshes, sockets, colliders and hit identities remain available.
 * These instances must not animate or change visibility/transforms/materials while
 * enabled. Controlled furnishings, pickups, doors and effects use separate paths.
 */
export function mergeStaticFurnishings(instances,{parent,cellSize=12}={}){
 if(!parent||!Number.isFinite(cellSize)||cellSize<=0)throw new TypeError('Parent and positive cell size required');
 parent.updateWorldMatrix(true,true);const inverse=parent.matrixWorld.clone().invert(),buckets=new Map(),meshes=[],snapshots=[],stats={before:0,after:0};let disposed=false;
 for(const instance of instances){let controlled=!!instance.animations?.length;instance.root.traverse(n=>{if(n.isBone||n!==instance.root&&(n.userData.dynamic||n.userData.interaction||n.userData.visibilityBoundary))controlled=true;});if(controlled)continue;
  const origin=new THREE.Vector3().setFromMatrixPosition(instance.root.matrixWorld).applyMatrix4(inverse),cell=[origin.x,origin.z].map(v=>Math.floor((v+cellSize/2)/cellSize)).join('/');
  instance.root.traverse(n=>{if(!eligible(n))return;const transform=inverse.clone().multiply(n.matrixWorld);if(!uniform(transform))return;
   const key=JSON.stringify([cell,renderMaterialKey(n.material),layout(n.geometry),n.layers.mask,n.renderOrder,n.castShadow,n.receiveShadow,n.frustumCulled]);
   let bucket=buckets.get(key);if(!bucket){bucket=[];buckets.set(key,bucket);}bucket.push({node:n,transform,instance});
  });
 }
 try{for(const parts of buckets.values()){
  stats.before+=parts.length;if(parts.length<2){stats.after+=parts.length;continue;}
  const geometries=[],ranges=[];let triangle=0,geometry;
  try{for(const part of parts){const g=part.node.geometry.index?part.node.geometry.toNonIndexed():part.node.geometry.clone();g.applyMatrix4(part.transform);for(const a of Object.values(g.attributes))a.gpuType??=THREE.FloatType;geometries.push(g);const count=g.attributes.position.count/3;ranges.push({...part,start:triangle,count,inverseNormal:new THREE.Matrix3().getNormalMatrix(part.transform.clone().invert()),scale:Math.hypot(...part.transform.elements.slice(0,3))});triangle+=count;}geometry=mergeGeometries(geometries,false);}finally{for(const g of geometries)g.dispose();}
  if(!geometry){stats.after+=parts.length;continue;}geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const first=parts[0].node,mesh=new THREE.Mesh(geometry,first.material);mesh.name='SceneFurniture_'+meshes.length;for(const k of ['renderOrder','castShadow','receiveShadow','frustumCulled'])mesh[k]=first[k];mesh.layers.mask=first.layers.mask;
  const families=[...new Set(parts.map(p=>p.instance.assetKey))].sort();mesh.userData.assetKey=families.length===1?families[0]:'scene:furnishings';mesh.userData.sceneOptimization={kind:'static-furnishings',families,sources:parts.map(p=>({root:p.instance.root.name,part:p.node.name}))};
  records.set(mesh,{ranges,get disposed(){return disposed;}});meshes.push(mesh);parent.add(mesh);for(const {node} of parts){snapshots.push({node,mask:node.layers.mask});node.layers.mask=0;}stats.after++;
 }}catch(error){dispose();throw error;}
 parent.updateMatrixWorld(true);
 function dispose(){if(disposed)return;disposed=true;for(const {node,mask} of snapshots)node.layers.mask=mask;for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();}}
 return {meshes,stats,dispose};
}
export function resolveFurnishingHit(hit){
 const record=records.get(hit?.object);if(!record)return hit;if(record.disposed)return null;
 const part=record.ranges.find(p=>hit.faceIndex>=p.start&&hit.faceIndex<p.start+p.count);if(!part)return null;
 const faceIndex=hit.faceIndex-part.start,index=part.node.geometry.index,vertices=[0,1,2].map(k=>index?index.getX(faceIndex*3+k):faceIndex*3+k);
 return {...hit,object:part.node,faceIndex,face:hit.face?{...hit.face,a:vertices[0],b:vertices[1],c:vertices[2],normal:hit.face.normal.clone().applyNormalMatrix(part.inverseNormal),materialIndex:0}:hit.face,normal:hit.normal?.clone().applyMatrix3(part.inverseNormal).multiplyScalar(1/part.scale)};
}
