const meta={"name": "wmc-stair-rail-exterior", "units": "meters"};
const CFG={"id": "wmc-stair-rail-exterior", "kind": "stairRail", "steps": 9, "run": 0.32, "rise": 0.18, "exterior": true};
function rng(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function bucket(){return{p:[],n:[],uv:[],c:[]};}
const boxCache=new Map();
async function bevel(w,h,d,r=.006,soft=false){const key=[w,h,d,r,soft].join(',');if(!boxCache.has(key))boxCache.set(key,await roundedBoxGeo(w,h,d,Math.min(r,w*.22,h*.22,d*.22),{style:soft?'round':'chamfer',segments:soft?5:1}));return boxCache.get(key).clone();}
function put(b,geo,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1],tint=1,mode='metric',grain=1,shift=0){
 let g=geo.index?geo.toNonIndexed():geo.clone();const p=g.getAttribute('position'),n=g.getAttribute('normal'),old=g.getAttribute('uv'),uv=[];
 for(let i=0;i<p.count;i++){
  const v=[p.getX(i)*scale[0],p.getY(i)*scale[1],p.getZ(i)*scale[2]],nn=[n.getX(i),n.getY(i),n.getZ(i)],axis=nn.map(Math.abs).indexOf(Math.max(...nn.map(Math.abs)));let u=0,w=0;
  if(mode==='keep'){u=old?old.getX(i):0;w=old?old.getY(i):0;}
  else if(mode==='wood'){
   if(axis===grain){const a=[0,1,2].filter(x=>x!==grain);u=Math.hypot(v[a[0]],v[a[1]])*6;w=Math.atan2(v[a[1]],v[a[0]])/6.283;}
   else{const a=[0,1,2].find(x=>x!==grain&&x!==axis);u=v[a]/.24+shift;w=v[grain]/1.1+shift*.37;}
  }else{const a=axis===0?[2,1]:axis===1?[0,2]:[0,1],rep=mode==='cloth'?.13:mode==='rug'?.09:mode==='stone'?.65:1;u=(v[a[0]]+pos[a[0]])/rep+shift;w=(v[a[1]]+pos[a[1]])/rep;}
  uv.push(u,w);
 }
 const q=rot.isQuaternion?rot:new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),q,new THREE.Vector3(...scale)));
 const pp=g.getAttribute('position'),nn=g.getAttribute('normal');const c=typeof tint==='number'?[tint,tint,tint]:tint;
 const cc=g.getAttribute('color');for(let i=0;i<pp.count;i++){b.p.push(pp.getX(i),pp.getY(i),pp.getZ(i));b.n.push(nn.getX(i),nn.getY(i),nn.getZ(i));b.uv.push(uv[i*2],uv[i*2+1]);b.c.push(c[0]*(cc?cc.getX(i):1),c[1]*(cc?cc.getY(i):1),c[2]*(cc?cc.getZ(i):1));}
}
function finish(root,name,b,mat){if(!b.p.length)return;const g=new THREE.BufferGeometry();for(const[k,a,s]of[['position',b.p,3],['normal',b.n,3],['uv',b.uv,2],['color',b.c,3]])g.setAttribute(k,new THREE.Float32BufferAttribute(a,s));mat.vertexColors=true;return createPart(name,g,mat,{parent:root});}
function bins(){return{warm:bucket(),dark:bucket(),stone:bucket(),iron:bucket(),snow:bucket(),linen:bucket(),throw:bucket(),ember:bucket(),glass:bucket()};}
async function mats(){
 const warm=await materialRecipe('kiln.material.wood.v1',{baseColor:'#ddc7a5',roughness:.71,textureResources:{baseColor:'kiln.texture.oak-veneer-albedo.v1',normal:'kiln.texture.oak-veneer-normal.v1'}});warm.normalScale.set(.3,.3);
 const dark=await materialRecipe('kiln.material.wood.v1',{baseColor:'#908a7f',roughness:.84,textureResources:{baseColor:'kiln.texture.weathered-planks-albedo.v1',normal:'kiln.texture.weathered-planks-normal.v1'}});dark.normalScale.set(.45,.45);
 const stone=await materialRecipe('kiln.material.stone.v1',{baseColor:'#babbb6',roughness:.96,textureResources:{baseColor:'kiln.texture.rock-face-albedo.v1',normal:'kiln.texture.rock-face-normal.v1'}});stone.normalScale.set(.55,.55);
 const snowT=proceduralTexture({schemaVersion:2,size:128,name:'NeutralFineSnow',layers:[{op:'noise',colorA:0xe5e9e9,colorB:0xf9faf7,scale:48,octaves:2,seed:149}]});
 const clothT=proceduralTexture({schemaVersion:2,size:256,name:'OatmealWoolWeave',layers:[{op:'noise',colorA:0xa99d89,colorB:0xd7ccb9,scale:54,octaves:3,seed:43},{op:'stripes',count:128,angleDeg:0,colorA:0xa9a293,colorB:0xffffff,opacity:.20,blend:'multiply'},{op:'stripes',count:128,angleDeg:90,colorA:0xb6ac96,colorB:0xffffff,opacity:.23,blend:'multiply'}]});
 const throwT=proceduralTexture({schemaVersion:2,size:256,name:'CharcoalTweedWeave',layers:[{op:'noise',colorA:0x53514a,colorB:0x908a7d,scale:46,octaves:3,seed:84},{op:'stripes',count:96,angleDeg:45,colorA:0x77756d,colorB:0xe9e0cb,opacity:.4,blend:'multiply'}]});
 const linen=pbrMaterial({albedo:clothT,normal:normalMapFromHeight(clothT,{strength:2}),roughness:.94,metalness:0});linen.normalScale.set(.4,.4);if(CFG.kind==='lamp')linen.side=THREE.DoubleSide;
 const thr=pbrMaterial({albedo:throwT,normal:normalMapFromHeight(throwT,{strength:2}),roughness:.96,metalness:0});thr.normalScale.set(.45,.45);thr.side=THREE.DoubleSide;
 return{warm,dark,stone,iron:new THREE.MeshStandardMaterial({color:0x323a3b,roughness:.57,metalness:.65}),snow:pbrMaterial({albedo:snowT,roughness:.97,metalness:0}),linen,throw:thr,ember:new THREE.MeshStandardMaterial({color:0xb45a1d,emissive:0xff641e,emissiveIntensity:2.5,roughness:1}),glass:new THREE.MeshStandardMaterial({color:0xe6eef1,transparent:true,opacity:.075,roughness:.10,metalness:0,side:THREE.DoubleSide,depthWrite:false})};
}
function weather(g,seed,amount){const p=g.getAttribute('position');for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,x+amount*Math.sin(y*27+z*19+seed)*Math.cos(x*17),y+amount*.5*Math.sin(x*24+z*22+seed),z+amount*Math.cos(x*31+y*17+seed));}g.computeVertexNormals();return g;}
async function block(B,key,size,pos,grain=1,tint=1,r=.006,rot=[0,0,0],shift=0){put(B[key],await bevel(...size,r),pos,rot,[1,1,1],tint,key==='stone'?'stone':key==='warm'||key==='dark'?'wood':'metric',grain,shift);}
async function beam(B,key,a,b,w=.16,d=.16,tint=1){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());put(B[key],await bevel(w,delta.length(),d,.005),va.add(vb).multiplyScalar(.5).toArray(),q,[1,1,1],tint,'wood',1);}
function rod(B,key,a,b,r=.008,radial=6,tint=1){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());put(B[key],new THREE.CylinderGeometry(r,r,delta.length(),radial),va.add(vb).multiplyScalar(.5).toArray(),q,[1,1,1],tint);}
function polygon(points,depth=0){const sh=new THREE.Shape();points.forEach((p,i)=>i?sh.lineTo(...p):sh.moveTo(...p));sh.closePath();if(depth){const g=new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:false,steps:1});g.translate(0,0,-depth/2);return g;}return new THREE.ShapeGeometry(sh);}
function snowBlob(B,p,s,seed){put(B.snow,weather(new THREE.SphereGeometry(1,10,6),seed,.10),p,[0,seed,0],s,.98);}
async function stoneBlock(B,size,pos,seed){const g=weather(await bevel(...size,.015),seed,.008);put(B.stone,g,pos,[0,seed%3*.005,0],[1,1,1],.78+(seed%7)*.035,'stone');}
async function wallRect(B,size,center,normal,seed){
 const axis=Math.abs(normal[0])?0:2,across=axis===0?2:0,depth=size[axis],width=size[across],H=size[1],face=normal[axis];
 const core=[...size];core[axis]=depth-.054;await block(B,'dark',core,center,1,.58,.002);
 const n=Math.max(1,Math.ceil(width/.18)),bw=width/n;
 for(let k=0;k<n;k++){
  const p=[...center];p[across]+=-width/2+(k+.5)*bw;
  const ss=[...size];ss[across]=bw-.003;ss[axis]=.030;p[axis]=center[axis]+face*(depth/2-.015);
  await block(B,'dark',ss,p,1,.86+.025*((k+seed)%6),.003,[0,0,0],(k+seed)*.137);
  ss[axis]=.024;p[axis]=center[axis]-face*(depth/2-.012);await block(B,'warm',ss,p,1,.92+.025*((k+seed)%4),.002,[0,0,0],(k+seed)*.173);
 }
 // Flush sill and head finish the cladding ends without narrowing the opening.
 for(const y of [-H/2+.04,H/2-.04]){const ss=[...size];ss[1]=.08;const p=[...center];p[1]+=y;await block(B,'dark',ss,p,across,.92,.003);}
}
async function floorBuild(B,cfg){
 const W=cfg.width,D=cfg.depth,H=cfg.height,deck=cfg.kind==='deck',key=deck?'dark':'warm';
 if(!deck)await block(B,'dark',[W,H-.045,D],[0,-.0225,0],2,.78,.003);
 else for(const x of [-W/2+.07,W/2-.07])await block(B,'dark',[.12,H-.04,D],[x,-.02,0],2,.87,.004);
 const n=Math.round(W/(deck?.15:.18)),bw=W/n;
 for(let i=0;i<n;i++){
  const x=-W/2+(i+.5)*bw;let z=-D/2,j=0;
  while(z<D/2-.001){const len=Math.min(D/2-z,deck?D:(j===0?.83+(i%3)*.47:1.82));
   await block(B,key,[bw-.003,.045,len-.002],[x,H/2-.0225,z+len/2],2,.87+.025*((i*7+j*3)%6),.0025,[0,0,0],i*.137+j*.07);
   if(deck)for(const zz of [z+.10,z+len-.10])for(const xx of [x-bw*.25,x+bw*.25]){const g=new THREE.CylinderGeometry(.0022,.0022,.0008,6);put(B.iron,g,[xx,H/2-.0004,zz]);}
   z+=len;j++;
  }
 }
 if(cfg.loft)await block(B,'dark',[3.9,.3,.22],[1.3,0,2.085],0,.92,.006);
}
async function wallBuild(B,cfg){for(let i=0;i<cfg.rects.length;i++){const r=cfg.rects[i];await wallRect(B,r.size,r.pos,cfg.normal,i*3);}
 if(cfg.gable==='rear'){
  put(B.dark,polygon([[-3.6,4.5],[3.6,4.5],[0,7.52076]],.20),[0,0,0],[0,0,0],[1,1,1],.90,'wood',1);
  const n=40,bw=7.2/n;for(let i=0;i<n;i++){const x=-3.6+(i+.5)*bw,h=3.02076-Math.abs(x)*Math.tan(40*Math.PI/180)-.015;if(h>.05){await block(B,'dark',[bw-.004,h,.035],[x,4.5+h/2,-.1075],1,.89+.025*(i%5),.002,[0,0,0],i*.13);await block(B,'warm',[bw-.004,h,.024],[x,4.5+h/2,.112],1,.95,.002,[0,0,0],i*.15);}}
 }
 if(cfg.gable==='front'){
  // Fitted triangular timber frame; the panes are a separately batchable asset.
  await beam(B,'dark',[-3.6,4.5,0],[0,7.52076,0],.18,.25);await beam(B,'dark',[0,7.52076,0],[3.6,4.5,0],.18,.25);
  await block(B,'dark',[7.2,.18,.25],[0,4.5,0],0,.94,.006);
  for(const x of [-2.4,-1.2,0,1.2,2.4]){const h=3.02076-Math.abs(x)*Math.tan(40*Math.PI/180)-.07;await block(B,'dark',[x===0?.16:.10,h,.18],[x,4.5+h/2,0],1,.96,.005);}
  for(const x of [-2.4,-1.2,0,1.2,2.4])for(const z of [-.13,.13]){const g=new THREE.CylinderGeometry(.012,.012,.005,8);g.rotateX(Math.PI/2);put(B.warm,g,[x,4.55,z],[0,0,0],[1,1,1],.62);}
 }
}
async function plinthBuild(B){await block(B,'stone',[2.4,1.6,.32],[0,0,0],1,.5,.002);let y=-.8;const hs=[.25,.29,.24,.28,.26,.28];for(let row=0;row<6;row++){let x=-1.2,i=0;while(x<1.2-.001){const w=Math.min(1.2-x,.38+((row*7+i*11)%5)*.09);await stoneBlock(B,[w-.014,hs[row]-.014,.34],[x+w/2,y+hs[row]/2,0],row*17+i*7);x+=w;i++;}y+=hs[row];}}
async function postBuild(B){await block(B,'dark',[.22,4.5,.22],[0,2.25,0],1,.96,.008);for(const y of [.12,4.30]){await block(B,'iron',[.225,.055,.225],[0,y,0],1,1,.002);for(const z of [-.114,.114]){const g=new THREE.CylinderGeometry(.014,.014,.005,8);g.rotateX(Math.PI/2);put(B.iron,g,[0,y,z]);}}}
async function rafterBuild(B){const slope=40*Math.PI/180,L=5.482710615195571;for(const side of [-1,1]){await block(B,'dark',[L,.20,.20],[side*2.1,5.537890774527711,0],0,.98,.006,[0,0,-side*slope]);}
 await block(B,'iron',[.25,.38,.22],[0,7.18,0],1,1,.004);for(const x of [-.065,.065])for(const y of [7.08,7.29]){const g=new THREE.CylinderGeometry(.012,.012,.006,8);g.rotateX(Math.PI/2);put(B.iron,g,[x,y,.114]);}}
