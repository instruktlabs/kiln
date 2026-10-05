// Scene-owned broad phase over placed meshes; narrow phase retains original
// indexed triangles. Static matrices are immutable, dynamic matrices are read
// at query time. Terrain support is a separate original-grid query.
export function createWorldContacts(T,{staticMeshes=[],dynamicMeshes=()=>[],cellSize=16}={}){
 if(!Number.isFinite(cellSize)||cellSize<=0||typeof dynamicMeshes!=='function')throw Error('Invalid world contacts');
 const cells=new Map(),localBounds=new WeakMap(),triangle=new T.Triangle(),matrix=new T.Matrix4(),ray=new T.Ray(),point=new T.Vector3(),normal=new T.Vector3(),segment=new T.Vector3(),offset=new T.Vector3();let disposed=false,records=[],queries=0,triangleChecks=0;
 function snapshots(meshes){const out=[];for(const mesh of meshes){if(!mesh.isMesh)throw Error('Contact mesh required');const geometry=mesh.geometry,p=geometry.attributes.position;if(!p)continue;let local=localBounds.get(geometry);if(!local){local=geometry.boundingBox??new T.Box3().setFromBufferAttribute(p);localBounds.set(geometry,local);}for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){if(mesh.isInstancedMesh){mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);}else matrix.copy(mesh.matrixWorld);out.push({geometry,matrix:matrix.clone(),bounds:local.clone().applyMatrix4(matrix)});}}return out;}
 records=snapshots(staticMeshes);staticMeshes=[];
 for(const r of records){const b=r.bounds;for(let x=Math.floor(b.min.x/cellSize);x<=Math.floor(b.max.x/cellSize);x++)for(let z=Math.floor(b.min.z/cellSize);z<=Math.floor(b.max.z/cellSize);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(r);}}
 const alive=()=>{if(disposed)throw Error('World contacts disposed');};
 function candidates(box,extra=[]){alive();queries++;const selected=new Set();for(let x=Math.floor(box.min.x/cellSize);x<=Math.floor(box.max.x/cellSize);x++)for(let z=Math.floor(box.min.z/cellSize);z<=Math.floor(box.max.z/cellSize);z++)for(const r of cells.get(x+','+z)||[])if(r.bounds.intersectsBox(box))selected.add(r);for(const r of snapshots([...dynamicMeshes(),...extra]))if(r.bounds.intersectsBox(box))selected.add(r);return selected;}
 function triangles(record,visit){const p=record.geometry.attributes.position,ix=record.geometry.index;for(let k=0;k<(ix?.count??p.count);k+=3){for(const [j,v]of [triangle.a,triangle.b,triangle.c].entries())v.fromBufferAttribute(p,ix?ix.getX(k+j):k+j).applyMatrix4(record.matrix);triangleChecks++;if(visit(triangle))return true;}return false;}
 function sphereHit(t,origin,direction,distance,radius){
  t.closestPointToPoint(origin,point);if(point.distanceToSquared(origin)<=radius*radius)return 0;let first=Infinity;
  const admit=d=>{if(d>=0&&d<=distance)first=Math.min(first,d);};
  t.getNormal(normal);const plane=offset.copy(origin).sub(t.a).dot(normal),velocity=direction.dot(normal);
  if(Math.abs(velocity)>1e-12)for(const sign of [-1,1]){const d=(sign*radius-plane)/velocity;if(d>=0&&d<=distance){point.copy(origin).addScaledVector(direction,d).addScaledVector(normal,-sign*radius);if(t.containsPoint(point))admit(d);}}
  for(const [a,b]of [[t.a,t.b],[t.b,t.c],[t.c,t.a]]){
   segment.copy(b).sub(a);offset.copy(origin).sub(a);const length=segment.lengthSq(),along=segment.dot(direction),start=segment.dot(offset),rayStart=direction.dot(offset),square=offset.lengthSq(),aa=length-along*along,bb=length*rayStart-start*along,cc=length*square-start*start-radius*radius*length,discriminant=bb*bb-aa*cc;
   if(aa>1e-12&&discriminant>=0){const d=(-bb-Math.sqrt(discriminant))/aa,y=start+d*along;if(y>=0&&y<=length)admit(d);}
   for(const end of [a,b]){offset.copy(origin).sub(end);const b=offset.dot(direction),c=offset.lengthSq()-radius*radius,h=b*b-c;if(h>=0)admit(-b-Math.sqrt(h));}
  }
  return Number.isFinite(first)?first:null;
 }
 return {blocked(box){if(!box||box.isEmpty()||![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite))throw Error('Finite contact box required');for(const r of candidates(box))if(triangles(r,t=>box.intersectsTriangle(t)))return true;return false;},
  cameraDistance(origin,desired,radius=.25,extra=[]){
   alive();if(![...origin.toArray(),...desired.toArray(),radius].every(Number.isFinite)||radius<0)throw Error('Invalid camera sweep');const direction=desired.clone().sub(origin),distance=direction.length();if(distance===0)return 0;direction.divideScalar(distance);const bounds=new T.Box3().setFromPoints([origin,desired]).expandByScalar(radius);let admitted=distance,hit=false;
   for(const r of candidates(bounds,extra))triangles(r,t=>{let d;if(radius===0){ray.origin.copy(origin);ray.direction.copy(direction);d=ray.intersectTriangle(t.a,t.b,t.c,false,point)?point.distanceTo(origin):null;}else d=sphereHit(t,origin,direction,distance,radius);if(d!==null&&d<=distance){hit=true;admitted=Math.min(admitted,d);}return false;});return hit?Math.max(0,admitted-.02):distance;
  },stats:()=>({staticRecords:records.length,cells:cells.size,queries,triangleChecks,disposed}),dispose(){disposed=true;records=[];cells.clear();dynamicMeshes=()=>[];}};
}
