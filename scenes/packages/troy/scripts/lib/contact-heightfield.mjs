// Offline height queries on original upward triangles. No resampled terrain.
// Callers own the continuous-heightfield assumption; bridges/overhangs need a
// different contact model. Meshes may have arbitrary baked world transforms.
export function createContactHeightfield(T,meshes,{cellSize=8}={}){
 if(!Number.isFinite(cellSize)||cellSize<=0)throw Error('Invalid heightfield cell size');
 const cells=new Map();let maxSlopeZ=0,insertions=0;
 for(const mesh of meshes){const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;for(let i=0;i<(ix?.count??p.count);i+=3){
  const [a,b,c]=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld)),e=b.clone().sub(a),f=c.clone().sub(a),normal=e.clone().cross(f);
  if(normal.lengthSq()<1e-16||normal.normalize().y<.5)continue;
  const det=e.x*f.z-e.z*f.x,triangle={a:a.toArray(),e:e.toArray(),f:f.toArray(),det,normal:normal.toArray()};
  maxSlopeZ=Math.max(maxSlopeZ,Math.abs((e.x*f.y-f.x*e.y)/det));
  const loX=Math.floor(Math.min(a.x,b.x,c.x)/cellSize),hiX=Math.floor(Math.max(a.x,b.x,c.x)/cellSize),loZ=Math.floor(Math.min(a.z,b.z,c.z)/cellSize),hiZ=Math.floor(Math.max(a.z,b.z,c.z)/cellSize);
  for(let x=loX;x<=hiX;x++)for(let z=loZ;z<=hiZ;z++){if(++insertions>1000000)throw Error('Heightfield cell budget exceeded');const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(triangle);}
 }}
 if(!cells.size)throw Error('No upward heightfield triangles');
 return {maxSlopeZ,hit(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))throw Error('Invalid height query');let result=null;
  for(const {a,e,f,det,normal} of cells.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize))||[]){const dx=x-a[0],dz=z-a[2],u=(dx*f[2]-dz*f[0])/det,v=(e[0]*dz-e[2]*dx)/det;if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8){const height=a[1]+u*e[1]+v*f[1];if(!result||height>result.height)result={height,normal:[...normal]};}}
  return result;
 }};
}