async function roofBuild(B,cfg){
 const W=5.482710615195571,D=12.1,side=cfg.side,q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-side*40*Math.PI/180),center=[side*2.1,5.757890774527711,0];
 const local=bins(),hole=side===1?[-2.48,-1.56,-.84,.04]:null;
 const pieces=hole?[[-W/2,hole[0],-D/2,D/2],[hole[1],W/2,-D/2,D/2],[hole[0],hole[1],-D/2,hole[2]],[hole[0],hole[1],hole[3],D/2]]:[[-W/2,W/2,-D/2,D/2]];
 for(const p of pieces){await block(local,'iron',[p[1]-p[0],.025,p[3]-p[2]],[(p[0]+p[1])/2,.0975,(p[2]+p[3])/2],0,1,.002);}
 const n=61,bw=D/n;for(let k=0;k<n;k++){const z=-D/2+(k+.5)*bw;const ranges=hole&&z>hole[2]-.1&&z<hole[3]+.1?[[-W/2,hole[0]],[hole[1],W/2]]:[[-W/2,W/2]];for(const r of ranges)await block(local,'warm',[r[1]-r[0]-.002,.195,bw-.003],[(r[0]+r[1])/2,-.0125,z],0,.85+.02*(k%7),.002,[0,0,0],k*.127);}
 for(let z=-D/2+.04;z<D/2;z+=.46){const ranges=hole&&z>hole[2]&&z<hole[3]?[[-W/2,hole[0]],[hole[1],W/2]]:[[-W/2,W/2]];for(const r of ranges)await block(local,'iron',[r[1]-r[0],.033,.018],[(r[0]+r[1])/2,.122,z],0,.92,.004);}
 for(const x of [-W/2,W/2])await block(local,'dark',[.06,.27,D],[x,-.015,0],2,.83,.004);
 // Closed variable-thickness snow skin, with wavy exposed eaves and a scoured seam.
 const nx=28,nz=64,verts=[],uv=[],ix=[],at=(i,j)=>j*(nx+1)+i;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/nz,z=-D/2+.03+v*(D-.06),edge=.025*Math.sin(j*.97)+.022*Math.sin(j*2.41),x=-W/2+.045+u*(W-.09)+edge*(2*u-1),h=.235+.045*Math.sin(x*2.3+z*.85+side)+.025*Math.sin(z*3.7+x*4.5)+.018*Math.cos(z*8.1+x*6.7);verts.push(x,h,z);uv.push(x,z);}
 const addQuad=(a,b,c,d)=>ix.push(a,c,b,b,c,d);
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const x=-W/2+(i+.5)/nx*W,z=-D/2+(j+.5)/nz*D;if(hole&&x>hole[0]-.05&&x<hole[1]+.05&&z>hole[2]-.08&&z<hole[3]+.08)continue;if(i>nx-5&&Math.sin(z*1.3+side)>.89)continue;addQuad(at(i,j),at(i+1,j),at(i,j+1),at(i+1,j+1));}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();put(local.snow,g,[0,0,0],[0,0,0],[1,1,1],1,'keep');
 // Eave/end skirts visibly carry snow thickness instead of a paper-thin plane.
 for(const ii of [0,nx])for(let j=0;j<nz;j++){const a=at(ii,j)*3,b=at(ii,j+1)*3,points=[verts[a],.111,verts[a+2],verts[b],.111,verts[b+2],verts[a],verts[a+1],verts[a+2],verts[b],verts[b+1],verts[b+2]];const sk=new THREE.BufferGeometry();sk.setAttribute('position',new THREE.Float32BufferAttribute(points,3));sk.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));sk.setIndex(ii===0?[0,1,2,1,3,2]:[0,2,1,1,2,3]);sk.computeVertexNormals();put(local.snow,sk);}
 for(const key of ['warm','dark','iron','snow']){const bb=local[key],geo=new THREE.BufferGeometry();for(const[k,a,s]of[['position',bb.p,3],['normal',bb.n,3],['uv',bb.uv,2],['color',bb.c,3]])geo.setAttribute(k,new THREE.Float32BufferAttribute(a,s));put(B[key],geo,center,q,[1,1,1],1,'keep');}
 if(side===-1){await block(B,'iron',[.30,.065,D],[0,7.55,0],2,1,.02);put(B.snow,weather(await bevel(.46,.15,D-.05,.05,true),4,.027),[0,7.72,0],[0,0,0],[1,1,1],.99);}
}
async function paneBuild(B){const xs=[-3.49,-2.45,-1.25,-.08,.08,1.25,2.45,3.49];for(let j=0;j<6;j++){let a,b;if(j<3){a=xs[j]+.025;b=xs[j+1]-.025;}else{a=xs[j+1]+.025;b=xs[j+2]-.025;}const top=x=>3.02076-Math.abs(x)*Math.tan(40*Math.PI/180)-.12;const p=[[a,.10],[b,.10],[b,top(b)],[a,top(a)]];put(B.glass,polygon(p),[0,0,.018]);}}
async function doorBuild(B,cfg){const L=1.24,H=2.24,local=bins();await block(local,'dark',[L,H,.055],[L/2,H/2,0],1,.90,.005);
 for(let i=0;i<7;i++){const w=(L-.18)/7;await block(local,'warm',[w-.003,H-.30,.025],[.09+(i+.5)*w,H/2,-.028],1,.9+.025*(i%4),.003,[0,0,0],i*.19);}
 for(const x of [.055,L-.055])await block(local,'dark',[.11,H,.09],[x,H/2,0],1,.98,.005);
 for(const y of [.07,H-.07,.74])await block(local,'dark',[L-.20,.14,.09],[L/2,y,0],0,.95,.005);
 for(const y of [.32,1.87]){await block(local,'iron',[.38,.043,.008],[.20,y,.049],0,1,.002);rod(local,'iron',[.014,y-.085,0],[.014,y+.085,0],.018,10);for(const x of [.08,.28,.36]){const g=new THREE.CylinderGeometry(.009,.009,.005,8);g.rotateX(Math.PI/2);put(local.iron,g,[x,y,.055]);}}
 for(const z of [-.051,.051]){await block(local,'iron',[.032,.20,.012],[L-.16,1.04,z],1,1,.003);rod(local,'iron',[L-.16,1.03,z],[L-.28,1.03,z],.012,10);}
 // Both leaves keep their original hinge origin. Entry width runs +Z; deck width +X.
 const q=cfg.entry?new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2):new THREE.Quaternion();
 for(const key of ['dark','warm','iron']){const bb=local[key],geo=new THREE.BufferGeometry();for(const[k,a,s]of[['position',bb.p,3],['normal',bb.n,3],['uv',bb.uv,2]])geo.setAttribute(k,new THREE.Float32BufferAttribute(a,s));put(B[key],geo,[0,0,0],q,[1,1,1],1,'keep');}}
