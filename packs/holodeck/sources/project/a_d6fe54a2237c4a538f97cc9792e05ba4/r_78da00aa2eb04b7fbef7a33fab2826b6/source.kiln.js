const meta={"name": "wmc-entry-bench", "units": "meters"};
const CFG={"id": "wmc-entry-bench", "kind": "entryBench"};
function rng(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function bucket(){return{p:[],n:[],uv:[],c:[]};}
const boxCache=new Map();
async function bevel(w,h,d,r=.006,soft=false){const key=[w,h,d,r,soft].join(',');if(!boxCache.has(key))boxCache.set(key,await roundedBoxGeo(w,h,d,Math.min(r,w*.22,h*.22,d*.22),{style:soft?'round':'chamfer',segments:soft?5:1}));return boxCache.get(key).clone();}
function put(b,geo,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1],tint=1,mode='metric',grain=1,shift=0){
 let g=geo.index?geo.toNonIndexed():geo.clone();const p=g.getAttribute('position'),n=g.getAttribute('normal'),old=g.getAttribute('uv'),uv=[],endFaces=[];
 for(let i=0;i<p.count;i++){
  const v=[p.getX(i)*scale[0],p.getY(i)*scale[1],p.getZ(i)*scale[2]],nn=[n.getX(i),n.getY(i),n.getZ(i)],axis=nn.map(Math.abs).indexOf(Math.max(...nn.map(Math.abs)));let u=0,w=0;if(i%3===0)endFaces.push(mode==='wood'&&axis===grain);
  if(mode==='keep'){u=old?old.getX(i):0;w=old?old.getY(i):0;}
  else if(mode==='wood'){
   if(endFaces[Math.floor(i/3)]){const a=[0,1,2].filter(x=>x!==grain);u=v[a[0]]/.14+.5+shift*.13;w=v[a[1]]/.14+.5;}
   else{const a=[0,1,2].find(x=>x!==grain&&x!==axis);u=v[a]/.16+shift;w=v[grain]/.85+shift*.37;}
  }else{const a=axis===0?[2,1]:axis===1?[0,2]:[0,1],rep=mode==='cloth'?.13:mode==='rug'?.09:mode==='stone'?.65:(b.metricRepeat||1);u=(v[a[0]]+pos[a[0]])/rep+shift;w=(v[a[1]]+pos[a[1]])/rep;}
  uv.push(u,w);
 }
 const q=rot.isQuaternion?rot:new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),q,new THREE.Vector3(...scale)));
 const pp=g.getAttribute('position'),nn=g.getAttribute('normal');const c=typeof tint==='number'?[tint,tint,tint]:tint;
 const cc=g.getAttribute('color');for(let i=0;i<pp.count;i++){const end=mode==='wood'&&b.endTarget&&endFaces[Math.floor(i/3)],dst=end?b.endTarget:b,et=end?(b.endTint||1):1;dst.p.push(pp.getX(i),pp.getY(i),pp.getZ(i));dst.n.push(nn.getX(i),nn.getY(i),nn.getZ(i));dst.uv.push(uv[i*2],uv[i*2+1]);dst.c.push(et*c[0]*(cc?cc.getX(i):1),et*c[1]*(cc?cc.getY(i):1),et*c[2]*(cc?cc.getZ(i):1));}
}
function finish(root,name,b,mat){if(!b.p.length)return;const g=new THREE.BufferGeometry();for(const[k,a,s]of[['position',b.p,3],['normal',b.n,3],['uv',b.uv,2],['color',b.c,3]])g.setAttribute(k,new THREE.Float32BufferAttribute(a,s));mat.vertexColors=true;g.rotateY(Math.PI/2);return createPart(name,g,mat,{parent:root});}
function bins(){const B={warm:bucket(),dark:bucket(),stone:bucket(),iron:bucket(),snow:bucket(),linen:bucket(),throw:bucket(),ember:bucket(),glass:bucket(),endgrain:bucket(),ceramic:bucket(),steel:bucket(),counter:bucket(),paper:bucket(),leather:bucket()};B.ceramic.metricRepeat=.25;B.leather.metricRepeat=.12;B.counter.metricRepeat=.6;B.warm.endTarget=B.endgrain;B.dark.endTarget=B.endgrain;B.dark.endTint=.56;return B;}
async function baseMats(){
 const warm=await materialRecipe('kiln.material.wood.v1',{baseColor:'#bdc9c2',roughness:.62,textureResources:{baseColor:'kiln.texture.oak-veneer-albedo.v1',normal:'kiln.texture.oak-veneer-normal.v1'}});warm.normalScale.set(.16,.16);
 const dark=await materialRecipe('kiln.material.wood.v1',{baseColor:'#7f8580',roughness:.70,textureResources:{baseColor:'kiln.texture.oak-veneer-albedo.v1',normal:'kiln.texture.oak-veneer-normal.v1'}});dark.normalScale.set(.17,.17);
 const stone=await materialRecipe('kiln.material.stone.v1',{baseColor:'#babbb6',roughness:.96,textureResources:{baseColor:'kiln.texture.rock-face-albedo.v1',normal:'kiln.texture.rock-face-normal.v1'}});stone.normalScale.set(.55,.55);
 const snowT=proceduralTexture({schemaVersion:2,size:128,name:'NeutralFineSnow',layers:[{op:'noise',colorA:0xe5e9e9,colorB:0xf9faf7,scale:48,octaves:2,seed:149}]});
 const clothT=proceduralTexture({schemaVersion:2,size:256,name:'OatmealWoolWeave',layers:[{op:'noise',colorA:0xb5ad9e,colorB:0xcdc4b3,scale:54,octaves:3,seed:43},{op:'stripes',count:128,angleDeg:0,colorA:0xa9a293,colorB:0xffffff,opacity:.12,blend:'multiply'},{op:'stripes',count:128,angleDeg:90,colorA:0xb6ac96,colorB:0xffffff,opacity:.14,blend:'multiply'}]});
 const throwT=proceduralTexture({schemaVersion:2,size:256,name:'CharcoalTweedWeave',layers:[{op:'noise',colorA:0x4b5050,colorB:0x6c7170,scale:46,octaves:3,seed:84},{op:'stripes',count:96,angleDeg:45,colorA:0x77756d,colorB:0xe9e0cb,opacity:.22,blend:'multiply'}]});
 const linen=pbrMaterial({albedo:clothT,normal:normalMapFromHeight(clothT,{strength:2}),roughness:.94,metalness:0});linen.normalScale.set(.28,.28);if(CFG.kind==='lamp')linen.side=THREE.DoubleSide;
 const thr=pbrMaterial({albedo:throwT,normal:normalMapFromHeight(throwT,{strength:2}),roughness:.96,metalness:0});thr.normalScale.set(.28,.28);thr.side=THREE.DoubleSide;
 // End grain has its own planar metric map: 140 mm per repeat, approximately 3 mm
 // growth rings with low-contrast early/late wood. No interpolated polar UVs.
 const ops=[];for(let i=0;i<31;i++){const r=Math.round(203-i*6.1),cx=117+Math.round(2*Math.sin(i*.37)),cy=109+Math.round(2*Math.cos(i*.41));ops.push({op:'paint',shape:{kind:'ellipse',x:cx-r,y:cy-r,width:r*2,height:r*2},rgba:[139,128,108,255]});ops.push({op:'paint',shape:{kind:'ellipse',x:cx-r+1,y:cy-r+1,width:r*2-2,height:r*2-2},rgba:[156,145,124,255]});}
 ops.push({op:'legacy-v2',spec:{schemaVersion:2,size:256,usage:'albedo',layers:[{op:'noise',colorA:0x8b806e,colorB:0x9c917c,scale:75,octaves:2,seed:39}]},opacity:42});
 const endT=proceduralTexture({schemaVersion:3,width:256,height:256,usage:'albedo',name:'TimberPlanarEndGrain140mmM4B',background:[156,145,124,255],operations:ops});
 const endgrain=new THREE.MeshStandardMaterial({map:endT,roughness:.72,metalness:0});
 return{warm,dark,stone,endgrain,iron:new THREE.MeshStandardMaterial({color:0x303737,roughness:.49,metalness:.68}),snow:pbrMaterial({albedo:snowT,roughness:.97,metalness:0}),linen,throw:thr,ember:new THREE.MeshStandardMaterial({color:0xb45a1d,emissive:0xff641e,emissiveIntensity:2.5,roughness:1}),glass:new THREE.MeshStandardMaterial({color:0xe6eef1,transparent:true,opacity:.075,roughness:.10,metalness:0,side:THREE.DoubleSide,depthWrite:false})};
}
function weather(g,seed,amount){const p=g.getAttribute('position');for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,x+amount*Math.sin(y*27+z*19+seed)*Math.cos(x*17),y+amount*.5*Math.sin(x*24+z*22+seed),z+amount*Math.cos(x*31+y*17+seed));}g.computeVertexNormals();return g;}
async function block(B,key,size,pos,grain=1,tint=1,r=.006,rot=[0,0,0],shift=0){put(B[key],await bevel(...size,r),pos,rot,[1,1,1],tint,key==='stone'?'stone':key==='warm'||key==='dark'?'wood':'metric',grain,shift);}
async function beam(B,key,a,b,w=.16,d=.16,tint=1){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());put(B[key],await bevel(w,delta.length(),d,.005),va.add(vb).multiplyScalar(.5).toArray(),q,[1,1,1],tint,'wood',1);}
function rod(B,key,a,b,r=.008,radial=6,tint=1){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());put(B[key],new THREE.CylinderGeometry(r,r,delta.length(),radial),va.add(vb).multiplyScalar(.5).toArray(),q,[1,1,1],tint);}
function polygon(points,depth=0){const sh=new THREE.Shape();points.forEach((p,i)=>i?sh.lineTo(...p):sh.moveTo(...p));sh.closePath();if(depth){const g=new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:false,steps:1});g.translate(0,0,-depth/2);return g;}return new THREE.ShapeGeometry(sh);}
function snowBlob(B,p,s,seed){put(B.snow,weather(new THREE.SphereGeometry(1,10,6),seed,.10),p,[0,seed,0],s,.98);}
async function stoneBlock(B,size,pos,seed){const g=weather(await bevel(...size,.015),seed,.008);put(B.stone,g,pos,[0,seed%3*.005,0],[1,1,1],.78+(seed%7)*.035,'stone');}

