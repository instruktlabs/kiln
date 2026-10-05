import {archerParts} from './archer-bank.mjs';
export function prepareArcherGeometry(T,mergeGeometries,reference,manifest){
 const parts=archerParts(reference.group,reference.projectile),groups=new Map();
 if(parts.length!==manifest.parts.length)throw Error('Archer part count mismatch');
 for(let i=0;i<parts.length;i++){
  const {node,path}=parts[i],record=manifest.parts[i],original=node.geometry;
  if(record.path!==path||record.vertices!==original.attributes.position.count||record.attributes.join(',')!==Object.keys(original.attributes).sort().join(','))throw Error('Archer part identity mismatch');
  const geometry=original.index?original.toNonIndexed():original.clone(),count=geometry.attributes.position.count,deforming=record.vertexOffset!==null;
  // Matte skin can reuse the body's material despite the body's historical
  // linen tangent stream. Only discard an unused stream on this owned copy.
  if(!node.material.normalMap)geometry.deleteAttribute('tangent');
  geometry.clearGroups();geometry.setAttribute('bakePart',new T.Float32BufferAttribute(new Float32Array(count).fill(i),1));
  if(deforming)geometry.setAttribute('bakeVertex',new T.Float32BufferAttribute(Float32Array.from({length:count},(_,j)=>record.vertexOffset+(original.index?original.index.getX(j):j)),1));
  if(!groups.has(node.material))groups.set(node.material,new Map());const key=deforming+':'+Object.keys(geometry.attributes).sort().join(','),byLayout=groups.get(node.material);
  if(!byLayout.has(key))byLayout.set(key,{deforming,geometries:[]});byLayout.get(key).geometries.push(geometry);
 }
 const out=[];for(const [material,byLayout] of groups)for(const {deforming,geometries} of byLayout.values()){
  const geometry=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!geometry)throw Error('Incompatible archer batch geometry');out.push({geometry,material,deforming});
 }
 return out;
}
