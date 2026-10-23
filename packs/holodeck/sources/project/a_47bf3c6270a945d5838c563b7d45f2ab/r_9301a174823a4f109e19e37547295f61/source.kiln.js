const meta={name:"Curved coconut palm",role:"fill"};
function build(){
const root=createRoot(meta.name), batches={};
function mat(key,color,leaves=false){const m=gameMaterial(color,{roughness:.88,metalness:0,flatShading:false});if(leaves)m.side=THREE.DoubleSide;batches[key]={m,p:[],n:[],u:[],i:[]};return key;}
function geo(key,g,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1]){
 const b=batches[key], c=g.clone(),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0],rot[1],rot[2]));
 c.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),q,new THREE.Vector3(...scale)));
 const p=c.getAttribute("position"),n=c.getAttribute("normal"),u=c.getAttribute("uv"),off=b.p.length/3;
 for(let i=0;i<p.count;i++){b.p.push(p.getX(i),p.getY(i),p.getZ(i));b.n.push(n.getX(i),n.getY(i),n.getZ(i));b.u.push(u?u.getX(i):0,u?u.getY(i):0);}
 const idx=c.getIndex();for(let i=0;i<(idx?idx.count:p.count);i++)b.i.push(off+(idx?idx.getX(i):i));c.dispose();
}
function ball(k,p,s,seg=12){geo(k,sphereGeo(1,seg,8),p,[0,0,0],s);}
function beam(k,a,b,r,seg=8){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize()),e=new THREE.Euler().setFromQuaternion(q);geo(k,cylinderGeo(r,r,d.length(),seg),A.add(B).multiplyScalar(.5).toArray(),[e.x,e.y,e.z]);}
// Folded opaque lamina: U across width, V from attached base=0 to tip=1.
// Separate ridge vertices retain a restrained central crease; smooth normals along each half.
function leaf(k,a,t,w,fold=.04){
const d=t.map((v,i)=>v-a[i]),L=Math.hypot(d[0],d[2])||1,side=[-d[2]/L,0,d[0]/L];
const p=[...a,...a],uv=[.5,0,.5,0],idx=[],stations=[.13,.58];
for(let j=1;j<=2;j++){
 const v=stations[j-1],b=a.map((x,i)=>x+d[i]*v),ww=w*1.18*Math.pow(1-v,.72);
 b[1]+=.13*Math.sin(Math.PI*v);
 const left=b.map((x,i)=>x+side[i]*ww),right=b.map((x,i)=>x-side[i]*ww);
 const ridge=[b[0],b[1]+fold*Math.sin(Math.PI*v),b[2]];
 p.push(...left,...ridge,...ridge,...right);uv.push(0,v,.5,v,.5,v,1,v);
 const q=2+(j-1)*4;
 if(j===1)idx.push(0,q,q+1,1,q+2,q+3);
 else{const z=q-4;idx.push(z,q,z+1,z+1,q,q+1,z+2,q+2,z+3,z+3,q+2,q+3);}
}
const tip=p.length/3;p.push(...t,...t);uv.push(.5,1,.5,1);
const z=6;idx.push(z,tip,z+1,z+2,tip+1,z+3);
geo(k,meshGeo({positions:p,indices:idx,uvs:uv}));
}
function tube(k,points,radii,rad=10){const p=[],idx=[];for(let j=0;j<points.length;j++)for(let i=0;i<rad;i++){const a=i/rad*Math.PI*2;p.push(points[j][0]+radii[j]*Math.cos(a),points[j][1],points[j][2]+radii[j]*Math.sin(a));}
for(let j=0;j<points.length-1;j++)for(let i=0;i<rad;i++){const a=j*rad+i,b=j*rad+(i+1)%rad,c=a+rad,d=b+rad;idx.push(a,c,b,b,c,d);}const bot=p.length/3;p.push(...points[0]);const top=p.length/3;p.push(...points[points.length-1]);for(let i=0;i<rad;i++){idx.push(bot,i,(i+1)%rad);const a=(points.length-1)*rad+i,b=(points.length-1)*rad+(i+1)%rad;idx.push(top,b,a);}geo(k,meshGeo({positions:p,indices:idx}));}
function finish(){for(const [name,b]of Object.entries(batches))if(b.p.length){const part=createPart(name,meshGeo({positions:b.p,indices:b.i,normals:b.n,uvs:b.u}),b.m,{parent:root});if(name==="palm-leaf"){part.name="palm-leaf";part.geometry.name="palm-leaf";}}return root;}

