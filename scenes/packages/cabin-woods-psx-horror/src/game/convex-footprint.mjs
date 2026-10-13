import * as THREE from 'three/webgpu';

/** Conservative XZ rock hull from actual placed geometry, independent of rendering. */
export function convexHullXZ(points){
 const sorted=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const half=list=>{const out=[];for(const p of list){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
 if(sorted.length<3)throw Error('Rock footprint requires at least three unique points.');
 const low=half(sorted),high=half([...sorted].reverse());low.pop();high.pop();const hull=[...low,...high];if(hull.length<3)throw Error('Rock footprint is degenerate.');return hull;
}

/** The same world hull and mesh-box union whether scenery uses a full clone or
 * a compact placement referencing its immutable saved source graph. */
export function staticInstanceFootprint(instance){
 const root=instance.root,source=instance.sourceRoot??root,points=[],point=new THREE.Vector3(),bounds=new THREE.Box3(),box=new THREE.Box3(),matrix=new THREE.Matrix4();
 root.updateWorldMatrix(true,false);source.updateWorldMatrix(true,true);
 const placement=source===root?new THREE.Matrix4():new THREE.Matrix4().multiplyMatrices(root.matrixWorld,source.matrixWorld.clone().invert());
 source.traverse(node=>{if(!node.isMesh||!node.geometry.attributes.position)return;matrix.multiplyMatrices(placement,node.matrixWorld);const attribute=node.geometry.attributes.position;
  for(let i=0;i<attribute.count;i++){point.fromBufferAttribute(attribute,i).applyMatrix4(matrix);points.push([point.x,point.z]);}
  if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();bounds.union(box.copy(node.geometry.boundingBox).applyMatrix4(matrix));
 });
 return {points:convexHullXZ(points),minX:bounds.min.x,maxX:bounds.max.x,minY:bounds.min.y,maxY:bounds.max.y,minZ:bounds.min.z,maxZ:bounds.max.z};
}
