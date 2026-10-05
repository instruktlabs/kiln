const meta={name:'tree-ornamental',role:'fill'};

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

// Low, angular foliage pads with a broad rim, not broadleaf ellipsoid balls.
function foliagePad(p,n,detailed,spin){
 const [cx,cy,cz,rx,ry,rz]=p,s=soup();
 const ring=(r,y)=>{for(let i=0;i<n;i++){const a=2*Math.PI*i/n+spin,f=.96+.04*Math.cos(i*2.7);s.positions.push(cx+Math.cos(a)*rx*r*f,cy+y*ry,cz+Math.sin(a)*rz*r*f);}};
 if(detailed){ring(.60,-.48);ring(1,0);ring(.68,.48);}else ring(1,0);
 const count=detailed?3:1,bottom=count*n,top=bottom+1;s.positions.push(cx,cy-ry,cz,cx,cy+ry,cz);
 for(let i=0;i<n;i++){const j=(i+1)%n;s.indices.push(i,j,bottom);for(let k=0;k<count-1;k++){const a=k*n+i,b=k*n+j;s.indices.push(a,a+n,b,b,a+n,b+n);}const o=(count-1)*n;s.indices.push(o+i,top,o+j);}
 return s;
}
function leaningStem(a,b,r0,r1,n){
 const s=soup();for(const [p,r] of [[a,r0],[b,r1]])for(let i=0;i<n;i++){const t=i*2*Math.PI/n;s.positions.push(p[0]+r*Math.cos(t),p[1],p[2]+r*Math.sin(t));}
 s.positions.push(...a,...b);for(let i=0;i<n;i++){const j=(i+1)%n;s.indices.push(i,i+n,j,j,i+n,j+n,i,j,2*n,i+n,2*n+1,j+n);}return s;
}
function buildLevel(g,lod,mats){
 const pools=[soup(),soup(),soup()],stems=soup();
 const pads=[
  [-1.6,4.55,-.55,.9,.35,.78,0],
  [1.55,4.8,.35,.95,.4,.72,0],
  [-.15,5.55,1.25,.95,.45,1.05,1],
  [-.9,5.42,-1.4,.78,.35,.9,1],
  [1.1,5.6,-1.1,.85,.4,.70,1],
  [-1.6,2.3,.02,.70,.30,.52,2],
  [-.95,4.95,1.3,.60,.25,.60,0],
  [-2.0,4.4,-.65,.5,.25,.5,2],
  [1.8,4.7,1.2,.65,.27,.62,0]
 ];
 const selected=lod===0?pads:lod===1?pads.slice(0,6):[[0,5.55,0,2.5,.45,2.3,0],[-1.65,2.3,.02,.7,.3,.52,0]];
 selected.forEach((p,i)=>append(pools[p[6]],foliagePad(p,lod===0?10:6,lod===0,i*.27)));
 // Fit every crown tier to the same envelope; apply exactly the same XZ frame to limb targets.
 const e=extent(pools),mx=(e.lo[0]+e.hi[0])/2,mz=(e.lo[2]+e.hi[2])/2,sx=5/(e.hi[0]-e.lo[0]),sz=4.6/(e.hi[2]-e.lo[2]);
 const frame=p=>[(p[0]-mx)*sx,p[1],(p[2]-mz)*sz];
 for(const p of pools)for(let i=0;i<p.positions.length;i+=3){const q=frame(p.positions.slice(i,i+3));p.positions.splice(i,3,...q);}
 const bases=[[-.13,0,-.08],[.13,0,-.06],[0,0,.14]];
 if(lod===2){
  const tips=[[-1.65,2.3,.02],[1.25,5.5,-.3],[-.55,5.5,.65]];
  bases.forEach((a,i)=>append(stems,leaningStem(a,frame(tips[i]),.075,.022,3)));
 }else{
  const paths=[
   [bases[0],[-.13,.8,-.08],[-.28,1.7,-.02],[-1.12,2.65,-.35],pads[0].slice(0,3)],
   [bases[1],[.13,.8,-.06],[.27,1.9,.02],[1.2,2.9,.32],pads[1].slice(0,3)],
   [bases[2],[0,.8,.14],[-.08,1.7,.35],[-.45,2.9,1.35],pads[2].slice(0,3)]
  ];
  paths.forEach(path=>{for(let j=0;j<path.length-1;j++){const a=j===0?path[j]:frame(path[j]),b=frame(path[j+1]),r0=[.075,.072,.064,.047][j],r1=[.072,.064,.047,.024][j];append(stems,j===0?leaningStem(a,b,r0,r1,lod===0?8:3):rod(a,b,r0,r1,lod===0?6:3));}});
  const forks=[
   [[-.98,2.50,-.30],pads[5].slice(0,3),.041,.023],
   [[-1.12,2.65,-.35],[-.8,4.55,-1.25],.044,.032],
   [[-.8,4.55,-1.25],pads[3].slice(0,3),.032,.016],
   [[1.2,2.9,.32],[1.05,4.55,-.6],.043,.029],
   [[1.05,4.55,-.6],pads[4].slice(0,3),.029,.016]
  ];
  if(lod===0)forks.push([[-.45,2.9,1.35],pads[6].slice(0,3),.030,.016],[pads[0].slice(0,3),pads[7].slice(0,3),.024,.013],[pads[1].slice(0,3),pads[8].slice(0,3),.024,.013]);
  forks.forEach(([a,b,r0,r1])=>append(stems,rod(frame(a),frame(b),r0,r1,lod===0?6:3)));
 }
 part(g,lod===2?'Trunk':'Stems',stems,mats[3]);pools.forEach((p,i)=>{if(p.positions.length)part(g,['CrownMid','CrownLight','CrownDark'][i],p,mats[i]);});
}
function build(){const root=createRoot(meta.name),mats=[material('leaf-mid',0x4F7A3A,.9),material('leaf-light',0x6E9A47,.9),material('leaf-dark',0x37592B,.9),material('bark-grey',0x6B6259,.95)];
 const tiers=[0,1,2].map(lod=>{const g=new THREE.Group();g.name='LOD'+lod;root.add(g);buildLevel(g,lod,mats);return g;});return finish(root,tiers,[80,300,0]);}