async function treadBuild(B){await block(B,'warm',[1.2,.12,.28],[0,0,0],0,.95,.006);for(const x of [-.49,.49])for(const z of [-.085,.085]){const g=new THREE.CylinderGeometry(.006,.006,.001,8);put(B.iron,g,[x,.0595,z]);}for(const z of [-.11,.11])await block(B,'dark',[1.18,.012,.009],[0,-.048,z],0,.8,.002);}
async function stairRailBuild(B,cfg){const n=cfg.steps,run=cfg.run,rise=cfg.rise,D=n*run,ext=cfg.exterior,first=ext?rise:0,last=ext?(n+1)*rise:n*rise;
 await beam(B,'dark',[0,first-.12,0],[0,last-.12,-D],.12,.20,.93);
 await beam(B,'dark',[0,first+1.015,0],[0,last+1.015,-D],.10,.09,.98);
 const count=ext?5:7;for(let k=0;k<count;k++){const t=k/(count-1),z=-D*t,y=first+(last-first)*t,upper=k===count-1;await block(B,'dark',[.10,upper?1.29:1.06,.10],[0,y+(upper?.385:.50),z],1,.92,.005);for(const yy of [y+.12,y+.92]){const g=new THREE.CylinderGeometry(.011,.011,.004,8);g.rotateZ(Math.PI/2);put(B.iron,g,[.052,yy,z]);}}
 // Upper post extends 230 mm down into the inclined member; paired steel
 // cheeks and two through-bolts finish the visible flight-facing connection.
 for(const x of [-.051,.051]){await block(B,'iron',[.008,.30,.08],[x,last-.06,-D+.005],1,.83,.003);for(const y of [last-.15,last+.035]){const g=new THREE.CylinderGeometry(.011,.011,.006,8);g.rotateZ(Math.PI/2);put(B.iron,g,[x+Math.sign(x)*.006,y,-D+.005]);}}
 for(const y of [.25,.49,.73])rod(B,'iron',[0,first+y,0],[0,last+y,-D],.006,6);
}
async function railBuild(B){const L=1.3;for(const x of [-L/2+.05,L/2-.05]){await block(B,'dark',[.10,1.04,.10],[x,.52,0],1,.96,.005);await block(B,'iron',[.13,.025,.13],[x,.015,0],1,1,.003);for(const y of [.24,.49,.74]){const g=new THREE.CylinderGeometry(.011,.011,.006,8);g.rotateX(Math.PI/2);put(B.iron,g,[x,y,.054]);}}
 await block(B,'dark',[L,.10,.10],[0,1.025,0],0,.98,.006);for(const y of [.24,.49,.74])rod(B,'iron',[-.6,y,0],[.6,y,0],.006,6);}
