import {namedMeshParts} from './bake-intake.mjs';
// Source vertices remain in their mesh-local frame. The shader applies the baked
// world transform before the actor instance matrix. No masters are mutated.
export function prepareRigidGeometry(T,mergeGeometries,root,manifest){
 const parts=namedMeshParts(root),groups=new Map();
 if(parts.length!==manifest.parts.length)throw Error('Part identity count mismatch');
 for(let i=0;i<parts.length;i++){
  const {node,path}=parts[i],record=manifest.parts[i];
  if(record.index!==i||record.path!==path||record.vertices!==node.geometry.attributes.position.count)throw Error('Part identity mismatch');
  if(Array.isArray(node.material)||!node.material.isMeshStandardMaterial||node.material.isMeshPhysicalMaterial||node.material.displacementMap)throw Error('Unsupported material');
  const original=node.geometry;
  if(original.drawRange.start!==0||original.drawRange.count!==Infinity)throw Error('Partial geometry is unsupported');
  if(Object.keys(original.attributes).some(n=>!['position','normal','uv','uv1','tangent'].includes(n)))throw Error('Unsupported vertex attributes');
  if(!original.attributes.normal)throw Error('Missing vertex normals');
  const g=original.index?original.toNonIndexed():original.clone();
  // Tangents are retained and rotated by the adapter, including handedness.
  g.clearGroups();g.setAttribute('bakePart',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(i),1));
  if(!groups.has(node.material))groups.set(node.material,[]);groups.get(node.material).push(g);
 }
 return [...groups].map(([material,geometries])=>{const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!geometry)throw Error('Incompatible attributes within material batch');return {material,geometry};});
}
