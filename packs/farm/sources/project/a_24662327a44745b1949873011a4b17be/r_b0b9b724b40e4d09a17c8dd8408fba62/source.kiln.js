const meta = {name:'Chicken', units:'metres', author:'gpt-6-astra', license:'CC0-1.0', lineage:'Original geometry and rig; no source reused'};
const TAU=Math.PI*2;
function ell(p,s,n=12,m=8) { const g=new THREE.SphereGeometry(1,n,m);g.scale(...s);g.translate(...p);return g; }
function join(gs){const a=[];for(const g of gs){const h=g.index?g.toNonIndexed():g; const p=h.attributes.position.array;for(let i=0;i<p.length;i+=9){const a0=new THREE.Vector3(p[i],p[i+1],p[i+2]),b0=new THREE.Vector3(p[i+3],p[i+4],p[i+5]),c0=new THREE.Vector3(p[i+6],p[i+7],p[i+8]);if(b0.sub(a0).cross(c0.sub(a0)).lengthSq()>1e-24)a.push(...p.slice(i,i+9));}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));g.computeVertexNormals();return g;}
function rod(a,b,r1,r2,n=8){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const g=new THREE.CylinderGeometry(r2,r1,d.length(),n,1,false);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray());return g;}
function group(name,parent,p=[0,0,0]){const g=new THREE.Group();g.name=name;g.position.set(...p);parent.add(g);return g;}
function mesh(name,g,m,parent){return createPart(name,g,m,{parent});}
function legPose(x,y,z,k=[.025,.165,z]){const f=[x,y+.016,z],dx=f[0]-k[0],dy=f[1]-k[1],d=Math.hypot(dx,dy),a=.097,b=.070,c=(a*a-b*b+d*d)/(2*d),h=Math.sqrt(Math.max(0,a*a-c*c));return {k,h:[k[0]+dx*c/d+dy*h/d,k[1]+dy*c/d-dx*h/d,z],f};}
function segState(a,b){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));return {p:a,q:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.clone().normalize()).toArray(),s:[1,v.length(),1]};}
function setSeg(n,a,b){const t=segState(a,b);n.position.set(...t.p);n.quaternion.set(...t.q);n.scale.set(...t.s);}
function curvedNeckGeo(profile,bend){
 const g=new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),12),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const y=p.getY(i);p.setX(i,p.getX(i)+bend*Math.sin(Math.PI*Math.max(0,Math.min(1,y))));}
 return join([g]);
}
function crouchPoint(p,w){const a=-.25*w,c=Math.cos(a),s=Math.sin(a),y=p[1]-.20;return [c*p[0]-s*y,.20-.045*w+s*p[0]+c*y,p[2]];}
function build(){
 const placement=createRoot('Chicken_Placement');const root=group('RigOrigin',placement,[-.016,0,0]);const body=group('BodyPivot',root);
 const cream=gameMaterial(0xe5d9bc,{roughness:.88,metalness:0}),red=gameMaterial(0xb84432,{roughness:.87,metalness:0}),yellow=gameMaterial(0xcba14f,{roughness:.84,metalness:0}),dark=gameMaterial(0x30332e,{roughness:.7,metalness:0});
 const gs=[ell([-.035,.24,0],[.164,.126,.11],18,12),ell([.045,.261,0],[.095,.11,.092],14,10)];
 for(const z of [-1,1]){
  const w=ell([-.051,.249,z*.083],[.118,.073,.030],12,8);w.translate(.05,-.25,0);w.rotateZ(.20);w.translate(-.05,.25,0);gs.push(w);
  gs.push(ell([-.15,.312,z*.021],[.067,.047,.041],10,6));
  const tail=ell([0,0,0],[.090,.038,.033],10,6);tail.rotateZ(-.8);tail.translate(-.203,.335,z*.021);gs.push(tail);
  gs.push(ell([.003,.181,z*.053],[.034,.053,.035],10,8));
 }
 mesh('Body_Wings_Tail_ThighPlumage',join(gs),cream,body);
 const neckA=group('NeckBasePivot',root), neckB=group('NeckUpperPivot',root);
 mesh('NeckLower',curvedNeckGeo([[0,-.45],[.040,-.3],[.065,0],[.059,.3],[.050,.65],[.043,1],[.025,1.3],[0,1.45]],.009),cream,neckA);
 mesh('NeckUpper',curvedNeckGeo([[0,-.40],[.028,-.25],[.042,0],[.040,.25],[.033,.55],[.028,.85],[.026,1],[.018,1.25],[0,1.4]],-.015),cream,neckB);
 setSeg(neckA,[.052,.265,0],[.088,.333,0]);setSeg(neckB,[.088,.318,0],[.115,.375,0]);
 const head=group('HeadPivot',root,[.115,.375,0]);
 mesh('Head',join([ell([0,0,0],[.049,.050,.044],14,10),...[-1,1].map(s=>ell([.020,.013,s*.044],[.002,.002,.001],6,4))]),cream,head);
 const beak=new THREE.ConeGeometry(.022,.054,4,1,false);beak.rotateZ(-Math.PI/2);beak.rotateX(Math.PI/4);beak.translate(.061,-.006,0);mesh('Beak',beak,yellow,head);
 const reds=[ell([.022,-.045,0],[.015,.026,.013],8,6),ell([-.015,.046,0],[.033,.013,.010],10,6)];
 for(const [x,y,r] of [[-.034,.056,.016],[-.011,.065,.019],[.013,.059,.016]])reds.push(ell([x,y,0],[r,r,.009],8,6));
 mesh('Comb_Wattle',join(reds),red,head);
 mesh('Eyes',join([-1,1].map(s=>ell([.018,.010,s*.040],[.0085,.009,.0045],10,8))),dark,head);
 for(const [side,z] of [['Left',-.054],['Right',.054]]){
  const lp=group('Leg_'+side,root), shin=group('Shin_'+side,lp),tars=group('Hock_'+side,lp),foot=group('Foot_'+side,root,[0,0,z]);
  mesh('Shin_'+side,join([new THREE.CylinderGeometry(.012,.014,1,8,1,false).translate(0,.5,0)]),yellow,shin);
  mesh('Tarsus_'+side,join([new THREE.CylinderGeometry(.010,.012,1,8,1,false).translate(0,.5,0),ell([0,0,0],[.013,.18,.013],8,6)]),yellow,tars);
  const toes=[ell([.004,.012,0],[.020,.012,.018],10,6)];
  for(const zz of [-.022,0,.022]){const a=[.005,.007,zz*.24],b=[.063-(Math.abs(zz)>.01?.010:0),.006,zz];toes.push(rod(a,b,.007,.0045,8),ell(b,[.006,.006,.005],8,6));}
  toes.push(rod([-.003,.008,0],[-.031,.006,-.012],.007,.0045,8),ell([-.031,.006,-.012],[.006,.006,.005],8,6));
  mesh('FootSolid_'+side,join(toes),yellow,foot);
  const p=legPose(0,0,z);setSeg(shin,p.k,p.h);setSeg(tars,p.h,p.f);
 }
 root.userData={conventions:{forward:'+X',up:'+Y',right:'+Z',root:'Fixed origin on ground; locomotion applied externally',walk:{duration:1.6,dutyFactor:.62,leftPhase:0,rightPhase:.5,impliedSpeed:.060/(.62*1.6),stride:.060/.62},sourceLineage:'Original; no reused geometry or rig'}};
 placement.userData=root.userData;return placement;
}
function animate(root){
 function make(name,duration,pose){
  const states={},N=120;
  function push(n,t,p,q,s){if(!states[n])states[n]={t:[],p:[],q:[],s:[]};const o=states[n];o.t.push(t);o.p.push(...p);o.q.push(...q);o.s.push(...s);}
  for(let i=0;i<=N;i++){const u=i/N,t=u*duration;const data=pose(u);
   for(const [n,v] of Object.entries(data))push(n,t,v.p,v.q||[0,0,0,1],v.s||[1,1,1]);
  }
  const tracks=[];for(const [n,v] of Object.entries(states)){tracks.push(new THREE.VectorKeyframeTrack(n+'.position',v.t,v.p),new THREE.QuaternionKeyframeTrack(n+'.quaternion',v.t,v.q),new THREE.VectorKeyframeTrack(n+'.scale',v.t,v.s));}
  return createClip(name,duration,tracks);
 }
 function pose(u,mode){
  const data={}, qz=a=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),a).toArray();
  let h=[.115,.375,0], mid=[.088,.333,0],angle=0;
  const w=mode==='Peck'?Math.pow(Math.sin(Math.PI*u),4):0;
  if(mode==='Peck'){h=[.115+.045*w,.375-.300*w,0];mid=[.088+.062*w,.333-.176*w,0];angle=-.90*w;}
  if(mode==='Idle'){h=[.115+.002*Math.sin(TAU*u),.375+.002*(1-Math.cos(TAU*u)),0];angle=.025*Math.sin(TAU*u);}
  if(mode==='Walk'){h=[.115+.006*Math.sin(TAU*2*u),.375+.004*(1-Math.cos(TAU*2*u)),0];}
  data.HeadPivot={p:h,q:qz(angle)};data.NeckBasePivot=segState(crouchPoint([.052,.265,0],w),mid);
  const upperStart=[mid[0]-.004,mid[1]-.012,0];data.NeckUpperPivot=segState(upperStart,h);
  for(const [side,z,phase] of [['Left',-.054,0],['Right',.054,.5]]){
   let x=0,y=0;
   if(mode==='Walk'){const p=(u+phase)%1,duty=.62,A=.030;
    if(p<duty)x=A-2*A*p/duty;
    else {const s=(p-duty)/(1-duty);x=-A+2*A*s-A/(Math.PI*duty)*Math.sin(TAU*s);y=.025*Math.pow(Math.sin(Math.PI*s),2);}
   }
   const p=legPose(x,y,z,crouchPoint([.025,.165,z],w));data['Shin_'+side]=segState(p.k,p.h);data['Hock_'+side]=segState(p.h,p.f);data['Foot_'+side]={p:[x,y,z]};
  }
  data.BodyPivot={p:mode==='Peck'?crouchPoint([0,0,0],w):[0,0,mode==='Walk'?-.008*Math.sin(TAU*u):0],q:qz(-.25*w)};
  return data;
 }
 return [make('Idle',3.2,u=>pose(u,'Idle')),make('Walk',1.6,u=>pose(u,'Walk')),make('Peck',2.8,u=>pose(u,'Peck'))];
}