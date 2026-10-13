const meta={name:'Nightman cabin window and removable boards',role:'prop'};
const MATERIALS={"tx01":{"schemaVersion":3,"model":"pbrMetallicRoughness","name":"Weathered cabin timber","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.87c9fe1286e32442ed5e29c42b5c05cf88ac5b509260b95ce755bcbd0e3cb8ea.base-color","sampler":{"minFilter":"nearest-mipmap-linear","magFilter":"nearest","wrapS":"repeat","wrapT":"repeat"}}}},"tx02":{"schemaVersion":3,"model":"pbrMetallicRoughness","name":"Warm interior boards","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.d86eb2087a7bd4edbe734e603bc6b8180220e751bc0e5244d80c696b566dfc26.base-color","sampler":{"minFilter":"nearest-mipmap-linear","magFilter":"nearest","wrapS":"repeat","wrapT":"repeat"}}}},"tx03":{"schemaVersion":3,"model":"pbrMetallicRoughness","name":"Fresh split wood","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.dec8945f78a3dca6d5031b36094a0583f02b39b0e3978ed2c34418010f14fbd5.base-color","sampler":{"minFilter":"nearest-mipmap-linear","magFilter":"nearest","wrapS":"repeat","wrapT":"repeat"}}}},"tx04":{"schemaVersion":3,"model":"pbrMetallicRoughness","name":"Cut endgrain","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.2dadd9f8f02157fcab7add4c237598d8358b2c65babbd07830c653791bad128d.base-color","sampler":{"minFilter":"nearest-mipmap-linear","magFilter":"nearest","wrapS":"repeat","wrapT":"repeat"}}}},"tx08":{"schemaVersion":3,"model":"pbrMetallicRoughness","name":"Worn iron","baseColor":16777215,"roughness":0.85,"metalness":0.25,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.1870a95ffec8e00bc9daac56a32bc537547e002305e373c4ff7a97f098119fbe.base-color","sampler":{"minFilter":"nearest-mipmap-linear","magFilter":"nearest","wrapS":"repeat","wrapT":"repeat"}}}}};
// Original beveled timber section: grain follows each member's long Z axis.
function timberGeo(length,width,height,repeat=1,warp=0,chip=0){
 const bevel=Math.min(width,height)*.16,profile=[[-width/2+bevel,-height/2],[width/2-bevel,-height/2],[width/2,-height/2+bevel],[width/2,height/2-bevel],[width/2-bevel,height/2],[-width/2+bevel,height/2],[-width/2,height/2-bevel],[-width/2,-height/2+bevel]];
 const positions=[],uv=[],indices=[],groups=[];let count=0;
 function face(points,coords,material){const base=count;for(let i=0;i<points.length;i++){positions.push(...points[i]);uv.push(...coords[i]);count++;}for(let j=1;j<points.length-1;j++)indices.push(base,base+j,base+j+1);groups.push({start:indices.length-(points.length-2)*3,count:(points.length-2)*3,materialIndex:material});}
 const z0=-length/2,z1=length/2;const start=i=>z0+((i===0||i===1)?chip:0),finish=i=>z1-((i===4||i===5)?chip*1.3:0);
 for(let i=0;i<8;i++){const a=profile[i],b=profile[(i+1)%8],v=Math.hypot(b[0]-a[0],b[1]-a[1])/repeat;face([[...a,start(i)],[...b,start((i+1)%8)],[b[0]+warp,b[1],finish((i+1)%8)],[a[0]+warp,a[1],finish(i)]],[[0,0],[0,v],[length/repeat,v],[length/repeat,0]],0);}
 face(profile.map((p,i)=>[...p,start(i)]).reverse(),profile.map(p=>[(p[0]+width/2)/.5,(p[1]+height/2)/.5]).reverse(),1);
 face(profile.map((p,i)=>[p[0]+warp,p[1],finish(i)]),profile.map(p=>[(p[0]+width/2)/.5,(p[1]+height/2)/.5]),1);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.addGroup(0,48,0);g.addGroup(48,36,1);return g;
}
function timber(parent,name,L,w,h,wood,end,pos,rotation=[0,0,0],repeat=1,warp=0){const g=timberGeo(L,w,h,repeat,warp,name.startsWith("Board_")?.018+(Number(name.split("_")[1])%3)*.004:0);const u=g.getAttribute("uv");const phase=name.includes("Board_2")?.43:name.includes("Board_3")?.7:.2;for(let j=0;j<u.count;j++)u.setY(j,u.getY(j)+phase);const mesh=new THREE.Mesh(g,[wood,end]);mesh.name=name;mesh.position.set(...pos);mesh.rotation.set(...rotation.map(v=>v*Math.PI/180));parent.add(mesh);return mesh;}
function socket(parent,name,xyz){const s=new THREE.Object3D();s.name=name;s.position.set(...xyz);parent.add(s);return s;}
async function build(){
 const root=createRoot('CabinWindowBoards');
 const exterior=await compilePortableMaterialSpecV3(MATERIALS.tx01),split=await compilePortableMaterialSpecV3(MATERIALS.tx03),end=await compilePortableMaterialSpecV3(MATERIALS.tx04),iron=await compilePortableMaterialSpecV3(MATERIALS.tx08);
 const frame=new THREE.Group();frame.name='WindowFrame';root.add(frame);
 timber(frame,'Frame_Left',1.1,.16,.08,exterior,end,[0,.55,-.64],[90,0,0],2);
 timber(frame,'Frame_Right',1.1,.16,.08,exterior,end,[0,.55,.64],[90,0,0],2);
 timber(frame,'Frame_Header',1.36,.16,.08,exterior,end,[0,1.14,0],[0,0,0],2);
 timber(frame,'Frame_Sill',1.44,.24,.08,exterior,end,[.025,-.04,0],[0,0,0],2);
 for(let i=0;i<3;i++){
   const board=new THREE.Group();board.name='Board_'+(i+1);board.position.set(.1,[.22,.55,.88][i],0);root.add(board);
   timber(board,'Board_'+(i+1)+'_Timber',1.5,.04,.15,split,end,[0,0,0],[i===1?-2:1,0,0],1,i===2?-.006:0);
   for(const side of [-1,1]){createPart('Board_'+(i+1)+'_Nail_'+(side<0?'L':'R'),cylinderGeo(.014,.014,.012,6),iron,{parent:board,position:[.026,0,side*.63],rotation:[0,0,-90]});socket(board,'Board_'+(i+1)+'_'+(side<0?'nail_left':'nail_right'),[.02,0,side*.63]);}
   socket(board,'Board_'+(i+1)+'_attach',[0,0,0]);socket(root,'board_mount_0'+(i+1),[.1,[.22,.55,.88][i],0]);
 }
 socket(root,'window_mount',[0,0,0]);socket(root,'window_clear_center',[0,.55,0]);
 root.userData.nightmanInterface={version:1,frame:'+Xoutside/+Yup/+Zright',clearOpening:{width:1.2,height:1.1},sillWorldHeight:.95,removableBoards:['Board_1','Board_2','Board_3'],collision:'Frame proxies only; scene adds separate board-state proxies'};
 return root;
}
