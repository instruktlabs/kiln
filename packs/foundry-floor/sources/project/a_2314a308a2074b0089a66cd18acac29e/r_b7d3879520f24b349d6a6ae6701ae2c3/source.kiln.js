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


// Each bough is a closed tapered four-sided volume, rooted at the central leader.
function bough(angle,base,length,rise){
 const s=soup(),c=Math.cos(angle),z=Math.sin(angle);
 const vertex=(r,y,t)=>{s.positions.push(r*c-t*z,y,r*z+t*c);};
 vertex(-.04,base+rise*.3,0);
 const sections=[[.18,.58,.32,.32],[.55,.36,.30,.22],[.82,.18,.14,.10]];
 for(const [r,y,w,h] of sections){vertex(r*length,base+(y+h)*rise,0);vertex(r*length,base+y*rise,w*length);vertex(r*length,base+(y-h)*rise,0);vertex(r*length,base+y*rise,-w*length);}
 vertex(length,base,0);
 for(let i=0;i<4;i++){const j=(i+1)%4;s.indices.push(0,1+j,1+i);for(let k=0;k<2;k++){const a=1+k*4+i,b=1+k*4+j;s.indices.push(a,b,a+4,b,b+4,a+4);}s.indices.push(9+i,9+j,13);}
 return s;
}
// Ring profiles retain one shared axis; irregularity changes only their branch edges.
function needleProfile(rings,top,n,spin){
 const s=soup();
 rings.forEach(([y,r],j)=>{for(let i=0;i<n;i++){const a=i*2*Math.PI/n+spin,f=1+.035*Math.sin(i*3+j*.9);s.positions.push(r*f*Math.cos(a),y,r*f*Math.sin(a));}});
 const bottom=s.positions.length/3;s.positions.push(0,rings[0][0],0,0,top,0);
 for(let i=0;i<n;i++){const k=(i+1)%n;s.indices.push(i,k,bottom);for(let j=0;j<rings.length-1;j++){const a=j*n+i,b=j*n+k;s.indices.push(a,a+n,b,b,a+n,b+n);}const a=(rings.length-1)*n;s.indices.push(a+i,bottom+1,a+k);}
 return s;
}
function buildLevel(g,lod,mats,spec){
 const [h,w,d]=spec,pools=[soup(),soup()],trunk=soup(),branches=soup(),span=h-.6;
 append(trunk,rod([0,0,0],[0,h-.15,0],d/2,d*.025,lod===0?8:lod===1?6:3));
 if(lod===0){
  const count=size==='l'?8:7;
  for(let j=0;j<count;j++){
   const t=j/(count-.25)*.94+.014*Math.sin(j*1.7),base=.6+t*span,radius=w/2*Math.pow(1-t,.88),rise=span*(size==='l'?.20:.23)*(1-t*.35),spin=j===0?0:j*.67;
   for(let i=0;i<6;i++){
    const a=spin+i*Math.PI/3,f=j===0?(i%3===0?1:i%3===1?.98:.96):.93+.07*Math.cos((i%3)*2+j*1.4),len=radius*f;
    append(pools[j<count*.57?0:1],bough(a,base+rise*.065*Math.abs(Math.sin(i*2+j)),len,rise));
    if(j<count-1 && i<2){const tip=[Math.cos(a)*len*.55,base+rise*.36,Math.sin(a)*len*.55];append(branches,rod([0,base+rise*.32,0],tip,d*.105*(1-t),d*.04*(1-t),3));}
   }
  }
  append(pools[1],needleProfile([[h-span*.13,w*.045],[h-span*.06,w*.022]],h,6,0));
 }else if(lod===1){
  append(pools[0],needleProfile([[.6,w*.50],[.6+span*.12,w*.37],[.6+span*.22,w*.39],[.6+span*.36,w*.27],[.6+span*.46,w*.28],[.6+span*.59,w*.17]],.6+span*.74,size==='l'?8:6,0));
  append(pools[1],needleProfile([[.6+span*.54,w*.225],[.6+span*.67,w*.145],[.6+span*.76,w*.135],[.6+span*.89,w*.045]],h,size==='l'?8:6,.12));
 }else{
  append(pools[0],needleProfile([[.6,w*.5],[.6+span*.30,w*.34],[.6+span*.70,w*.13]],h,6,0));
 }
 // Centre remains exactly on the trunk. Fit horizontal extents without moving the leader.
 const e=extent(pools),sx=w/(e.hi[0]-e.lo[0]),sz=w/(e.hi[2]-e.lo[2]);
 for(const p of [...pools,branches])for(let i=0;i<p.positions.length;i+=3){p.positions[i]*=sx;p.positions[i+2]*=sz;}
 append(trunk,branches);
 part(g,'Trunk',trunk,mats[2]);part(g,'NeedlesLower',pools[0],mats[0]);if(pools[1].positions.length)part(g,'NeedlesUpper',pools[1],mats[1]);
}
function build(){const root=createRoot(meta.name),mats=[material('needle-dark',0x2F5A3E,.9),material('needle-mid',0x3E6E4A,.9),material('bark-grey',0x6B6259,.95)];
 const tiers=[0,1,2].map(lod=>{const g=new THREE.Group();g.name='LOD'+lod;root.add(g);buildLevel(g,lod,mats,specs[size]);return g;});return finish(root,tiers,[120,400,0]);}
