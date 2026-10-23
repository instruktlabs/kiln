const meta={name:"Tidemark creeping groundcover",role:"fill"};
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

mat("stem",0x78914d);mat("leaves",0x699451,true);
for(let i=0;i<24;i++){const a=i*2.39996,r=.15+.45*Math.sqrt((i+.5)/24),base=[Math.cos(a)*r,.01,Math.sin(a)*r],tip=[base[0]+Math.cos(a+.7)*.28,.12+.08*Math.sin(i),base[2]+Math.sin(a+.7)*.28];blade(base,tip,.10,.035,3);}
return finish();}