import * as THREE from 'three/webgpu';
const visible=n=>{for(;n;n=n.parent)if(!n.visible)return false;return true;};
/** Static root bounds and flat mesh lists; moving/deforming roots refresh bounds.
 * Call invalidate after changing child topology. Added/removed top-level roots are
 * detected automatically. The caller updates world matrices and skin bounds first.
 */
export function createRaycastIndex(root,{dynamic=()=>false,ignore=()=>false}={}){
 let records=[],children=[],invalid=true;const point=new THREE.Vector3(),candidates=[],hits=[];
 function rebuild(){children=[...root.children];records=[];for(const node of children){if(ignore(node))continue;const meshes=[];node.traverse(n=>{if(n.isMesh)meshes.push(n);});records.push({node,meshes,dynamic:dynamic(node),box:new THREE.Box3().setFromObject(node),matrix:node.matrixWorld.clone()});}invalid=false;}
 return {invalidate(){invalid=true;},intersect(ray,accept=()=>true){
  if(invalid||children.length!==root.children.length||children.some((n,i)=>root.children[i]!==n))rebuild();
  candidates.length=0;hits.length=0;
  for(const entry of records){const {node,box}=entry;if(!visible(node)||!accept(node))continue;
   if(entry.dynamic||!entry.matrix.equals(node.matrixWorld)){box.setFromObject(node);entry.matrix.copy(node.matrixWorld);}
   if(!box.containsPoint(ray.ray.origin)){if(!ray.ray.intersectBox(box,point)||point.distanceToSquared(ray.ray.origin)>ray.far*ray.far)continue;}
   for(const mesh of entry.meshes)if(visible(mesh))candidates.push(mesh);
  }
  return ray.intersectObjects(candidates,false,hits);
 }};
}