// Construction equations below use X across / +Z front, then finish() bakes a +90 Y
// conversion into every mesh. Exported reusable assets face +X, +Y up, +Z right.
async function mats(){const M=await baseMats();
 const fleck=proceduralTexture({schemaVersion:2,size:128,name:'IvoryStonewareFineSpeckle',layers:[{op:'noise',colorA:0xbab6a4,colorB:0xe8e2cd,scale:83,octaves:2,seed:18}]});
 M.ceramic=pbrMaterial({albedo:fleck,roughness:.34,metalness:0});
 const soap=proceduralTexture({schemaVersion:2,size:256,name:'HonedSoapstone600mm',layers:[{op:'noise',colorA:0x424b49,colorB:0x626c67,scale:7,octaves:4,seed:91},{op:'noise',colorA:0x7b8780,colorB:0xc0c5b8,scale:95,octaves:2,seed:71,blend:'multiply',opacity:.12}]});
 M.counter=pbrMaterial({albedo:soap,normal:normalMapFromHeight(soap,{strength:.3}),roughness:.69,metalness:0});M.counter.normalScale.set(.15,.15);
 M.steel=new THREE.MeshStandardMaterial({color:0x9fa9a7,roughness:.28,metalness:.85});
 M.paper=new THREE.MeshStandardMaterial({color:0xe5ddc6,roughness:.95});
 const leathT=proceduralTexture({schemaVersion:2,size:128,name:'DryBrownLeatherFineGrain',layers:[{op:'noise',colorA:0x4b4135,colorB:0x75604b,scale:85,octaves:3,seed:118}]});const leath=pbrMaterial({albedo:leathT,normal:normalMapFromHeight(leathT,{strength:.8}),roughness:.85,metalness:0});leath.normalScale.set(.20,.20);M.leather=leath;
 return M;
}
function tube(B,key,points,r=.005,segments=24,radial=8,tint=1){put(B[key],curveToMesh(points,r,segments,radial),[0,0,0],[0,0,0],[1,1,1],tint);}
function lathed(B,key,profile,pos,segments=32,tint=1){put(B[key],lathe(profile,segments),pos,[0,0,0],[1,1,1],tint);}
function ring(B,key,r,t,pos,tilt=0){const g=new THREE.TorusGeometry(r,t,6,36);g.rotateX(Math.PI/2+tilt);put(B[key],g,pos);}
async function soft(B,key,size,pos,rot=[0,0,0],seed=1){let g=await bevel(...size,Math.min(...size)*.36,true);const p=g.getAttribute('position');for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i);const w=Math.min(1,Math.abs(y)/(size[1]*.5));p.setXYZ(i,x,y+.002*Math.sin(x*43+seed)*Math.sin(z*27+seed)*w,z+.0025*Math.sin(x*35+y*24+seed));}g.computeVertexNormals();put(B[key],g,pos,rot,[1,1,1],1,'cloth');}
function sheet(B,key,fn,n=40,m=40,repeat=[8,10]){const p=[],uv=[],ix=[];for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){const u=i/n,v=j/m;p.push(...fn(u,v));uv.push(u*repeat[0],v*repeat[1]);}for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;ix.push(a,c,b,b,c,d);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();put(B[key],g,[0,0,0],[0,0,0],[1,1,1],1,'keep');}
function peg(B,x,y,z,r=.004){const g=new THREE.CylinderGeometry(r,r,.0018,10);g.rotateX(Math.PI/2);put(B.endgrain,g,[x,y,z],[0,0,0],[1,1,1],.76);}
async function book(B,pos,size=[.18,.035,.24],seed=0){const [x,y,z]=pos,[w,h,d]=size;await block(B,'paper',[w-.008,h-.008,d-.012],[x,y+h/2,z],0,.94,.001);for(const yy of [y+.002,y+h-.002])await block(B,'leather',[w,.004,d],[x,yy,z],0,.78+.07*seed,.001);await block(B,'leather',[.006,h,d],[x-w/2+.003,y+h/2,z],2,.85,.001);for(let j=0;j<5;j++)rod(B,'paper',[x+w/2+.0005,y+.007+j*(h-.014)/4,z-d/2+.012],[x+w/2+.0005,y+.007+j*(h-.014)/4,z+d/2-.012],.00045,4,.75);}
function cup(B,pos,scale=1){const [x,y,z]=pos,s=scale;lathed(B,'ceramic',[[0,0],[.032*s,0],[.037*s,.006*s],[.044*s,.082*s],[.043*s,.087*s],[.038*s,.087*s],[.036*s,.011*s],[0,.011*s]],[x,y,z],32);tube(B,'ceramic',[[x+.040*s,y+.070*s,z],[x+.069*s,y+.068*s,z],[x+.073*s,y+.038*s,z],[x+.043*s,y+.023*s,z]],.006*s,20,7);}
function plate(B,pos,r=.12){lathed(B,'ceramic',[[0,.004],[r*.72,.004],[r*.97,.016],[r,.020],[r*.98,.025],[r*.73,.012],[0,.012]],pos,36);}
async function sideTable(B){for(const x of [-.14,.14])for(const z of [-.14,.14])await beam(B,'warm',[x,0,z],[x*.88,.49,z*.88],.033,.033);await block(B,'warm',[.38,.035,.38],[0,.5025,0],0,.98,.006);await block(B,'warm',[.30,.023,.30],[0,.12,0],2,.94,.003);for(const z of [-.135,.135])await block(B,'warm',[.29,.075,.026],[0,.44,z],0,.96,.003);for(const x of [-.135,.135])await block(B,'warm',[.026,.075,.25],[x,.44,0],2,.96,.003);await block(B,'warm',[.278,.064,.018],[0,.443,.154],0,1,.003);rod(B,'iron',[-.034,.445,.17],[.034,.445,.17],.0045,8);for(const x of [-.11,.11])peg(B,x,.445,.165);await book(B,[-.02,.133,0],[.19,.027,.23],1);}
async function diningTable(B){const W=.75,D=1.20;for(const x of [-.29,.29])for(const z of [-.50,.50]){await beam(B,'warm',[x*.99,0,z*.99],[x,.71,z],.055,.055,.94);peg(B,x,.66,z>0?.531:-.531);}
 for(const x of [-.29,.29])await block(B,'warm',[.035,.105,1.02],[x,.645,0],2,.94,.004);for(const z of [-.50,.50])await block(B,'warm',[.61,.105,.035],[0,.645,z],0,.94,.004);
 for(let i=0;i<4;i++)await block(B,'warm',[W/4-.0015,.042,D],[-W/2+(i+.5)*W/4,.729,0],2,.96+.012*(i%3),.004,[0,0,0],i*.179);
 // Two modest settings; the central prep/serving zone remains open.
 for(const x of [-.245,.245]){plate(B,[x,.751,.02],.105);cup(B,[x,.751,-.27],.85);await block(B,'linen',[.13,.004,.18],[x,.754,.30],0,1,.001);}
}
async function diningChair(B){for(const x of [-.205,.205])for(const z of [-.205,.205])await beam(B,'warm',[x,0,z],[x*.91,.43,z*.9],.036,.036,.95);
 for(const x of [-.185,.185])await beam(B,'warm',[x,.35,-.19],[x,.83,-.235],.035,.035,.97);
 for(const z of [-.185,.185])await block(B,'warm',[.41,.045,.03],[0,.395,z],0,.97,.003);for(const x of [-.185,.185])await block(B,'warm',[.03,.045,.37],[x,.395,0],2,.97,.003);
 await soft(B,'linen',[.455,.055,.455],[0,.4325,0], [0,0,0],8);
 // Two curved solid back slats follow the same rear-post frame, with visible mortise ends.
 for(const y of [.63,.785]){const p=[],ix=[];for(let i=0;i<=20;i++){const x=-.203+i/20*.406,z=-.224-.035*(1-(x/.203)**2),yy=y;for(const [dy,dz]of[[-.042,-.013],[-.042,.013],[.042,.013],[.042,-.013]])p.push(x,yy+dy,z+dz);}for(let i=0;i<20;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4;ix.push(a,b,a+4,b,b+4,a+4);}ix.push(0,2,1,0,3,2,80,81,82,80,82,83);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();put(B.warm,g,[0,0,0],[0,0,0],[1,1,1],.97,'wood',0);}
 for(const x of [-.205,.205])peg(B,x,.63,-.210);for(const x of [-.19,.19])rod(B,'warm',[x,.20,-.20],[x,.20,.20],.012,10,.92);
}
function bowlSink(B){const p=[],ix=[],rings=[[.52,.42,.071,.904],[.484,.384,.065,.902],[.44,.34,.055,.87],[.34,.24,.045,.75],[.33,.23,.04,.738]];const N=32;for(const [w,d,r,y]of rings)for(let i=0;i<N;i++){const corner=Math.floor(i/8),a=(i%8)/7*Math.PI/2+corner*Math.PI/2,cx=(corner===0||corner===3?1:-1)*(w/2-r),cz=(corner<2?1:-1)*(d/2-r);p.push(-.63+cx+r*Math.cos(a),y,cz+r*Math.sin(a));}for(let j=0;j<rings.length-1;j++)for(let i=0;i<N;i++){const a=j*N+i,b=j*N+(i+1)%N,c=a+N,d=b+N;ix.push(a,b,c,b,d,c);}const center=p.length/3;p.push(-.63,.738,0);for(let i=0;i<N;i++)ix.push(center,(rings.length-1)*N+i,(rings.length-1)*N+(i+1)%N);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();put(B.steel,g);lathed(B,'iron',[[0,0],[.024,0],[.024,.002],[0,.002]],[-.63,.740,0],20);}
async function kitchen(B){
 // Overall 2.40 x .65 m; front includes handles. Recessed toe kick is 90 mm.
 await block(B,'dark',[2.32,.72,.53],[0,.47,-.025],1,.83,.003);await block(B,'dark',[2.29,.10,.44],[0,.05,-.07],0,.66,.003);
 for(const x of [-1.175,1.175])await block(B,'warm',[.05,.80,.60],[x,.46,-.025],1,.94,.005);
 for(let i=0;i<4;i++){const x=-.87+i*.58;await block(B,'warm',[.563,.707,.025],[x,.463,.263],1,.94+.02*(i%2),.003,[0,0,0],i*.17);for(const xx of [x-.245,x+.245])await block(B,'warm',[.05,.69,.014],[xx,.463,.281],1,.97,.003);for(const y of [.145,.781])await block(B,'warm',[.45,.055,.014],[x,y,.281],0,.97,.003);rod(B,'iron',[x+.20,.61,.302],[x+.20,.73,.302],.006,10);for(const y of [.61,.73])rod(B,'iron',[x+.20,y,.285],[x+.20,y,.312],.005,8);}
 // Four counter strips make a real sink opening, no opaque cap beneath the basin.
 const hole=[-.90,-.36,-.22,.22];for(const [x0,x1,z0,z1] of [[-1.2,hole[0],-.325,.325],[hole[1],1.2,-.325,.325],[hole[0],hole[1],-.325,hole[2]],[hole[0],hole[1],hole[3],.325]])await block(B,'counter',[x1-x0,.035,z1-z0],[(x0+x1)/2,.8825,(z0+z1)/2],0,1,.004);
 bowlSink(B);tube(B,'steel',[[-.63,.90,-.265],[-.63,1.15,-.265],[-.63,1.205,-.19],[-.63,1.20,-.08],[-.63,1.12,-.055]],.012,32,10);lathed(B,'steel',[[0,0],[.023,0],[.023,.018],[.015,.022],[0,.022]],[-.63,.90,-.265],24);rod(B,'steel',[-.49,.916,-.265],[-.49,1.01,-.265],.009,10);rod(B,'steel',[-.49,1.01,-.265],[-.45,1.01,-.265],.009,10);
 await block(B,'iron',[.49,.018,.45],[.83,.909,0],0,.65,.012);for(const z of [-.115,.115]){ring(B,'steel',.075,.003,[.83,.920,z]);ring(B,'iron',.052,.003,[.83,.921,z]);}
 // Shelf and brackets meet the rear-wall plane; its top supports the existing lantern.
 await block(B,'warm',[2.30,.04,.32],[0,1.70,-.165],0,.97,.004);for(const x of [-.94,.94]){await block(B,'iron',[.025,.34,.025],[x,1.51,-.305],1,1,.002);await beam(B,'iron',[x,1.35,-.305],[x,1.68,-.02],.018,.018);}
 for(let i=0;i<3;i++)plate(B,[-.72,1.721+i*.013,-.15],.105);cup(B,[-.26,1.721,-.17]);cup(B,[-.06,1.721,-.17],.92);
 // One kettle, a chopping board, and a towel: static household cues.
 lathed(B,'iron',[[0,0],[.06,0],[.09,.025],[.10,.085],[.08,.14],[.045,.155],[0,.155]],[.83,.923,.115],28);ring(B,'steel',.045,.003,[.83,1.08,.115]);tube(B,'iron',[[.75,1.03,.115],[.745,1.16,.115],[.91,1.16,.115],[.91,1.03,.115]],.009,24,8);tube(B,'iron',[[.91,.985,.115],[.98,1.01,.115],[1.015,1.06,.115]],.017,16,10);
 await block(B,'warm',[.30,.018,.22],[.24,.909,-.05],0,1,.009);ring(B,'iron',.016,.002,[.365,.921,-.05]);
 rod(B,'iron',[.16,.69,.313],[.44,.69,.313],.006,10);sheet(B,'linen',(u,v)=>[.22+u*.16,.69-v*.31+.004*Math.sin(u*23)*Math.sin(v*6),.318+.004*Math.sin(u*25+v*8)],12,22,[2,4]);
}
async function bed(B){
 // Mattress is a true 1.60 x 2.00 m; entire frame/textile envelope <=1.74 x2.14.
 for(const x of [-.77,.77])for(const z of [-.94,.94])await block(B,'warm',[.10,.36,.10],[x,.18,z],1,.94,.008);
 for(const x of [-.835,.835])await block(B,'warm',[.07,.18,2.08],[x,.30,0],2,.95,.005);for(const z of [-1.035,1.035])await block(B,'warm',[1.67,.18,.07],[0,.30,z],0,.95,.005);
 for(let i=0;i<13;i++)await block(B,'warm',[1.62,.025,.105],[0,.361,-.93+i*.155],0,.91,.003);
 await soft(B,'linen',[1.60,.20,2.00],[0,.48,0],[0,0,0],3);
 for(const x of [-.79,.79])await block(B,'warm',[.08,1.04,.08],[x,.52,-1.03],1,.98,.005);
 for(const y of [.66,.85])await block(B,'warm',[1.60,.17,.045],[0,y,-1.027],0,.96,.005);
 await block(B,'warm',[1.72,.035,.30],[0,1.0325,-.915],0,.98,.005);
 for(const [x,r]of[[-.40,-.04],[.40,.055]])await soft(B,'linen',[.66,.14,.43],[x,.66,-.70],[.08,r,0],x*7);
 // Soft duvet with broad supported folds and short gathered side drop, bounded by frame.
 sheet(B,'linen',(u,v)=>{const x=(u-.5)*1.68,z=-.40+v*1.41,edge=Math.max(0,(Math.abs(x)-.765)/.075),foot=Math.max(0,(z-.96)/.05);return[x,.598-.16*edge*edge-.08*foot+.012*Math.sin(v*18+u*7)*Math.sin(Math.PI*u)+.006*Math.sin(u*37+v*11),z];},48,52,[13,11]);
 sheet(B,'throw',(u,v)=>{const x=(u-.5)*1.70,z=.40+v*.53,edge=Math.max(0,(Math.abs(x)-.765)/.085);return[x,.618-.17*edge*edge+.009*Math.sin(u*31+v*7)+.004*Math.sin(u*71+v*9),z];},48,20,[11,4]);
 for(let i=0;i<40;i++){const x=-.83+i*.0425,y=.617-.17*Math.max(0,(Math.abs(x)-.765)/.085)**2;rod(B,'throw',[x,y,.93],[x+.001,y-.006,.966],.0018,4,.91);}
 await book(B,[-.55,1.05,-.916],[.20,.035,.22],1);
}
async function desk(B){for(const x of [-.48,.48])for(const z of [-.205,.205])await beam(B,'warm',[x,0,z],[x*.96,.71,z*.96],.042,.042,.96);await block(B,'warm',[1.10,.038,.55],[0,.731,0],0,.98,.005);for(const x of [-.465,.465])await block(B,'warm',[.025,.075,.43],[x,.67,0],2,.95,.003);await block(B,'warm',[.94,.075,.026],[0,.67,-.205],0,.95,.003);await block(B,'warm',[.29,.064,.38],[-.31,.67,.01],0,.95,.003);await block(B,'warm',[.286,.059,.018],[-.31,.671,.211],0,1,.003);rod(B,'iron',[-.35,.671,.232],[-.27,.671,.232],.0045,8);for(const x of [-.44,-.18])peg(B,x,.67,.223);}
async function entryBench(B){for(const x of [-.53,.53])for(const z of [-.155,.155])await block(B,'warm',[.055,.41,.055],[x,.205,z],1,.96,.004);for(const z of [-.145,.145])await block(B,'warm',[1.08,.075,.035],[0,.36,z],0,.94,.003);for(let i=0;i<3;i++)await block(B,'warm',[1.20,.04,.137],[0,.43,-.14+i*.14],0,.98,.004,[0,0,0],i*.13);
 for(let i=0;i<4;i++)await block(B,'warm',[1.08,.022,.075],[0,.125,-.14+i*.092],0,.94,.003);
 // Integrated hall tree stays wholly within bench footprint, secured by rear stiles.
 for(const x of [-.53,.53])await block(B,'warm',[.047,1.66,.047],[x,.83,-.182],1,.94,.004);await block(B,'warm',[1.16,.13,.037],[0,1.57,-.177],0,.97,.004);
 for(const x of [-.38,0,.38]){tube(B,'iron',[[x,1.57,-.15],[x,1.52,-.09],[x,1.55,-.065]],.006,12,8);peg(B,x,1.60,-.155);}
 // A hanging coat with supported shoulders, shaped sleeves, seams and uneven hem.
 sheet(B,'throw',(u,v)=>{const a=u*Math.PI*2,shoulder=Math.min(1,v/.11),rx=.038+shoulder*(.112+.013*Math.sin(Math.PI*v)),rz=.038+.032*Math.sin(Math.PI*v*.85),fold=.006*Math.sin(a*5+.4*v)*Math.sin(Math.PI*v),x=-.35+Math.cos(a)*(rx+fold*.55),y=1.52-v*.75+.009*Math.sin(a*3+.8)*v,z=-.092+Math.sin(a)*(rz+fold)+.006*v*v;return[x,y,z];},40,38,[5,7]);
 tube(B,'iron',[[-.38,1.55,-.08],[-.35,1.52,-.102],[-.47,1.44,-.102],[-.23,1.44,-.102],[-.35,1.52,-.102]],.003,28,6);
 tube(B,'throw',[[-.395,1.517,-.093],[-.35,1.49,-.069],[-.305,1.517,-.093]],.010,18,8);
 for(const side of [-1,1])tube(B,'throw',[[-.35+side*.10,1.48,-.095],[-.35+side*.185,1.30+side*.012,-.055],[-.35+side*.17,1.07+side*.018,-.040]],.041,18,10);
 const zip=[];for(let i=0;i<=18;i++){const v=.12+i/18*.78,a=Math.PI/2,z=-.092+.038+.032*Math.sin(Math.PI*v*.85)+.006*Math.sin(a*5+.4*v)*Math.sin(Math.PI*v)+.006*v*v+.002;zip.push([-.35,1.52-v*.75+.009*Math.sin(a*3+.8)*v,z]);}tube(B,'iron',zip,.0016,24,5);
 // Two worn boots sit on the lower shelf, rather than in the standing envelope.
 for(const x of [.12,.29]){await soft(B,'leather',[.13,.11,.265],[x,.191,.012],[0,0,0],x*7);put(B.leather,lathe([[.060,0],[.052,.18],[.040,.18],[.044,.045],[.055,.045],[.060,0]],24),[x,.21,-.055],[0,0,0],[1,1,.85],.84);ring(B,'leather',.050,.003,[x,.387,-.055]);await block(B,'leather',[.055,.12,.012],[x,.298,-.010],1,.85,.005);for(const yy of [.25,.278,.306,.334])for(const xx of [-.033,.033]){const eg=new THREE.TorusGeometry(.0035,.001,4,8);put(B.iron,eg,[x+xx,yy,-.003]);}await block(B,'iron',[.134,.016,.269],[x,.144,.012],0,.56,.005);for(let j=0;j<4;j++)rod(B,'linen',[x-.032,.24+j*.028,-.001],[x+.032,.25+j*.028,-.001],.0016,4,.7);}
}
async function pendant(B){
 // Lowest visible point y=0. Hang with y=.65 canopy touching the real ceiling.
 lathed(B,'iron',[[.027,.15],[.05,.145],[.13,.07],[.17,.035],[.17,.026],[.16,.026],[.12,.065],[.044,.136],[.026,.14]],[0,0,0],40);
 lathed(B,'ceramic',[[.027,.137],[.043,.132],[.118,.061],[.158,.024],[.153,.019],[.113,.059],[.039,.127],[.027,.132]],[0,0,0],40);
 rod(B,'iron',[0,.145,0],[0,.62,0],.0045,10);lathed(B,'iron',[[0,.62],[.065,.62],[.065,.638],[.05,.65],[0,.65]],[0,0,0],32);put(B.ember,new THREE.SphereGeometry(.026,20,12),[0,.026,0]);
}
async function props(B){
 // Reusable quiet reading/tea vignette, intentionally compact and surface-rooted.
 await block(B,'warm',[.35,.014,.26],[0,.007,0],0,.96,.005);for(const z of [-.125,.125])await block(B,'warm',[.35,.018,.008],[0,.022,z],0,.96,.002);for(const x of [-.171,.171])await block(B,'warm',[.008,.018,.244],[x,.022,0],2,.96,.002);
 await book(B,[-.064,.014,-.009],[.16,.029,.22],0);cup(B,[.098,.014,.032],.79);await block(B,'linen',[.12,.003,.095],[.092,.016,-.071],0,1,.001);rod(B,'iron',[-.11,.048,.055],[-.01,.048,.055],.0025,8);}
const BUILDERS={sideTable,diningTable,diningChair,kitchen,bed,desk,entryBench,pendant,props};
async function build(){const root=createRoot(CFG.id),B=bins();await BUILDERS[CFG.kind](B);const M=await mats();for(const key of Object.keys(B))if(B[key].p)finish(root,key,B[key],M[key]);return root;}
