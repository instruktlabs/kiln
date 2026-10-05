// A seekable consumer strike target on the original front shield triangles.
// The actual blade support vertex stops just outside the chosen surface.
export function createShieldStrikePose(T,{actor,target,skin=.0003}){
 const shield=target.get('shield'),p=shield.geometry.attributes.position,ix=shield.geometry.index,bounds=new T.Box3().setFromBufferAttribute(p),origin=new T.Vector3(bounds.max.x*.45,bounds.max.y*.05,bounds.max.z+.2),ray=new T.Ray(origin,new T.Vector3(0,0,-1)),point=new T.Vector3();let closest=Infinity,contact=null;
 for(let k=0;k<(ix?.count??p.count);k+=3){const face=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(k+j):k+j));if(ray.intersectTriangle(...face,false,point)){const distance=point.distanceTo(origin);if(distance<closest){closest=distance;contact=point.clone();}}}
 if(!contact)throw Error('No original shield front surface');
 const vertices=[],blade=actor.get('sword').geometry.attributes.position;for(let i=0;i<blade.count;i++){const v=new T.Vector3().fromBufferAttribute(blade,i);if(v.y>=.12)vertices.push(v);}if(!vertices.length)throw Error('No original blade support');
 return ()=>{
  shield.updateWorldMatrix(true,false);actor.body.updateWorldMatrix(true,false);const normal=new T.Vector3(0,0,1).transformDirection(shield.matrixWorld),up=new T.Vector3(0,1,0),direction=normal.clone().negate().addScaledVector(up,-.20).normalize(),x=up.clone().cross(direction).normalize(),z=x.clone().cross(direction),worldQ=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,direction,z)),q=actor.body.getWorldQuaternion(new T.Quaternion()).invert().multiply(worldQ);
  let support=null,distance=Infinity;for(const vertex of vertices){const d=vertex.clone().applyQuaternion(worldQ).dot(normal);if(d<distance){distance=d;support=vertex;}}
  const surface=contact.clone().applyMatrix4(shield.matrixWorld).addScaledVector(normal,skin),point=actor.body.worldToLocal(surface),hand=q.clone().multiply(actor.socket.quaternion.clone().invert());
  return {w:point.sub(support.clone().applyQuaternion(q)).sub(actor.socket.position.clone().applyQuaternion(hand)),q};
 };
}
