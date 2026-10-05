const meta = { name: 'Troy Citadel Temple Hall', role: 'building' };
async function build() {
  const root = createRoot('TroyCitadelTempleHall');
  // Pack frame: +Z faces the approach, Y=0 is the ground datum.
  const P = { width: 8.4, rear: -7, front: 7, hallFront: 3.6, floor: 0.45, wallTop: 4.65, doorWidth: 2.4, doorHeight: 3.1, hearthZ: -1 };
  root.userData = { project: 'troy', inventoryId: 'temple-hall', forward: '+Z', clearDoorWidth: P.doorWidth, clearDoorHeight: P.doorHeight };
  const masonrySpec = { schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Warm brick and mortar', roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, textures: {
    baseColor: {kind:'resource',resourceId:'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.base-color'},
    normal: {kind:'resource',resourceId:'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.normal'},
    metallicRoughness: {kind:'resource',resourceId:'kiln.library.bdadf5681b7f781dc116ca696211c87592144b6cccab9275743e3033ccddd8aa.metallic-roughness'} } };
  const timberSpec = { schemaVersion: 2, model: 'pbrMetallicRoughness', name: 'Warm straight wood grain', roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: 'opaque', alphaCutoff: 0.5, doubleSided: false, textures: {
    baseColor: {kind:'resource',resourceId:'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color'},
    normal: {kind:'resource',resourceId:'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.normal'},
    metallicRoughness: {kind:'resource',resourceId:'kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness'} } };
  const stone = await compilePortableMaterialSpecV2({...masonrySpec, name:'Troy limestone',baseColor:0xcdbf9f});
  const plaster = await compilePortableMaterialSpecV2({...masonrySpec,name:'Troy plastered mudbrick',baseColor:0xe3d8c0});
  const timber = await compilePortableMaterialSpecV2({...timberSpec,name:'Troy timber',baseColor:0x6b4a2e});
  const crimson = await compilePortableMaterialSpecV2({...timberSpec,name:'Troy crimson painted timber',baseColor:0x8c2f2a});
  // Limestone and plaster finishes derive from the pinned masonry material.
  // Smooth opaque surfaces retain its packed roughness response; timber keeps its grain.
  for (const m of [stone,plaster]) { m.map=null; m.normalMap=null; }
  for (const m of [stone,plaster,timber,crimson]) {
    for(const key of ['map','normalMap','metalnessMap','roughnessMap']) if(m[key]) {m[key].wrapS=THREE.RepeatWrapping;m[key].wrapT=THREE.RepeatWrapping;}
  }
  // Merge static primitives by material and architectural role while keeping a removable roof.
  const batches = {};
  const roof = new THREE.Group(); roof.name='Roof'; root.add(roof);
  function put(name, mat, geo, pos, parent=root) {
    const g=geo.clone(); g.translate(...pos);
    if(!batches[name]) batches[name]={mat,parent,geos:[]};
    batches[name].geos.push(g);
  }
  function box(name,mat,size,pos,parent=root) {
    const g=boxGeo(...size).clone(); const a=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
    const repeat=mat===stone||mat===plaster?2:1;
    for(let i=0;i<a.count;i++) {
      const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i));
      const u=nx>.5?a.getZ(i):a.getX(i),v=ny>.5?a.getZ(i):a.getY(i);
      uv.setXY(i,u/repeat,v/repeat);
    }
    put(name,mat,g,pos,parent);
  }
  function cyl(name,mat,rt,rb,h,pos) {put(name,mat,remapUV(cylinderGeo(rt,rb,h,12),{scale:[1,h]}),pos);}
  function footing(name,size,pos) {
    const g=boxGeo(...size).clone(),a=g.getAttribute('position');
    for(let i=0;i<a.count;i++) if(a.getY(i)<0) a.setX(i,a.getX(i)*1.28);
    g.computeVertexNormals();put(name,stone,g,pos);
  }
  box('FoundationAndFloor',stone,[8.8,.45,14.4],[0,.225,0]);
  // Shallow approach steps leave a full-width path to the porch and doorway.
  box('FoundationAndFloor',stone,[4.7,.15,.55],[0,.075,7.975]);
  box('FoundationAndFloor',stone,[4.7,.30,.55],[0,.15,7.425]);
  footing('SlopedStoneFootings',[.8,.75,10.8],[-3.8,.825,-1.6]);
  footing('SlopedStoneFootings',[.8,.75,10.8],[3.8,.825,-1.6]);
  box('SlopedStoneFootings',stone,[6.8,.75,.8],[0,.825,-6.6]);
  box('HallWalls',plaster,[.65,3.45,10.6],[-3.875,2.925,-1.7]);
  box('HallWalls',plaster,[.65,3.45,10.6],[3.875,2.925,-1.7]);
  box('HallWalls',plaster,[7.1,3.45,.65],[0,2.925,-6.675]);
  // Front wall pieces expose exact finished doorway clearance for inspection.
  const jambW=(P.width-P.doorWidth)/2;
  box('DoorwayLeftPier',plaster,[jambW,4.2,.65],[-(P.doorWidth+jambW)/2,2.55,P.hallFront]);
  box('DoorwayRightPier',plaster,[jambW,4.2,.65],[(P.doorWidth+jambW)/2,2.55,P.hallFront]);
  box('DoorwayHeader',plaster,[P.doorWidth,1.1,.65],[0,4.1,P.hallFront]);
  // Timber surround lies outside the clear 2.4 x 3.1 m portal.
  for(const s of [-1,1]) box('DoorwayTimber',timber,[.20,3.1,.82],[s*1.3,2,P.hallFront]);
  box('DoorwayLintel',timber,[3.02,.30,.90],[0,3.70,P.hallFront]);
  for(const s of [-1,1]) {
    footing('SlopedStoneFootings',[.8,.75,2.8],[s*3.8,.825,5]);
    box('PorchAntae',plaster,[.65,3.45,2.8],[s*3.875,2.925,5]);
    box('PorchAntaeCaps',stone,[.86,.20,.72],[s*3.875,4.75,6.08]);
  }
  function column(name,x,z) {
    cyl('ColumnStoneBases',stone,.46,.5,.20,[x,.55,z]);
    cyl(name,crimson,.34,.29,3.55,[x,2.425,z]);
    cyl('ColumnCapitals',timber,.48,.36,.18,[x,4.29,z]);
    box('ColumnAbaci',timber,[1.02,.27,.95],[x,4.515,z]);
  }
  for(const x of [-1.65,1.65]) column('PorchColumns',x,6.05);
  for(const x of [-1.85,1.85]) for(const z of [-2.85,.85]) column('HallColumns',x,z);
  box('PorchEntablature',timber,[8.55,.34,.52],[0,4.48,6.05]);
  for(const x of [-1.85,1.85]) box('HallRoofBeams',timber,[.42,.32,10.0],[x,4.49,-1.55]);
  for(const z of [-2.85,.85]) box('HallRoofBeams',timber,[7.75,.32,.42],[0,4.49,z]);
  // Hearth rim: solid annular prism, with an inset wood/ash bed and a clear walking ring.
  const hp=[],hu=[];
  function quad(a,b,c,d){for(const v of [a,c,b,a,d,c]){hp.push(...v);hu.push(v[0]/2,v[2]/2);}}
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8,b=(i+1)*Math.PI/8,lo=.45,hi=.70;
    const v=(r,t,y)=>[r*Math.cos(t),y,P.hearthZ+r*Math.sin(t)];
    quad(v(1.1,a,hi),v(1.1,b,hi),v(.85,b,hi),v(.85,a,hi));
    quad(v(1.1,a,lo),v(1.1,b,lo),v(1.1,b,hi),v(1.1,a,hi));
    quad(v(.85,b,lo),v(.85,a,lo),v(.85,a,hi),v(.85,b,hi));
    quad(v(.85,a,lo),v(.85,b,lo),v(1.1,b,lo),v(1.1,a,lo));
  }
  const hearth=new THREE.BufferGeometry();hearth.setAttribute('position',new THREE.Float32BufferAttribute(hp,3));hearth.setAttribute('uv',new THREE.Float32BufferAttribute(hu,2));hearth.computeVertexNormals();
  put('HearthStoneRim',stone,hearth,[0,0,0]);
  cyl('HearthFuelBed',timber,.84,.84,.07,[0,.485,P.hearthZ]);
  for(const z of [-1.22,-.98,-.74]) box('HearthFuelBed',timber,[1.0,.09,.12],[0,.565,z]);
  // Rear offering dais and low side benches support the ceremonial use of the hall.
  box('InteriorStoneFurnishings',stone,[2.6,.18,1.45],[0,.54,-5.4]);
  box('InteriorStoneFurnishings',stone,[1.45,.78,.70],[0,1.02,-5.6]);
  for(const x of [-2.8,2.8]) {
    box('InteriorStoneFurnishings',stone,[.70,.46,3.1],[x,.68,-4.05]);
    box('InteriorTimberSeats',timber,[.78,.12,3.2],[x,.97,-4.05]);
  }
  // Restrained, readable crimson bands rather than tiny sculptural ornament.
  for(const x of [-3.53,3.53]) box('CrimsonWallBands',crimson,[.05,.20,9.8],[x,3.65,-1.55]);
  box('CrimsonWallBands',crimson,[7.05,.20,.05],[0,3.65,-6.32]);
  box('PorchFrieze',crimson,[8.58,.16,.055],[0,4.51,6.335]);
  for(let i=-3;i<=3;i++) box('PorchFrieze',crimson,[.24,.34,.08],[i*.95,4.68,6.35]);
  // A flat roof with a real 2.2 m square smoke/light aperture over the hearth.
  const roofMin=-7.35,roofMax=6.65,holeMin=-2.1,holeMax=.1;
  box('RoofSlab',plaster,[9.15,.32,holeMin-roofMin],[0,4.81,(roofMin+holeMin)/2],roof);
  box('RoofSlab',plaster,[9.15,.32,roofMax-holeMax],[0,4.81,(roofMax+holeMax)/2],roof);
  for(const x of [-2.8375,2.8375]) box('RoofSlab',plaster,[3.475,.32,2.2],[x,4.81,-1],roof);
  for(const x of [-4.50,4.50]) box('RoofFascia',timber,[.20,.28,14.1],[x,4.72,-.35],roof);
  for(const z of [-7.35,6.65]) box('RoofFascia',timber,[9.2,.28,.20],[0,4.72,z],roof);
  for(const x of [-4.32,4.32]) box('RoofParapet',stone,[.25,.32,13.80],[x,5.13,-.35],roof);
  for(const z of [-7.12,6.42]) box('RoofParapet',stone,[8.42,.32,.25],[0,5.13,z],roof);
  for(const x of [-1.2,1.2]) box('LightwellCurb',stone,[.20,.30,2.60],[x,5.12,-1],roof);
  for(const z of [-2.2,.2]) box('LightwellCurb',stone,[2.2,.30,.20],[0,5.12,z],roof);
  // Exposed end-grain beam tails establish the timber roof construction in silhouette.
  for(const z of [-6,-4.5,-3,0,1.5,3,4.5]) for(const x of [-4.43,4.43]) box('RoofFascia',timber,[.48,.20,.24],[x,4.57,z],roof);
  // Consolidate each rigid material batch; retain the floor, hearth and doorway as useful inspection subjects.
  const rigid = {};
  for(const [role,b] of Object.entries(batches)) {
    const keep=['FoundationAndFloor','HearthStoneRim','DoorwayLeftPier','DoorwayRightPier','DoorwayHeader'].includes(role);
    const finish=b.mat===stone?'Stone':b.mat===plaster?'Plaster':b.mat===timber?'Timber':'Crimson';
    const name=keep?role:(b.parent===roof?'Roof':'Hall')+finish;
    if(!rigid[name]) rigid[name]={mat:b.mat,parent:b.parent,geos:[],roles:[]};
    rigid[name].geos.push(...b.geos);rigid[name].roles.push(role);
  }
  for(const [name,b] of Object.entries(rigid)) {
    const positions=[],normals=[],uvs=[];
    for(const source of b.geos) {
      const g=source.index?source.toNonIndexed():source;
      positions.push(...g.getAttribute('position').array);normals.push(...g.getAttribute('normal').array);uvs.push(...g.getAttribute('uv').array);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    const part=createPart(name,g,b.mat,{parent:b.parent});
    part.userData={architecturalRoles:b.roles};
  }
  return root;
}
