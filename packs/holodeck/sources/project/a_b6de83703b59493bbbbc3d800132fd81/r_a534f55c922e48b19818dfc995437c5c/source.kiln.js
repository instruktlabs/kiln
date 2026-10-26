const meta={name:"Layered palm thatch roof",role:"building"};
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
function leaf(k,a,t,w,fold=.08){
 const d=[t[0]-a[0],t[1]-a[1],t[2]-a[2]],L=Math.hypot(d[0],d[2])||1,side=[-d[2]/L,0,d[0]/L],mid=d.map((v,i)=>a[i]+v*.43);
 const p=[...a,...mid.map((v,i)=>v+side[i]*w),mid[0],mid[1]+fold,mid[2],...t,...mid.map((v,i)=>v-side[i]*w)];
 geo(k,meshGeo({positions:p,indices:[0,1,2,1,3,2,0,2,4,2,3,4]}));
}
function tube(k,points,radii,rad=10){const p=[],idx=[];for(let j=0;j<points.length;j++)for(let i=0;i<rad;i++){const a=i/rad*Math.PI*2;p.push(points[j][0]+radii[j]*Math.cos(a),points[j][1],points[j][2]+radii[j]*Math.sin(a));}
for(let j=0;j<points.length-1;j++)for(let i=0;i<rad;i++){const a=j*rad+i,b=j*rad+(i+1)%rad,c=a+rad,d=b+rad;idx.push(a,c,b,b,c,d);}const bot=p.length/3;p.push(...points[0]);const top=p.length/3;p.push(...points[points.length-1]);for(let i=0;i<rad;i++){idx.push(bot,i,(i+1)%rad);const a=(points.length-1)*rad+i,b=(points.length-1)*rad+(i+1)%rad;idx.push(top,b,a);}geo(k,meshGeo({positions:p,indices:idx}));}
function finish(){for(const [name,b]of Object.entries(batches))if(b.p.length)createPart(name,meshGeo({positions:b.p,indices:b.i,normals:b.n,uvs:b.u}),b.m,{parent:root});return root;}

mat("thatch-honey",0xaa9362,true);mat("thatch-shade",0x918157,true);
for(const side of[-1,1])for(let row=0;row<9;row++)for(let j=0;j<32;j++){
const z=-3.35+(j+.5)*6.7/32+.025*Math.sin(j*4+row),t=row/9,x=side*(.02+t*3.65),y=4.29-t*1.67,reach=.65;
const p=[x,y,z-.14,x,y,z+.14,x+side*reach,y-.31-.04*Math.sin(j*5),z+.105,x+side*reach,y-.31-.04*Math.sin(j*5),z-.12];geo((j+row)%4?"thatch-honey":"thatch-shade",meshGeo({positions:p,indices:[0,1,2,0,2,3]}));}
for(let j=0;j<36;j++)beam("thatch-shade",[0,4.32,-3.35+j*.19],[0,4.32,-3.19+j*.19],.105,6);
for(const s of[-1,1]){
const g=meshGeo({positions:[0,4.23,-3.35,0,4.23,3.35,s*3.89,2.48,3.35,s*3.89,2.48,-3.35,0,4.08,-3.35,0,4.08,3.35,s*3.89,2.33,3.35,s*3.89,2.33,-3.35],indices:[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2]});geo("thatch-shade",g);
for(let j=0;j<100;j++){const z=-3.35+j*.067;beam("thatch-honey",[s*3.55,2.63,z],[s*(3.93+.06*Math.sin(j*3)),2.31+.04*Math.sin(j*2),z+.012],.012,5);}}
return finish();}