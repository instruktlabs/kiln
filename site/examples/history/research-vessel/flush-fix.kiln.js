// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = { name: 'RV Tern — asymmetric coastal research vessel', category: 'vehicle', role: 'vehicle', units: 'metres' };
const serviceOffset = 0.40;
const deckHeight = 1.20;
const carriageX = -2.85;
function build() {
  const root = createRoot('ResearchVessel');
  const navy = gameMaterial(0x16475a, { roughness: 0.38, metalness: 0.38, flatShading: false });
  const deckMat = gameMaterial(0x87978e, { roughness: 0.93 });
  const white = gameMaterial(0xe5e6d8, { roughness: 0.45, metalness: 0.18 });
  const steel = gameMaterial(0x82969d, { roughness: 0.32, metalness: 0.8 });
  const dark = gameMaterial(0x172b35, { roughness: 0.55, metalness: 0.3 });
  const yellow = gameMaterial(0xf2ad32, { roughness: 0.4, metalness: 0.32 });
  const glass = gameMaterial(0x164052, { roughness: 0.16, metalness: 0.5 });
  const red = gameMaterial(0xc85a42, { roughness: 0.65 });
  const rubber = gameMaterial(0x20272b, { roughness: 0.92 });
  function group(name, parent=root, position=[0,0,0]) {
    const g = new THREE.Group(); g.name=name; g.position.set(...position); parent.add(g); return g;
  }
  function box(name, size, pos, mat, parent=root) { return createPart(name,boxGeo(...size),mat,{position:pos,parent}); }
  function rod(name,a,b,r,mat,parent=root) {
    const av=new THREE.Vector3(...a), bv=new THREE.Vector3(...b), d=bv.clone().sub(av);
    const m=createPart(name,cylinderGeo(r,r,d.length(),10),mat,{position:av.clone().add(bv).multiplyScalar(0.5).toArray(),parent});
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); return m;
  }
  function pipe(name,points,r,mat,parent=root) { return createPart(name,pipeAlongPath(points,r,{tubularSegments:96,radialSegments:8}),mat,{parent}); }
  // Authored longitudinal sections: broad transom, gently curved working body, fine raised entrance.
  function section(x) {
    const t=(x+4)/8;
    const w=1.43+0.13*Math.sin(Math.PI*t)-1.40*Math.pow(t,4);
    const rise=Math.pow(Math.max(0,(x-0.3)/3.7),1.65);
    return {x,w,y:deckHeight+0.48*rise,k:0.14+0.48*Math.pow(t,5)};
  }
  const stations=Array.from({length:65},(_,i)=>section(-4+i/8));
  // Closed seven-sided transverse rings, continuous longitudinally; ring order faces +X.
  function hullGeometry() {
    const positions=[],indices=[], n=7;
    stations.forEach(s=>{
      const ch=s.k+0.34;
      [[s.y,s.w],[ch,s.w*0.86],[s.k+0.055,s.w*0.34],[s.k,0],[s.k+0.055,-s.w*0.34],[ch,-s.w*0.86],[s.y,-s.w]]
        .forEach(p=>positions.push(s.x,p[0],p[1]));
    });
    for(let i=0;i<stations.length-1;i++)for(let j=0;j<n;j++){
      const a=i*n+j,b=i*n+(j+1)%n,c=(i+1)*n+(j+1)%n,d=(i+1)*n+j;
      indices.push(a,c,d,a,b,c);
    }
    for(const end of [0,stations.length-1]){
      const s=stations[end], center=positions.length/3; positions.push(s.x,(s.y+s.k)/2,0);
      for(let j=0;j<n;j++){const a=end*n+j,b=end*n+(j+1)%n; if(end===0)indices.push(center,b,a);else indices.push(center,a,b);}
    }
    return meshGeo({positions,indices});
  }
  const hull=group('ContinuousChineHull');
  createPart('CurvedShell',hullGeometry(),navy,{parent:hull});
  // Deck is an explicit thin closed shell following the same sheer.
  const dp=[],di=[];
  stations.forEach((s,si)=>{const sx=si===0?s.x+0.002:s.x;dp.push(sx,s.y+0.025,s.w-0.025,sx,s.y+0.025,-s.w+0.025,sx,s.y-0.015,-s.w+0.025,sx,s.y-0.015,s.w-0.025);});
  for(let i=0;i<64;i++)for(let j=0;j<4;j++){const a=4*i+j,b=4*i+(j+1)%4,c=4*(i+1)+(j+1)%4,d=4*(i+1)+j;di.push(a,d,c,a,c,b);}
  di.push(0,1,2,0,2,3,256,258,257,256,259,258);
  createPart('SheerFollowingDeck',meshGeo({positions:dp,indices:di}),deckMat,{parent:hull});
  for(const side of [-1,1]){
    pipe('ChineRubbingStrip_'+side,stations.map(s=>[s.x,s.k+0.34,side*s.w*0.86]),0.027,white,hull);
    pipe('Gunwale_'+side,stations.map(s=>[s.x,s.y+0.07,side*(s.w-0.015)]),0.052,dark,hull);
    pipe('BootStripe_'+side,stations.map(s=>[s.x,s.k+0.17,side*s.w*0.60]),0.034,red,hull);
  }
  box('TransomRubRail',[0.08,0.1,2.82],[-3.99,1.17,0],dark,hull);
  const rails=group('SafetyRailings');
  for(const side of [-1,1]){
    const pts=[];
    for(let i=0;i<=32;i++){const s=section(-3.85+i*7.72/32);pts.push([s.x,s.y+0.85,side*(s.w-0.12)]);}
    pipe('ContinuousTopRail_'+side,pts,0.026,white,rails);
    pipe('ContinuousMidRail_'+side,pts.map(p=>[p[0],p[1]-0.39,p[2]]),0.018,steel,rails);
    for(let i=0;i<=10;i++){const s=section(-3.85+i*7.65/10),z=side*(s.w-0.12);
      rod('Stanchion_'+side+'_'+i,[s.x,s.y+0.045,z],[s.x,s.y+0.85,z],0.025,white,rails);
      box('RailFoot_'+side+'_'+i,[0.12,0.035,0.12],[s.x,s.y+0.045,z],steel,rails);
    }
  }
  for(const y of [1.65,2.05]) rod('SternRail_'+y,[-3.86,y,-1.30],[-3.86,y,1.30],0.025,white,rails);
  for(const z of [-0.65,0,0.65])rod('SternPost_'+z,[-3.86,1.23,z],[-3.86,2.05,z],0.025,white,rails);
  const cabin=group('PortWheelhouse',root,[0.45,1.25,-0.62]);
  box('CabinBody',[2.28,1.62,1.18],[0,0.82,0],white,cabin);
  box('CabinFoundation',[2.4,0.12,1.30],[0,0.02,0],dark,cabin);
  box('RoofOverhang',[2.53,0.14,1.43],[0,1.69,0],white,cabin);
  box('RoofAccent',[2.49,0.055,1.39],[0,1.78,0],navy,cabin);
  for(const z of [-0.605,0.605]){
    for(const x of [-0.72,0,0.72])box('SideWindow_'+z+'_'+x,[0.57,0.59,0.018],[x,1.14,z],glass,cabin);
    rod('CabinGrabRail_'+z,[-0.85,0.55,z*1.08],[0.9,0.55,z*1.08],0.019,steel,cabin);
  }
  for(const z of [-0.3,0.3]){
    box('ForwardWindshield_'+z,[0.022,0.67,0.5],[1.151,1.16,z],glass,cabin);
    rod('WindshieldWiper_'+z,[1.172,0.88,z-0.18],[1.172,1.32,z+0.13],0.012,dark,cabin);
  }
  box('AftDoor',[0.025,1.25,0.62],[-1.153,0.66,0.03],navy,cabin);
  box('DoorGlazing',[0.025,0.48,0.45],[-1.17,1.0,0.03],glass,cabin);
  rod('DoorHandle',[-1.19,0.54,0.20],[-1.19,0.74,0.20],0.018,steel,cabin);
  const mast=group('SensorMast',cabin,[0.2,1.8,0]);
  rod('Mast',[0,0,0],[0,0.92,0],0.045,white,mast);
  box('RadarBar',[0.85,0.10,0.17],[0,0.68,0],white,mast);
  createPart('Radome',sphereGeo(0.19,16,12),white,{position:[0,1.0,0],parent:mast});
  rod('Aerial',[-0.48,0,0],[-0.48,1.22,0],0.012,steel,mast);
  createPart('PortLamp',sphereGeo(0.055,12,8),red,{position:[0.75,1.8,-0.63],parent:cabin});
  createPart('StarboardLamp',sphereGeo(0.055,12,8),gameMaterial(0x37bc88),{position:[0.75,1.8,0.63],parent:cabin});
  const work=group('OpenStarboardWorkDeck');
  // Flush perimeter markings leave the main walking and sampling area clear.
  for(const z of [0.29,1.20])box('WorkZoneLine_'+z,[3.05,0.014,0.025],[-0.28,1.24,z],yellow,work);
  box('FlushSampleHatch',[0.95,0.035,0.67],[-0.68,1.245,0.75],dark,work);
  box('SampleHatchLid',[0.84,0.018,0.56],[-0.68,1.272,0.75],steel,work);
  for(const x of [-0.96,-0.41])rod('HatchHandle_'+x,[x,1.30,0.66],[x,1.30,0.84],0.014,dark,work);
  const track=group('SternDeckTrack');
  for(const z of [-0.28,0.28]){
    box('TrackBed_'+z,[1.8,0.065,0.20],[-2.50,1.265,z],dark,track);
    box('TrackRail_'+z,[1.8,0.065,0.075],[-2.50,1.33,z],steel,track);
    for(const x of [-3.34,-1.66])box('EndStop_'+z+'_'+x,[0.10,0.16,0.16],[x,1.34,z],yellow,track);
  }
  const motion=createPivot('ServiceTranslation',[carriageX+serviceOffset,1.35,0],root);
  const service=group('ServiceAssembly',motion);
  box('CarriageFootplate',[0.70,0.11,0.90],[0,0.085,0],yellow,service);
  for(const x of [-0.23,0.23])for(const z of [-0.28,0.28]){
    box('RailShoe_'+x+'_'+z,[0.18,0.07,0.17],[x,-0.005,z],dark,service);
    createPart('FootplateBolt_'+x+'_'+z,cylinderGeo(0.033,0.033,0.025,6),steel,{position:[x,0.155,z],parent:service});
  }
  createPart('SlewBearing',cylinderGeo(0.27,0.29,0.16,24),dark,{position:[0,0.22,0],parent:service});
  createPart('CranePedestal',cylinderGeo(0.15,0.21,0.73,20),yellow,{position:[0,0.65,0],parent:service});
  box('CraneShoulder',[0.34,0.31,0.34],[0,1.08,0],yellow,service);
  rod('MainBoom',[0,1.11,0],[0.1,2.07,0.63],0.105,yellow,service);
  rod('OuterBoom',[0.1,2.07,0.63],[0.16,1.99,1.19],0.082,yellow,service);
  rod('HydraulicBody',[0,0.66,0.11],[0.065,1.42,0.56],0.063,dark,service);
  rod('HydraulicRod',[0.065,1.42,0.56],[0.10,1.84,0.73],0.032,steel,service);
  createPart('BoomHinge',cylinderXGeo(0.13,0.13,0.41,16),steel,{position:[0.1,2.07,0.63],parent:service});
  createPart('WinchDrum',cylinderXGeo(0.17,0.17,0.34,20),dark,{position:[-0.15,1.10,-0.22],parent:service});
  pipe('CableGuide',[[-0.28,0.17,-0.31],[-0.28,0.42,-0.31],[-0.18,0.73,-0.25],[-0.15,1.10,-0.22]],0.031,steel,service);
  pipe('HoistCable',[[-0.15,1.13,-0.22],[0.07,2.19,0.62],[0.17,2.08,1.20],[0.17,0.78,1.20]],0.014,dark,service);
  createPart('HeadSheave',cylinderXGeo(0.10,0.10,0.10,16),dark,{position:[0.17,2.04,1.20],parent:service});
  createPart('SampleWeight',cylinderGeo(0.11,0.07,0.28,12),steel,{position:[0.17,0.65,1.20],parent:service});
  box('CraneControlBox',[0.19,0.30,0.21],[0.24,0.63,-0.16],navy,service);
  for(const z of [-1,1])for(const x of [-2.0,0.0,1.8]){
    const s=section(x);
    createPart('SideFender_'+x+'_'+z,cylinderGeo(0.105,0.105,0.52,12),rubber,{position:[x,s.y-0.14,z*(s.w+0.06)],parent:root});
    rod('FenderLanyard_'+x+'_'+z,[x,s.y+0.25,z*(s.w-0.08)],[x,s.y+0.1,z*(s.w+0.06)],0.011,dark);
  }
  for(const x of [-3.55,2.52])for(const z of [-0.83,0.83]){
    const s=section(x); rod('Bollard_'+x+'_'+z,[x,s.y,z],[x,s.y+0.20,z],0.055,steel);
    rod('Cleat_'+x+'_'+z,[x-0.13,s.y+0.18,z],[x+0.13,s.y+0.18,z],0.029,steel);
  }
  box('Skeg',[1.35,0.25,0.09],[-2.75,0.12,0],navy);
  rod('PropellerShaft',[-3.45,0.18,0],[-2.1,0.23,0],0.045,steel);
  for(let i=0;i<3;i++){
    const blade=box('PropellerBlade_'+i,[0.06,0.42,0.11],[-3.42,0.18,0],yellow);
    blade.rotation.x=i*Math.PI*2/3;
  }
  box('Rudder',[0.31,0.42,0.055],[-3.78,0.21,0],navy);
  return root;
}
function animate(root) {
  return [createClip('ServiceMotion',1,[positionTrack('Joint_ServiceTranslation',[
    {time:0,position:[carriageX+serviceOffset,1.35,0]},
    {time:0.5,position:[carriageX+serviceOffset+0.4,1.35,0]},
    {time:1,position:[carriageX+serviceOffset,1.35,0]}
  ])])];
}
