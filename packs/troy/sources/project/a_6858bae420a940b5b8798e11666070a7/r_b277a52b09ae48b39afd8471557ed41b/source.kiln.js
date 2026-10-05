const meta = {name: 'Late Bronze Age war chariot', role: 'vehicle'};
const materialSpecs = {"wood":{"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Warm straight wood grain","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness"}}},"bronze":{"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Brushed neutral metal","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.2748d26e15d49933d18ed70d5352b51ecf5bf5c92d60b41ceddffa52750582d6.metallic-roughness"}}},"linen":{"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Neutral woven fabric","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness"}}}};
const D = {wheelRadius: .60, wheelX: .85, axleZ: -.39, floorY: .70, halfWidth: .60, poleEnd: 2.75};
function mergePieces(pieces) {
  const positions=[], normals=[], uvs=[];
  for (const obj of pieces) {
    obj.updateMatrix();
    let g=obj.geometry.clone().applyMatrix4(obj.matrix);
    if(g.index) g=g.toNonIndexed();
    const p=g.getAttribute('position'), n=g.getAttribute('normal'), u=g.getAttribute('uv');
    for(let i=0;i<p.count;i++){
      positions.push(p.getX(i),p.getY(i),p.getZ(i));
      normals.push(n.getX(i),n.getY(i),n.getZ(i));
      uvs.push(u?u.getX(i):0,u?u.getY(i):0);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  return g;
}
function rimGeometry(inner,outer,width,segments=32){
  const pos=[], uv=[];
  function quad(a,b,c,d,u0,u1){
    for(const [p,u,v] of [[a,u0,0],[b,u1,0],[c,u1,1],[a,u0,0],[c,u1,1],[d,u0,1]]){pos.push(...p);uv.push(u,v);}
  }
  for(let i=0;i<segments;i++){
    const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
    const v=(r,t,x)=>[x,r*Math.cos(t),r*Math.sin(t)];
    const l=-width/2,h=width/2;
    quad(v(outer,a,l),v(outer,b,l),v(outer,b,h),v(outer,a,h),i/segments,(i+1)/segments);
    quad(v(inner,a,h),v(inner,b,h),v(inner,b,l),v(inner,a,l),i/segments,(i+1)/segments);
    quad(v(inner,a,l),v(inner,b,l),v(outer,b,l),v(outer,a,l),i/segments,(i+1)/segments);
    quad(v(outer,a,h),v(outer,b,h),v(inner,b,h),v(inner,a,h),i/segments,(i+1)/segments);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.computeVertexNormals();return g;
}
async function build(){
  const root=createRoot('WarChariot');
  root.position.z=-.93;
  root.userData={period:'Late Bronze Age, about 1200 BC',style:'Aegean rail chariot interpretation',forward:'+Z',units:'metres',crewCapacity:2};
  const wood=await compilePortableMaterialSpecV2(materialSpecs.wood);
  wood.name='Troy timber';
  const bronze=await compilePortableMaterialSpecV2({...materialSpecs.bronze,baseColor:0xb08d57});
  bronze.name='Troy bronze';
  const cloth=await compilePortableMaterialSpecV2({...materialSpecs.linen,baseColor:0x8c2f2a});
  cloth.name='Troy crimson woven screen';
  const frame=[],fittings=[],screens=[];
  const add=(list,name,g,m,p=[0,0,0],r=[0,0,0])=>list.push(createPart(name,g,m,{position:p,rotation:r}));
  const beam=(list,name,a,b,rad,m)=>list.push(beamBetween(name,a,b,rad,m,{segments:8}));
  for(let i=0;i<8;i++){
    const left=-.5985+i*.15,right=left+.147;
    const shape=new THREE.Shape();
    shape.moveTo(left,-.50);shape.lineTo(right,-.50);
    for(let k=0;k<=4;k++){
      const x=right+(left-right)*k/4;
      shape.lineTo(x,.12+.48*Math.sqrt(Math.max(0,1-(x/.60)**2)));
    }
    shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:false,steps:1});
    g.rotateX(Math.PI/2);
    add(frame,'floor_plank_'+i,g,wood,[0,D.floorY,0]);
  }
  for(const x of [-.46,.46]) add(frame,'longitudinal_sill_'+x,boxGeo(.075,.095,.91),wood,[x,.603,-.045]);
  for(const z of [D.axleZ,.34]) add(frame,'floor_bolster_'+z,boxGeo(z===D.axleZ?1.28:.99,.08,.12),wood,[0,.625,z]);
  const railPath=[[-.60,1.17,-.50],[-.60,1.30,.12]];
  for(let i=1;i<=12;i++){const a=i*Math.PI/12;railPath.push([-.60*Math.cos(a),1.30+.08*Math.sin(a),.12+.48*Math.sin(a)]);}
  railPath.push([.60,1.17,-.50]);
  const profile=Array.from({length:8},(_,i)=>[.038*Math.cos(i*Math.PI/4),.038*Math.sin(i*Math.PI/4)]);
  add(frame,'bent_upper_rail',sweepProfile(profile,railPath,{up:[0,1,0],creaseAngle:40}),wood);
  const lowerPath=railPath.map(p=>[p[0],.72,p[2]]);
  add(frame,'lower_car_rail',sweepProfile(profile,lowerPath,{up:[0,1,0],creaseAngle:40}),wood);
  const stations=[railPath[0],railPath[1],railPath[4],railPath[7],railPath[10],railPath[13],railPath[14]];
  stations.forEach((p,i)=>{
    beam(frame,'rail_post_'+i,[p[0],.69,p[2]],p,.031,wood);
    add(fittings,'post_socket_'+i,cylinderGeo(.045,.045,.075,8),bronze,[p[0],.742,p[2]]);
  });
  for(const side of [-1,1]){
    beam(frame,'side_diagonal_'+side,[side*.60,.72,-.48],[side*.60,1.30,.12],.024,wood);
    add(fittings,'axle_mount_'+side,boxGeo(.14,.16,.17),bronze,[side*.46,.60,D.axleZ]);
  }
  // Lower front screen remains below the open handrail and leaves the rear open.
  for(let i=1;i<13;i++){
    const a=lowerPath[i],b=lowerPath[i+1];
    const mid=[(a[0]+b[0])/2,.918,(a[2]+b[2])/2];
    const len=Math.hypot(b[0]-a[0],b[2]-a[2]);
    const angle=Math.atan2(-(b[2]-a[2]),b[0]-a[0])*180/Math.PI;
    add(screens,'front_screen_'+i,boxGeo(len+.005,.345,.017),cloth,mid,[0,angle,0]);
  }
  createPart('car_frame',mergePieces(frame),wood,{parent:root});
  createPart('bronze_fittings',mergePieces(fittings),bronze,{parent:root});
  createPart('crimson_front_screen',mergePieces(screens),cloth,{parent:root});
  createPart('axle',cylinderGeo(.058,.058,1.96,12),wood,{position:[0,.60,D.axleZ],rotation:[0,0,90],parent:root});
  const polePath=[[0,.57,D.axleZ],[0,.58,.30],[0,.66,.75],[0,.95,1.55],[0,1.19,2.35],[0,1.24,D.poleEnd]];
  const poleProfile=[[-.044,-.045],[.044,-.045],[.044,.045],[-.044,.045]];
  createPart('draft_pole',sweepProfile(poleProfile,polePath,{up:[0,1,0],creaseAngle:60}),wood,{parent:root});
  const yokePath=[[-1.04,1.28,2.75],[-.82,1.29,2.75],[-.61,1.18,2.75],[-.36,1.18,2.75],[-.17,1.26,2.75],[.17,1.26,2.75],[.36,1.18,2.75],[.61,1.18,2.75],[.82,1.29,2.75],[1.04,1.28,2.75]];
  createPart('two_horse_yoke',sweepProfile([[-.045,-.045],[.045,-.045],[.045,.045],[-.045,.045]],yokePath,{up:[0,1,0]}),wood,{parent:root});
  const yokeFittings=[];
  for(const x of [-.50,.50]){
    add(yokeFittings,'yoke_pad_'+x,boxGeo(.31,.095,.20),cloth,[x,1.115,2.75]);
  }
  add(yokeFittings,'pole_yoke_lashing',boxGeo(.125,.16,.15),cloth,[0,1.24,2.75]);
  createPart('yoke_bindings',mergePieces(yokeFittings),cloth,{parent:root});
  for(const [side,x] of [['left',-D.wheelX],['right',D.wheelX]]){
    const pivot=new THREE.Group();pivot.name='wheel_'+side;pivot.position.set(x,.60,D.axleZ);root.add(pivot);
    pivot.userData={axis:[1,0,0],radius:D.wheelRadius};
    const pieces=[];
    add(pieces,side+'_rim',rimGeometry(.48,.60,.15),wood);
    add(pieces,side+'_hub',cylinderGeo(.086,.086,.27,12),wood,[0,0,0],[0,0,90]);
    for(let i=0;i<4;i++){
      const a=Math.PI/4+i*Math.PI/2;
      beam(pieces,side+'_spoke_'+i,[0,.055*Math.cos(a),.055*Math.sin(a)],[0,.542*Math.cos(a),.542*Math.sin(a)],.032,wood);
    }
    createPart(side+'_wooden_wheel',mergePieces(pieces),wood,{parent:pivot});
    const metal=[];
    for(const dx of [-.093,.093]) add(metal,side+'_hub_band_'+dx,rimGeometry(.082,.091,.035,12),bronze,[dx,0,0]);
    const outer=side==='left'?-.143:.143;
    add(metal,side+'_axle_cap',cylinderGeo(.059,.059,.027,8),bronze,[outer,0,0],[0,0,90]);
    createPart(side+'_hub_fittings',mergePieces(metal),bronze,{parent:pivot});
  }
  // A hollow side quiver stays forward of the spinning right wheel.
  const quiver=new THREE.Group();quiver.name='right_javelin_quiver';
  quiver.position.set(.69,.80,.28);quiver.rotation.x=12*Math.PI/180;root.add(quiver);
  const sheath=await compilePortableMaterialSpecV2({...materialSpecs.linen,baseColor:0x7a5536});
  sheath.name='Troy leather-coloured quiver';
  const casing=[],quiverMetal=[],shafts=[];
  add(casing,'hollow_quiver_body',rimGeometry(.085,.105,.63,12),sheath,[0,.315,0],[0,0,90]);
  add(casing,'quiver_closed_bottom',cylinderGeo(.105,.105,.035,12),sheath,[0,.0175,0]);
  for(const y of [.10,.56]) add(quiverMetal,'quiver_band_'+y,rimGeometry(.103,.115,.045,12),bronze,[0,y,0],[0,0,90]);
  const javelins=[[-.043,-.030,1.55],[.014,-.042,1.67],[.052,.006,1.60],[-.010,.018,1.72],[-.047,.035,1.63]];
  javelins.forEach(([x,z,h],i)=>{
    add(shafts,'javelin_shaft_'+i,cylinderGeo(.014,.017,h-.035,8),wood,[x,(h+.035)/2,z]);
    add(quiverMetal,'javelin_socket_'+i,cylinderGeo(.020,.024,.065,8),bronze,[x,h-.015,z]);
    add(quiverMetal,'javelin_head_'+i,bladeGeo({length:.21,baseWidth:.075,thickness:.014,tipLength:.16,edgeBevel:1}),bronze,[x,h,z],[0,i*37,0]);
  });
  createPart('quiver_sheath',mergePieces(casing),sheath,{parent:quiver});
  createPart('quiver_bands_and_javelin_heads',mergePieces(quiverMetal),bronze,{parent:quiver});
  createPart('five_javelin_shafts',mergePieces(shafts),wood,{parent:quiver});
  for(const [name,y] of [['lower',.10],['upper',.56]]){
    const angle=12*Math.PI/180;
    const qy=.80+y*Math.cos(angle),qz=.28+y*Math.sin(angle);
    const end=[.645,qy+.095*Math.sin(angle),qz-.095*Math.cos(angle)];
    beamBetween('quiver_'+name+'_mount',[.60,qy,.12],end,.022,bronze,{segments:8,parent:root});
  }
  return root;
}
function animate(){
  const keys=Array.from({length:9},(_,i)=>({time:i*.25,rotation:[i*45,0,0]}));
  return [createClip('wheel_spin',2,[rotationTrack('wheel_left',keys),rotationTrack('wheel_right',keys)],{loop:true})];
}
