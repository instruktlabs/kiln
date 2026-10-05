const size = 'l';
const specs={l:[18,7,.7],m:[11,4.5,.45]};
const meta={name:'tree-conifer-'+size,role:'fill'};

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


function cone(cx,y,cz,r,height,n,spin){
 const s=soup();
 for(let i=0;i<n;i++){const a=2*Math.PI*i/n+spin;s.positions.push(cx+r*Math.cos(a),y,cz+r*Math.sin(a));}
 s.positions.push(cx,y+height,cz,cx,y,cz);
 for(let i=0;i<n;i++){const j=(i+1)%n;s.indices.push(i,n,j,i,j,n+1);}
 return s;
}

function buildLevel(g,lod,mats,spec){
 const [h,w,d]=spec,pools=[soup(),soup()],trunk=soup(),n=lod===0?8:6;
 const layers=lod===2?[[0,1,1,0]]:lod===1?[[0,.64,1,0],[.23,.60,.76,0],[.49,.51,.5,1]]:[[0,.62,1,0],[.2,.59,.80,0],[.42,.52,.59,1],[.66,.34,.36,1]];
 layers.forEach((p,i)=>append(pools[p[3]],cone(i===0?0:Math.sin(i*2)*w*.025,p[0],i===0?0:Math.cos(i*2)*w*.025,p[2]*w/2,p[1],n,i*.16)));
 fit(pools,w,h-.6,w,.6);
 const th=.6+(h-.6)*.36;append(trunk,rod([0,0,0],[0,th,0],d/2,d*.22,n));
 if(lod<2)for(let i=0;i<(lod===0?3:2);i++){const a=i*2.1;append(trunk,rod([0,th*.65,0],[Math.cos(a)*w*.16,th,Math.sin(a)*w*.16],d*.14,d*.06,n));}
 part(g,'Trunk',trunk,mats[2]);part(g,'NeedlesLower',pools[0],mats[0]);if(pools[1].positions.length)part(g,'NeedlesUpper',pools[1],mats[1]);
}
function build(){const root=createRoot(meta.name),mats=[material('needle-dark',0x2F5A3E,.9),material('needle-mid',0x3E6E4A,.9),material('bark-grey',0x6B6259,.95)];
 const tiers=[0,1,2].map(lod=>{const g=new THREE.Group();g.name='LOD'+lod;root.add(g);buildLevel(g,lod,mats,specs[size]);return g;});return finish(root,tiers,[120,400,0]);}
