const FABRIC={"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Neutral woven fabric","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.5c4fcccb2832191d7bb6ee06900a0209ac9ae169b6bc3bf9a60a629fe575f86c.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.5c4fcccb2832191d7bb6ee06900a0209ac9ae169b6bc3bf9a60a629fe575f86c.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.5c4fcccb2832191d7bb6ee06900a0209ac9ae169b6bc3bf9a60a629fe575f86c.metallic-roughness"}}};
const WOOD={"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Warm straight wood grain","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.72660efdf55d5b2efe260bfe06e4631a0c3aef69e6226f34b4d6867ec22ef879.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.72660efdf55d5b2efe260bfe06e4631a0c3aef69e6226f34b4d6867ec22ef879.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.72660efdf55d5b2efe260bfe06e4631a0c3aef69e6226f34b4d6867ec22ef879.metallic-roughness"}}};
const METAL={"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Brushed neutral metal","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.metallic-roughness"}}};
const meta={name:'Rowan — Shapes & Seasons Farmer',description:'Friendly adult farmer. Rigid articulated loft construction; faceted face, deliberate garment volumes and restrained pinned woven PBR. High requested. Model gpt-6-astra; harness codex; author gpt-6-astra.',nominalTravelSpeedMps:0.6,forward:'+X',rig:'rigid',toolAttachment:'Joint_RightHandToolAttachment'};
function section(y,rx,rz,x=0,z=0,n=12){return {profile:Array.from({length:n},(_,i)=>[rx*Math.cos(i*2*Math.PI/n),rz*Math.sin(i*2*Math.PI/n)]),frame:{origin:[x,y,z]}};}
function shape(rows){return loftProfiles(rows.map(r=>section(...r)));}
function fabricUV(g,tile=.08){g=g.toNonIndexed();g.computeVertexNormals();const p=g.attributes.position,n=g.attributes.normal,u=[];for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(Math.abs(n.getY(i))>.7)u.push(x/tile,z/tile);else if(Math.abs(n.getX(i))>Math.abs(n.getZ(i)))u.push(z/tile,y/tile);else u.push(x/tile,y/tile);}g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));return g;}
async function build(){
 const root=createRoot('Farmer');root.userData={nominalTravelSpeedMps:.6,placementRootFixed:true,rig:'rigid',bodyHeightMeters:1.75};
 const cloth=async(color)=>{const s=JSON.parse(JSON.stringify(FABRIC));delete s.textures.baseColor;s.baseColor=color;s.metalness=0;const m=await compilePortableMaterialSpecV2(s);m.normalScale.set(.12,.12);m.flatShading=true;return m;};
 const denim=await cloth(0x284764),cream=await cloth(0xeee0be),wood=await compilePortableMaterialSpecV2(WOOD),steel=await compilePortableMaterialSpecV2(METAL);wood.normalScale.set(.12,.12);steel.normalScale.set(.08,.08);wood.flatShading=steel.flatShading=true;
 const skin=gameMaterial(0xd89765,{roughness:.88}),beard=gameMaterial(0x63412b,{roughness:1}),straw=gameMaterial(0xd8ad56,{roughness:.97}),boot=gameMaterial(0x70472b,{roughness:.92}),sole=gameMaterial(0x392d25,{roughness:1}),eye=gameMaterial(0x242926,{roughness:.6}),white=gameMaterial(0xf4e7d0,{roughness:.8}),brass=gameMaterial(0xb29351,{roughness:.58,metalness:.65});
 function part(name,g,m,pos,parent,rotation){return createPart(name,(m===denim||m===cream)?fabricUV(g):g,m,{position:pos,parent,rotation:rotation||[0,0,0]});}
 function ell(name,pos,s,m,parent){const g=new THREE.SphereGeometry(1,12,8);g.scale(...s);return part(name,g,m,pos,parent);}
 // Review 2 hand surfaces: all coordinates below remain in the original rigid parent.
 // Closed rings with rounded, tapered ends; original component placement stays on its anchor.
 function handSurface(name,anchor,rows,up,parent){
  const centers=rows.map(r=>new THREE.Vector3(r[0],r[1],r[2])),positions=[],indices=[],uvs=[],N=12;
  for(let k=0;k<rows.length;k++){
   const tangent=centers[Math.min(k+1,rows.length-1)].clone().sub(centers[Math.max(0,k-1)]).normalize();
   const a=new THREE.Vector3(...up);a.addScaledVector(tangent,-a.dot(tangent)).normalize();
   const b=new THREE.Vector3().crossVectors(tangent,a).normalize();
   for(let j=0;j<N;j++){
    const q=j*2*Math.PI/N,c=Math.cos(q),s=Math.sin(q),power=rows[k][5]||1;
    const p=centers[k].clone().addScaledVector(a,rows[k][3]*Math.sign(c)*Math.pow(Math.abs(c),power))
      .addScaledVector(b,rows[k][4]*Math.sign(s)*Math.pow(Math.abs(s),power));
    positions.push(p.x-anchor[0],p.y-anchor[1],p.z-anchor[2]);uvs.push(j/N,k/(rows.length-1));
    if(k<rows.length-1){const i=k*N+j,n=k*N+(j+1)%N;indices.push(i,n,i+N,n,n+N,i+N);}
   }
  }
  for(const k of [0,rows.length-1]){
   const c=positions.length/3,p=centers[k];positions.push(p.x-anchor[0],p.y-anchor[1],p.z-anchor[2]);uvs.push(.5,k?1:0);
   for(let j=0;j<N;j++){const a=k*N+j,b=k*N+(j+1)%N;indices.push(...(k?[c,a,b]:[c,b,a]));}
  }
  return part(name,meshGeo({positions,indices,uvs}),skin,anchor,parent);
 }
 
 function box(name,pos,s,m,parent,rotation){return part(name,new THREE.BoxGeometry(...s),m,pos,parent,rotation);}
 function rod(name,a,b,r,m,parent){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va);const g=new THREE.CylinderGeometry(r,r,d.length(),10);const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());g.applyQuaternion(q);if(m===wood){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*.15,uv.getY(i)*1.35);}return part(name,g,m,va.add(vb).multiplyScalar(.5).toArray(),parent);}
 const pelvis=createPivot('Pelvis',[0,.87,0],root);
 part('OverallSeat',shape([[-.10,.135,.195],[0,.165,.215],[.17,.166,.216]]),denim,[0,0,0],pelvis);
 const chest=createPivot('Chest',[0,1.01,0],root);
 part('CreamShirt',shape([[0,.15,.205],[.16,.16,.23],[.29,.137,.246],[.37,.115,.19],[.41,.08,.105]]),cream,[0,0,0],chest);
 part('OverallBib',shape([[.01,.159,.211],[.16,.17,.217],[.29,.151,.173]]),denim,[.005,0,0],chest);
 box('BibPocket',[.175,.18,0],[.012,.103,.13],denim,chest);
 for(const z of [-.142,.142]){box('FrontStrap'+z,[.075,.318,z],[.025,.18,.047],denim,chest,[0,0,15]);box('ShoulderStrapBridge'+z,[0,.389,z],[.16,.024,.047],denim,chest);box('BackStrap'+z,[-.105,.30,z],[.025,.20,.047],denim,chest,[0,0,-25]);ell('Buckle'+z,[.094,.282,z],[.012,.017,.018],brass,chest);box('Collar'+z,[.106,.395,z*.38],[.047,.083,.072],cream,chest,[z<0?-22:22,0,-22]);}
 ell('Neck',[0,.426,0],[.073,.093,.079],skin,chest);
 const head=createPivot('Head',[.014,.52,0],chest);
 part('FacetedFace',shape([[-.095,.077,.084],[-.055,.118,.122],[.045,.127,.135],[.14,.116,.126],[.215,.084,.097]]),skin,[0,0,0],head);
 ell('HairBack',[-.056,.086,0],[.097,.145,.137],beard,head);
 part('ShortBeard',shape([[-.102,.07,.074],[-.079,.105,.11],[-.025,.125,.122],[.018,.121,.113]]),beard,[.01,0,0],head);
 ell('MouthSmile',[.136,-.024,0],[.015,.017,.050],skin,head);
 for(const s of [-1,1]){ell('Ear'+s,[.004,.049,s*.141],[.041,.065,.03],skin,head);ell('EyeWhite'+s,[.122,.092,s*.052],[.013,.031,.023],white,head);ell('Eye'+s,[.133,.091,s*.052],[.008,.022,.011],eye,head);box('Brow'+s,[.131,.138,s*.052],[.025,.018,.055],beard,head,[s*9,0,0]);ell('Mustache'+s,[.140,-.002,s*.028],[.021,.02,.037],beard,head);}
 part('Nose',shape([[.022,.025,.024],[.065,.034,.018],[.094,.012,.011]]),skin,[.132,0,0],head);
 const hat=createPivot('Hat',[0,.195,0],head);
 part('HatBrim',shape([[-.009,.292,.292],[.010,.299,.299],[.027,.271,.274]]),straw,[0,0,0],hat);
 part('HatCrown',shape([[.017,.148,.145],[.095,.14,.137],[.16,.114,.122],[.171,.087,.095]]),straw,[-.022,0,0],hat);
 part('HatBand',shape([[.030,.151,.148],[.061,.148,.145]]),beard,[-.022,0,0],hat);
 for(const s of [-1,1]){
 const hip=createPivot(s<0?'LeftHip':'RightHip',[0,0,s*.126],pelvis);
 ell('HipCover'+s,[0,-.018,0],[.132,.143,.122],denim,hip);
 part('Thigh'+s,shape([[-.405,.09,.092],[-.32,.102,.103],[-.13,.116,.113],[.03,.115,.114]]),denim,[0,0,0],hip);
 const knee=createPivot(s<0?'LeftKnee':'RightKnee',[0,-.382,0],hip);
 ell('KneeCover'+s,[0,0,0],[.093,.10,.095],denim,knee);
 part('Shin'+s,shape([[-.36,.084,.084],[-.22,.086,.087],[-.08,.096,.095],[.015,.091,.093]]),denim,[0,0,0],knee);
 const ankle=createPivot(s<0?'LeftAnkle':'RightAnkle',[0,-.382,0],knee);
 ell('AnkleCover'+s,[0,.05,0],[.089,.085,.089],denim,ankle);
 part('TrouserCuff'+s,shape([[.015,.09,.09],[.089,.094,.094]]),denim,[0,0,0],ankle);
 part(s<0?'LeftBoot':'RightBoot',shape([[-.13,.137,.099,.046],[-.095,.14,.102,.049],[-.04,.128,.099,.042],[.025,.093,.087,0],[.09,.073,.071,-.006]]),boot,[0,0,0],ankle);
 part('BootSole'+s,shape([[-.13,.14,.103,.047],[-.103,.14,.103,.047]]),sole,[0,0,0],ankle);
 // Rest pose uses the same analytic leg solution as the zero-stride grounded stance.
 const a=Math.acos(.74/.764);hip.rotation.z=a;knee.rotation.z=-2*a;ankle.rotation.z=a;
 }
 for(const s of [-1,1]){
 const arm=createPivot(s<0?'LeftShoulder':'RightShoulder',[0,.30,s*.221],chest);
 ell('ShoulderSleeve'+s,[0,-.028,s*.021],[.108,.118,.115],cream,arm);
 part('UpperSleeve'+s,shape([[-.225,.077,.081,0,s*.059],[-.12,.089,.094,0,s*.039],[.025,.084,.092,0,0]]),cream,[0,0,0],arm);
 const elbow=createPivot(s<0?'LeftElbow':'RightElbow',[0,-.205,s*.058],arm);
 ell('Elbow'+s,[0,0,0],[.065,.075,.066],skin,elbow);
 part('RolledCuff'+s,shape([[-.015,.082,.083],[.063,.087,.088]]),cream,[0,0,0],elbow);
 if(s<0){part('LeftForearm',shape([[-.22,.046,.048],[-.08,.06,.06],[.015,.061,.061]]),skin,[0,0,0],elbow);handSurface('LeftHand',[.005,-.242,0],[
 [0,-.202,0,.044,.046],[0,-.219,0,.046,.046],[.001,-.242,.001,.049,.030,.86],
 [.001,-.260,.002,.047,.024,.82],[0,-.277,.004,.039,.019,.9]
 ],[1,0,0],elbow);
 // Four short, gently flexed fingers, graduated without changing the wrist frame.
 for(const [name,x,end,r] of [['Little',-.034,-.310,.011],['Ring',-.012,-.323,.012],
  ['Middle',.012,-.327,.0125],['Index',.035,-.318,.0115]]){
  handSurface('LeftFinger'+name,[x,-.272,.003],[
   [x,-.262,.003,r*.95,.018],[x,-.279,.004,r,.018],
   [x+.001,end+.015,.010,r*.90,.016],[x+.002,end+.004,.014,r*.62,.011],
   [x+.002,end,.015,.002,.003]
  ],[1,0,0],elbow);
 }
 handSurface('LeftThumb',[.043,-.219,.011],[
  [.027,-.222,.019,.024,.024],[.043,-.236,.026,.021,.021],
  [.053,-.250,.027,.016,.016],[.053,-.263,.025,.011,.011],[.050,-.270,.024,.003,.003]
 ],[0,0,1],elbow);}else{
 rod('RightForearm',[0,0,0],[.14,-.035,.102],.058,skin,elbow);
 const hand=createPivot('RightHandToolAttachment',[.15,-.035,.113],elbow);hand.userData={socket:'right-hand-grip',tool:'ThreeProngPitchfork',attached:true};
 handSurface('GripPalm',[-.018,0,-.006],[
 [-.027,-.057,-.004,.014,.019],[-.027,-.047,-.004,.027,.031,.85],
 [-.027,-.023,-.005,.033,.037,.82],[-.024,.021,-.005,.029,.037,.82],
 [-.022,.048,-.007,.024,.030,.88],[-.022,.059,-.007,.012,.018]
 ],[1,0,0],hand);
 // Retain the three historical finger anchors, add a fourth, and curl around the exact shaft.
 const fingers=[
  {name:'GripFingers-0.036',anchor:[.028,-.036,.005],y:-.039,r:.0105,end:-66},
  {name:'GripFingers0',anchor:[.028,0,.005],y:-.014,r:.0125,end:-83},
  {name:'GripFingers0.034',anchor:[.028,.034,.005],y:.012,r:.013,end:-92},
  {name:'GripFingerIndex',anchor:[.028,.043,.005],y:.037,r:.012,end:-78}
 ];
 for(const f of fingers){
  const rows=[];
  for(let i=0;i<=8;i++){
   const t=i/8,a=(140+(f.end-140)*t)*Math.PI/180;
   const tip=i===8?.22:i===7?.72:1;
   const radius=.022+f.r*.93;
   rows.push([.014+radius*Math.cos(a),f.y-.003*t,.006+radius*Math.sin(a),f.r*tip,f.r*tip]);
  }
  handSurface(f.name,f.anchor,rows,[0,1,0],hand);
 }
 handSurface('GripThumb',[.020,.055,-.027],[
  [-.036,.022,-.022,.023,.021],[-.021,.045,-.035,.020,.018],
  [.001,.052,-.039,.017,.016],[.022,.039,-.032,.015,.014],
  [.028,.023,-.019,.011,.011],[.026,.017,-.016,.003,.003]
 ],[0,1,0],hand);
 const fork=createPivot('Pitchfork',[.014,0,.006],hand);
 rod('WoodHandle',[0,-.80,0],[0,.42,0],.022,wood,fork);
 rod('SteelSocket',[0,.37,0],[0,.51,0],.027,steel,fork);
 rod('ForkCrossbar',[0,.50,-.137],[0,.50,.137],.022,steel,fork);
 for(const z of [-.137,0,.137])part('Tine'+z,shape([[.485,.018,.019,0,z],[.55,.02,.018,0,z],[.77,.010,.011,.027,z],[.807,.002,.002,.028,z]]),steel,[0,0,0],fork);
 }
 }
 consolidateRowanDraws(root);
 return root;
}

