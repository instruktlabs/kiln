// Golden Gate Bridge | original procedural geometry | CC0
const meta = { name: 'Golden Gate Bridge', role: 'wonder' };
const D = { halfMain:640.08, end:982.98, stub:1032.98, cableX:13.716, tower:227.3808, sag:143.256, pitch:15.24, truss:7.62 };
function road(z) { const a=Math.abs(z); return a<=D.halfMain ? 74.9808+.3192*(1-(a/D.halfMain)**2) : 74.9808-(Math.min(a,D.end)-D.halfMain)*12.9808/(D.end-D.halfMain); }
function cableY(z) {
 const a=Math.abs(z);
 if(a<=D.halfMain) return D.tower-D.sag+D.sag*(a/D.halfMain)**2;
 const t=(a-D.halfMain)/(D.end-D.halfMain);
 return D.tower+(64-D.tower)*t-24*t*(1-t);
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
function roadSolid(x0,x1,z0,z1,topOffset,thick,steps=32) {
 const P=[],I=[],U=[];for(let i=0;i<=steps;i++){const z=z0+(z1-z0)*i/steps,y=road(z)+topOffset;P.push(x0,y,z,x1,y,z,x0,y-thick,z,x1,y-thick,z);U.push(x0,z,x1,z,x0,z,x1,z);}
 for(let i=0;i<steps;i++){const a=4*i,b=a+4;I.push(a,b,a+1,a+1,b,b+1,a+2,a+3,b+2,a+3,b+3,b+2,a,a+2,b,a+2,b+2,b,a+1,b+1,a+3,a+3,b+1,b+3);}
 I.push(0,1,2,1,3,2);const k=steps*4;I.push(k,k+2,k+1,k+1,k+2,k+3);return meshGeo({positions:P,indices:I,uvs:U});
}
function ellipseRing(rx,rz,wall,y0,y1,count=96) {
 const P=[],I=[],U=[];for(let j=0;j<count;j++){const t=j/count*2*Math.PI,c=Math.cos(t),s=Math.sin(t);P.push(rx*c,y0,rz*s,rx*c,y1,rz*s,(rx-wall)*c,y1,(rz-wall)*s,(rx-wall)*c,y0,(rz-wall)*s);U.push(j/count,0,j/count,1,j/count,1,j/count,0);}
 for(let j=0;j<count;j++){let a=4*j,b=4*((j+1)%count);for(let k=0;k<4;k++){const l=(k+1)%4;I.push(a+k,b+k,a+l,a+l,b+k,b+l);}}return meshGeo({positions:P,indices:I,uvs:U});
}
function build() {
 const root=createRoot('GoldenGateBridge');
 const paint=gameMaterial(0xc0362c,{roughness:.36,metalness:0,flatShading:false});
 const inset=gameMaterial(0xab3026,{roughness:.44,metalness:0,flatShading:false});
 const concrete=gameMaterial(0xbdb6a7,{roughness:.88,metalness:0,flatShading:false});
 const asphalt=gameMaterial(0x343639,{roughness:.96,metalness:0});
 const ivory=gameMaterial(0xe8e5d9,{roughness:.72,metalness:0});
 const glass=gameMaterial(0xe9c68c,{roughness:.22,metalness:0,emissive:0xffbd62,emissiveIntensity:.45});
 const red=gameMaterial(0xba1712,{roughness:.18,metalness:0,emissive:0xff1505,emissiveIntensity:.8});
 const dark=gameMaterial(0x413c36,{roughness:.8,metalness:0});
 const mats={paint,inset,concrete,asphalt,ivory,glass,red,dark};
 const cache={};const C=(w,h,d,b=.05)=>{const key=[w,h,d,b].join('_');return cache[key]||(cache[key]=chamfer(w,h,d,b));};
 const towers=[];
 for(const [label,z] of [['South',-D.halfMain],['North',D.halfMain]]) {
 const tower=group(label+'Tower',root,[0,0,z]);towers.push(tower);
 const pier=group('Pier',tower);solid('Footing',C(44,3,26,.4),concrete,pier,[0,.9,0]);solid('PierBody',C(40,11.0112,23,.8),concrete,pier,[0,7.9056,0]);
 const levels=[13.4112,72,121,161,191,223.81464],ws=[10.0584,7.4,6.5,5.4,4.5],ds=[16.4592,11.4,9.7,8,7];
 for(const [side,x] of [['West',D.cableX],['East',-D.cableX]]) {
 const leg=group('Leg'+side,tower,[x,0,0]);
 for(let j=0;j<5;j++)solid('Tier'+(j+1),C(ws[j],levels[j+1]-levels[j],ds[j],.12),paint,leg,[0,(levels[j]+levels[j+1])/2,0]);
 // LEG_DETAIL
 const crown=group('Crown'+side,tower,[x,223.81464,0]);solid('SaddleBlock',C(3.7,3.56616,6.1,.14),paint,crown,[0,1.78308,0]);
 }
 for(const [j,y,h] of [[1,114.87912,9.144],[2,154.50312,9.17448],[3,188.03112,6.64464],[4,218.26728,6.67512]]){const portal=group('Portal'+j,tower);solid('Core',C(27.432,h,j<3?7:5,.12),paint,portal,[0,y,0]);}
 // TOWER_DETAIL
 }
 const fender=group('SouthFender',root,[0,0,-D.halfMain]);solid('EllipticalWall',ellipseRing(45.72,23.622,3.048,-.6,4.572),concrete,fender);
 for(const [side,x] of [['West',D.cableX],['East',-D.cableX]]) {
 const g=group('MainCable'+side,root);const points=[];for(let i=0;i<=800;i++){const z=-1012.98+i*2025.96/800;points.push(new THREE.Vector3(x,cableY(z),z));}
 const path=new THREE.CatmullRomCurve3(points);solid('ContinuousCable',new THREE.TubeGeometry(path,1200,.4619625,12,false),paint,g);
 }
 const deck=group('Deck',root);solid('Roadway',roadSolid(-9.4488,9.4488,-D.stub,D.stub,0,.45,160),asphalt,deck);
 solid('Underdeck',roadSolid(-13.716,13.716,-D.end,D.end,-.5,.124,128),paint,deck);
 for(const side of [-1,1])solid(side>0?'WestWalk':'EastWalk',roadSolid(side>0?9.4488:-12.4968,side>0?12.4968:-9.4488,-D.stub,D.stub,.22,.28,160),concrete,deck);
 // STRUCTURE
 // DECK_DETAIL
 // ANCHORAGES
 return root;
}