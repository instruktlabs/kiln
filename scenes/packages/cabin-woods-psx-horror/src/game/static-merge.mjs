import * as THREE from 'three/webgpu';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Consumer-only derivative: retain the complete frame graph, hide merged source meshes.
 * Animated, skinned, morphed, multi-material and transparent meshes remain untouched.
 * Call only for known static assets; moving windows/doors and creatures never use this pass.
 */
export function mergeStaticAsset(root){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),buckets=new Map(),owned=[];
 root.traverse(node=>{
  if(!node.isMesh||node.isSkinnedMesh||!node.visible||node.layers.mask===0||Array.isArray(node.material)||node.material.transparent||Object.keys(node.geometry.morphAttributes).length)return;
  const attributes=Object.keys(node.geometry.attributes).sort(),key=`${node.material.uuid}:${attributes.map(k=>`${k}/${node.geometry.attributes[k].itemSize}/${node.geometry.attributes[k].normalized}`).join(',')}`;
  let bucket=buckets.get(key);if(!bucket){bucket={material:node.material,meshes:[]};buckets.set(key,bucket);}bucket.meshes.push(node);
 });
 let before=0,after=0;
 for(const bucket of buckets.values()){
  before+=bucket.meshes.length;if(bucket.meshes.length<2){after++;continue;}
  const parts=bucket.meshes.map(mesh=>{const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));return geometry;});
  const geometry=mergeGeometries(parts,false);for(const part of parts)part.dispose();
  if(!geometry){after+=bucket.meshes.length;continue;}
  for(const mesh of bucket.meshes)mesh.layers.disableAll();
  geometry.computeBoundingBox();geometry.computeBoundingSphere();const merged=new THREE.Mesh(geometry,bucket.material);merged.name=`SceneMerged_${bucket.material.name||after}`;merged.castShadow=false;root.add(merged);owned.push(geometry);after++;
 }
 return {before,after,dispose(){for(const geometry of owned)geometry.dispose();}};
}