/**
 * Review 1: reversible draw consolidation. Original construction above stays editable.
 * Direct siblings only: never cross any pivot, attachment or other parent boundary.
 * Exact material object identity plus attribute layout determines compatibility.
 * Empty named nodes retain each original component transform and range ownership.
 */
function consolidateRowanDraws(root) {
 const animatedNames=new Set();
 for(const clip of animate(root)) for(const track of clip.tracks)
   animatedNames.add(track.name.slice(0,track.name.lastIndexOf('.')));
 const parents=[]; root.traverse(node=>{if(!node.isMesh)parents.push(node);});
 for(const parent of parents){
  const buckets=[];
  for(const mesh of parent.children.slice()){
   if(!mesh.isMesh || mesh.children.length || Array.isArray(mesh.material) ||
      mesh.material.transparent || !mesh.visible || animatedNames.has(mesh.name)) continue;
   const geometry=mesh.geometry;
   const keys=Object.keys(geometry.attributes).sort();
   if(mesh.material.normalMap && !keys.includes('tangent'))keys.push('tangent');
   if(!keys.includes('position') || !keys.includes('normal') ||
      geometry.morphAttributes && Object.keys(geometry.morphAttributes).length)continue;
   if(geometry.drawRange.start!==0 || Number.isFinite(geometry.drawRange.count))continue;
   const layout=keys.map(k=>k+':'+(k==='tangent'?4:geometry.attributes[k].itemSize)+':'+(geometry.attributes[k]?.normalized||false)).join('|');
   let bucket=buckets.find(b=>b.material===mesh.material && b.layout===layout);
   if(!bucket){bucket={material:mesh.material,layout,keys,meshes:[]};buckets.push(bucket);}
   bucket.meshes.push(mesh);
  }
  let serial=0;
  for(const bucket of buckets){
   if(bucket.meshes.length<2)continue;
   const values={};for(const key of bucket.keys)values[key]=[];
   const ranges=[];let firstVertex=0;
   for(const mesh of bucket.meshes){
    mesh.updateMatrix();
    let g=mesh.geometry.clone();
    if(bucket.keys.includes('tangent') && !g.attributes.tangent){
     if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));
     g.computeTangents();
    }
    if(g.index)g=g.toNonIndexed();
    g.applyMatrix4(mesh.matrix);
    const vertexCount=g.attributes.position.count;
    for(const key of bucket.keys){
     const attr=g.attributes[key];
     for(let i=0;i<attr.count;i++)for(let c=0;c<attr.itemSize;c++)
       values[key].push(attr.getComponent(i,c));
    }
    ranges.push({name:mesh.name,firstVertex,vertexCount,firstTriangle:firstVertex/3,
       triangleCount:vertexCount/3,originalPosition:mesh.position.toArray(),
       originalQuaternion:mesh.quaternion.toArray(),originalScale:mesh.scale.toArray()});
    firstVertex+=vertexCount;
   }
   const mergedGeometry=new THREE.BufferGeometry();
   for(const key of bucket.keys)mergedGeometry.setAttribute(key,
     new THREE.Float32BufferAttribute(values[key],key==='tangent'?4:bucket.meshes[0].geometry.attributes[key].itemSize));
   const merged=new THREE.Mesh(mergedGeometry,bucket.material);
   merged.name='Mesh_Consolidated_'+parent.name+'_'+serial++;
   merged.userData={rowanComponents:{version:1,rigidParent:parent.name,ranges},
     optimization:'same-parent/exact-material; no simplification; original leaf names retained'};
   merged.castShadow=bucket.meshes[0].castShadow;
   merged.receiveShadow=bucket.meshes[0].receiveShadow;
   for(let i=0;i<bucket.meshes.length;i++){
    const mesh=bucket.meshes[i],anchor=new THREE.Group();
    anchor.name=mesh.name;anchor.position.copy(mesh.position);anchor.quaternion.copy(mesh.quaternion);
    anchor.scale.copy(mesh.scale);anchor.userData={...mesh.userData,
      rowanComponent:{mergedMesh:merged.name,...ranges[i]}};
    parent.remove(mesh);parent.add(anchor);
   }
   parent.add(merged);
  }
 }
}

