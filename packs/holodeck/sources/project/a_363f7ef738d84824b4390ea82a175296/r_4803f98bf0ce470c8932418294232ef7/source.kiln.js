const meta={name:"Coastal sea grape shrub",role:"fill"};
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
const d=t.map((v,i)=>v-a[i]),L=Math.hypot(d[0],d[2])||1,side=[-d[2]/L,0,d[0]/L],p=[...a],idx=[];
for(let j=1;j<6;j++){const u=j/6,b=a.map((v,i)=>v+d[i]*u),ww=w*Math.pow(Math.sin(Math.PI*u),.7);
p.push(...b.map((v,i)=>v+side[i]*ww),b[0],b[1]+fold*Math.sin(Math.PI*u),b[2],...b.map((v,i)=>v-side[i]*ww));
if(j===1)idx.push(0,1,2,0,2,3);else{const k=1+(j-2)*3;idx.push(k,k+3,k+1,k+1,k+3,k+4,k+1,k+4,k+2,k+2,k+4,k+5);}}
const tip=p.length/3;p.push(...t);idx.push(13,tip,14,14,tip,15);geo(k,meshGeo({positions:p,indices:idx}));}
function tube(k,points,radii,rad=10){const p=[],idx=[];for(let j=0;j<points.length;j++)for(let i=0;i<rad;i++){const a=i/rad*Math.PI*2;p.push(points[j][0]+radii[j]*Math.cos(a),points[j][1],points[j][2]+radii[j]*Math.sin(a));}
for(let j=0;j<points.length-1;j++)for(let i=0;i<rad;i++){const a=j*rad+i,b=j*rad+(i+1)%rad,c=a+rad,d=b+rad;idx.push(a,c,b,b,c,d);}const bot=p.length/3;p.push(...points[0]);const top=p.length/3;p.push(...points[points.length-1]);for(let i=0;i<rad;i++){idx.push(bot,i,(i+1)%rad);const a=(points.length-1)*rad+i,b=(points.length-1)*rad+(i+1)%rad;idx.push(top,b,a);}geo(k,meshGeo({positions:p,indices:idx}));}
function finish(){for(const [name,b]of Object.entries(batches))if(b.p.length)createPart(name,meshGeo({positions:b.p,indices:b.i,normals:b.n,uvs:b.u}),b.m,{parent:root});return root;}

mat("branch",0x88715a);mat("leaf-sage",0x7b8855,true);mat("leaf-olive",0x657547,true);
for(let b=0;b<11;b++){const a=b*2.39996,len=.65+(b%4)*.18,end=[Math.cos(a)*len,.85+(b%3)*.27,Math.sin(a)*len];beam("branch",[0,-.12,0],end,.027,7);
for(let j=0;j<10;j++){const t=.3+j*.07,p=[end[0]*t,end[1]*t,end[2]*t],ang=a+j*2.1,d=.4+.1*Math.sin(j+b);leaf(j%3?"leaf-sage":"leaf-olive",p,[p[0]+Math.cos(ang)*d,p[1]+.13,p[2]+Math.sin(ang)*d],.19+.025*Math.sin(j),.065);}}return finish();}