const meta={name:"Hut workbench and woven baskets",role:"prop"};
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

mat("weathered-timber",0x9e825d);mat("woven-fibre",0xb5a174);
for(let j=0;j<4;j++)geo("weathered-timber",new THREE.BoxGeometry(.29,.09,2.4),[-2.25+j*.3,.82,0]);
for(const x of[-2.18,-1.4])for(const z of[-.94,.94])beam("weathered-timber",[x,-.15,z],[x,.8,z],.065,8);
for(let b=0;b<2;b++){const x=1.9,z=-1.5+b*1.05;geo("woven-fibre",cylinderGeo(.35,.26,.42,16),[x,.21,z]);for(let j=0;j<7;j++)geo("woven-fibre",new THREE.TorusGeometry(.27+j*.012,.014,4,16),[x,.04+j*.057,z],[Math.PI/2,0,0]);}
return finish();}