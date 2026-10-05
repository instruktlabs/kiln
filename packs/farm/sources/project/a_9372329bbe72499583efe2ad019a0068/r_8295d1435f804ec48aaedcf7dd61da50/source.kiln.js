const meta = {name:'Buttercup • faceted farm cow', author:'gpt-6-astra / codex', requestedEffort:'High', walk:{durationSeconds:2,forwardAxis:'+X',nominalSpeedMetresPerSecond:.18,strideMetres:.36,inPlace:true}};
function build(){
 const root=createRoot('Cow');
 const cream=gameMaterial(0xE2D3B3,{roughness:.92});
 const brown=gameMaterial(0x865936,{roughness:.94});
 const darkBrown=gameMaterial(0x513820,{roughness:.96});
 const hoof=gameMaterial(0x30312E,{roughness:.9});
 const pink=gameMaterial(0xD7977F,{roughness:.87});
 const nostril=gameMaterial(0x754B3D,{roughness:.95});
 const horn=gameMaterial(0xE7C998,{roughness:.86});
 const eye=gameMaterial(0x242722,{roughness:.36});
 const glint=gameMaterial(0xFFF3D7,{roughness:.4});
 for(const mat of [cream,brown,darkBrown,hoof,pink,nostril,horn,eye,glint])mat.color.convertSRGBToLinear();
 // Closed authored ring topology. A section is [axis,centerA,centerB,radiusA,radiusB].
 // Broad patches are material regions of the same surface, never floating overlays.
 function skin(name,rings,axis,n,mats,choose,parent,phase=0,power=1){
   const verts=[]; const bins=mats.map(()=>[]);
   const signpow=v=>Math.sign(v)*Math.pow(Math.abs(v),power);
   for(let i=0;i<rings.length;i++){
    const r=rings[i];
    for(let j=0;j<n;j++){
     const a=2*Math.PI*j/n+phase+(name==='Torso'?.055*Math.sin(i*2.1):0);
     const u=r[1]+r[3]*signpow(Math.cos(a)),v=r[2]+r[4]*signpow(Math.sin(a));
     verts.push(axis==='x'?[r[0],u,v]:[u,r[0],v]);
    }
   }
   function tri(a,b,c,region){
    const p=verts[a],q=verts[b],r=verts[c];
    const mid=p.map((v,k)=>(v+q[k]+r[k])/3);
    const id=region===undefined?(choose?choose(mid):0):region;
    bins[id].push(...p,...q,...r);
   }
   for(let i=0;i<rings.length-1;i++) for(let j=0;j<n;j++){
    const a=i*n+j,b=(i+1)*n+j,c=(i+1)*n+(j+1)%n,d=i*n+(j+1)%n;
    const quadCenter=verts[a].map((v,k)=>(v+verts[b][k]+verts[c][k]+verts[d][k])/4);
    const region=name==='Torso'&&choose?choose(quadCenter):undefined;
    if(axis==='x'){tri(a,c,b,region);tri(a,d,c,region);}else{tri(a,b,c,region);tri(a,c,d,region);}
   }
   for(const end of [0,rings.length-1]){
    const r=rings[end],idx=verts.length;
    verts.push(axis==='x'?[r[0],r[1],r[2]]:[r[1],r[0],r[2]]);
    for(let j=0;j<n;j++){
     const a=end*n+j,b=end*n+(j+1)%n;
     if((axis==='x')===(end===0))tri(idx,b,a);else tri(idx,a,b);
    }
   }
   const positions=[]; for(const b of bins)positions.push(...b);
   const geo=meshGeo({positions}); let offset=0;
   bins.forEach((b,i)=>{if(b.length)geo.addGroup(offset,b.length/3,i);offset+=b.length/3;});
   const part=createPart(name,geo,mats[0],{parent}); part.material=mats; return part;
 }
 function oval(name,pos,scale,mat,parent,rot=[0,0,0],seg=12){
   return createPart(name,sphereGeo(1,seg,8),mat,{position:pos,scale,rotation:rot,parent});
 }
 const bodyR=[
 [-.82,.89,0,.25,.26],[-.73,.89,0,.39,.37],[-.53,.895,0,.425,.435],
 [-.29,.895,0,.43,.455],[-.05,.89,0,.43,.46],[.17,.90,0,.42,.44],
 [.37,.92,0,.39,.41],[.55,.935,0,.365,.365],[.66,.95,0,.27,.25]];
 function coat(p){
  const x=p[0],y=p[1],z=p[2];
  if(x>.07+.13*(1.0-y)+.025*Math.sin(z*8)&&y>.61)return 1;
  if(x<-.23&&x>-.77&&y>.94-.12*(x+.3))return 1;
  if(Math.pow((x+.40)/.265,2)+Math.pow((y-.665)/.185,2)<1)return 1;
  return 0;
 }
 skin('Torso',bodyR,'x',16,[cream,brown],coat,root);
 // Neck overlaps the shoulder within its silhouette; the head rotates about the poll/neck root.
 const neck=createPivot('Neck',[.52,1.03,0],root);
 skin('NeckMass',[[.40,.97,0,.25,.27],[.56,1.04,0,.29,.27],[.72,1.12,0,.23,.235]],'x',12,[cream,brown],p=>p[1]<.86?0:1,root);
 const head=createPivot('Head',[.13,.17,0],neck);
 const headR=[
 [.79,.43,0,.17,.175],[.89,.38,0,.24,.225],[1.05,.28,0,.245,.245],
 [1.23,.20,0,.215,.24],[1.38,.14,0,.16,.20],[1.43,.12,0,.10,.14]];
 const localHead=headR.map(r=>[r[0]-1.20,r[1],r[2],r[3],r[4]]);
 skin('HeadAndJaw',localHead,'y',16,[cream,brown],p=>{
  const worldY=p[1]+1.20;
  return (p[0]>.25&&Math.abs(p[2])<.087)||(worldY<.86)?0:1;
 },head);
 // Broad beveled muzzle, rounded rectangle rather than a small spherical nose.
 skin('Muzzle',[[.44,-.33,0,.095,.20],[.57,-.33,0,.13,.235],[.68,-.33,0,.10,.205]],'x',12,[pink],null,head,Math.PI/12,.48);
 for(const s of [-1,1]){
  oval('Nostril'+s,[.683,-.315,s*.112],[.009,.035,.029],nostril,head,[0,0,-10*s],8);
  oval('EyeSocket'+s,[.348,.037,s*.204],[.052,.072,.032],darkBrown,head,[0,s*42,0]);
  oval('Eye'+s,[.371,.04,s*.217],[.039,.055,.024],eye,head,[0,s*42,0]);
  oval('EyeCatchlight'+s,[.392,.060,s*.217],[.013,.016,.009],glint,head,[0,s*42,0],8);
  // Thick leaf ears, tapered from a securely embedded root to a drooping tip.
  const ear=createPivot('Ear'+s,[.08,.16,s*.17],head);
  const ev=[
   [0,0,0],[.035,.065,s*.12],[.025,.035,s*.28],[-.01,-.065,s*.37],
   [.015,-.15,s*.25],[.01,-.115,s*.10],[.070,-.04,s*.18],[-.035,-.045,s*.18]];
  const inds=[0,1,6,1,2,6,2,3,6,3,4,6,4,5,6,5,0,6,1,0,7,2,1,7,3,2,7,4,3,7,5,4,7,0,5,7];
  const eg=meshGeo({positions:ev.flat(),indices:s===-1?inds:inds.reduce((a,v,i,ar)=>i%3===0?a.concat(ar[i],ar[i+2],ar[i+1]):a,[])});
  createPart('EarLeaf'+s,eg,brown,{parent:ear});
  // Curved cream horns rise and turn slightly inward.
  const prof=Array.from({length:7},(_,i)=>[.064*Math.cos(i*2*Math.PI/7),.064*Math.sin(i*2*Math.PI/7)]);
  createPart('Horn'+s,sweepProfile(prof,[[.105,.19,s*.17],[.08,.28,s*.245],[.07,.38,s*.25],[.09,.49,s*.225]],{scale:[[1.2,1.2],[.95,.95],[.58,.58],[.12,.12]],up:[1,0,0]}),horn,{parent:head});
 }
 // Forelegs retain their original chain. Hindlegs represent femur, tibia,
 // and metatarsal/pastern with a high stifle and a backward hock.
 for(const front of [true,false])for(const s of [-1,1]){
  const name=(front?'Fore':'Hind')+(s===1?'Right':'Left');
  const x=front?.43:-.65,z=s*(front?.205:.235);
  const joint=createPivot(name+'Root',[x,front?.81:.86,z],root);
  let ankle;
  if(front){
   skin(name+'Upper',[[.055,0,0,.092,.088],[-.13,.003,0,.108,.095],[-.37,.009,0,.087,.080],[-.445,.01,0,.075,.073],[-.49,.01,0,.032,.032]].reverse(),'y',8,[cream,brown],p=>0,joint,Math.PI/8,.85);
   const knee=createPivot(name+'Knee',[.01,-.43,0],joint);
   skin(name+'Shank',[[-.255,.012,0,.065,.065],[-.11,0,0,.073,.074],[0,0,0,.080,.078],[.055,0,0,.055,.053],[.078,0,0,.015,.015]],'y',8,[cream],null,knee,Math.PI/8,.85);
   ankle=createPivot(name+'Ankle',[.012,-.23,0],knee);
  }else{
   skin(name+'Thigh',[[-.19,.07125,0,.100,.088],[-.08,.030,0,.130,.105],[.025,-.0094,0,.145,.120]],'y',8,[cream],null,joint,Math.PI/8,.85);
   const stifle=createPivot(name+'Stifle',[.060,-.16,0],joint);
   skin(name+'Tibia',[[-.375,-.070,0,.025,.025],[-.325,-.070,0,.065,.065],[-.28,-.065,0,.078,.072],[-.15,-.0339,0,.090,.079],[.025,.00565,0,.108,.090]],'y',8,[cream],null,stifle,Math.PI/8,.85);
   const hock=createPivot(name+'Hock',[-.070,-.31,0],stifle);
   skin(name+'Metatarsal',[[-.265,.057,0,.064,.065],[-.11,.026,0,.072,.071],[0,0,0,.076,.072],[.05,0,0,.054,.051],[.073,0,0,.015,.015]],'y',8,[cream],null,hock,Math.PI/8,.85);
   ankle=createPivot(name+'Ankle',[.057,-.24,0],hock);
  }
  // Rounded cream pastern fills the rotating hoof socket without changing its sole.
  oval(name+'PasternBlend',[0,.015,0],[.070,.065,.070],cream,ankle,[0,0,0],8);
  skin(name+'Hoof',[[-.15,.014,0,.102,.095],[-.02,.004,0,.081,.08],[.012,0,0,.077,.079]],'y',8,[hoof],null,ankle,Math.PI/8,.45);
 }
 oval('Udder',[-.43,.525,0],[.23,.16,.215],pink,root,[0,0,0],12);
 for(const x of [-.53,-.34])for(const z of [-.105,.105]){
  skin('Teat'+x+'_'+z,[[.305,x+.01,z,.023,.023],[.39,x,z,.03,.031],[.435,x,z,.032,.032]],'y',7,[pink],null,root);
 }
 const tail=createPivot('TailAttachment',[-.765,1.12,0],root);
 const profile=Array.from({length:7},(_,i)=>[.028*Math.cos(i*2*Math.PI/7),.028*Math.sin(i*2*Math.PI/7)]);
 createPart('TailStem',sweepProfile(profile,[[0,0,0],[-.095,-.16,.03],[-.14,-.37,.055],[-.22,-.56,.065]],{scale:[[1,1],[.85,.85],[.7,.7],[.75,.75]],up:[0,0,1]}),cream,{parent:tail});
 oval('TailTuft',[-.24,-.64,.065],[.075,.14,.07],darkBrown,tail,[0,0,-18],7);
 for(const child of root.children)child.position.x+=.0615;
 root.scale.x=.92;
 // Identity at rest; Walk settles the body while preserving the placement root.
 const gaitBody=createPivot('GaitBody',[0,0,0],root);
 for(const child of root.children.slice())if(child!==gaitBody)gaitBody.add(child);
 return root;
}
function animate(){
 const track=(name,keys)=>rotationTrack('Joint_'+name,keys.map(k=>({time:k[0],rotation:[0,0,k[1]]})));
 
 // Calm four-beat walk: 2 s, +X, 0.18 m/s, 0.36 m stride.
 // Lift uses sin^4 so velocity and acceleration approach zero at foot contact.
 const duration=2,duty=.75,speed=.18,count=400;
 const bodyY=p=>-.035-.0015*(1+Math.cos(8*Math.PI*p));
 const walkTracks=[],bodyKeys=[],headKeys=[],neckKeys=[];
 for(let i=0;i<=count;i++){
  const p=i===count?0:i/count,time=i*duration/count;
  bodyKeys.push({time,position:[0,bodyY(p),0]});
  headKeys.push({time,rotation:[0,0,.8*Math.sin(4*Math.PI*p)]});
  neckKeys.push({time,rotation:[0,0,-.35*Math.sin(4*Math.PI*p)]});
 }
 walkTracks.push(positionTrack('Joint_GaitBody',bodyKeys),
  rotationTrack('Joint_Head',headKeys),rotationTrack('Joint_Neck',neckKeys));
 for(const leg of [
  {name:'HindLeft',front:false,offset:0},
  {name:'ForeLeft',front:true,offset:.25},
  {name:'HindRight',front:false,offset:.5},
  {name:'ForeRight',front:true,offset:.75}]){
  const bx=leg.front?.01:-.070,by=leg.front?-.43:-.31;
  const cx=leg.front?.012:.057,cy=leg.front?-.23:-.24;
  const l1=Math.hypot(bx,by),l2=Math.hypot(cx,cy);
  const base1=Math.atan2(by,bx),base2=Math.atan2(cy,cx);
  const keys=leg.front?[[],[],[]]:[[],[],[],[]];
  const stanceTravel=speed*duration*duty/.92;
  for(let i=0;i<=count;i++){
   const time=i*duration/count,cyclePhase=i===count?0:i/count;
   const p=(cyclePhase-leg.offset+1)%1;
   let dx=stanceTravel*(.5-p/duty),lift=0,pitch=0,shape=0;
   if(p>duty){
    const u=(p-duty)/(1-duty),S=u*u*u*(10+u*(-15+6*u));
    const endSlope=-speed*duration*(1-duty)/.92;
    dx=-stanceTravel/2+(stanceTravel-endSlope)*S+endSlope*u;
    shape=Math.pow(Math.sin(Math.PI*u),4);
    lift=.06*shape;pitch=8*Math.PI/180*shape;
   }
   let minY=Infinity;
   for(let j=0;j<8;j++){
    const c=Math.cos(2*Math.PI*j/8+Math.PI/8);
    const vx=.014+.102*Math.sign(c)*Math.pow(Math.abs(c),.45);
    minY=Math.min(minY,vx*Math.sin(pitch)-.15*Math.cos(pitch));
   }
   let targetX=(leg.front?.022:.047)+dx+.014-(.014*Math.cos(pitch)+.15*Math.sin(pitch));
   let targetY=lift-minY-((leg.front?.81:.86)+bodyY(cyclePhase));
   let thigh=0;
   if(!leg.front){
    thigh=.12*dx/(stanceTravel/2)+.035*shape;
    targetX-=.060*Math.cos(thigh)+.16*Math.sin(thigh);
    targetY-=.060*Math.sin(thigh)-.16*Math.cos(thigh);
   }
   const cosB=(targetX*targetX+targetY*targetY-l1*l1-l2*l2)/(2*l1*l2);
   if(cosB>1||cosB< -1)throw new Error('Walk IK target unreachable');
   const bend=(leg.front?-1:1)*Math.acos(cosB);
   const a1=Math.atan2(targetY,targetX)-Math.atan2(l2*Math.sin(bend),l1+l2*Math.cos(bend));
   const first=a1-base1,second=bend+base1-base2;
   const angles=leg.front?[first,second,pitch-first-second]:[thigh,first-thigh,second,pitch-first-second];
   angles.forEach((a,k)=>keys[k].push({time,rotation:[0,0,a*180/Math.PI]}));
  }
  const suffixes=leg.front?['Root','Knee','Ankle']:['Root','Stifle','Hock','Ankle'];
  suffixes.forEach((suffix,k)=>walkTracks.push(rotationTrack('Joint_'+leg.name+suffix,keys[k])));
 }
 const walk=createClip('Walk',duration,walkTracks);

 return [walk,createClip('ArticulationProbe',4,[
 track('Neck',[[0,0],[.45,0],[1,-13],[1.45,0],[4,0]]),
 track('Head',[[0,0],[.45,0],[1,-7],[1.45,0],[4,0]]),
 track('ForeRightRoot',[[0,0],[1.8,0],[2.6,20],[3.25,0],[4,0]]),
 track('ForeRightKnee',[[0,0],[1.8,0],[2.6,-36],[3.25,0],[4,0]]),
 track('ForeRightAnkle',[[0,0],[1.8,0],[2.6,12],[3.25,0],[4,0]])
 ])];
}