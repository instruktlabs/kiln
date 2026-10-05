// Original Kiln Commons Farm sheep. Metres, +X forward, +Y up, +Z right.
// Matte untextured PBR deliberately preserves broad fleece facets.
// Rigid joints with overlapping rounded covers, no skin deformation.
// Walk: 2 s, duty .76, stride .15 m, implied travel .0986842105 m/s.
const meta = {name:'Sheep', description:'Compact cream faceted sheep; Idle, four-beat Walk and Graze.'};
const LEGS = [
 {id:'FL',x:.32,z:-.155,hind:false,phase:.25},
 {id:'FR',x:.32,z:.155,hind:false,phase:.75},
 {id:'HL',x:-.32,z:-.155,hind:true,phase:0},
 {id:'HR',x:-.32,z:.155,hind:true,phase:.5}
];
const HIP=.45, CLEAR=.003, RAD=180/Math.PI;
function ell(s,p=[0,0,0],w=12,h=8,rz=0) {
 const g=sphereGeo(1,w,h).toNonIndexed(); g.scale(...s); g.rotateZ(rz); g.translate(...p); g.computeVertexNormals(); return g;
}
function merged(gs) {
 const pos=[],norm=[],uv=[];
 for(const gi of gs) {
  const g=gi.index?gi.toNonIndexed():gi;
  pos.push(...g.attributes.position.array); norm.push(...g.attributes.normal.array);
  uv.push(...g.attributes.uv.array);
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 return g;
}
function segment(len,rt,rb) {
 const c=cylinderGeo(rt,rb,len,10).clone();c.translate(0,-len/2,0);
 return merged([c,ell([rt,rt,rt],[0,0,0],10,6),ell([rb,rb,rb],[0,-len,0],10,6)]);
}
function solve(leg,dx=0,lift=0) {
 const l1=leg.hind?.205:.200, l2=leg.hind?.195:.190;
 const ex=dx-(leg.hind?.045:0);
 const ey=(leg.hind?.13:.075)+lift-HIP;
 const d=Math.sqrt(ex*ex+ey*ey);
 const mid=Math.atan2(ex,-ey);
 const a=Math.acos(Math.max(-1,Math.min(1,(l1*l1+d*d-l2*l2)/(2*l1*d))));
 const q1=mid+(leg.hind?1:-1)*a;
 const kx=Math.sin(q1)*l1, ky=-Math.cos(q1)*l1;
 const q2=Math.atan2(ex-kx,-(ey-ky));
 const q3=leg.hind?Math.atan2(.045,.055):0;
 return {l1,l2,q1,q2,q3};
}
function build() {
 const root=createRoot('Sheep_Placement');
 const wool=gameMaterial('#E2D3B3',{roughness:.96,metalness:0});
 const dark=gameMaterial('#30312E',{roughness:.9,metalness:0});
 const hoof=gameMaterial('#242622',{roughness:.86,metalness:0});
 const eye=gameMaterial('#151713',{roughness:.38,metalness:0,flatShading:false});
 const light=gameMaterial('#EAE0C9',{roughness:.8,metalness:0});
 const inner=gameMaterial('#726B60',{roughness:.95,metalness:0});
 createPart('Fleece',merged([
  ell([.55,.285,.315],[0,.535,0],16,10),
  ell([.245,.235,.27],[.30,.55,0],12,8),
  ell([.23,.225,.267],[-.31,.535,0],12,8)
 ]),wool,{parent:root});
 const neck=createPivot('Neck',[.34,.55,0],root);
 createPart('NeckFleece',ell([.29,.17,.205],[.09,.035,0],12,8,.22),wool,{parent:neck});
 const head=createPivot('Head',[.35,.12,0],neck);
 const faceGeometry=merged([
  ell([.17,.17,.132],[.025,.005,0],14,10,-.35),
  ell([.125,.084,.108],[.14,-.091,0],12,8),
  ell([.07,.032,.095],[.175,-.13,0],10,6)
 ]);
 createPart('Forelock',ell([.115,.073,.125],[-.023,.145,0],12,6,-.1),wool,{parent:head});
 const ears=[],earInner=[],eyes=[],glints=[];
 for(const side of [-1,1]){
  ears.push(ell([.098,.034,.17],[-.03,.083,side*.185],10,6,side*.06));
  earInner.push(ell([.065,.012,.11],[-.015,.109,side*.203],8,6));
  eyes.push(ell([.032,.039,.019],[.071,.051,side*.125],12,8));
  glints.push(ell([.009,.012,.005],[.079,.064,side*.142],8,6));
 }
 createPart('Face',merged([faceGeometry,...ears]),dark,{parent:head});
 createPart('EarInner',merged(earInner),inner,{parent:head});
 createPart('Eyes',merged(eyes),eye,{parent:head});
 createPart('EyeGlints',merged(glints),light,{parent:head});
 createPart('Nostrils',merged([-1,1].map(s=>ell([.009,.014,.012],[.248,-.087,s*.048],8,6))),hoof,{parent:head});
 const tail=createPivot('Tail',[-.485,.49,0],root);
 createPart('TailFleece',ell([.115,.07,.068],[-.055,-.052,0],10,6,.65),wool,{parent:tail});
 for(const leg of LEGS){
  const s=solve(leg);
  const hip=createPivot(leg.id+'_Hip',[leg.x,HIP,leg.z],root);hip.rotation.z=s.q1;
  createPart(leg.id+'_Upper',segment(s.l1,.053,.038),dark,{parent:hip});
  const knee=createPivot(leg.id+(leg.hind?'_Stifle':'_Elbow'),[0,-s.l1,0],hip);knee.rotation.z=s.q2-s.q1;
  createPart(leg.id+'_Lower',segment(s.l2,.039,.027),dark,{parent:knee});
  const ankle=createPivot(leg.id+(leg.hind?'_Hock':'_Ankle'),[0,-s.l2,0],knee);ankle.rotation.z=(leg.hind?s.q3:0)-s.q2;
  let footParent=ankle;
  if(leg.hind){
   const len=Math.sqrt(.045*.045+.055*.055);
   createPart(leg.id+'_Pastern',segment(len,.028,.027),dark,{parent:ankle});
   footParent=createPivot(leg.id+'_Foot',[0,-len,0],ankle);footParent.rotation.z=-s.q3;
  } else {
   footParent=createPivot(leg.id+'_Foot',[0,0,0],ankle);
  }
  const c=cylinderGeo(.043,.05,.07,8).clone();c.scale(1.2,1,.9);c.translate(.018,-.037,0);
  createPart(leg.id+'_Hoof',c,hoof,{parent:footParent});
 }
 return root;
}
function footPath(p) {
 p=((p%1)+1)%1;
 const duty=.76,stride=.15;
 if(p<duty)return {x:stride*(.5-p/duty),y:0};
 const u=(p-duty)/(1-duty);
 // Hermite swing matches backward stance speed at both transitions.
 const tangent=-stride*(1-duty)/duty;
 const x=(2*u*u*u-3*u*u+1)*(-stride/2)+(u*u*u-2*u*u+u)*tangent+(-2*u*u*u+3*u*u)*(stride/2)+(u*u*u-u*u)*tangent;
 return {x,y:.060*Math.pow(Math.sin(Math.PI*u),2)};
}
function animate(root) {
 const walk=[];
 for(const leg of LEGS){
  const a=[],b=[],c=[];
  for(let i=0;i<=160;i++){
   const t=i/160, f=footPath(t-leg.phase),s=solve(leg,f.x,f.y);
   a.push({time:2*t,rotation:[0,0,s.q1*RAD]});
   b.push({time:2*t,rotation:[0,0,(s.q2-s.q1)*RAD]});
   c.push({time:2*t,rotation:[0,0,((leg.hind?s.q3:0)-s.q2)*RAD]});
  }
  walk.push(rotationTrack('Joint_'+leg.id+'_Hip',a));
  walk.push(rotationTrack('Joint_'+leg.id+(leg.hind?'_Stifle':'_Elbow'),b));
  walk.push(rotationTrack('Joint_'+leg.id+(leg.hind?'_Hock':'_Ankle'),c));
 }
 const keys=(duration,fn,n=64)=>Array.from({length:n+1},(_,i)=>({time:duration*i/n,rotation:fn(i/n)}));
 walk.push(rotationTrack('Joint_Head',keys(2,p=>[0,0,1.2*Math.sin(2*Math.PI*p)])));
 walk.push(rotationTrack('Joint_Tail',keys(2,p=>[4*Math.sin(2*Math.PI*p),0,0])));
 const idle=[
 rotationTrack('Joint_Head',keys(4,p=>[0,1.5*Math.sin(2*Math.PI*p),.7*Math.sin(4*Math.PI*p)])),
 rotationTrack('Joint_Tail',keys(4,p=>[5*Math.sin(2*Math.PI*p)*Math.pow(Math.sin(Math.PI*p),2),0,0]))
 ];
 const graze=[
 rotationTrack('Joint_Neck',keys(6,p=>{
  const u=p<.3?p/.3:p>.7?(1-p)/.3:1;
  const ease=u*u*u*(u*(u*6-15)+10);
  return [0,0,-60*ease];
 },120)),
 rotationTrack('Joint_Head',keys(6,p=>[0,0,(p>.3&&p<.7)?1.2*Math.pow(Math.sin(Math.PI*(p-.3)/.4),2)*Math.sin(10*Math.PI*p):0],120)),
 rotationTrack('Joint_Tail',keys(6,p=>[3*Math.sin(2*Math.PI*p),0,0]))
 ];
 return [createClip('Idle',4,idle),createClip('Walk',2,walk),createClip('Graze',6,graze)];
}
