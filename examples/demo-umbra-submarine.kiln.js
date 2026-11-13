// Maintainer revision: flush-face fix (2026-11-12, Claude Sonnet 5.5 via Claude Code): 1 part edit that separates coplanar faces; materials, names, hierarchy and animation are unchanged.
const meta = {name:'UMBRA SSN - Nuclear Submarine',category:'vehicle',role:'vehicle'};
function build(){
 const root=createRoot('UMBRA_SSN');
 const P={cy:6.2, radius:5.5, sailTop:21.5};
 // Game LOD: named source parts remain editable; export batches static geometry.
 const Q={hullLength:64,hullHalf:24,foil:16,cylinder:12,sphereWidth:20,sphereHeight:12,batchStatic:true,triangleLimit:20000};
 const hull=gameMaterial(0x202b32,{metalness:.45,roughness:.43,flatShading:false});
 const lower=gameMaterial(0x182126,{metalness:.35,roughness:.53,flatShading:false});
 const panel=gameMaterial(0x303d44,{metalness:.5,roughness:.44,flatShading:false});
 const seam=gameMaterial(0x111a1e,{roughness:.7,flatShading:false});
 const edge=gameMaterial(0x60717a,{metalness:.7,roughness:.32,flatShading:false});
 const bronze=gameMaterial(0x9d7640,{metalness:.82,roughness:.3,flatShading:false});
 const glass=gameMaterial(0x17383f,{metalness:.55,roughness:.16,flatShading:false});
 const ivory=gameMaterial(0xc5c9bd,{roughness:.65});
 const add=(n,g,m,p=[0,0,0],r=[0,0,0],parent=root)=>createPart(n,g,m,{position:p,rotation:r,parent});
 const box=(n,s,m,p,r)=>add(n,new THREE.BoxGeometry(...s),m,p,r);
 const cyl=(n,rt,rb,h,m,p,r)=>add(n,new THREE.CylinderGeometry(rt,rb,h,rt<.1?6:Q.cylinder),m,p,r);
 const sphere=(n,s,m,p)=>createPart(n,new THREE.SphereGeometry(1,Q.sphereWidth,Q.sphereHeight),m,{position:p,scale:s,parent:root});
 const line=(n,pts,r,m)=>add(n,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p))),Math.max(6,Math.min(24,pts.length*2)),r,4,false),m);
 const stations=[[-55,0.35],[-52,.65],[-49,1.3],[-45,2.15],[-39,3.25],[-31,4.55],[-22,5.23],[-12,5.47],[0,5.5],[20,5.5],[34,5.44],[43,4.95],[49,3.95],[53,2.5],[55,.15]];
 const curve=new THREE.CatmullRomCurve3(stations.map(p=>new THREE.Vector3(p[0],p[1],0)),false,'centripetal');
 const samples=curve.getPoints(Q.hullLength);
 // Adjacent upper/lower surfaces eliminate the hidden duplicate underside.
 const geo=new THREE.LatheGeometry(samples.map(p=>new THREE.Vector2(p.y,p.x)),Q.hullHalf,Math.PI,Math.PI);
 geo.rotateZ(-Math.PI/2);
 add('Pressure_Hull',geo,hull,[0,P.cy,0]);
 function radius(x){let a=samples[0];for(const b of samples){if(b.x>=x){const t=(x-a.x)/(b.x-a.x||1);return a.y+(b.y-a.y)*t;}a=b;}return a.y;}
 // Lower half meets the upper half at the equator.
 const low=new THREE.LatheGeometry(samples.map(p=>new THREE.Vector2(p.y,p.x)),Q.hullHalf,0,Math.PI);
 low.rotateZ(-Math.PI/2);add('Lower_Hull_Coating',low,lower,[0,P.cy,0]);
 // Fine circumferential joints, deliberately darker than the hull.
 [-39,-30,-18,-5,8,27,38,45].forEach((x,i)=>add('Hull_Expansion_Seam_'+i,new THREE.TorusGeometry(radius(x)+.008,.027,3,Q.hullHalf*2),seam,[x,P.cy,0],[0,90,0]));
 function foil(chord,width,cx=0){const p=[];const N=Q.foil;for(let i=0;i<=N;i++){let t=i/N;let z=5*width*(.2969*Math.sqrt(t)-.126*t-.3516*t*t+.2843*t*t*t-.1036*t*t*t*t);p.push([cx+chord/2-chord*t,z]);}for(let i=N-1;i>0;i--){let t=i/N;let z=5*width*(.2969*Math.sqrt(t)-.126*t-.3516*t*t+.2843*t*t*t-.1036*t*t*t*t);p.push([cx+chord/2-chord*t,-z]);}return p;}
 add('Dorsal_Casing',loftProfiles([{profile:foil(69,4.1),frame:{origin:[4,10.8,0]}},{profile:foil(68,3.6),frame:{origin:[4,11.55,0]}}]),hull);
 add('Tall_Streamlined_Sail',loftProfiles([
 {profile:foil(18,4.9),frame:{origin:[13,10.78,0]}},
 {profile:foil(16.8,4.3),frame:{origin:[13.2,13,0]}},
 {profile:foil(15.3,3.8),frame:{origin:[13.7,P.sailTop-.45,0]}},
 {profile:foil(14.7,3.5),frame:{origin:[13.65,P.sailTop,0]}}]),panel);
 add('Sail_Crown',loftProfiles([{profile:foil(14.8,3.55),frame:{origin:[13.65,21.43,0]}},{profile:foil(14.5,3.4),frame:{origin:[13.65,21.63,0]}}]),hull);
 // Hydroplanes have a thick leading edge, tapered tips and swept trailing geometry.
 function fin(name,x,y,z,span,chord,rot){
 const f=loftProfiles([{profile:foil(chord,1.05),frame:{origin:[0,0,0]}},{profile:foil(chord*.9,.72,-.5),frame:{origin:[0,span*.62,0]}},{profile:foil(chord*.49,.23,-1.05),frame:{origin:[0,span,0]}}]);
 add(name,f,hull,[x,y,z],[rot,0,0]);
 }
 fin('Stern_Upper_Rudder',-45,6.2,0,9.5,10.5,0);
 fin('Stern_Lower_Rudder',-45,6.2,0,6.1,10.5,180);
 fin('Stern_Starboard_Plane',-45,6.2,0,10.4,10.8,90);
 fin('Stern_Port_Plane',-45,6.2,0,10.4,10.8,-90);
 fin('Sail_Starboard_Plane',15,15.1,1.5,6,5.8,90);
 fin('Sail_Port_Plane',15,15.1,-1.5,6,5.8,-90);
 for(const s of [-1,1]){
 line('Stern_Control_Hinge_'+s,[[-48,6.22,s*3],[-48.8,6.22,s*6.5],[-49.05,6.22,s*9.5]],.042,seam);
 line('Rudder_Hinge_'+s,[[-48,6.2+s*2.1,0],[-48.7,6.2+s*5.5,0]],.045,seam);
 // Bridge optics and inspection panels.
 for(let j=0;j<4;j++)box('Sail_Optical_Window_'+s+'_'+j,[.74,.42,.05],glass,[17.4-j*.94,20.45,s*(.94+j*.1)]);
 line('Sail_Service_Seam_'+s,[[8.3,13.3,s*.8],[8.7,18.8,s*.78],[9,20.6,s*.76]],.025,seam);
 for(let j=0;j<6;j++)box('Sail_Vent_'+s+'_'+j,[.65,.075,.045],seam,[9.4,14.1+j*.23,s*1.54]);
 // Aft free-flood vent bank.
 for(let j=0;j<12;j++){const x=-22+j*.91;const z=s*3.1;const y=P.cy+Math.sqrt(radius(x)*radius(x)-z*z);
 box('Flood_Vent_'+s+'_'+j,[.51,.042,.28],seam,[x,y+.025,z],[s*34,0,0]);}
 }
 // Concentric escape hatches, bolts, grab handles and deck access panels.
 function hatch(name,x,z,r){
 const y=11.57;
 cyl(name+'_Recess',r+.14,r+.14,.07,seam,[x,y,z]);
 cyl(name+'_Rim',r,r,.1,edge,[x,y+.06,z]);
 cyl(name+'_Lid',r*.86,r*.86,.11,hull,[x,y+.14,z]);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(name+'_Bolt_'+i,.055,.055,.045,bronze,[x+Math.cos(a)*r*.91,y+.15,z+Math.sin(a)*r*.91]);}
 line(name+'_Handle',[[x-.25,y+.16,z],[x-.25,y+.4,z],[x+.25,y+.4,z],[x+.25,y+.16,z]],.045,edge);
 }
 hatch('Forward_Escape_Hatch',29,0,.97);hatch('Aft_Escape_Hatch',-15,0,.85);
 for(let j=0;j<6;j++){const x=-5-j*2.9;box('Deck_Access_Recess_'+j,[2.2,.055,1.45],seam,[x,11.57,0]);box('Deck_Access_Lid_'+j,[2.08,.06,1.33],panel,[x,11.61,0]);}
 // Telescoping sensor package.
 function mast(name,x,z,h,r){
 cyl(name+'_Boot',r*1.65,r*1.9,.38,hull,[x,21.73,z]);
 cyl(name+'_Brass_Collar',r*1.5,r*1.5,.16,bronze,[x,21.98,z]);
 cyl(name+'_Stem',r,r,h,edge,[x,22+h/2,z]);
 cyl(name+'_Black_Sleeve',r*1.04,r*1.04,h*.31,hull,[x,22+h*.25,z]);
 return 22+h;
 }
 let y=mast('Search_Periscope',17,0,5.3,.16);
 box('Periscope_Head',[.72,.4,.42],hull,[17.16,y,0]);
 box('Periscope_Lens',[.026,.21,.25],glass,[17.535,y,0]);
 y=mast('Optronic_Mast',13.5,.14,4.15,.25);
 cyl('Optronic_Head',.38,.35,.84,hull,[13.5,y+.24,.14]);
 box('Optronic_Lens',[.025,.32,.3],glass,[13.88,y+.25,.14]);
 y=mast('Radar_Mast',10.2,0,2.5,.22);
 box('Radar_Array',[2.3,.4,.54],panel,[10.2,y+.1,0]);
 mast('Radio_Antenna',8.3,0,4.0,.075);
 // Low-profile bridge hatch.
 cyl('Bridge_Hatch_Rim',.65,.65,.11,seam,[18.3,21.69,0]);
 cyl('Bridge_Hatch',.52,.52,.12,panel,[18.3,21.77,0]);
 // Seven curved, skewed bronze propeller blades, on an aft shaft.
 cyl('Propeller_Shaft',.39,.39,3.8,edge,[-55.25,6.2,0],[0,0,90]);
 sphere('Propeller_Hub',[1.75,.77,.77],bronze,[-57,6.2,0]);
 for(let i=0;i<7;i++){
 const blade=loftProfiles([
 {profile:foil(1.1,.23),frame:{origin:[0,.55,0],rotation:[0,20,0]}},
 {profile:foil(2.5,.19),frame:{origin:[-.3,2,0],rotation:[0,36,0]}},
 {profile:foil(2.2,.13),frame:{origin:[-.75,3.4,0],rotation:[0,53,0]}},
 {profile:foil(.55,.07),frame:{origin:[-1.3,4.1,0],rotation:[0,63,0]}}]);
 add('Skewed_Propeller_Blade_'+i,blade,bronze,[-56.9,6.2,0],[i*360/7,0,0]);
 }
 // Bow sonar boundary and conformal flank sensor fairings.
 add('Sonar_Cap_Seam',new THREE.TorusGeometry(radius(43)+.023,.045,3,Q.hullHalf*2),seam,[43,6.2,0],[0,90,0]);
 for(const s of [-1,1]){
 sphere('Flank_Array_'+s,[13,.37,.12],panel,[8,6.6,s*5.47]);
 for(let j=0;j<5;j++)box('Draft_Marking_'+s+'_'+j,[.5,.1,.03],ivory,[38,6+j*.42,s*(radius(38)-.02-j*.015)]);
 // Small forward torpedo shutter outlines.
 for(const offset of [-.65,.65]){
 const pts=[];for(let i=0;i<=32;i++){const a=i*Math.PI/16;const x=45+2.3*Math.cos(a), yy=6.2+offset+.48*Math.sin(a);const zz=s*Math.sqrt(Math.max(.1,radius(x)*radius(x)-(yy-6.2)*(yy-6.2)));pts.push([x,yy,zz+s*.02]);}line('Bow_Shutter_'+s+'_'+offset,pts,.035,seam);
 }
 }
 // Keep only triangles needed for the visible exterior; budget includes every mesh.
 if(Q.batchStatic){
  root.updateMatrixWorld(true);
  const groups=new Map(), original=[];
  root.traverse(m=>{
   if(!m.isMesh)return;
   original.push(m);
   const rotating=/Skewed_Propeller_Blade|Propeller_Hub/.test(m.name);
   const key=(rotating?'Propeller_':'Static_')+m.material.uuid;
   if(!groups.has(key))groups.set(key,{material:m.material,rotating,positions:[],normals:[],uvs:[],indices:[],names:[]});
   const b=groups.get(key),g=m.geometry.clone().applyMatrix4(m.matrixWorld);
   const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),base=b.positions.length/3;
   for(let i=0;i<p.count;i++){
    b.positions.push(p.getX(i)+(rotating?56.9:0),p.getY(i)-(rotating?6.2:0),p.getZ(i));
    b.normals.push(n.getX(i),n.getY(i),n.getZ(i));
    b.uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);
   }
   if(g.index){for(let i=0;i<g.index.count;i++)b.indices.push(base+g.index.getX(i));}
   else{for(let i=0;i<p.count;i++)b.indices.push(base+i);}
   b.names.push(m.name);
   g.dispose();
  });
  original.forEach(m=>m.parent.remove(m));
  let groupIndex=0;
  groups.forEach(b=>{
   const g=new THREE.BufferGeometry();
   g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));
   g.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));
   g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uvs,2));
   g.setIndex(b.indices);
   const m=add(b.rotating?'Propeller_Assembly':'Static_Material_Batch_'+groupIndex++,g,b.material,b.rotating?[-56.9,6.2,0]:[0,0,0]);
   m.userData.sourceParts=b.names;
  });
 }
 let triangles=0;
 root.traverse(m=>{if(m.isMesh)triangles+=(m.geometry.index?m.geometry.index.count:m.geometry.getAttribute('position').count)/3;});
 if(triangles>=Q.triangleLimit)throw new Error('Game triangle budget exceeded: '+triangles);
 return root;
}