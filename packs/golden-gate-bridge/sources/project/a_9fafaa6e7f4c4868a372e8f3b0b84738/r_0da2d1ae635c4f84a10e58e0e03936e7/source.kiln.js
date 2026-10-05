// Golden Gate Bridge | original procedural geometry | CC0
const meta = { name: 'Golden Gate Bridge', role: 'wonder' };
const PARAMS = { lod: 'far' }; // full | web | far; the only variant selector.
const FULL=PARAMS.lod==='full', FAR=PARAMS.lod==='far';
const L={full:{roadSteps:160,cableSteps:660,cableSides:12,railPitch:3.81,crownSteps:16,lampStep:1,armSteps:10,trussBays:258},web:{roadSteps:32,cableSteps:180,cableSides:6,railPitch:3.81,crownSteps:6,lampStep:2,armSteps:6,trussBays:258},far:{roadSteps:16,cableSteps:80,cableSides:4,railPitch:15.24,crownSteps:4,lampStep:8,armSteps:3,trussBays:65}}[PARAMS.lod];
if(!L)throw new Error('Unknown bridge LOD');
const OMIT_DETAIL=['PlateSeams','RivetRows','PortalRivets','ClampFlangesBolts','DeckClevises','GussetPlates','SidewalkBearingStools','LongitudinalTStringers','DrainSlots','FormworkCourseLines'];
const OMIT_FAR=['FluteRibs','RecessedDecoPanels','SteppedBordersAndHaunches','CrownInsetPanels','ConnectionPlates','CableBands','FloorbeamISections','CrossFramesAndLateralX','OuterOpenRailings','RoadSafetyRailings','Underdeck','WestBypassFascia','EastBypassFascia','BrokenLaneLines','ExpansionJoints','ChevronFlutes','HousingPilasters','AccessDoorReveal'];
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
function solid(name,g,mat,parent,p=[0,0,0],s=[1,1,1]){if(!FULL&&(OMIT_DETAIL.includes(name)||(FAR&&OMIT_FAR.includes(name))))return null;return createPart(name,g,mat,{parent,position:p,scale:s});}
function segmentItem(g,a,b,scale=[1,1]) {const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);return {g,p:av.add(bv).multiplyScalar(.5).toArray(),q:new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()),s:[scale[0],delta.length(),scale[1]]};}
function walkShift(z){const a=Math.abs(Math.abs(z)-D.halfMain);return a<10.5?8.6:a<26?8.6*(26-a)/15.5:0;}
function roadSolid(x0,x1,z0,z1,topOffset,thick,steps=32,walkSide=0) {
 if(!FULL)steps=Math.min(steps,L.roadSteps);
 const zs=[],n=walkSide?Math.max(2,Math.min(160,steps)):steps;for(let k=0;k<=n;k++)zs.push(z0+(z1-z0)*k/n);for(const t of [-D.end,-D.halfMain,D.halfMain,D.end])if(t>z0+1e-8&&t<z1-1e-8)zs.push(t);if(walkSide)for(const s of [-1,1])for(const v of [-26,-10.5,0,10.5,26]){const t=s*D.halfMain+v;if(t>z0+1e-8&&t<z1-1e-8)zs.push(t);}zs.sort((a,b)=>a-b);for(let i=zs.length-1;i>0;i--)if(Math.abs(zs[i]-zs[i-1])<1e-8)zs.splice(i,1);steps=zs.length-1;const P=[],I=[],U=[];for(let i=0;i<=steps;i++){const z=zs[i],y=road(z)+topOffset;const shift=walkSide*walkShift(z);P.push(x0+shift,y,z,x1+shift,y,z,x0+shift,y-thick,z,x1+shift,y-thick,z);U.push(x0,z,x1,z,x0,z,x1,z);}
 for(let i=0;i<steps;i++){const a=4*i,b=a+4;I.push(a,b,a+1,a+1,b,b+1,a+2,a+3,b+2,a+3,b+3,b+2,a,a+2,b,a+2,b+2,b,a+1,b+1,a+3,a+3,b+1,b+3);}
 I.push(0,1,2,1,3,2);const k=steps*4;I.push(k,k+2,k+1,k+1,k+2,k+3);return meshGeo({positions:P,indices:I,uvs:U});
}
function indexedSubset(g,indices) {
 const po=g.attributes.position,no=g.attributes.normal,uv=g.attributes.uv,map=new Map(),P=[],N=[],U=[],I=[];
 for(const id of indices){if(!map.has(id)){map.set(id,P.length/3);P.push(po.getX(id),po.getY(id),po.getZ(id));N.push(no.getX(id),no.getY(id),no.getZ(id));U.push(uv.getX(id),uv.getY(id));}I.push(map.get(id));}
 return meshGeo({positions:P,normals:N,uvs:U,indices:I});
}
function roadSurfaceParts(g) {
 const all=Array.from(g.index.array),wallEnd=(g.attributes.position.count/4-1)*24,top=[],body=[];
 for(let i=0;i<all.length;i++)(i<wallEnd&&i%24<6?top:body).push(all[i]);
 return [indexedSubset(g,top),indexedSubset(g,body)];
}
function ellipseRing(rx,rz,wall,y0,y1,count=96) {
 if(!FULL)count=FAR?24:48;
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
function lodCableGeo(x) {
 const zs=[-1012.98,1012.98,-D.end,D.end],P=[],N=[],I=[],U=[],r=.4619625,sides=L.cableSides;
 if(!FAR)for(let i=0;i<=L.cableSteps;i++)zs.push(-1012.98+i*2025.96/L.cableSteps);
 for(let k=-63;k<=63;k++){const z=k*D.pitch;if(Math.abs(Math.abs(z)-D.halfMain)>1)zs.push(z);}
 for(const t of [-D.halfMain,D.halfMain])for(const dz of [-5,-2,-.5,0,.5,2,5])zs.push(t+dz);
 zs.sort((a,b)=>a-b);for(let i=zs.length-1;i>0;i--)if(Math.abs(zs[i]-zs[i-1])<1e-8)zs.splice(i,1);
 for(let j=0;j<zs.length;j++){const z=zs[j],slope=(cableY(z+.001)-cableY(z-.001))/.002,den=Math.sqrt(1+slope*slope);
 for(let k=0;k<sides;k++){const a=2*Math.PI*k/sides,c=Math.cos(a),s=Math.sin(a);P.push(x+r*c,cableY(z)+r*s/den,z-r*s*slope/den);N.push(c,s/den,-s*slope/den);U.push(k/sides,j/(zs.length-1));}}
 for(let j=0;j<zs.length-1;j++)for(let k=0;k<sides;k++){const a=j*sides+k,b=j*sides+(k+1)%sides,c=a+sides,d=b+sides;I.push(a,b,c,b,d,c);}
 for(const end of [0,1]){const ring=end?(zs.length-1)*sides:0,z=zs[end?zs.length-1:0],slope=(cableY(z+.001)-cableY(z-.001))/.002,normal=new THREE.Vector3(0,slope,1).normalize().multiplyScalar(end?1:-1),center=P.length/3;
 P.push(x,cableY(z),z);N.push(...normal.toArray());U.push(.5,.5);
 for(let k=0;k<sides;k++){P.push(P[(ring+k)*3],P[(ring+k)*3+1],P[(ring+k)*3+2]);N.push(...normal.toArray());U.push(.5+.5*Math.cos(k/sides*2*Math.PI),.5+.5*Math.sin(k/sides*2*Math.PI));}
 for(let k=0;k<sides;k++){const a=center+1+k,b=center+1+(k+1)%sides;if(end)I.push(center,a,b);else I.push(center,b,a);}}
 return meshGeo({positions:P,normals:N,indices:I,uvs:U});
}
function cappedCable(path,count,radius,sides){
 if(!FULL)return lodCableGeo(path.getPoint(0).x);
 const tube=new THREE.TubeGeometry(path,count,radius,sides,false),po=tube.attributes.position,P=[],N=[],U=[],I=[];
 for(const end of [0,1]){const normal=path.getTangentAt(end).multiplyScalar(end?1:-1),center=path.getPointAt(end),base=P.length/3;P.push(...center.toArray());N.push(...normal.toArray());U.push(.5,.5);const ring=end?count*(sides+1):0;
 for(let k=0;k<sides;k++){P.push(po.getX(ring+k),po.getY(ring+k),po.getZ(ring+k));N.push(...normal.toArray());U.push(.5+.5*Math.cos(k/sides*2*Math.PI),.5+.5*Math.sin(k/sides*2*Math.PI));}
 for(let k=0;k<sides;k++){const a=base+1+k,b=base+1+(k+1)%sides,va=new THREE.Vector3(P[a*3],P[a*3+1],P[a*3+2]).sub(center),vb=new THREE.Vector3(P[b*3],P[b*3+1],P[b*3+2]).sub(center);if(va.cross(vb).dot(normal)>0)I.push(base,a,b);else I.push(base,b,a);}
 }return merge([{g:tube},{g:meshGeo({positions:P,normals:N,uvs:U,indices:I})}]);
}
function openVerticalBox(w,h,d) {
 const P=[],N=[],U=[],I=[];
 for(const axis of [0,2])for(const s of [-1,1]){const other=axis===0?2:0,hw=w/2,hd=d/2,vs=[];
 for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const p=[0,b*h/2,0];p[axis]=s*(axis===0?hw:hd);p[other]=a*(other===0?hw:hd);vs.push(p);}
 const n=new THREE.Vector3(axis===0?s:0,0,axis===2?s:0);const ab=new THREE.Vector3(...vs[1]).sub(new THREE.Vector3(...vs[0])),ac=new THREE.Vector3(...vs[2]).sub(new THREE.Vector3(...vs[0]));if(ab.cross(ac).dot(n)<0)vs.reverse();const o=P.length/3;
 for(let k=0;k<4;k++){P.push(...vs[k]);N.push(...n.toArray());U.push(k===1||k===2?1:0,k>=2?1:0);}I.push(o,o+1,o+2,o,o+2,o+3);}
 return meshGeo({positions:P,normals:N,uvs:U,indices:I});
}
function surfaceStrap(w,h,depth) {
 const x=w/2,y=h/2;return meshGeo({positions:[-x,-y,0,x,-y,0,x,y,0,-x,y,0,-x,-y,depth,x,-y,depth,x,y,depth,-x,y,depth],indices:[4,5,6,4,6,7,0,4,7,0,7,3,1,2,6,1,6,5,0,1,5,0,5,4,3,7,6,3,6,2]});
}
function plateSkin(base,w,d,lo,hi) {
 if(!FULL)return base;
 const bevels=base.clone(),all=Array.from(base.index.array);bevels.setIndex(all.filter((v,i)=>i>=36||(i>=12&&i<24)));
 const cuts=[lo+.09];for(let y=lo+5;y<hi-.5;y+=6)cuts.push(y);cuts.push(hi-.09);
 const P=[],N=[],U=[],I=[],center=(lo+hi)/2;
 for(const axis of [0,2])for(const sign of [-1,1])for(let row=0;row<cuts.length-1;row++){
 const a=cuts[row],b=cuts[row+1],other=axis===0?2:0,half=(other===0?w:d)/2-.09,face=sign*(axis===0?w:d)/2,normal=new THREE.Vector3(axis===0?sign:0,0,axis===2?sign:0),vs=[];
 for(const [x,y] of [[-half,a],[half,a],[half,b],[-half,b]]){const p=[0,y-center,0];p[axis]=face;p[other]=x;vs.push(p);}
 if(new THREE.Vector3(...vs[1]).sub(new THREE.Vector3(...vs[0])).cross(new THREE.Vector3(...vs[2]).sub(new THREE.Vector3(...vs[0]))).dot(normal)<0)vs.reverse();
 const o=P.length/3,phase=((row*37+axis*17+(sign>0?11:3))%101)/101;
 for(const p of vs){P.push(...p);N.push(...normal.toArray());U.push(p[other]/(axis===0?d*.1466667:w*.21)+phase,(p[1]+center-a)/(b-a));}I.push(o,o+1,o+2,o,o+2,o+3);
 }return merge([{g:bevels},{g:meshGeo({positions:P,normals:N,uvs:U,indices:I})}]);
}
function cableRangeAtZ(geo,z) {
 const p=geo.attributes.position,idx=geo.index;let low=Infinity,high=-Infinity;
 for(let i=0;i<idx.count;i+=3){const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2),za=p.getZ(a),zb=p.getZ(b),zc=p.getZ(c);
 if(z<Math.min(za,zb,zc)-1e-8||z>Math.max(za,zb,zc)+1e-8)continue;
 for(const [u,v] of [[a,b],[b,c],[c,a]]){const zu=p.getZ(u),zv=p.getZ(v);if(z<Math.min(zu,zv)-1e-8||z>Math.max(zu,zv)+1e-8)continue;
 if(Math.abs(zv-zu)<1e-10){low=Math.min(low,p.getY(u),p.getY(v));high=Math.max(high,p.getY(u),p.getY(v));}
 else{const t=(z-zu)/(zv-zu),y=p.getY(u)+(p.getY(v)-p.getY(u))*t;low=Math.min(low,y);high=Math.max(high,y);}
 }}
 if(!Number.isFinite(low)||!Number.isFinite(high))throw new Error('Cable section missing at '+z);return [low,high];
}
function roundedSaddleHousing(towerZ,fittingCableGeo) {
  const rootY=223.81464, halfLength=4.5, angular=FULL?16:8;
  const stations=Array.from({length:L.crownSteps+1},(_,j)=>-halfLength+2*halfLength*j/L.crownSteps);
  for(const dz of [-1.819169981105233,.8470898715306703,3.6876660706620896])stations.push(towerZ<0?dz:-dz);
  stations.sort((a,b)=>a-b);const longitudinal=stations.length-1;
  const halfWidth=1.40, roofRise=.86, floor=.32, innerX=.54;
  const P=[],I=[],U=[];
  function vertex(x,y,z,u,v){const index=P.length/3;P.push(x,y,z);U.push(u,v);return index;}
  // Outer rings precede inner rings at every station. Each ring is CCW in XY.
  for(let j=0;j<=longitudinal;j++) {
    const dz=stations[j];
    const cy=cableY(towerZ+dz)-rootY;
    const section=cableRangeAtZ(fittingCableGeo,towerZ+dz),innerCy=(section[0]+section[1])/2-rootY,innerY=(section[1]-section[0])/2+.08;
    for(let layer=0;layer<2;layer++)for(let k=0;k<angular;k++) {
      const t=2*Math.PI*k/angular,c=Math.cos(t),s=Math.sin(t);
      let x,y;
      if(layer===0) {
        // Rounded upper half ellipse; lower rays stop at side walls or flat base.
        const radial=s>=-1e-12
          ? 1/Math.sqrt(c*c/(halfWidth*halfWidth)+s*s/(roofRise*roofRise))
          : Math.min(Math.abs(c)>1e-12?halfWidth/Math.abs(c):Infinity,(cy-floor)/(-s));
        x=radial*c;y=cy+radial*s;
      } else {
        x=innerX*c;y=innerCy+innerY*s;
        // Seat follows the actual exported cable's triangle cross-section.
        if(k===3*angular/4)y=section[0]-rootY+.008;
      }
      vertex(x,y,dz,k/angular,j/longitudinal);
    }
  }
  const ring=2*angular;
  for(let j=0;j<longitudinal;j++)for(let k=0;k<angular;k++) {
    const n=(k+1)%angular,a=j*ring+k,b=j*ring+n,c=a+ring,d=b+ring;
    I.push(a,b,c,b,d,c); // outward outer wall
    I.push(a+angular,c+angular,b+angular,b+angular,c+angular,d+angular); // inward tunnel wall
  }
  // Duplicate end vertices for hard annular-face normals; position weld remains closed.
  for(const end of [0,1]) {
    const old=end?longitudinal*ring:0,base=P.length/3;
    for(let k=0;k<ring;k++)vertex(P[(old+k)*3],P[(old+k)*3+1],P[(old+k)*3+2],U[(old+k)*2],U[(old+k)*2+1]);
    for(let k=0;k<angular;k++) {
      const n=(k+1)%angular,a=base+k,b=base+n,c=base+angular+k,d=base+angular+n;
      if(end)I.push(a,b,c,b,d,c);else I.push(a,c,b,b,c,d);
    }
  }
  return meshGeo({positions:P,indices:I,uvs:U});
}
function calibratedPaint(texture,roughness,name,normal) {
 const bytes=texture.image.data,count=texture.image.width*texture.image.height;
 if(bytes.length!==count*4||bytes.BYTES_PER_ELEMENT!==1)throw new Error('Expected 8-bit RGBA procedural albedo');
 const sums=[0,0,0],linear=v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);
 for(let i=0;i<bytes.length;i+=4)for(let c=0;c<3;c++)sums[c]+=linear(bytes[i+c]/255);
 const target=[192,54,44].map(v=>linear(v/255)),factors=sums.map((sum,c)=>target[c]/(sum/count));
 if(factors.some(v=>v>1||v<0))throw new Error('Paint compensation outside dielectric base-color range');
 const material=pbrMaterial({albedo:texture,normal,roughness,metalness:0});
 material.color.setRGB(...factors);material.name=name;return material;
}
function build() {
 const root=createRoot('GoldenGateBridge');
 const fittingPoints=[];for(let i=0;i<=800;i++){const z=-1012.98+i*2025.96/800;fittingPoints.push(new THREE.Vector3(D.cableX,cableY(z),z));}const fittingCableGeo=cappedCable(new THREE.CatmullRomCurve3(fittingPoints),660,.4619625,12);
 const paintMap=proceduralTexture({schemaVersion:2,size:256,usage:'albedo',name:'CC0_Paint_SubtleValue',layers:[{op:'noise',colorA:0xf2f2f2,colorB:0xffffff,scale:8,octaves:3,seed:1937}]});
 const paint=calibratedPaint(paintMap,.68,'Paint');
 const insetMap=proceduralTexture({schemaVersion:2,size:256,usage:'albedo',name:'CC0_RecessGrime',layers:[{op:'noise',colorA:0xf0f0f0,colorB:0xffffff,scale:6,octaves:3,seed:1933}]});
 const inset=calibratedPaint(insetMap,.74,'PaintRecess');
 const panelMap=proceduralTexture({schemaVersion:2,size:512,usage:'albedo',name:'CC0_Tower_PlateCoursesAndRunoff',layers:[
 {op:'noise',colorA:0xebebeb,colorB:0xffffff,scale:3,octaves:2,seed:1937},
 {op:'stripes',colorA:0xeeeeee,colorB:0xffffff,count:32,angleDeg:0,blend:'multiply',opacity:.24},
 {op:'noise',colorA:0xf7f7f7,colorB:0xffffff,scale:64,octaves:2,seed:470,blend:'multiply',opacity:.20},
 {op:'gradient',from:0xffffff,to:0xd9d9d9,angleDeg:90,blend:'multiply',opacity:.35},
 {op:'bricks',brick:0xffffff,mortar:0xc9c9c9,rows:1,cols:1,mortarWidth:.025,stagger:0,blend:'multiply',opacity:.22}]});
 const panelPaint=calibratedPaint(panelMap,.70,'PaintPanels',normalMapFromHeight(panelMap,{strength:.018,name:'CC0_MaintainedPaint_Microrelief'}));
 const concreteMap=proceduralTexture({schemaVersion:2,size:256,usage:'albedo',name:'CC0_Concrete_MineralVariation',layers:[{op:'noise',colorA:0x69645a,colorB:0x6c675d,scale:11,octaves:4,seed:1933},{op:'noise',colorA:0xbab6af,colorB:0xffffff,scale:80,octaves:2,seed:744,blend:'multiply',opacity:.06}]});
 const concrete=pbrMaterial({albedo:concreteMap,roughness:.9,metalness:0});
 const asphaltMap=proceduralTexture({schemaVersion:2,size:256,usage:'albedo',name:'CC0_Asphalt_Aggregate',layers:[{op:'noise',colorA:0x07090a,colorB:0x131619,scale:96,octaves:3,seed:1986}]});
 const asphalt=pbrMaterial({albedo:asphaltMap,normal:normalMapFromHeight(asphaltMap,{strength:.60,name:'CC0_Asphalt_Normal'}),roughness:.97,metalness:0});
 const ivory=gameMaterial(0xb9b6ab,{roughness:.83,metalness:0});
 const glass=gameMaterial(0xe9c68c,{roughness:.22,metalness:0,emissive:0xffbd62,emissiveIntensity:.45});
 const red=gameMaterial(0xba1712,{roughness:.18,metalness:0,emissive:0xff1505,emissiveIntensity:.8});
 const dark=gameMaterial(0x171612,{roughness:.9,metalness:0});
 const mats={paint,inset,concrete,asphalt,ivory,glass,red,dark};
 concrete.name='Concrete';asphalt.name='Asphalt';ivory.name='RoadMarkings';glass.name='LampGlass';red.name='BeaconEmissive';dark.name='DarkDetail';
 const cache={};const C=(w,h,d,b=.05)=>{const key=[w,h,d,b].join('_');return cache[key]||(cache[key]=!FULL&&(FAR||Math.min(w,h,d)<1)?new THREE.BoxGeometry(w,h,d):chamfer(w,h,d,b));};
 const towers=[];
 for(const [label,z] of [['South',-D.halfMain],['North',D.halfMain]]) {
 const tower=group(label+'Tower',root,[0,0,z]);towers.push(tower);
 const pier=group('Pier',tower);solid('Footing',C(46,3,23.6,.4),concrete,pier,[0,.9,0]);solid('PierBody',C(42.672,11.0112,20.1168,.5),concrete,pier,[0,7.9056,0]);
 const levels=[13.4112,72,121,161,191,223.81464],ws=[10.0584,7.4,6.5,5.4,4.5],ds=[16.4592,11.4,9.7,8,7];
 for(const [side,x] of [['West',D.cableX],['East',-D.cableX]]) {
 const leg=group('Leg'+side,tower,[x,0,0]);
 for(let j=0;j<5;j++)solid('Tier'+(j+1),plateSkin(C(ws[j]-.26,levels[j+1]-levels[j],ds[j]-.26,.09),ws[j]-.26,ds[j]-.26,levels[j],levels[j+1]),panelPaint,leg,[0,(levels[j]+levels[j+1])/2,0]);
 const ribs=[],seams=[],rivets=[];const rivetGeo=meshGeo({positions:[-.045,-.045,0,.045,-.045,0,.045,.045,0,-.045,.045,0,0,0,.030],indices:[0,1,4,1,2,4,2,3,4,3,0,4]});
 for(let j=0;j<5;j++){const w=ws[j],d=ds[j],lo=levels[j],hi=levels[j+1],hh=hi-lo;
 for(const sign of [-1,1]){
 for(let k=0;k<5;k++){const xx=-w*.42+k*w*.21;ribs.push({g:new THREE.BoxGeometry(.22,hh-.22,.30),p:[xx,(lo+hi)/2,sign*(d/2-.11)]});}
 for(let k=0;k<7;k++){const zz=-d*.44+k*d*.88/6;ribs.push({g:new THREE.BoxGeometry(.30,hh-.22,.22),p:[sign*(w/2-.11),(lo+hi)/2,zz]});}
 }
 for(let yy=lo+5;yy<hi-.5;yy+=6)for(const sign of [-1,1]){
 const qFront=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sign<0?Math.PI:0),qSide=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sign*Math.PI/2);
 seams.push({g:surfaceStrap(w-.32,.11,.075),p:[0,yy,sign*(d/2-.14)],q:qFront},{g:surfaceStrap(d-.32,.11,.075),p:[sign*(w/2-.14),yy,0],q:qSide});
 for(let k=0;k<5;k++)rivets.push({g:rivetGeo,p:[-w*.42+k*w*.21,yy,sign*(d/2+.037)],q:qFront});
 for(let k=0;k<7;k++)rivets.push({g:rivetGeo,p:[sign*(w/2+.037),yy,-d*.44+k*d*.88/6],q:qSide});
 }
 ribs.push({g:C(w,.18,d,.04),p:[0,hi-.09,0]});
 }solid('FluteRibs',merge(ribs),paint,leg);solid('PlateSeams',merge(seams),inset,leg);solid('RivetRows',merge(rivets),paint,leg);
 const crown=group('Crown'+side,tower,[x,223.81464,0]);
 solid('SaddleBed',C(4.3,.35,7.8,.10),inset,crown,[0,.175,0]);
 solid('RoundedSaddleHousing',roundedSaddleHousing(z,fittingCableGeo),paint,crown);
// First tier bites into the rounded roof without reaching the cable passage.
const pedestal=[];
pedestal.push({g:C(1.60,.86,1.90,.06),p:[0,4.55,0]}); // 4.12 .. 4.98
pedestal.push({g:C(1.34,.60,1.60,.05),p:[0,5.27,0]}); // 4.97 .. 5.57
pedestal.push({g:C(1.10,.70,1.28,.04),p:[0,5.91,0]}); // 5.56 .. 6.26
solid('SteppedBeaconPlinth',merge(pedestal),paint,crown);
const crownPanels=[];
for(const sign of [-1,1])crownPanels.push({
  g:recessPanel(.94,.58),p:[0,4.55,sign*.935],s:[1,1,.22],
  q:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sign<0?Math.PI:0)
});
solid('CrownInsetPanels',merge(crownPanels),inset,crown);
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
 const deck=group('Deck',root),roadParts=roadSurfaceParts(roadSolid(-9.4488,9.4488,-D.stub,D.stub,0,.45,160));solid('Roadway',roadParts[0],asphalt,deck);solid('Roadbed',roadParts[1],asphalt,deck);
 solid('Underdeck',roadSolid(-9.4488,9.4488,-D.stub,D.stub,-.43,.10,96),paint,deck);
 for(const side of [-1,1]){const concreteWalk=[],steelWalk=[],edgeSteel=[],cuts=[-D.stub,-D.halfMain-26,-D.halfMain+26,D.halfMain-26,D.halfMain+26,D.stub],x0=side>0?9.4488:-12.4968,x1=side>0?12.4968:-9.4488;
 for(let i=0;i<cuts.length-1;i++){const a=cuts[i],b=cuts[i+1],isBypass=i===1||i===3;(isBypass?steelWalk:concreteWalk).push({g:roadSolid(x0,x1,a,b,.22,.28,isBypass?12:32,side)});if(isBypass){for(const xx of [x0,x1])edgeSteel.push({g:roadSolid(xx-.065,xx+.065,a,b,.19,.53,12,side)});}}
 solid(side>0?'WestWalk':'EastWalk',merge(concreteWalk),concrete,deck);solid(side>0?'WestSteelBypass':'EastSteelBypass',merge(steelWalk),paint,deck);solid(side>0?'WestBypassFascia':'EastBypassFascia',merge(edgeSteel),paint,deck);}
 const unitBox=new THREE.BoxGeometry(1,1,1),memberGeo=FULL?unitBox:openVerticalBox(1,1,1);
 const trianglePlate=meshGeo({positions:[-.5,-.5,-.5,-.5,-.5,.5,-.5,.5,0,.5,-.5,-.5,.5,-.5,.5,.5,.5,0],indices:[0,1,2,3,5,4,0,3,4,0,4,1,1,4,5,1,5,2,2,5,3,2,3,0]});
 const ropeGeo=FULL?new THREE.CylinderGeometry(.03413125,.03413125,1,5):new THREE.CylinderGeometry(.03413125,.03413125,1,FAR?3:4,1,true);
 const bandGeo=new THREE.CylinderGeometry(.535,.535,.72,FULL?10:6);
 const boltGeo=new THREE.OctahedronGeometry(.09,0);
 const stations=[];for(let k=-63;k<=63;k++){const zz=k*D.pitch;if(Math.abs(Math.abs(zz)-D.halfMain)>1)stations.push(zz);}
 for(const [side,x] of [['West',D.cableX],['East',-D.cableX]]){
 const hg=group('Suspenders'+side,root),rr=[],bb=[],ff=[],sockets=[];
 for(const zz of stations){const cy=cableY(zz),dy=road(zz)-.40,delta=new THREE.Vector3(0,cableY(zz+.1)-cableY(zz-.1),.2).normalize(),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta);
 bb.push({g:bandGeo,p:[x,cy,zz],q});
 for(const s of (FAR?[0]:[-1,1])){rr.push(segmentItem(ropeGeo,[x+s*.25,dy,zz],[x+s*.25,cy-.32,zz]));sockets.push({g:new THREE.BoxGeometry(.18,.56,.22),p:[x+s*.25,dy+.23,zz]});ff.push({g:new THREE.BoxGeometry(.28,.16,.95),p:[x+s*.56,cy-.18,zz]});
 for(const dz of [-.28,0,.28])ff.push({g:boltGeo,p:[x+s*.57,cy-.02,zz+dz]});
 }sockets.push({g:new THREE.BoxGeometry(1.32,.20,.70),p:[x,dy-.01,zz]});
 }
 solid('RopePairs',merge(rr),paint,hg);solid('CableBands',merge(bb),paint,hg);solid('ClampFlangesBolts',merge(ff),inset,hg);solid('DeckClevises',merge(sockets),paint,hg);
 }
 const under=group('DeckLateralBracing',root),cross=[];
 for(let k=-64;k<64;k+=(FULL?1:4)){const z0=k*D.pitch,z1=(k+(FULL?1:4))*D.pitch,y0=road(z0)-7.96,y1=road(z1)-7.96;
 cross.push(segmentItem(memberGeo,[-13.716,y0,z0],[13.716,y1,z1],[.18,.24]),segmentItem(memberGeo,[13.716,y0,z0],[-13.716,y1,z1],[.18,.24]));
 cross.push({g:unitBox,p:[0,y0,z0],s:[27.432,.50,.24]});
 }solid('CrossFramesAndLateralX',merge(cross),paint,under);
 const floorItems=[],stringerItems=[],walkStools=[],stoolGeo=openVerticalBox(.36,1.11,.34);
 for(const zz of stations){const yy=road(zz);floorItems.push(
 {g:unitBox,p:[0,yy-1.80,zz],s:[27.432,1.20,.12]},
 {g:unitBox,p:[0,yy-1.18,zz],s:[27.432,.10,.44]},
 {g:unitBox,p:[0,yy-2.40,zz],s:[27.432,.10,.44]});
 if(Math.abs(Math.abs(zz)-D.halfMain)>=26)for(const side of [-1,1])walkStools.push({g:stoolGeo,p:[side*10.9728,yy-.595,zz]});
 }
 for(const xx of [-6.3,-3.15,0,3.15,6.3])stringerItems.push({g:roadSolid(xx-.07,xx+.07,-D.end,D.end,-.50,.64,32)},{g:roadSolid(xx-.23,xx+.23,-D.end,D.end,-1.10,.10,32)});
 if(!FULL){floorItems.length=0;for(let i=0;i<stations.length;i+=2){const zz=stations[i];floorItems.push({g:unitBox,p:[0,road(zz)-1.80,zz],s:[27.432,1.20,.44]});}}
 solid('FloorbeamISections',merge(floorItems),paint,under);
 solid('SidewalkBearingStools',merge(walkStools),paint,under);
 solid('LongitudinalTStringers',merge(stringerItems),paint,under);
 for(const [side,x] of [['West',D.cableX],['East',-D.cableX]]){
 const truss=group('DeckTruss'+side,root),members=[],gussets=[],hardware=[];
 const chords=[];for(const off of [0,-D.truss+.3]){if(FULL){for(const dx of [-.27,.27])chords.push({g:roadSolid(x+dx-.06,x+dx+.06,-D.end,D.end,-.31+off,.62,32)});chords.push({g:roadSolid(x-.22,x+.22,-D.end,D.end,-.55+off,.14,32)});}else chords.push({g:roadSolid(x-.27,x+.27,-D.end,D.end,-.31+off,.62,L.roadSteps)});}solid('RolledChords',merge(chords),paint,truss);
 const n=L.trussBays,tstep=FULL?7.62:2*D.end/n;
 for(let k=0;k<n;k++){const z0=-D.end+k*tstep,z1=z0+tstep,top0=road(z0)-.62,top1=road(z1)-.62,bot0=top0-D.truss+.3,bot1=top1-D.truss+.3;
 // continuous rolled chord profiles are emitted once per cable plane
 const a=[x,k%2?bot0:top0,z0],b=[x,k%2?top1:bot1,z1];members.push(segmentItem(memberGeo,a,b,[.26,.34]));
 members.push(segmentItem(memberGeo,[x,bot0,z0],[x,top0,z0],[.24,.32]));
 for(const yy of [top0,bot0]){for(const dx of [-.34,.34])gussets.push({g:trianglePlate,p:[x+dx,yy,z0],s:[.10,1.0,1.05]});}
 }
 solid('ChordsPostsDiagonals',merge(members),paint,truss);solid('GussetPlates',merge(gussets),inset,truss);
 }
 // Pedestrian bypasses flare around each main tower leg.
 function walkCenter(zz){const a=Math.abs(Math.abs(zz)-D.halfMain);return 10.9728+(a<10.5?8.6:a<26?8.6*(26-a)/15.5:0);}
 const railRoot=group('SidewalkRailings',deck),railItems=[],innerItems=[];
 const balGeo=openVerticalBox(.032,1.1392,.032),postGeo=openVerticalBox(.09,1.2192,.09),guardPostGeo=openVerticalBox(.10,.88,.10);
 const avoidTower=zz=>Math.abs(Math.abs(zz)-D.halfMain)<7;
 for(const sign of [-1,1]){
 const start=-D.stub,end=D.stub,steps=Math.round((end-start)/L.railPitch),pitch=(end-start)/steps;
 for(let k=0;k<steps;k++){const z0=start+k*pitch,z1=z0+pitch,y0=road(z0)+.22,y1=road(z1)+.22,x0=sign*(walkCenter(z0)+1.47),x1=sign*(walkCenter(z1)+1.47);
 railItems.push({g:postGeo,p:[x0,y0+.6096,z0]});
 // Handrails are continuous geometry below, without hidden per-bay end caps.
 for(let b=1;b<(FULL?4:1);b++){const zz=z0+pitch*b/4;railItems.push({g:balGeo,p:[sign*(walkCenter(zz)+1.47),road(zz)+.87,zz]});}
 // Guard rail on the curb side remains clear of the roadway.
 if(FULL||k%2===0)innerItems.push({g:guardPostGeo,p:[sign*(walkCenter(z0)-1.36),y0+.44,z0]});
 }
 for(const hh of [.12,1.2192])railItems.push({g:roadSolid(sign*12.4428-.0375,sign*12.4428+.0375,-D.stub,D.stub,.22+hh+.0375,.075,96,sign)});for(const hh of [.42,.88])innerItems.push({g:roadSolid(sign*9.6128-.05,sign*9.6128+.05,-D.stub,D.stub,.22+hh+.0375,.075,96,sign)});
 solid(sign>0?'WestCurb':'EastCurb',roadSolid(sign>0?9.4488:-9.6488,sign>0?9.6488:-9.4488,-D.stub,D.stub,.27,.30,160),concrete,deck);
 }
 solid('OuterOpenRailings',merge(railItems),paint,railRoot);solid('RoadSafetyRailings',merge(innerItems),paint,railRoot);
 const barrier=group('MovableMedian',deck),median=[],medianCount=FULL?Math.ceil(2*D.stub):1,medianPitch=2*D.stub/medianCount,medianJoint=FULL?.004:0;
 for(let k=0;k<medianCount;k++){const z0=-D.stub+k*medianPitch+(k?medianJoint/2:0),z1=-D.stub+(k+1)*medianPitch-(k<medianCount-1?medianJoint/2:0);median.push({g:roadSolid(-.1524,.1524,z0,z1,.8128,.8128,FULL?1:L.roadSteps)});}
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
 for(const armY of [6.4,7.07]){const arm=[];for(let i=0;i<=L.armSteps;i++){const t=i/L.armSteps*Math.PI/2;arm.push([2.05*(1-Math.cos(t)),armY+1.95*Math.sin(t),0]);}
 lampBody.push({g:sweepProfile([[-.065,-.08],[.065,-.08],[.065,.08],[-.065,.08]],arm,{up:[0,0,1]})});}
 lampBody.push({g:C(1.35,.30,.62,.04),p:[2.27,8.68,0]},{g:C(.26,.18,.30,.025),p:[0,5.85,0]});
 lampGlass.push({g:C(1.14,.10,.48,.03),p:[2.27,8.49,0]});
 const lampGeo=merge(lampBody),lensGeo=merge(lampGlass);
 for(const side of [-1,1]){const bodies=[],lenses=[],q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),side>0?Math.PI:0);
 for(let k=-22;k<=22;k++){if(!FULL&&k%L.lampStep!==0)continue;const zz=k*45.72;if(Math.abs(Math.abs(zz)-D.halfMain)<11)continue;const p=[side*9.91,road(zz)+.22,zz];bodies.push({g:lampGeo,p,q});lenses.push({g:lensGeo,p,q});}
 const sideRoot=group(side>0?'WestLampArray':'EastLampArray',lamps);solid('StandardsAndTwinArms',merge(bodies),paint,sideRoot);solid('AmberLenses',merge(lenses),glass,sideRoot);
 }
 const bypass=group('TowerSidewalkBrackets',deck),bk=[];
 for(const tz of [-D.halfMain,D.halfMain])for(const side of [-1,1])for(const dz of [-10.5,-6,6,10.5]){const zz=tz+dz,yy=road(zz)-.06;
 bk.push(segmentItem(C(.22,1,.32,.025),[side*13.7,yy-3.8,tz+Math.max(-6,Math.min(6,dz))],[side*20.8,yy-.10,zz]));
 bk.push(segmentItem(C(.20,1,.34,.022),[side*13.7,yy-.10,tz+Math.max(-5.5,Math.min(5.5,dz))],[side*20.8,yy-.10,zz]));
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
 solid('AccessDoorReveal',C(1.14,2.0,.14,.045),inset,pylon,[0,64.2,-sgn*3.63]);solid('InsetAccessDoor',C(.80,1.57,.08,.025),dark,pylon,[0,64.2,-sgn*(FAR?3.625:3.715)]);
 }
 solid('FormworkCourseLines',merge(courses),dark,a);solid('HousingPilasters',merge(pilasters),concrete,a);
 }
 function qualify(node,prefix){for(const child of node.children){child.name=prefix+'_'+child.name;qualify(child,child.name);}}for(const child of root.children)qualify(child,child.name);
 root.traverse(node=>{
  const names={Deck_Mesh_Roadway:'Roadway',Deck_Mesh_WestCurb:'CurbsWest',Deck_Mesh_EastCurb:'CurbsEast',Deck_MovableMedian_Mesh_LinkedConcreteUnits:'Median'};
  if(names[node.name])node.name=names[node.name];
  const match=/^(South|North)Tower_Crown(West|East)_Mesh_AircraftWarningLens$/.exec(node.name);
  if(match)node.name='Beacon_'+match[1]+'_'+match[2];
 });
 root.userData={lod:PARAMS.lod,units:'metres',up:'+Y',roadAxis:'+Z',sceneNodes:['Roadway','Median','CurbsWest','CurbsEast','Beacon_South_West','Beacon_South_East','Beacon_North_West','Beacon_North_East']};
 return root;
}