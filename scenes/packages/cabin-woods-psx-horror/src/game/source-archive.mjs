import * as THREE from 'three/webgpu';

/** Retain fully batched, immutable static source graphs outside the render tree.
 * Geometry, names, materials and per-root visibility remain available to callers.
 * Only direct children are admitted. Local transforms/topology must stay fixed;
 * parent transforms/visibility are mirrored by sync before batch culling.
 */
export function createSourceArchive(sources,parent){
 const root=new THREE.Group(),records=[];root.name='SceneSourceArchive';
 parent.updateWorldMatrix(true,false);root.matrixAutoUpdate=false;root.matrixWorldAutoUpdate=false;root.matrix.copy(parent.matrixWorld);root.matrixWorld.copy(parent.matrixWorld);
 for(const source of sources){
  if(source.parent!==parent)continue;
  let safe=true;source.traverse(node=>{if(node.userData?.interaction||node.userData?.dynamic||node.isBone||node.isSkinnedMesh||node.isLight||node.isCamera||(node.isMesh&&node.layers.mask!==0))safe=false;});
  if(safe)records.push({source,index:parent.children.indexOf(source)});
 }
 for(const {source} of records)root.add(source);
 let disposed=false;
 const updateWorld=(node,matrix)=>{node.matrixWorld.multiplyMatrices(matrix,node.matrix);node.matrixWorldNeedsUpdate=false;for(const child of node.children)updateWorld(child,node.matrixWorld);};
 const sync=()=>{
  if(disposed)return;
  let visible=true;for(let node=parent;node;node=node.parent)if(!node.visible){visible=false;break;}root.visible=visible;
  if(!root.matrixWorld.equals(parent.matrixWorld)){root.matrix.copy(parent.matrixWorld);root.matrixWorld.copy(parent.matrixWorld);for(const {source} of records)updateWorld(source,root.matrixWorld);}
 };
 sync();
 return {root,sync,dispose(){if(disposed)return;sync();disposed=true;for(const {source,index} of records.sort((a,b)=>a.index-b.index)){parent.add(source);parent.children.pop();parent.children.splice(Math.min(index,parent.children.length),0,source);}root.clear();}};
}
