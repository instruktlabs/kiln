const size = 'l';
const specs={l:[20,16,1,4.5,12],m:[15,12,.75,4.5,12],s:[10,8,.5,3,9]};
const meta={name:'tree-broad-'+size,role:'fill'};

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

function buildLevel(group,lod,mats,spec){
 const [height,width,diameter,clearance,count]=spec;
 const pools=[soup(),soup(),soup()],trunk=soup();
 const n=lod===0?7:6,h=lod===0?5:lod===1?4:3;
 const points=lod===2?[[0,0,0,1,1,1,0]]:lod===1?
 [[0,.3,0,.9,.95,.85,0],[-.65,0,0,.72,.8,.8,0],[.65,.15,0,.72,.85,.8,1],[0,.55,.55,.8,.75,.72,1],[0,-.3,-.4,.8,.7,.8,2]]:
 [[-.72,.05,0,.65,.8,.75,0],[.72,.12,0,.65,.86,.75,0],[0,.15,-.7,.8,.8,.66,0],[0,.2,.7,.8,.85,.68,0],[-.45,.62,-.35,.75,.73,.72,1],[.44,.72,.33,.74,.7,.7,1],[.45,.56,-.4,.75,.8,.73,1],[-.43,.6,.42,.72,.78,.78,1],[0,-.35,0,.9,.66,.85,2],[.45,-.2,-.35,.74,.72,.77,2],[-.4,.15,.36,.7,.83,.72,0],[.1,.45,-.1,.85,.8,.83,0]].slice(0,count);
 points.forEach((p,i)=>append(pools[p[6]],ellipsoid(...p.slice(0,6),n,h,.18+(i%4)*.11,i*.61)));
 fit(pools,width,height-clearance,width*.92,clearance);
 const th=clearance+(height-clearance)*.38;
 append(trunk,rod([0,0,0],[0,th,0],diameter/2,diameter*.21,lod===0?8:6));
 if(lod<2)for(let i=0;i<(lod===0?3:2);i++){const a=i*2.1+.4;append(trunk,rod([0,th*.7,0],[Math.cos(a)*width*.12,th+height*.025,Math.sin(a)*width*.12],diameter*.17,diameter*.08,lod===0?8:6));}
 part(group,'Trunk',trunk,mats[3]);
 pools.forEach((p,i)=>{if(p.positions.length)part(group,['CrownMid','CrownLight','CrownDark'][i],p,mats[i]);});
}
function build(){
 const root=createRoot(meta.name);
 const mats=[material('leaf-mid',0x4F7A3A,.9),material('leaf-light',0x6E9A47,.9),material('leaf-dark',0x37592B,.9),material('bark-grey',0x6B6259,.95)];
 const tiers=[0,1,2].map(lod=>{const g=new THREE.Group();g.name='LOD'+lod;root.add(g);buildLevel(g,lod,mats,specs[size]);return g;});
 return finish(root,tiers,[120,400,0]);
}
