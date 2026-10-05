const meta={name:'shrub-mound',role:'fill'};

function material(name, color, roughness) {
 const m = gameMaterial(color, {roughness, metalness:0, flatShading:true}); m.name=name; return m;
}
function soup(){return {positions:[],indices:[]};}
function append(dst, src){const o=dst.positions.length/3;dst.positions.push(...src.positions);dst.indices.push(...src.indices.map(i=>i+o));}
function ellipsoid(cx,cy,cz,rx,ry,rz,n,h,tilt,spin){
 const s=soup(),pts=[[0,1,0]];
 for(let j=1;j<h;j++){const a=Math.PI*j/h;for(let i=0;i<n;i++){const b=2*Math.PI*i/n+spin;pts.push([Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)]);}}
 pts.push([0,-1,0]);
 for(const [x,y,z] of pts){const yy=y*Math.cos(tilt)-z*Math.sin(tilt),zz=y*Math.sin(tilt)+z*Math.cos(tilt);s.positions.push(cx+x*rx,cy+yy*ry,cz+zz*rz);}
 for(let i=0;i<n;i++)s.indices.push(0,1+(i+1)%n,1+i);
 for(let j=0;j<h-2;j++)for(let i=0;i<n;i++){const a=1+j*n+i,b=1+j*n+(i+1)%n,c=a+n,d=b+n;s.indices.push(a,b,c,b,d,c);}
 const bottom=pts.length-1,base=1+(h-2)*n;for(let i=0;i<n;i++)s.indices.push(base+i,base+(i+1)%n,bottom);
 return s;
}
function rod(a,b,r0,r1,n){
 const s=soup(),axis=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
 const u=new THREE.Vector3(1,0,0);if(Math.abs(axis.dot(u))>.9)u.set(0,0,1);
 u.cross(axis).normalize(); const v=axis.clone().cross(u);
 for(let j=0;j<2;j++)for(let i=0;i<n;i++){const t=2*Math.PI*i/n,base=j?b:a,r=j?r1:r0;s.positions.push(base[0]+r*(u.x*Math.cos(t)+v.x*Math.sin(t)),base[1]+r*(u.y*Math.cos(t)+v.y*Math.sin(t)),base[2]+r*(u.z*Math.cos(t)+v.z*Math.sin(t)));}
 s.positions.push(...a,...b);
 for(let i=0;i<n;i++){const k=(i+1)%n;s.indices.push(i,k,i+n,k,k+n,i+n,2*n,k,i,2*n+1,i+n,k+n);}
 return s;
}
function extent(parts){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of parts)for(let i=0;i<p.positions.length;i+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p.positions[i+k]);hi[k]=Math.max(hi[k],p.positions[i+k]);}return {lo,hi};}
function fit(parts,w,h,d,y){const e=extent(parts);for(const p of parts)for(let i=0;i<p.positions.length;i+=3){p.positions[i]=(p.positions[i]-(e.lo[0]+e.hi[0])/2)*w/(e.hi[0]-e.lo[0]);p.positions[i+1]=y+(p.positions[i+1]-e.lo[1])*h/(e.hi[1]-e.lo[1]);p.positions[i+2]=(p.positions[i+2]-(e.lo[2]+e.hi[2])/2)*d/(e.hi[2]-e.lo[2]);}}
function part(parent,name,data,mat){const geo=meshGeo(data).toNonIndexed();geo.computeVertexNormals();const m=createPart(name,geo,mat,{parent});m.name=name;return m;}
const coverage=(r,d)=>(Math.PI*(r/(2*d*Math.tan(25*Math.PI/180)))**2)/(16/9);
function finish(root,tiers,distances){root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(tiers[0]),r=box.getSize(new THREE.Vector3()).length()/2;defineLod(tiers,{screenCoverage:[coverage(r,distances[0]),coverage(r,distances[1]),distances[2]?coverage(r,distances[2]):0]});return root;}

function buildLevel(g,lod,mat){const foliage=soup(),n=lod===0?7:lod===1?4:5,h=lod===0?5:3;
 const points=lod===2?[[0,0,0,1,.65,.9]]:[[-.5,0,0,.75,.6,.8],[.5,.08,.05,.72,.65,.75],[0,.13,-.25,.85,.7,.75]];
 points.forEach((p,i)=>append(foliage,ellipsoid(...p,n,h,.19+i*.17,i*.51)));
 fit([foliage],1.6,.8,1.45,0);part(g,'Foliage',foliage,mat);
}
function build(){const root=createRoot(meta.name),mat=material('leaf-mid',0x4F7A3A,.9);
 const tiers=[0,1,2].map(lod=>{const g=new THREE.Group();g.name='LOD'+lod;root.add(g);buildLevel(g,lod,mat);return g;});return finish(root,tiers,[40,150,600]);}