function animate(root){
 const walk=[],idle=[],N=48,T=1.2;const rad=180/Math.PI;
 for(const [name,offset] of [['Left',0],['Right',.5]]){const h=[],k=[],a=[];for(let i=0;i<=N;i++){let p=(i/N+offset)%1;let x,y=.13;if(p<=.5)x=.18-.72*p;else{let u=(p-.5)*2;x=-.18+.36*(3*u*u-2*u*u*u)-.36*(2*u*u*u-3*u*u+u);y+=.085*Math.sin(Math.PI*u)**2;}const d=Math.hypot(x,.87-y),b=Math.acos(Math.min(1,d/.764)),ha=Math.atan2(x,.87-y)+b,ka=-2*b;h.push({time:T*i/N,rotation:[0,0,ha*rad]});k.push({time:T*i/N,rotation:[0,0,ka*rad]});a.push({time:T*i/N,rotation:[0,0,-(ha+ka)*rad]});}walk.push(rotationTrack('Joint_'+name+'Hip',h),rotationTrack('Joint_'+name+'Knee',k),rotationTrack('Joint_'+name+'Ankle',a));}
 const arm=[],body=[],breath=[],head=[];for(let i=0;i<=N;i++){const p=i/N,q=Math.sin(2*Math.PI*p);arm.push({time:T*p,rotation:[0,0,-14*q]});body.push({time:T*p,rotation:[1.2*q,2*q,0]});breath.push({time:4*p,position:[0,1.01+.004*(1-Math.cos(2*Math.PI*p)),.004*q]});head.push({time:4*p,rotation:[0,1.2*q,.5*q]});}walk.push(rotationTrack('Joint_LeftShoulder',arm),rotationTrack('Joint_Chest',body));idle.push(positionTrack('Joint_Chest',breath),rotationTrack('Joint_Head',head));return [createClip('Idle',4,idle),createClip('Walk',T,walk)];
}