async function storageBuild(B){await block(B,'dark',[1,1.2,3.24],[0,.6,0],2,.90,.004);for(let i=0;i<6;i++){const z=-1.62+(i+.5)*.54;await block(B,'warm',[.028,1.04,.522],[.494,.59,z],1,.95,.004,[0,0,0],i*.16);await block(B,'dark',[.032,.05,.49],[.499,.16,z],2,.9,.004);rod(B,'iron',[.516,.65,z+.14],[.516,.77,z+.14],.009,8);}await block(B,'warm',[1,.055,3.24],[0,1.1725,0],2,.95,.005);}
async function pillow(B,key,size,pos,rot=[0,0,0],seed=0){let g=await bevel(...size,Math.min(...size)*.24,true);const p=g.getAttribute('position');for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,x,y+.003*Math.sin(x*35+seed)*Math.sin(z*38+seed),z+.004*Math.sin(x*27+y*24+seed));}g.computeVertexNormals();put(B[key],g,pos,rot,[1,1,1],1,'cloth');}
function clothSheet(B,key,fn,n=24,m=32){const p=[],uv=[],ix=[];for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){const u=i/n,v=j/m;p.push(...fn(u,v));uv.push(u*7,v*9);}for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;ix.push(a,b,c,b,d,c);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();put(B[key],g,[0,0,0],[0,0,0],[1,1,1],1,'keep');}
async function sofaBuild(B){
 for(const x of [-.66,.66])for(const z of [-.29,.29])await beam(B,'warm',[x,.015,z],[x*.94,.25,z*.94],.075,.075,.92);
 await pillow(B,'linen',[1.65,.22,.80],[0,.30,0]);
 for(const x of [-.76,.76])await pillow(B,'linen',[.13,.43,.82],[x,.49,0]);
 for(const x of [-.35,.35]){await pillow(B,'linen',[.68,.14,.59],[x,.435,-.07],[0,0,0],x*7);await pillow(B,'linen',[.68,.43,.16],[x,.70,.29],[.10,0,0],x*9);}
 for(const [x,z,r]of[[-.45,.18,-.16],[.40,.16,.13]])await pillow(B,'throw',[.33,.34,.095],[x,.66,z],[.16,0,r],x*17);
 clothSheet(B,'throw',(u,v)=>{const x=.47+u*.34,z=.30-v*.69,y=v<.35?.88-v*.62:.66-(v-.35)*.73;return[x+.008*Math.sin(v*23+u*12),y+.018*Math.sin(u*35+v*11),z];},16,26);
 for(let i=0;i<12;i++)rod(B,'throw',[.48+i*.027,.18,-.39],[.48+i*.027,.12,-.40],.003,4,.92);
}
async function chairBuild(B){
 for(const x of [-.26,.26])for(const z of [-.27,.27])await beam(B,'warm',[x,.015,z],[x*.87,.47,z*.94],.055,.055,.92);
 await block(B,'warm',[.65,.06,.68],[0,.35,0],2,.95,.005);
 for(const x of [-.30,.30]){await beam(B,'warm',[x,.36,.27],[x,.88,.29],.06,.06);await block(B,'warm',[.065,.055,.67],[x,.62,0],2,.96,.005);}
 await pillow(B,'linen',[.54,.14,.58],[0,.45,-.015]);await pillow(B,'linen',[.55,.43,.13],[0,.70,.27],[.12,0,0]);
 await block(B,'warm',[.65,.065,.06],[0,.86,.31],0,.95,.005);
}
async function tableBuild(B){for(const x of [-.45,.45])for(const z of [-.23,.23])await block(B,'warm',[.09,.39,.09],[x,.195,z],1,.93,.006);for(const z of [-.23,.23])await block(B,'dark',[.99,.10,.045],[0,.28,z],0,.9,.004);
 for(let i=0;i<3;i++)await block(B,'warm',[1.15,.065,.203],[0,.425,-.206+i*.206],0,.89+.04*i,.008,[0,0,0],i*.17);
 // Restrained books and one ceramic bowl add scale without obstructing the walk.
 await block(B,'linen',[.29,.045,.22],[-.25,.48,.03],0,.92,.003,[0,.13,0]);await block(B,'dark',[.31,.009,.23],[-.25,.506,.03],0,.80,.002,[0,.13,0]);
 const bowl=new THREE.SphereGeometry(.105,16,10,0,Math.PI*2,Math.PI*.35,Math.PI*.58);put(B.stone,bowl,[.25,.52,.02],[Math.PI,0,0],[1,.55,1],.80,'stone');
}
async function rugBuild(B){const W=2,D=3.3;const g=await bevel(W,.018,D,.007,true);put(B.linen,g,[0,.009,0],[0,0,0],[1,1,1],.78,'rug');for(const x of [-.965,.965])put(B.throw,await bevel(.04,.007,D-.02,.003),[x,.021,0],[0,0,0],[1,1,1],.82,'rug');for(const z of [-1.61,1.61])put(B.throw,await bevel(W-.08,.007,.04,.003),[0,.021,z],[0,0,0],[1,1,1],.82,'rug');for(const z of [-1.66,1.66])for(let i=0;i<48;i++)rod(B,'linen',[-.94+i*.04,.009,z],[-.937+i*.04,.007,z+Math.sign(z)*.065],.0023,4,.88);}
async function hearthBuild(B){
 await stoneBlock(B,[1.45,.24,1.1],[0,.12,0],31);
 for(const x of [-.53,.53])for(let j=0;j<6;j++)await stoneBlock(B,[.27,.21,.72],[x,.355+j*.23,-.04],j*13+(x>0?3:7));
 await stoneBlock(B,[1.38,.19,.84],[0,1.68,-.02],54);
 for(let j=0;j<3;j++)await stoneBlock(B,[.91,.20,.70],[0,1.87+j*.21,-.06],71+j*3);
 // A genuinely recessed iron cavity; its opening faces +Z toward the living seats.
 await block(B,'iron',[.80,.94,.035],[0,.77,-.365],1,.43,.004);
 for(const x of [-.40,.40])await block(B,'iron',[.035,.94,.71],[x,.77,0],1,.60,.004);
 for(const y of [.29,1.25])await block(B,'iron',[.83,.035,.73],[0,y,0],0,.62,.004);
 for(const x of [-.415,.415])await block(B,'iron',[.045,1.02,.035],[x,.77,.375],1,.95,.004);
 for(const y of [.27,1.28])await block(B,'iron',[.86,.045,.035],[0,y,.375],0,.95,.004);
 for(const x of [-.29,-.1,.1,.29])rod(B,'iron',[x,.35,-.27],[x,.35,.30],.012,8);
 for(let i=0;i<5;i++){const g=new THREE.CylinderGeometry(.065,.08,.63,9,3);g.rotateZ(Math.PI/2);put(B.dark,weather(g,i*9,.006),[0,.43+(i%2)*.10,-.20+i*.105],[0,(i%2?-.13:.17),0],[1,1,1],.24,'wood',0);}
 for(let i=0;i<18;i++){const x=-.28+(i%6)*.108,z=-.19+Math.floor(i/6)*.18;put(B.ember,weather(new THREE.IcosahedronGeometry(.035,0),i,.05),[x,.405+(i%3)*.018,z],[0,i,0],[1,.7,1],.75+(i%4)*.08);}
}
async function chimneyBuild(B){
 await block(B,'stone',[.59,7.2,.59],[0,3.6,0],1,.5,.002);
 const H=.225;for(let j=0;j<32;j++)for(const side of [-1,1])for(let k=0;k<2;k++){const w=(k===0?.31:.29),x=k===0?-.145:.165;const p=j%2?[side*.15,(j+.5)*H,x]:[x,(j+.5)*H,side*.15];await stoneBlock(B,[.294,H-.013,.294],p,j*13+k*7+(side>0?3:1));}
 // Roof flashing follows the east 40-degree pitch and surrounds the masonry shaft.
 await block(B,'iron',[1.08,.028,1.08],[0,6.1,0],0,.85,.004,[0,0,-40*Math.PI/180]);
 for(const x of [-.35,.35])for(const z of [-.35,.35])await block(B,'iron',[.045,.22,.045],[x,7.19,z],1,1,.004);
 await block(B,'iron',[.88,.08,.88],[0,7.28,0],0,1,.014);snowBlob(B,[.10,7.355,.08],[.35,.07,.35],5);
}
async function lampBuild(B){
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3;await beam(B,'warm',[Math.cos(a)*.22,.015,Math.sin(a)*.22],[Math.cos(a)*.035,1.25,Math.sin(a)*.035],.038,.038);}
 rod(B,'iron',[0,.15,0],[0,1.50,0],.012,10);
 const shade=new THREE.CylinderGeometry(.20,.29,.37,32,1,true);put(B.linen,shade,[0,1.43,0],[0,0,0],[1,1,1],1,'cloth');
 for(const y of [1.245,1.615]){const g=new THREE.TorusGeometry(y<1.3?.29:.20,.006,5,32);g.rotateX(Math.PI/2);put(B.iron,g,[0,y,0]);}
 put(B.ember,new THREE.SphereGeometry(.034,12,8),[0,1.44,0]);
}
async function construct(B,cfg){
 if(['floor','deck'].includes(cfg.kind))return floorBuild(B,cfg);
 if(cfg.kind==='wall')return wallBuild(B,cfg);
 if(cfg.kind==='plinth')return plinthBuild(B);
 if(cfg.kind==='post')return postBuild(B);
 if(cfg.kind==='rafter')return rafterBuild(B);
 if(cfg.kind==='roof')return roofBuild(B,cfg);
 if(cfg.kind==='pane')return paneBuild(B);
 if(cfg.kind==='door')return doorBuild(B,cfg);
 if(cfg.kind==='tread')return treadBuild(B);
 if(cfg.kind==='stairRail')return stairRailBuild(B,cfg);
 if(cfg.kind==='rail')return railBuild(B);
 if(cfg.kind==='storage')return storageBuild(B);
 if(cfg.kind==='sofa')return sofaBuild(B);
 if(cfg.kind==='chair')return chairBuild(B);
 if(cfg.kind==='table')return tableBuild(B);
 if(cfg.kind==='rug')return rugBuild(B);
 if(cfg.kind==='hearth')return hearthBuild(B);
 if(cfg.kind==='chimney')return chimneyBuild(B);
 if(cfg.kind==='lamp')return lampBuild(B);
 throw new Error('Unknown asset module '+cfg.kind);
}
async function build(){const root=createRoot(CFG.id),B=bins(),M=await mats();await construct(B,CFG);for(const k of Object.keys(B))finish(root,k,B[k],M[k]);return root;}
