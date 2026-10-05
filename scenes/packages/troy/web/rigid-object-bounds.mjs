// Fixed topology and immutable vertices; arbitrary rigid hierarchy poses/scales.
// Match Box3.setFromObject's geometry-box policy, including hidden mesh parts.
// Callers rebuild this reader after changing topology or geometry. No skinned,
// morphed, instanced or shader-deformed vertices are covered by this contract.
export function createRigidObjectBounds(T,root){
 const parts=[],version=p=>p.isInterleavedBufferAttribute?p.data.version:p.version;
 root.traverse(node=>{
  if(node.isSkinnedMesh||Object.keys(node.geometry?.morphAttributes??{}).some(k=>node.geometry.morphAttributes[k].length))throw Error('Unsupported deforming object bounds');
  if(node.isInstancedMesh||node.isBatchedMesh)throw Error('Unsupported instanced object bounds');
  if(!node.geometry)return;
  const materials=Array.isArray(node.material)?node.material:[node.material];
  if(materials.some(m=>m?.displacementMap||m?.positionNode))throw Error('Unsupported deforming material bounds');
  if(node.boundingBox!==undefined)throw Error('Unsupported custom object bounds');
  const geometry=node.geometry,position=geometry.attributes.position;if(!position)throw Error('Missing bounds positions');
  if(!geometry.boundingBox)geometry.computeBoundingBox();const b=geometry.boundingBox;
  if(b.isEmpty())return;
  const center=b.getCenter(new T.Vector3()),half=b.getSize(new T.Vector3()).multiplyScalar(.5);
  if(![...center.toArray(),...half.toArray()].every(Number.isFinite))throw Error('Invalid geometry bounds');
  parts.push({node,geometry,position,version:version(position),center:center.toArray(),half:half.toArray()});
 });
 return {parts:parts.length,read(target=new T.Box3(),{worldUpdated=false}={}){
  if(typeof worldUpdated!=='boolean')throw Error('Explicit world ownership required');
  if(!worldUpdated)root.updateWorldMatrix(true,true);target.makeEmpty();
  for(const part of parts){
   if(part.node.geometry!==part.geometry||part.geometry.attributes.position!==part.position||version(part.position)!==part.version)throw Error('Rigid bounds geometry changed');
   const e=part.node.matrixWorld.elements,[x,y,z]=part.center,[hx,hy,hz]=part.half;
   const cx=e[0]*x+e[4]*y+e[8]*z+e[12],cy=e[1]*x+e[5]*y+e[9]*z+e[13],cz=e[2]*x+e[6]*y+e[10]*z+e[14];
   const ex=Math.abs(e[0])*hx+Math.abs(e[4])*hy+Math.abs(e[8])*hz,ey=Math.abs(e[1])*hx+Math.abs(e[5])*hy+Math.abs(e[9])*hz,ez=Math.abs(e[2])*hx+Math.abs(e[6])*hy+Math.abs(e[10])*hz;
   target.min.x=Math.min(target.min.x,cx-ex);target.min.y=Math.min(target.min.y,cy-ey);target.min.z=Math.min(target.min.z,cz-ez);
   target.max.x=Math.max(target.max.x,cx+ex);target.max.y=Math.max(target.max.y,cy+ey);target.max.z=Math.max(target.max.z,cz+ez);
  }
  return target;
 }};
}