mat("fibrous-trunk",0x947456);mat("palm-leaf",0xffffff,true);mat("crown-and-coconuts",0x827046);
const leafMat=batches["palm-leaf"].m;leafMat.name="palm-leaf-opaque";leafMat.roughness=.79;leafMat.transparent=false;leafMat.opacity=1;leafMat.alphaTest=0;
leafMat.map=proceduralTexture({schemaVersion:2,size:128,usage:"albedo",name:"Palm folded greens",layers:[
{op:"gradient",from:0x648c3e,to:0xb0bb62,angleDeg:90},
{op:"stripes",colorA:0x7c9a45,colorB:0xa9b764,count:2,angleDeg:0,opacity:.22,blend:"normal"},
{op:"noise",colorA:0x7d9b4b,colorB:0xadb96a,scale:3,octaves:1,seed:417,opacity:.08,blend:"normal"}
]});leafMat.map.wrapS=THREE.ClampToEdgeWrapping;leafMat.map.wrapT=THREE.ClampToEdgeWrapping;
const pts=[],rs=[];for(let j=0;j<=48;j++){const t=j/48;pts.push([1.6*t*t,7.6*t,.35*Math.sin(t*2.5)]);rs.push((.27-.13*t)*(1+.055*Math.sin(j*3.1)));}tube("fibrous-trunk",pts,rs,12);
const c=pts[48];
// Broad irregular rosette. Bezier endpoints retain the young fronds' upward
// direction; the middle tier projects laterally, and only the old tier hangs.
const fronds=[
[.10,3.35,-1.60,1.00,.12,56],[1.16,3.82,-1.22,.78,-.18,56],
[2.28,3.12,-1.92,1.10,.20,56],[3.42,3.61,-1.42,.90,-.16,56],
[4.54,3.26,-1.72,.82,.14,56],[5.55,3.72,-1.08,1.00,-.12,56],
[.60,4.18,.12,1.42,.18,56],[1.48,3.70,.48,1.65,-.16,56],
[2.43,4.04,-.10,1.35,.22,56],[3.30,3.84,.35,1.58,-.20,56],
[4.19,4.30,-.28,1.42,.12,56],[5.07,3.56,.62,1.75,-.16,56],
[5.98,4.02,.16,1.46,.22,56],
[.30,1.52,2.88,2.10,.22,30],[1.92,2.06,2.30,2.35,-.20,32],
[3.12,1.20,3.15,2.45,.18,28],[4.48,2.20,2.54,2.28,-.24,32],
[5.62,1.65,2.96,2.52,.20,30]];
for(let f=0;f<fronds.length;f++){
 const [az,len,endY,lift,twist,pairs]=fronds[f],dx=Math.cos(az),dz=Math.sin(az);
 function spine(t){
  const u=1-t;
  const reach=3*u*u*t*len*.13+3*u*t*t*len*.64+t*t*t*len;
  const bend=Math.sin(Math.PI*t)*twist;
  const cp1=f>12?lift*.66:lift,cp2=f>12?(f%2===1?endY*.72:endY+.12):endY+lift*.70;
  return[c[0]+dx*reach-dz*bend,c[1]+3*u*u*t*cp1+3*u*t*t*cp2+t*t*t*endY,c[2]+dz*reach+dx*bend];
 }
 for(let j=0;j<7;j++)beam("crown-and-coconuts",spine(j/7),spine((j+1)/7),.024*(1-j/8),6);
 for(let j=0;j<pairs;j++){
  const t=.075+.895*j/(pairs-1),p=spine(t);
  const before=spine(Math.max(0,t-.005)),after=spine(Math.min(1,t+.005));
  const tx=after[0]-before[0],tz=after[2]-before[2],h=Math.hypot(tx,tz),ux=tx/h,uz=tz/h;
  for(const s of[-1,1]){
   const phase=Math.sin(f*12.7+j*2.39+s*1.71),gap=(j%7===3&&s===1)?.88:1;
   const l=(.15+1.18*Math.pow(Math.sin(Math.PI*t),.72))*gap*(1+.08*phase)*(f>12?.74:1);
   const sweep=.18+.30*t+.07*phase,down=(.26+.40*t+.16*phase)*l;
   const tip=[p[0]+ux*sweep-s*uz*l,p[1]-down,p[2]+uz*sweep+s*ux*l];
   leaf("palm-leaf",p,tip,(.055+.005*Math.sin(j*1.9+f))*(1-.24*t),.023);
  }
 }
 // A small terminal blade covers the rachis end without a long bare spike.
 leaf("palm-leaf",spine(.93),spine(1.025),.040,.018);
}
for(let i=0;i<4;i++){const a=i*1.8;ball("crown-and-coconuts",[c[0]+.24*Math.cos(a),7.25,c[2]+.24*Math.sin(a)],[.13,.18,.13],10);}return finish();}