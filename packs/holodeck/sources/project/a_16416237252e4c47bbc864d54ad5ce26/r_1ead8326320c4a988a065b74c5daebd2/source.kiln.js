const meta={name:"Tidemark articulated shore crab",role:"prop"};const gaitChannels=[{"node":"leg_0_0","axis":"y","amplitude":0.18,"phase":0},{"node":"leg_0_0","axis":"x","amplitude":-0.06,"phase":-1.5707963267948966},{"node":"leg_0_1","axis":"y","amplitude":0.18,"phase":3.141592653589793},{"node":"leg_0_1","axis":"x","amplitude":-0.06,"phase":1.5707963267948966},{"node":"leg_0_2","axis":"y","amplitude":0.18,"phase":0},{"node":"leg_0_2","axis":"x","amplitude":-0.06,"phase":-1.5707963267948966},{"node":"leg_0_3","axis":"y","amplitude":0.18,"phase":3.141592653589793},{"node":"leg_0_3","axis":"x","amplitude":-0.06,"phase":1.5707963267948966},{"node":"leg_1_0","axis":"y","amplitude":0.18,"phase":3.141592653589793},{"node":"leg_1_0","axis":"x","amplitude":0.06,"phase":1.5707963267948966},{"node":"leg_1_1","axis":"y","amplitude":0.18,"phase":0},{"node":"leg_1_1","axis":"x","amplitude":0.06,"phase":-1.5707963267948966},{"node":"leg_1_2","axis":"y","amplitude":0.18,"phase":3.141592653589793},{"node":"leg_1_2","axis":"x","amplitude":0.06,"phase":1.5707963267948966},{"node":"leg_1_3","axis":"y","amplitude":0.18,"phase":0},{"node":"leg_1_3","axis":"x","amplitude":0.06,"phase":-1.5707963267948966},{"node":"claw_left","axis":"z","amplitude":0.1,"phase":0},{"node":"claw_right","axis":"z","amplitude":0.1,"phase":3.141592653589793}];
function build(){
const root=createRoot(meta.name),mats={},batches={};
function mat(key,color,leaf=false){const m=gameMaterial(color,{roughness:.83,metalness:0,flatShading:false});if(leaf){m.side=THREE.DoubleSide;m.color.setHex(0xffffff);m.map=proceduralTexture({schemaVersion:2,size:64,usage:"albedo",name:"Warm layered greens",layers:[{op:"gradient",from:color,to:0x9fb76c,angleDeg:90},{op:"stripes",colorA:0x789753,colorB:0xa2b76e,count:2,opacity:.12,blend:"normal"}]});m.map.wrapS=THREE.ClampToEdgeWrapping;m.map.wrapT=THREE.ClampToEdgeWrapping;}mats[key]=m;}
function joint(name,pos,parent=root,rest=[0,0,0]){const j=createPivot(name,pos,parent);j.name=name;j.rotation.set(...rest);return j;}
function geo(k,g,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1],parent=root){
const key=parent.name+"_"+k;const b=batches[key]??(batches[key]={parent,key:k,p:[],n:[],u:[],i:[]}),c=g.clone();
c.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(...scale)));
const p=c.getAttribute("position"),n=c.getAttribute("normal"),uv=c.getAttribute("uv"),off=b.p.length/3;
for(let i=0;i<p.count;i++){b.p.push(p.getX(i),p.getY(i),p.getZ(i));b.n.push(n.getX(i),n.getY(i),n.getZ(i));b.u.push(uv?uv.getX(i):0,uv?uv.getY(i):0);}
const ix=c.getIndex();for(let i=0;i<(ix?ix.count:p.count);i++)b.i.push(off+(ix?ix.getX(i):i));c.dispose();}
function ball(k,p,s,parent=root,seg=10){geo(k,sphereGeo(1,seg,6),p,[0,0,0],s,parent);}
function beam(k,a,b,r,parent=root,segments=6){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize()),e=new THREE.Euler().setFromQuaternion(q);geo(k,cylinderGeo(r,r,d.length(),segments),A.add(B).multiplyScalar(.5).toArray(),[e.x,e.y,e.z],[1,1,1],parent);}
function blade(a,t,w,fold=.06,rows=3,parent=root,key="leaves"){
const d=t.map((v,i)=>v-a[i]),l=Math.hypot(d[0],d[2])||1,side=[-d[2]/l,0,d[0]/l],p=[...a],uv=[.5,0],ix=[];
for(let j=1;j<=rows;j++){const v=j/(rows+1),b=a.map((x,i)=>x+d[i]*v),width=w*Math.pow(Math.sin(Math.PI*v),.75);
p.push(...b.map((x,i)=>x+side[i]*width),b[0],b[1]+fold*Math.sin(Math.PI*v),b[2],...b.map((x,i)=>x-side[i]*width));uv.push(0,v,.5,v,1,v);
const q=1+(j-1)*3;if(j===1)ix.push(0,q,q+1,0,q+1,q+2);else{const z=q-3;ix.push(z,q,z+1,z+1,q,q+1,z+1,q+1,z+2,z+2,q+1,q+2);}}
const tip=p.length/3;p.push(...t);uv.push(.5,1);const z=1+(rows-1)*3;ix.push(z,tip,z+1,z+1,tip,z+2);geo(key,meshGeo({positions:p,indices:ix,uvs:uv}),[0,0,0],[0,0,0],[1,1,1],parent);}
function finish(){for(const b of Object.values(batches)){const part=createPart(b.key,meshGeo({positions:b.p,normals:b.n,indices:b.i,uvs:b.u}),mats[b.key],{parent:b.parent});part.name=b.key==="leaves"?"leaf_blade":b.parent.name.replace(/[^a-zA-Z0-9_-]/g,"_")+"_"+b.key;}return root;}

mat("shell",0xb48b59);mat("dark",0x4c513c);
ball("shell",[0,.15,0],[.18,.09,.16],root,12);
for(let side=0;side<2;side++){const s=side?1:-1;for(let i=0;i<4;i++){const x=-.13+i*.082,leg=joint("leg_"+side+"_"+i,[x,.14,s*.10]);beam("shell",[0,0,0],[-.035,.025,s*.15],.017,leg,6);beam("shell",[-.035,.025,s*.15],[-.065,-.125,s*.21],.013,leg,6);}
const claw=joint(side?"claw_right":"claw_left",[.12,.18,s*.09]);beam("shell",[0,0,0],[.14,.02,s*.09],.025,claw,6);ball("shell",[.15,.025,s*.10],[.065,.042,.045],claw);beam("shell",[.16,.025,s*.10],[.21,.05,s*.12],.015,claw,6);}
for(const s of[-1,1]){beam("shell",[.09,.18,s*.06],[.115,.25,s*.065],.012);ball("dark",[.115,.26,s*.065],[.016,.02,.016],root,8);}return finish();}
// Runtime motion is owned by Holodeck behavior.gait. Parent revisions retain the GPU motion study.
