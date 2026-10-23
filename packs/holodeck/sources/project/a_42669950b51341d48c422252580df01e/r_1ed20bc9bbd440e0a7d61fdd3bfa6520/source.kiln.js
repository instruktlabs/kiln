const meta={name:"Weathered driftwood and granite",role:"prop"};
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

mat("bleached-wood",0xa69a82);mat("warm-granite",0x96958a);
for(let j=0;j<7;j++){const a=j/7,b=(j+1)/7;beam("bleached-wood",[-1.5+3*a,.15+.08*Math.sin(a*4),.17*Math.sin(a*3)],[-1.5+3*b,.15+.08*Math.sin(b*4),.17*Math.sin(b*3)],.18-.06*a,12);}
beam("bleached-wood",[-.35,.16,0],[-.9,.61,.7],.075,8);
beam("bleached-wood",[.8,.2,.06],[1.5,.43,-.43],.07,8);
for(let i=0;i<6;i++){const a=i*1.05;beam("bleached-wood",[-1.45,.15,0],[-1.72-.15*Math.sin(i),.15+.12*Math.cos(a),.12*Math.sin(a)],.035,6);}
for(let i=0;i<4;i++){const a=i*2.4;const g=new THREE.IcosahedronGeometry(1,1);const p=g.getAttribute("position");for(let j=0;j<p.count;j++){const f=1+.09*Math.sin(p.getX(j)*5+p.getY(j)*7+p.getZ(j)*9+i);p.setXYZ(j,p.getX(j)*f,p.getY(j)*f,p.getZ(j)*f);}g.computeVertexNormals();geo("warm-granite",g,[Math.cos(a)*.7,.12+(i%2)*.1,.85+Math.sin(a)*.45],[.12*i,.6*i,.2*i],[.42+.08*(i%2),.3+.1*(i%2),.35]);}return finish();}