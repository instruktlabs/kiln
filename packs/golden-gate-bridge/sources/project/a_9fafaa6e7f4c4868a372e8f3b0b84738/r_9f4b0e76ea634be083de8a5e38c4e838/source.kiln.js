// Golden Gate Bridge | original procedural geometry | CC0
const meta = { name: 'Golden Gate Bridge', role: 'wonder' };
const D = { halfMain:640.08, end:982.98, stub:1032.98, cableX:13.716, tower:227.3808, sag:143.256, pitch:15.24, truss:7.62 };
function road(z) { const a=Math.abs(z); return a<=D.halfMain ? 74.9808+.3192*(1-(a/D.halfMain)**2) : 74.9808-(Math.min(a,D.end)-D.halfMain)*12.9808/(D.end-D.halfMain); }
function cableY(z) {
 const a=Math.abs(z),q=a-D.halfMain;
 function base(v){if(v<=D.halfMain)return D.tower-D.sag+D.sag*(v/D.halfMain)**2;const t=(v-D.halfMain)/(D.end-D.halfMain);return D.tower+(64-D.tower)*t-24*t*(1-t);}
 if(Math.abs(q)>=5)return base(a);
 const edge=D.halfMain+(q<0?-5:5),t=1-Math.abs(q)/5,y0=base(edge),m=(base(edge+.01)-base(edge-.01))/.02*(q<0?5:-5);
 return (2*t*t*t-3*t*t+1)*y0+(t*t*t-2*t*t+t)*m+(-2*t*t*t+3*t*t)*D.tower;
}
function group(name,parent,pos=[0,0,0]) { const g=new THREE.Group();g.name=name;g.position.set(...pos);parent.add(g);return g; }
function chamfer(w,h,d,b=.05) {
 b=Math.min(b,w*.2,h*.2,d*.2); const A=[w/2,h/2,d/2],B=A.map(v=>v-b),P=[],N=[],U=[],I=[];
 function face(vs) { let a=new THREE.Vector3(...vs[0]), bb=new THREE.Vector3(...vs[1]),c=new THREE.Vector3(...vs[2]);let n=bb.clone().sub(a).cross(c.clone().sub(a)).normalize();let mid=new THREE.Vector3();vs.forEach(v=>mid.add(new THREE.Vector3(...v)));if(n.dot(mid)<0){vs.reverse();n.negate();}const off=P.length/3;for(const v of vs){P.push(...v);N.push(n.x,n.y,n.z);const ax=Math.abs(n.x),ay=Math.abs(n.y);if(ay>=ax&&ay>=Math.abs(n.z))U.push(v[0],v[2]);else if(ax>=Math.abs(n.z))U.push(v[2],v[1]);else U.push(v[0],v[1]);}for(let j=1;j<vs.length-1;j++)I.push(off,off+j,off+j+1); }
 for(let axis=0;axis<3;axis++)for(const s of [-1,1]){const u=(axis+1)%3,v=(axis+2)%3;face([[-1,-1],[1,-1],[1,1],[-1,1]].map(q=>{const p=[0,0,0];p[axis]=s*A[axis];p[u]=q[0]*B[u];p[v]=q[1]*B[v];return p;}));}
 for(let ax=0;ax<3;ax++){const u=(ax+1)%3,v=(ax+2)%3;for(const s of [-1,1])for(const t of [-1,1])face([[-1,0],[-1,1],[1,1],[1,0]].map(q=>{const p=[0,0,0];p[ax]=q[0]*B[ax];p[u]=s*(q[1]?B[u]:A[u]);p[v]=t*(q[1]?A[v]:B[v]);return p;}));}
 for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])face([[x*A[0],y*B[1],z*B[2]],[x*B[0],y*A[1],z*B[2]],[x*B[0],y*B[1],z*A[2]]]);
 return meshGeo({positions:P,normals:N,uvs:U,indices:I});
}
function merge(items) {
 const p=[],n=[],u=[],idx=[];const v=new THREE.Vector3(),nn=new THREE.Vector3();
 for(const item of items){const g=item.g;const mat=new THREE.Matrix4().compose(new THREE.Vector3(...(item.p||[0,0,0])),item.q||new THREE.Quaternion(),new THREE.Vector3(...(item.s||[1,1,1])));const nm=new THREE.Matrix3().getNormalMatrix(mat);const po=g.attributes.position,no=g.attributes.normal,uv=g.attributes.uv,off=p.length/3;
 for(let i=0;i<po.count;i++){v.fromBufferAttribute(po,i).applyMatrix4(mat);p.push(v.x,v.y,v.z);nn.fromBufferAttribute(no,i).applyMatrix3(nm).normalize();n.push(nn.x,nn.y,nn.z);u.push(uv?uv.getX(i):0,uv?uv.getY(i):0);}
 if(g.index)for(let i=0;i<g.index.count;i++)idx.push(off+g.index.getX(i));else for(let i=0;i<po.count;i++)idx.push(off+i);
 }return meshGeo({positions:p,normals:n,uvs:u,indices:idx});
}
function solid(name,g,mat,parent,p=[0,0,0],s=[1,1,1]){return createPart(name,g,mat,{parent,position:p,scale:s});}
function segmentItem(g,a,b,scale=[1,1]) {const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);return {g,p:av.add(bv).multiplyScalar(.5).toArray(),q:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()),s:[scale[0],delta.length(),scale[1]]};}
function walkShift(z){const a=Math.abs(Math.abs(z)-D.halfMain);return a<10.5?8.6:a<26?8.6*(26-a)/15.5:0;}
function roadSolid(x0,x1,z0,z1,topOffset,thick,steps=32,walkSide=0) {
 const zs=[];if(walkSide){for(let k=0;k<=96;k++)zs.push(z0+(z1-z0)*k/96);for(const s of [-1,1])for(const v of [-26,-10.5,0,10.5,26])zs.push(s*D.halfMain+v);zs.sort((a,b)=>a-b);steps=zs.length-1;}const P=[],I=[],U=[];for(let i=0;i<=steps;i++){const z=walkSide?zs[i]:z0+(z1-z0)*i/steps,y=road(z)+topOffset;const shift=walkSide*walkShift(z);P.push(x0+shift,y,z,x1+shift,y,z,x0+shift,y-thick,z,x1+shift,y-thick,z);U.push(x0,z,x1,z,x0,z,x1,z);}
 for(let i=0;i<steps;i++){const a=4*i,b=a+4;I.push(a,b,a+1,a+1,b,b+1,a+2,a+3,b+2,a+3,b+3,b+2,a,a+2,b,a+2,b+2,b,a+1,b+1,a+3,a+3,b+1,b+3);}
 I.push(0,1,2,1,3,2);const k=steps*4;I.push(k,k+2,k+1,k+1,k+2,k+3);return meshGeo({positions:P,indices:I,uvs:U});
}
function ellipseRing(rx,rz,wall,y0,y1,count=96) {
 const P=[],I=[],U=[];for(let j=0;j<count;j++){const t=j/count*2*Math.PI,c=Math.cos(t),s=Math.sin(t);P.push(rx*c,y0,rz*s,rx*c,y1,rz*s,(rx-wall)*c,y1,(rz-wall)*s,(rx-wall)*c,y0,(rz-wall)*s);U.push(j/count,0,j/count,1,j/count,1,j/count,0);}
 for(let j=0;j<count;j++){let a=4*j,b=4*((j+1)%count);for(let k=0;k<4;k++){const l=(k+1)%4;I.push(a+k,b+k,a+l,a+l,b+k,b+l);}}return meshGeo({positions:P,indices:I,uvs:U});
}
function recessPanel(w,h) {
 const P=[],I=[],N=[],U=[];
 const out=[[-w/2,-h/2,.15],[w/2,-h/2,.15],[w/2,h/2,.15],[-w/2,h/2,.15]];
 const inn=[[-w/2+.16,-h/2+.22,-.025],[w/2-.16,-h/2+.22,-.025],[w/2-.16,h/2-.22,-.025],[-w/2+.16,h/2-.22,-.025]];
 const back=out.map(p=>[p[0],p[1],-.16]);
 function f(v){let a=new THREE.Vector3(...v[0]),b=new THREE.Vector3(...v[1]),c=new THREE.Vector3(...v[2]),n=b.sub(a).cross(c.sub(a)).normalize(),o=P.length/3;for(const p of v){P.push(...p);N.push(n.x,n.y,n.z);U.push(p[0],p[1]);}I.push(o,o+1,o+2,o,o+2,o+3);}
 for(let j=0;j<4;j++){let k=(j+1)%4;f([out[j],out[k],inn[k],inn[j]]);f([out[k],out[j],back[j],back[k]]);}
 f(inn);f([back[3],back[2],back[1],back[0]]);return meshGeo({positions:P,normals:N,uvs:U,indices:I});
}
function cappedCable(path,count,radius,sides){
 const tube=new THREE.TubeGeometry(path,count,radius,sides,false),po=tube.attributes.position,P=[],N=[],U=[],I=[];
 for(const end of [0,1]){const normal=path.getTangentAt(end).multiplyScalar(end?1:-1),center=path.getPointAt(end),base=P.length/3;P.push(...center.toArray());N.push(...normal.toArray());U.push(.5,.5);const ring=end?count*(sides+1):0;
 for(let k=0;k<sides;k++){P.push(po.getX(ring+k),po.getY(ring+k),po.getZ(ring+k));N.push(...normal.toArray());U.push(.5+.5*Math.cos(k/sides*2*Math.PI),.5+.5*Math.sin(k/sides*2*Math.PI));}
 for(let k=0;k<sides;k++){const a=base+1+k,b=base+1+(k+1)%sides,va=new THREE.Vector3(P[a*3],P[a*3+1],P[a*3+2]).sub(center),vb=new THREE.Vector3(P[b*3],P[b*3+1],P[b*3+2]).sub(center);if(va.cross(vb).dot(normal)>0)I.push(base,a,b);else I.push(base,b,a);}
 }return merge([{g:tube},{g:meshGeo({positions:P,normals:N,uvs:U,indices:I})}]);
}
function build() {
 const root=createRoot('GoldenGateBridge');
 const paintMap=proceduralTexture({schemaVersion:2,size:256,usage:'albedo',name:'CC0_InternationalOrange_EvenWeathering',layers:[{op:'noise',colorA:0x6a1d12,colorB:0x7a2417,scale:4,octaves:3,seed:1937},{op:'noise',colorA:0xe5e0d8,colorB:0xffffff,scale:64,octaves:2,seed:470,blend:'multiply',opacity:.10}]});
 const paint=pbrMaterial({albedo:paintMap,roughness:.60,metalness:0});
 const inset=gameMaterial(0x7c2119,{roughness:.52,metalness:0,flatShading:false});
 const concreteMap=proceduralTexture({schemaVersion:2,size:256,usage:'albedo',name:'CC0_Concrete_MineralVariation',layers:[{op:'noise',colorA:0x69645a,colorB:0x6c675d,scale:11,octaves:4,seed:1933},{op:'noise',colorA:0xbab6af,colorB:0xffffff,scale:80,octaves:2,seed:744,blend:'multiply',opacity:.06}]});
 const concrete=pbrMaterial({albedo:concreteMap,roughness:.9,metalness:0});
 const asphaltMap=proceduralTexture({schemaVersion:2,size:256,usage:'albedo',name:'CC0_Asphalt_Aggregate',layers:[{op:'noise',colorA:0x07090a,colorB:0x131619,scale:96,octaves:3,seed:1986}]});
 const asphalt=pbrMaterial({albedo:asphaltMap,normal:normalMapFromHeight(asphaltMap,{strength:.60,name:'CC0_Asphalt_Normal'}),roughness:.97,metalness:0});
 const ivory=gameMaterial(0xb9b6ab,{roughness:.83,metalness:0});
 const glass=gameMaterial(0xe9c68c,{roughness:.22,metalness:0,emissive:0xffbd62,emissiveIntensity:.45});
 const red=gameMaterial(0xba1712,{roughness:.18,metalness:0,emissive:0xff1505,emissiveIntensity:.8});
 const dark=gameMaterial(0x171612,{roughness:.9,metalness:0});
 const mats={paint,inset,concrete,asphalt,ivory,glass,red,dark};
 const cache={};const C=(w,h,d,b=.05)=>{const key=[w,h,d,b].join('_');return cache[key]||(cache[key]=chamfer(w,h,d,b));};
 const towers=[];
 for(const [label,z] of [['South',-D.halfMain],['North',D.halfMain]]) {
 const tower=group(label+'Tower',root,[0,0,z]);towers.push(tower);
 const pier=group('Pier',tower);solid('Footing',C(46,3,23.6,.4),concrete,pier,[0,.9,0]);solid('PierBody',C(42.672,11.0112,20.1168,.5),concrete,pier,[0,7.9056,0]);
 const levels=[13.4112,72,121,161,191,223.81464],ws=[10.0584,7.4,6.5,5.4,4.5],ds=[16.4592,11.4,9.7,8,7];
 for(const [side,x] of [['West',D.cableX],['East',-D.cableX]]) {
 const leg=group('Leg'+side,tower,[x,0,0]);
 for(let j=0;j<5;j++)solid('Tier'+(j+1),C(ws[j]-.26,levels[j+1]-levels[j],ds[j]-.26,.09),paint,leg,[0,(levels[j]+levels[j+1])/2,0]);
 const ribs=[],seams=[],rivets=[];const rivetGeo=new THREE.OctahedronGeometry(.045,0);
 for(let j=0;j<5;j++){const w=ws[j],d=ds[j],lo=levels[j],hi=levels[j+1],hh=hi-lo;
 for(const sign of [-1,1]){
 for(let k=0;k<5;k++){const xx=-w*.42+k*w*.21;ribs.push({g:new THREE.BoxGeometry(.22,hh-.22,.30),p:[xx,(lo+hi)/2,sign*(d/2-.11)]});}
 for(let k=0;k<7;k++){const zz=-d*.44+k*d*.88/6;ribs.push({g:new THREE.BoxGeometry(.30,hh-.22,.22),p:[sign*(w/2-.11),(lo+hi)/2,zz]});}
 for(let yy=lo+5;yy<hi-.5;yy+=6){seams.push({g:new THREE.BoxGeometry(w-.32,.07,.07),p:[0,yy,sign*(d/2-.145)]});for(let k=0;k<5;k++)rivets.push({g:rivetGeo,p:[-w*.42+k*w*.21,yy,sign*(d/2+.008)]});}
 }
 ribs.push({g:C(w, .18,d,.04),p:[0,hi-.09,0]});
 }solid('FluteRibs',merge(ribs),paint,leg);solid('PlateSeams',merge(seams),inset,leg);solid('RivetRows',merge(rivets),paint,leg);
 const crown=group('Crown'+side,tower,[x,223.81464,0]);
 solid('SaddleBed',C(4.3,.35,7.8,.10),inset,crown,[0,.175,0]);
 const saddleParts=[],fins=[];const saddlePath=[];for(let k=0;k<=20;k++){const dz=-5+k*.5;saddlePath.push([0,cableY(z+dz)-223.81464-.56,dz]);}
 solid('CurvedSaddle',sweepProfile([[-.80,-.16],[.80,-.16],[.80,.16],[-.80,.16]],saddlePath,{up:[0,1,0]}),paint,crown);
 for(let k=0;k<15;k++){const dz=-4.9+k*.7,hh=cableY(z+dz)-223.81464-.4;for(const ss of [-1,1])fins.push({g:C(.44,hh,.14,.03),p:[ss*.99,hh/2,dz]});}
 solid('SaddleGussets',merge(fins),paint,crown);
 const cover=loftProfiles([{profile:[[-1.7,-2],[1.7,-2],[1.7,2],[-1.7,2]],frame:{origin:[0,2.0,0]}},{profile:[[-.72,-.95],[.72,-.95],[.72,.95],[-.72,.95]],frame:{origin:[0,6.25,0]}}]);solid('TaperedSaddleCover',cover,paint,crown);
 solid('BeaconFoot',C(1.6,.16,2.05,.05),inset,crown,[0,6.25,0]);solid('AircraftWarningLens',new THREE.CylinderGeometry(.22,.25,.50,12),red,crown,[0,6.58,0]);
 solid('BeaconCap',C(.66,.12,.66,.045),paint,crown,[0,6.89,0]);
 }
 for(const [j,y,h] of [[1,114.87912,9.144],[2,154.50312,9.17448],[3,188.03112,6.64464],[4,218.26728,6.67512]]){
 const portal=group('Portal'+j,tower),depth=j<3?7:5,width=27.432-(j===1?7.4:j===2?6.5:j===3?5.4:4.5)+.38;
 solid('Core',C(width,h,depth-.28,.10),inset,portal,[0,y,0]);
 const pan=[],trim=[],riv=[];const faceGeo=recessPanel(1.15,h-1.5);
 for(const sign of [-1,1]){
 for(let k=-6;k<=6;k++){pan.push({g:faceGeo,p:[k*1.48,y,sign*(depth/2-.05)],q:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sign<0?Math.PI:0)});for(const yy of [y-h/2+.5,y+h/2-.5])riv.push({g:new THREE.OctahedronGeometry(.045,0),p:[k*1.48,yy,sign*(depth/2+.035)]});}
 for(const yy of [y-h/2+.24,y+h/2-.24])trim.push({g:C(width+.1,.45,.34,.05),p:[0,yy,sign*(depth/2-.02)]});
 }
 for(const side of [-1,1])for(let step=0;step<3;step++)trim.push({g:C(1.9-step*.48,.40,depth-.15,.06),p:[side*(width/2-.85+step*.23),y-h/2-.20-step*.4,0]});
 solid('RecessedDecoPanels',merge(pan),paint,portal);solid('SteppedBordersAndHaunches',merge(trim),paint,portal);solid('PortalRivets',merge(riv),paint,portal);
 }
 const braces=group('BelowRoadBracing',tower),bs=[],joints=[];
 for(const [lo,hi] of [[14.0,39.2],[39.2,69.0]]){
 for(const sign of [-1,1])bs.push(segmentItem(C(1.45,1,1.9,.10),[-D.cableX,lo,sign*.8],[D.cableX,hi,sign*.8]));
 for(const sign of [-1,1])bs.push(segmentItem(C(1.45,1,1.9,.10),[D.cableX,lo,sign*.8],[-D.cableX,hi,sign*.8]));
 }
 for(const yy of [14.0,39.2,69.0])bs.push({g:C(27.432,1.65,5.2,.1),p:[0,yy,0]});
 solid('XMembers',merge(bs),paint,braces);
 for(const yy of [14,39.2,69])for(const xx of [-9.2,9.2])joints.push({g:C(2.8,3.2,.15,.10),p:[xx,yy,2.63]},{g:C(2.8,3.2,.15,.10),p:[xx,yy,-2.63]});
 solid('ConnectionPlates',merge(joints),inset,braces);
 }
 const fender=group('SouthFender',root,[0,0,-D.halfMain]);solid('EllipticalWall',ellipseRing(45.72,23.622,3.048,-.6,4.572),concrete,fender);
 for(const [side,x] of [['West',D.cableX],['East',-D.cableX]]) {
 const g=group('MainCable'+side,root);const points=[];for(let i=0;i<=800;i++){const z=-1012.98+i*2025.96/800;points.push(new THREE.Vector3(x,cableY(z),z));}
 const path=new THREE.CatmullRomCurve3(points);solid('ContinuousCable',cappedCable(path,660,.4619625,12),paint,g);
 }
 const deck=group('Deck',root);solid('Roadway',roadSolid(-9.4488,9.4488,-D.stub,D.stub,0,.45,160),asphalt,deck);
 solid('Underdeck',roadSolid(-13.716,13.716,-D.stub,D.stub,-.5,.124,160),paint,deck);
 for(const side of [-1,1])solid(side>0?'WestWalk':'EastWalk',roadSolid(side>0?9.4488:-12.4968,side>0?12.4968:-9.4488,-D.stub,D.stub,.22,.28,1024,side),concrete,deck);
 const unitBox=new THREE.BoxGeometry(1,1,1);
 const trianglePlate=meshGeo({positions:[-.5,-.5,-.5,-.5,-.5,.5,-.5,.5,0,.5,-.5,-.5,.5,-.5,.5,.5,.5,0],indices:[0,1,2,3,5,4,0,3,4,0,4,1,1,4,5,1,5,2,2,5,3,2,3,0]});
 const ropeGeo=new THREE.CylinderGeometry(.03413125,.03413125,1,5);
 const bandGeo=new THREE.CylinderGeometry(.535,.535,.72,10);
 const boltGeo=new THREE.OctahedronGeometry(.09,0);
 const stations=[];for(let k=-63;k<=63;k++){const zz=k*D.pitch;if(Math.abs(Math.abs(zz)-D.halfMain)>1)stations.push(zz);}
 for(const [side,x] of [['West',D.cableX],['East',-D.cableX]]){
 const hg=group('Suspenders'+side,root),rr=[],bb=[],ff=[],sockets=[];
 for(const zz of stations){const cy=cableY(zz),dy=road(zz)-.40,delta=new THREE.Vector3(0,cableY(zz+.1)-cableY(zz-.1),.2).normalize(),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta);
 bb.push({g:bandGeo,p:[x,cy,zz],q});
 for(const s of [-1,1]){rr.push(segmentItem(ropeGeo,[x+s*.25,dy,zz],[x+s*.25,cy-.32,zz]));sockets.push({g:new THREE.BoxGeometry(.18,.56,.22),p:[x+s*.25,dy+.23,zz]});ff.push({g:new THREE.BoxGeometry(.28,.16,.95),p:[x+s*.56,cy-.18,zz]});
 for(const dz of [-.28,0,.28])ff.push({g:boltGeo,p:[x+s*.57,cy-.02,zz+dz]});
 }sockets.push({g:new THREE.BoxGeometry(1.32,.20,.70),p:[x,dy-.01,zz]});
 }
 solid('RopePairs',merge(rr),paint,hg);solid('CableBands',merge(bb),paint,hg);solid('ClampFlangesBolts',merge(ff),inset,hg);solid('DeckClevises',merge(sockets),paint,hg);
 }
 const under=group('DeckLateralBracing',root),cross=[];
 for(let k=-64;k<64;k++){const z0=k*D.pitch,z1=(k+1)*D.pitch,y0=road(z0)-7.96,y1=road(z1)-7.96;
 cross.push(segmentItem(unitBox,[-13.716,y0,z0],[13.716,y1,z1],[.18,.24]),segmentItem(unitBox,[13.716,y0,z0],[-13.716,y1,z1],[.18,.24]));
 cross.push({g:unitBox,p:[0,y0,z0],s:[27.432,.50,.24]});
 }solid('CrossFramesAndLateralX',merge(cross),paint,under);
 for(const [side,x] of [['West',D.cableX],['East',-D.cableX]]){
 const truss=group('DeckTruss'+side,root),members=[],gussets=[],hardware=[];
 const chords=[];for(const off of [0,-D.truss+.3]){for(const dx of [-.27,.27])chords.push({g:roadSolid(x+dx-.06,x+dx+.06,-D.end,D.end,-.31+off,.62,96)});chords.push({g:roadSolid(x-.22,x+.22,-D.end,D.end,-.55+off,.14,96)});}solid('RolledChords',merge(chords),paint,truss);
 const tstep=7.62,n=Math.round(2*D.end/tstep);
 for(let k=0;k<n;k++){const z0=-D.end+k*tstep,z1=z0+tstep,top0=road(z0)-.62,top1=road(z1)-.62,bot0=top0-D.truss+.3,bot1=top1-D.truss+.3;
 // continuous rolled chord profiles are emitted once per cable plane
 const a=[x,k%2?bot0:top0,z0],b=[x,k%2?top1:bot1,z1];members.push(segmentItem(unitBox,a,b,[.26,.34]));
 members.push(segmentItem(unitBox,[x,bot0,z0],[x,top0,z0],[.24,.32]));
 for(const yy of [top0,bot0]){for(const dx of [-.34,.34])gussets.push({g:trianglePlate,p:[x+dx,yy,z0],s:[.10,1.0,1.05]});}
 }
 solid('ChordsPostsDiagonals',merge(members),paint,truss);solid('GussetPlates',merge(gussets),inset,truss);
 }
 // Pedestrian bypasses flare around each main tower leg.
 function walkCenter(zz){const a=Math.abs(Math.abs(zz)-D.halfMain);return 10.9728+(a<10.5?8.6:a<26?8.6*(26-a)/15.5:0);}
 const railRoot=group('SidewalkRailings',deck),railItems=[],innerItems=[];
 const balGeo=new THREE.BoxGeometry(.032,1.03,.032),postGeo=new THREE.BoxGeometry(.09,1.2192,.09);
 const avoidTower=zz=>Math.abs(Math.abs(zz)-D.halfMain)<7;
 for(const sign of [-1,1]){
 const start=-D.stub,end=D.stub,steps=Math.round((end-start)/3.81),pitch=(end-start)/steps;
 for(let k=0;k<steps;k++){const z0=start+k*pitch,z1=z0+pitch,y0=road(z0)+.22,y1=road(z1)+.22,x0=sign*(walkCenter(z0)+1.47),x1=sign*(walkCenter(z1)+1.47);
 railItems.push({g:postGeo,p:[x0,y0+.6096,z0]});
 // Handrails are continuous geometry below, without hidden per-bay end caps.
 for(let b=1;b<4;b++){const zz=z0+pitch*b/4;railItems.push({g:balGeo,p:[sign*(walkCenter(zz)+1.47),road(zz)+.22+.63,zz]});}
 // Guard rail on the curb side remains clear of the roadway.
 innerItems.push({g:unitBox,p:[sign*(walkCenter(z0)-1.36),y0+.49,z0],s:[.10,.98,.10]});
 }
 for(const hh of [.12,1.2192])railItems.push({g:roadSolid(sign*12.4428-.0375,sign*12.4428+.0375,-D.stub,D.stub,.22+hh+.0375,.075,96,sign)});for(const hh of [.42,.88])innerItems.push({g:roadSolid(sign*9.6128-.05,sign*9.6128+.05,-D.stub,D.stub,.22+hh+.0375,.075,96,sign)});
 solid(sign>0?'WestCurb':'EastCurb',roadSolid(sign>0?9.4488:-9.6488,sign>0?9.6488:-9.4488,-D.stub,D.stub,.27,.30,160),concrete,deck);
 }
 solid('OuterOpenRailings',merge(railItems),paint,railRoot);solid('RoadSafetyRailings',merge(innerItems),paint,railRoot);
 const barrier=group('MovableMedian',deck),median=[],medianPins=[];
 const medianGeo=new THREE.BoxGeometry(.3048,.8128,1.978);
 for(let zz=-D.stub+1;zz<D.stub;zz+=2){median.push({g:medianGeo,p:[0,road(zz)+.4064,zz]});}
 solid('LinkedConcreteUnits',merge(median),concrete,barrier);
 const lines=group('LaneMarkings',deck),marks=[],whitePlane=new THREE.PlaneGeometry(.115,3.0),flat=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
 for(const xx of [-6.28,-3.17,3.17,6.28])for(let zz=-D.stub+3;zz<D.stub-3;zz+=12)marks.push({g:whitePlane,p:[xx,road(zz)+.012,zz],q:flat});
 solid('BrokenLaneLines',merge(marks),ivory,lines);
 for(const xx of [-9.18,9.18])solid(xx>0?'WestEdgeLine':'EastEdgeLine',roadSolid(xx-.065,xx+.065,-D.stub,D.stub,.013,.003,160),ivory,lines);
 const drains=[],joints=[];for(let zz=-D.end;zz<D.end;zz+=15.24){for(const side of [-1,1])drains.push({g:unitBox,p:[side*9.32,road(zz)+.014,zz],s:[.15,.012,.42]});}
 for(const zz of [-D.halfMain,D.halfMain,-D.end,D.end])joints.push({g:unitBox,p:[0,road(zz)+.016,zz],s:[18.88,.016,.15]});
 solid('DrainSlots',merge(drains),dark,deck);solid('ExpansionJoints',merge(joints),dark,deck);
 // One reusable lamp geometry per finish, placed with shared buffers.
 const lamps=group('ArtDecoLampStandards',deck);
 const lampBody=[],lampGlass=[];
 lampBody.push({g:C(.42,.5,.42,.025),p:[0,.25,0]},{g:C(.23,6.2,.26,.022),p:[0,3.5,0]});
 for(const armY of [6.4,7.07]){const arm=[];for(let i=0;i<=10;i++){const t=i/10*Math.PI/2;arm.push([2.05*(1-Math.cos(t)),armY+1.95*Math.sin(t),0]);}
 lampBody.push({g:sweepProfile([[-.065,-.08],[.065,-.08],[.065,.08],[-.065,.08]],arm,{up:[0,0,1]})});}
 lampBody.push({g:C(1.35,.30,.62,.04),p:[2.27,8.68,0]},{g:C(.26,.18,.30,.025),p:[0,5.85,0]});
 lampGlass.push({g:C(1.14,.10,.48,.03),p:[2.27,8.49,0]});
 const lampGeo=merge(lampBody),lensGeo=merge(lampGlass);
 for(const side of [-1,1]){const bodies=[],lenses=[],q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),side>0?Math.PI:0);
 for(let k=-22;k<=22;k++){const zz=k*45.72;if(Math.abs(Math.abs(zz)-D.halfMain)<11)continue;const p=[side*9.91,road(zz)+.22,zz];bodies.push({g:lampGeo,p,q});lenses.push({g:lensGeo,p,q});}
 const sideRoot=group(side>0?'WestLampArray':'EastLampArray',lamps);solid('StandardsAndTwinArms',merge(bodies),paint,sideRoot);solid('AmberLenses',merge(lenses),glass,sideRoot);
 }
 const bypass=group('TowerSidewalkBrackets',deck),bk=[];
 for(const tz of [-D.halfMain,D.halfMain])for(const side of [-1,1])for(const dz of [-10.5,-6,6,10.5]){const zz=tz+dz,yy=road(zz)-.06;
 bk.push(segmentItem(C(.22,1,.32,.025),[side*13.7,yy-3.8,tz+Math.max(-6,Math.min(6,dz))],[side*20.8,yy-.10,zz]));
 bk.push(segmentItem(C(.20,1,.34,.022),[side*13.7,yy-.10,zz],[side*20.8,yy-.10,zz]));
 }solid('CantileverKnees',merge(bk),paint,bypass);

 for(const [label,sgn] of [['South',-1],['North',1]]){
 const a=group(label+'Anchorage',root,[0,0,sgn*(D.end+25)]),body=[];
 body.push({g:C(43,4,52,.45),p:[0,1.4,0]},{g:C(39,52.4,49.5,.4),p:[0,29.6,0]},{g:C(40.2,5.6,50.0,.32),p:[0,58.2,0]},{g:C(40.8,.5,50.4,.10),p:[0,61.15,0]});
 solid('AnchorageHousing',merge(body),concrete,a);
 const courses=[],pilasters=[],windows=[];
 for(const side of [-1,1]){
 for(let yy=7;yy<59;yy+=5.5)courses.push({g:unitBox,p:[side*19.506,yy,0],s:[.018,.045,48]});
 for(const zz of [-19,-6,6,19])pilasters.push({g:C(.5,53,.8,.07),p:[side*19.64,31,zz]});
 const pylon=group(side>0?'PylonWest':'PylonEast',a,[side*16.2,0,-sgn*22]);
 solid('PylonShaft',C(5.5,67,7.2,.14),concrete,pylon,[0,32.9,0]);solid('SteppedCrown',C(4.3,3.8,5.8,.10),concrete,pylon,[0,67.9,0]);solid('UpperCrown',C(3.3,1.1,4.8,.07),concrete,pylon,[0,70.1,0]);
 const ribs=[];for(const ss of [-1,1])for(let k=-2;k<=2;k++){const p=[[-.28,-.28],[.28,-.28],[.42,0],[0,.32],[-.42,0]];const rib=sweepProfile(p,[[k*.77,12,ss*3.5],[k*.77,70,ss*3.5]],{up:[0,0,1]});ribs.push({g:rib});}
 solid('ChevronFlutes',merge(ribs),concrete,pylon);
 solid('AccessDoorReveal',C(1.14,2.0,.14,.045),inset,pylon,[0,64.2,-sgn*3.63]);solid('InsetAccessDoor',C(.80,1.57,.08,.025),dark,pylon,[0,64.2,-sgn*3.715]);
 }
 solid('FormworkCourseLines',merge(courses),dark,a);solid('HousingPilasters',merge(pilasters),concrete,a);
 }
 function qualify(node,prefix){for(const child of node.children){child.name=prefix+'_'+child.name;qualify(child,child.name);}}for(const child of root.children)qualify(child,child.name);
 return root;
}