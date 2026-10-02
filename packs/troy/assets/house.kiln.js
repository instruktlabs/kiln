const meta = { name: 'Trojan Walk-in House', role: 'building' };
// Revision 2 (material pass, 2 October 2026): the footings and hearth are the pack's coursed
// limestone and the walls, floor, ramp and roof its plastered mudbrick, each mapped from world
// position in metres (limestone tiles every 1.2 m, mudbrick every 1 m) instead of one stretched
// tile per box face. Geometry, part names, the roof subtree and the ladder are revision 1's.
const D = { width:6, depth:5, wall:0.45, floor:0.12, stoneTop:0.62, ceiling:3.0,
  doorwayWidth:1.4, doorwayHeight:2.35, jamb:0.18, roofThickness:0.24 };
const T = { stone:1.2, brick:1.0 }; // texture tiles in metres
// Batched geometry already sits in root space, so its position is the world position.
function worldUV(geo, tile) {
  const p=geo.getAttribute('position'), n=geo.getAttribute('normal');
  let uv=geo.getAttribute('uv');
  if(!uv || uv.count!==p.count) { uv=new THREE.Float32BufferAttribute(new Float32Array(p.count*2),2); geo.setAttribute('uv',uv); }
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const ax=Math.abs(n.getX(i)), ay=Math.abs(n.getY(i)), az=Math.abs(n.getZ(i));
    if(ax>=ay && ax>=az) uv.setXY(i,z/tile,y/tile);
    else if(ay>=az) uv.setXY(i,x/tile,z/tile);
    else uv.setXY(i,x/tile,y/tile);
  }
  uv.needsUpdate=true;
  return geo;
}
async function build() {
  const root = createRoot('TrojanHouse');
  root.userData = { forward:'+Z', units:'metres', soldierHeight:1.8, doorClearWidth:D.doorwayWidth,
    doorClearHeight:D.doorwayHeight, floorHeight:D.floor, entry:'Open passage with shallow approach ramp' };
  const limestone = await compilePortableMaterialSpecV2({
    schemaVersion:2, model:'pbrMetallicRoughness', name:'Troy coursed limestone',
    roughness:1, metalness:0, emissiveIntensity:1, alphaMode:'opaque', alphaCutoff:0.5, doubleSided:false,
    textures:{
      baseColor:{kind:'resource',resourceId:'kiln.library.118cd21f2b4775fea0005aad90da65ade37215ca06d04d6997862c773bb236ed.base-color'},
      metallicRoughness:{kind:'resource',resourceId:'kiln.library.118cd21f2b4775fea0005aad90da65ade37215ca06d04d6997862c773bb236ed.metallic-roughness'}}});
  const mudbrick = await compilePortableMaterialSpecV2({
    schemaVersion:2, model:'pbrMetallicRoughness', name:'Troy plastered mudbrick',
    roughness:1, metalness:0, emissiveIntensity:1, alphaMode:'opaque', alphaCutoff:0.5, doubleSided:false,
    textures:{
      baseColor:{kind:'resource',resourceId:'kiln.library.421914182486ebb17266b4b953976ac273c19da2d449919cd10baa7d25844363.base-color'},
      metallicRoughness:{kind:'resource',resourceId:'kiln.library.421914182486ebb17266b4b953976ac273c19da2d449919cd10baa7d25844363.metallic-roughness'}}});
  const timberSpec = {"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Warm straight wood grain","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness"}}};
  const wood = await compilePortableMaterialSpecV2({...timberSpec,name:'Troy timber',
    textures:{baseColor:timberSpec.textures.baseColor,metallicRoughness:timberSpec.textures.metallicRoughness}});
  const batches = {};
  function add(bucket, geo, position=[0,0,0], rotation=[0,0,0]) {
    const g = geo.clone();
    const e = new THREE.Euler(...rotation.map(v=>v*Math.PI/180));
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));
    g.translate(...position);
    (batches[bucket] || (batches[bucket]=[])).push(g);
  }
  function box(bucket,size,p,rot) {add(bucket,boxGeo(...size),p,rot);}
  // tile: world-unit masonry UVs in metres; omitted, each piece keeps its own UVs (timber).
  function flush(bucket,name,mat,parent=root,tile) {
    const geos=batches[bucket] || [];
    const positions=[],normals=[],uvs=[];
    for(const geo of geos) {
      const g=geo.index ? geo.toNonIndexed() : geo;
      if(tile) worldUV(g,tile);
      const p=g.getAttribute('position'), n=g.getAttribute('normal'), uv=g.getAttribute('uv');
      for(let i=0;i<p.count;i++) {
        positions.push(p.getX(i),p.getY(i),p.getZ(i));
        normals.push(n.getX(i),n.getY(i),n.getZ(i));
        uvs.push(uv ? uv.getX(i):0,uv ? uv.getY(i):0);
      }
    }
    const result=createPart(name,meshGeo({positions,normals,uvs}),mat,{parent});
    return result;
  }
  function rect(x0,x1,z0,z1){return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];}
  function footing(x0,x1,z0,z1,expandX,expandZ) {
    add('stone',loftProfiles([
      {profile:rect(x0-expandX,x1+expandX,z0-expandZ,z1+expandZ),frame:{origin:[0,0,0]}},
      {profile:rect(x0,x1,z0,z1),frame:{origin:[0,D.stoneTop,0]}}
    ]));
  }
  const halfDoor=D.doorwayWidth/2, roughHalf=halfDoor+D.jamb;
  // Footings are split at the opening: no continuous plinth across the entrance.
  footing(-3,-2.55,-2.05,2.05,0.12,0);
  footing(2.55,3,-2.05,2.05,0.12,0);
  footing(-3,3,-2.5,-2.05,0.12,0.12);
  footing(-3,-roughHalf,2.05,2.5,0,0.12);
  footing(roughHalf,3,2.05,2.5,0,0.12);
  const wallH=D.ceiling-D.stoneTop;
  box('mud',[0.45,wallH,4.1],[-2.775,D.stoneTop+wallH/2,0]);
  box('mud',[0.45,wallH,4.1],[2.775,D.stoneTop+wallH/2,0]);
  // A high rear vent is a real aperture.
  box('mud',[2.65,wallH,0.45],[-1.675,D.stoneTop+wallH/2,-2.275]);
  box('mud',[2.65,wallH,0.45],[1.675,D.stoneTop+wallH/2,-2.275]);
  box('mud',[0.7,1.38,0.45],[0,D.stoneTop+0.69,-2.275]);
  box('mud',[0.7,0.4,0.45],[0,2.8,-2.275]);
  const frontPierW=3-roughHalf, lintelY=D.floor+D.doorwayHeight;
  box('mud',[frontPierW,wallH,0.45],[-(3+roughHalf)/2,D.stoneTop+wallH/2,2.275]);
  box('mud',[frontPierW,wallH,0.45],[(3+roughHalf)/2,D.stoneTop+wallH/2,2.275]);
  box('mud',[roughHalf*2,D.ceiling-lintelY-0.22,0.45],
    [0,(D.ceiling+lintelY+0.22)/2,2.275]);
  // Clear opening is measured between these finished timber jamb faces.
  createPart('DoorJambLeft',boxGeo(D.jamb,D.doorwayHeight,0.52),wood,
    {position:[-halfDoor-D.jamb/2,D.floor+D.doorwayHeight/2,2.275],parent:root});
  createPart('DoorJambRight',boxGeo(D.jamb,D.doorwayHeight,0.52),wood,
    {position:[halfDoor+D.jamb/2,D.floor+D.doorwayHeight/2,2.275],parent:root});
  createPart('DoorLintel',boxGeo(2.12,0.22,0.56),wood,
    {position:[0,lintelY+0.11,2.275],parent:root});
  // One room; the main 1.4 m entry lane remains clear to the back wall.
  box('floor',[5.1,D.floor,4.1],[0,D.floor/2,0]);
  // Closed wedge ramp joins exactly to the floor at z=2.05.
  const ramp=boxGeo(1.4,D.floor,1.4).clone();
  const rp=ramp.getAttribute('position');
  for(let i=0;i<rp.count;i++) {
    const z=rp.getZ(i)+2.75;
    const y=rp.getY(i)>0 ? D.floor*(3.45-z)/1.4 : 0;
    rp.setXYZ(i,rp.getX(i),y,z);
  }
  ramp.computeVertexNormals();
  add('floor',ramp);
  // Low octagonal hearth placed to the left, away from the entry route.
  const cx=-1.45,cz=-0.45;
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    box('stone',[0.44,0.16,0.22],[cx+0.58*Math.sin(a),D.floor+0.08,cz+0.58*Math.cos(a)],[0,i*45,0]);
  }
  add('wood',cylinderGeo(0.065,0.065,0.65,6),[cx,D.floor+0.085,cz],[0,0,90]);
  add('wood',cylinderGeo(0.055,0.055,0.55,6),[cx,D.floor+0.10,cz],[90,20,0]);
  // Visible load-bearing ceiling timbers meet both side walls.
  for(let i=0;i<6;i++){
    const z=-1.75+i*0.7;
    box('wood',[6.0,0.18,0.20],[0,D.ceiling-0.09,z]);
  }
  // Flat earthen roof and low rim. Roof is a separate named subtree for cutaway review.
  const roof=new THREE.Group();roof.name='Roof';root.add(roof);
  roof.userData={role:'roof',top:D.ceiling+D.roofThickness};
  box('roof',[6.12,D.roofThickness,5.12],[0,D.ceiling+D.roofThickness/2,0]);
  box('roof',[6.0,0.22,0.18],[0,3.35,-2.4]);
  box('roof',[6.0,0.22,0.18],[0,3.35,2.4]);
  box('roof',[0.18,0.22,4.8],[-2.91,3.35,0]);
  // Right rim leaves a landing gap at the ladder.
  box('roof',[0.18,0.22,2.35],[2.91,3.35,-1.225]);
  box('roof',[0.18,0.22,1.15],[2.91,3.35,1.825]);
  // Timber ladder along the right flank. Extended rails provide handholds above the roof.
  const ladder=createLadder('RoofLadder',{
    bottom:[4.15,0.055,0.55],top:[3.06,3.95,0.55],width:0.72,
    rungCount:12,railRadius:0.055,rungRadius:0.037,segments:6,widthDirection:[0,0,1],
    material:wood,parent:root});
  // Consolidate its static parts with the house timbers, preserving one material draw.
  ladder.root.updateMatrixWorld(true);
  ladder.root.traverse(o=>{
    if(o.isMesh){
      const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);
      (batches.wood || (batches.wood=[])).push(g);
    }
  });
  root.remove(ladder.root);
  // The handhold above the roof leans out; short cross ties meet the roof edge.
  box('wood',[0.30,0.10,0.10],[3.01,3.19,0.19]);
  box('wood',[0.30,0.10,0.10],[3.01,3.19,0.91]);
  flush('stone','StoneFootingsAndHearth',limestone,root,T.stone);
  flush('mud','MudbrickWalls',mudbrick,root,T.brick);
  flush('floor','FloorAndEntranceRamp',mudbrick,root,T.brick);
  flush('wood','CeilingTimbersAndRoofLadder',wood);
  flush('roof','FlatRoofAndRim',mudbrick,roof,T.brick);
  return root;
}
