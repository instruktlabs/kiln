// Original cabbage growth family. CC0-1.0. Metres; fixed planting root [0,0,0].
const STAGE = 4;
const meta = { name: 'cabbage-stage-' + STAGE };
const SOIL_SPEC = {"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Coarse brown soil","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.d0c33de000ded1132e8e826d55d4814d5f7f3665a77ce08d3a3beaf9fc3bca28.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.d0c33de000ded1132e8e826d55d4814d5f7f3665a77ce08d3a3beaf9fc3bca28.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.d0c33de000ded1132e8e826d55d4814d5f7f3665a77ce08d3a3beaf9fc3bca28.metallic-roughness"}}};
function mesh(positions, indices, uvs) { return meshGeo({positions,indices,...(uvs?{uvs}:{})}); }
function mound() {
  const p=[],ix=[],uv=[],N=16;
  const rings=[[.14,0],[.132,.016],[.088,.032]];
  for(let j=0;j<3;j++)for(let i=0;i<N;i++){
    const a=i*2*Math.PI/N, r=rings[j][0]*(1+.035*Math.sin(i*2.4));
    const x=r*Math.cos(a),z=r*Math.sin(a);p.push(x,rings[j][1],z);uv.push(.5+x/2,.5+z/2);
  }
  p.push(0,.038,0,0,0,0);uv.push(.5,.5,.5,.5);
  for(let j=0;j<2;j++)for(let i=0;i<N;i++){const a=j*N+i,b=j*N+(i+1)%N,c=a+N,d=b+N;ix.push(a,c,b,b,c,d);}
  for(let i=0;i<N;i++){ix.push(32+i,48,32+(i+1)%N);ix.push(i,(i+1)%N,49);}
  return mesh(p,ix,uv);
}
// A closed thick shell with a narrow petiole, broad blade, and two quiet folds.
function blade(reach,rise,width,angle,base,phase,wrap) {
  const p=[],faces=[],rows=[],T=[0,.14,.34,.57,.78,.93,1],U=[-1,-.5,0,.5,1];
  for(let j=0;j<T.length;j++){
    const t=T[j], row=[]; const vals=(j===0||j===T.length-1)?[0]:U;
    for(const u of vals){
      const f=Math.pow(Math.sin(Math.PI*t),.60)*(.40+.60*t);
      let x=reach*Math.sin(t*Math.PI/2),y=base+rise*t-.11*rise*Math.sin(Math.PI*t),z=u*width*.5*f;
      y+=width*.19*u*u*Math.sin(Math.PI*t)+width*.035*Math.sin(3*Math.PI*t+phase)*Math.abs(u);
      x+=width*.045*Math.sin(2*Math.PI*t+phase)*u;
      if(wrap){const theta=.12+2.62*t; x=.201*Math.sin(theta);y=.21-.150*Math.cos(theta);z=u*width*.5*f; x*=Math.sqrt(Math.max(.22,1-z*z/(.205*.205))); }
      const c=Math.cos(angle),s=Math.sin(angle);row.push(p.length/3);p.push(x*c-z*s,y,x*s+z*c);
    } rows.push(row);
  }
  for(let j=0;j<rows.length-1;j++){
    const a=rows[j],b=rows[j+1];
    if(a.length===1){for(let k=0;k<4;k++)faces.push(a[0],b[k+1],b[k]);}
    else if(b.length===1){for(let k=0;k<4;k++)faces.push(a[k],a[k+1],b[0]);}
    else for(let k=0;k<4;k++)faces.push(a[k],a[k+1],b[k],a[k+1],b[k+1],b[k]);
  }
  // Offset the second surface along averaged normals, then stitch every rim edge.
  const tmp=mesh(p,faces), ns=tmp.getAttribute('normal'), count=p.length/3;
  const thick=wrap?.0024:Math.max(.0014,width*.024);
  for(let i=0;i<count;i++)p.push(p[3*i]-ns.getX(i)*thick,p[3*i+1]-ns.getY(i)*thick,p[3*i+2]-ns.getZ(i)*thick);
  const ix=faces.slice(); for(let i=0;i<faces.length;i+=3)ix.push(faces[i]+count,faces[i+2]+count,faces[i+1]+count);
  const boundary=[rows[0][0],...rows.slice(1,-1).map(r=>r[0]),rows[6][0],...rows.slice(1,-1).reverse().map(r=>r[4])];
  for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];ix.push(a,b,a+count,b,b+count,a+count);}
  return mesh(p,ix);
}
function core(){
  const p=[0,.059,0],ix=[],N=12;
  for(let j=1;j<8;j++){const t=j*Math.PI/8;for(let i=0;i<N;i++){const a=i*2*Math.PI/N;const r=.195*Math.sin(t)*(1+.035*Math.sin(3*a+t));p.push(r*Math.cos(a),.215-.156*Math.cos(t),r*Math.sin(a));}}
  const top=p.length/3;p.push(0,.371,0);
  for(let i=0;i<N;i++)ix.push(0,1+(i+1)%N,1+i);
  for(let j=0;j<6;j++)for(let i=0;i<N;i++){const a=1+j*N+i,b=1+j*N+(i+1)%N;ix.push(a,b,a+N,b,b+N,a+N);}
  for(let i=0;i<N;i++)ix.push(73+i,73+(i+1)%N,top);
  // Reverse spherical winding to outward.
  for(let i=0;i<ix.length;i+=3){const v=ix[i+1];ix[i+1]=ix[i+2];ix[i+2]=v;}
  return mesh(p,ix);
}

function headWrap(index){
  // Sample the SAME faceted core surface. A raised face and buried inner face
  // form a true overlapping leaf, with no independent near-coplanar tessellation.
  const geo=core(),a=geo.getAttribute('position'),ix=geo.index;
  const vertices=[],faces=[],cache=new Map();
  const add=p=>{const key=p.map(v=>v.toFixed(7)).join(',');if(cache.has(key))return cache.get(key);const i=vertices.length;vertices.push(p);cache.set(key,i);return i;};
  const center=.3+index*2*Math.PI/3;
  // Clip each core facet to a quiet sixteen-sided leaf outline in angle/height.
  // Intersections interpolate on that exact facet, preserving its plane.
  const outline=Array.from({length:16},(_,i)=>{const a=i*2*Math.PI/16;return[.96*Math.cos(a),.5+.43*Math.sin(a)];});
  for(let i=0;i<ix.count;i+=3){
    let poly=[0,1,2].map(k=>{const j=ix.getX(i+k),p=[a.getX(j),a.getY(j),a.getZ(j)],ang=Math.atan2(p[2],p[0])-center;return{p,q:[Math.atan2(Math.sin(ang),Math.cos(ang)),(p[1]-.059)/.312]};});
    if(Math.max(...poly.map(v=>v.q[0]))-Math.min(...poly.map(v=>v.q[0]))>Math.PI)continue;
    for(let e=0;e<outline.length&&poly.length;e++){
      const A=outline[e],B=outline[(e+1)%outline.length],side=v=>(B[0]-A[0])*(v.q[1]-A[1])-(B[1]-A[1])*(v.q[0]-A[0]),next=[];
      for(let k=0;k<poly.length;k++){
        const v=poly[k],w=poly[(k+1)%poly.length],dv=side(v),dw=side(w);
        if(dv>=-1e-12)next.push(v);
        if((dv>=0)!==(dw>=0)){const t=dv/(dv-dw);next.push({p:v.p.map((x,k)=>x+t*(w.p[k]-x)),q:v.q.map((x,k)=>x+t*(w.q[k]-x))});}
      }poly=next;
    }
    if(poly.length>=3){const ids=poly.map(v=>add(v.p)).filter((v,k,ids)=>v!==ids[(k+ids.length-1)%ids.length]);for(let k=1;k<ids.length-1;k++){const A=vertices[ids[0]],B=vertices[ids[k]],C=vertices[ids[k+1]],u=B.map((x,j)=>x-A[j]),v=C.map((x,j)=>x-A[j]);const area2=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);if(area2>1e-9)faces.push(ids[0],ids[k],ids[k+1]);}}
  }
  const p=[],indices=faces.slice(),n=vertices.length,edges=new Map();
  // Outer lift ~4-7mm after growth scaling, inner face buried ~3mm.
  for(const scale of [1.035,.985])for(const v of vertices)p.push(v[0]*scale,v[1],v[2]*scale);
  for(let i=0;i<faces.length;i+=3){
    indices.push(faces[i]+n,faces[i+2]+n,faces[i+1]+n);
    for(let k=0;k<3;k++){const a=faces[i+k],b=faces[i+(k+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}
  }
  for(const[a,b]of edges.values())indices.push(b,a,a+n,b,a+n,b+n);
  const used=new Map(),compact=[];const remapped=indices.map(i=>{if(!used.has(i)){used.set(i,compact.length/3);compact.push(...p.slice(i*3,i*3+3));}return used.get(i);});
  return mesh(compact,remapped);
}

async function build(){
  const root=createRoot('CabbageSlot');
  const soil=await compilePortableMaterialSpecV2(SOIL_SPEC);soil.name='Shared_seeded_soil';soil.metalness=0;soil.normalScale.set(.18,.18);
  createPart('SoilMound',mound(),soil,{parent:root});
  const plant=createRoot('Plant');root.add(plant);
  const dark=gameMaterial(0x647238,{roughness:.94,metalness:0,flatShading:false});dark.name='Cabbage_dark';
  const light=gameMaterial(0x94A046,{roughness:.93,metalness:0,flatShading:false});light.name='Cabbage_light';
  const pale=gameMaterial(0xb7bd78,{roughness:.95,metalness:0,flatShading:false});pale.name='Cabbage_pale_head';
  const n=[0,2,5,8,5][STAGE];
  createPart('CentralStem',cylinderGeo(.009+STAGE*.0015,.011+STAGE*.002,.055,8),light,{position:[0,.038,0],parent:plant});
  for(let i=0;i<n;i++){
    const a=(i*2*Math.PI/n)+(STAGE===1?.28:.19);
    let reach,rise,width,base=.047;
    if(STAGE===1){reach=.066;rise=.048+(i%2)*.008;width=.060;}
    if(STAGE===2){reach=.075+(i%2)*.018;rise=.12+(i%3)*.021;width=.088;}
    if(STAGE===3){const inner=i>=5;reach=inner?.095:.183;rise=inner?.25:.13+(i%2)*.035;width=inner?.135:.17; }
    if(STAGE===4){reach=.28;rise=.175+(i%2)*.035;width=.255;}
    createPart('Leaf_'+(i+1),blade(reach,rise,width,a,base,i*.63,false),i%3===0?light:dark,{parent:plant});
  }
  if(STAGE===4){
    createPart('HeadHeart',core(),pale,{parent:plant});
    for(let i=0;i<3;i++)createPart('HeadWrap_'+(i+1),headWrap(i),pale,{parent:plant});
  }
  // Scale about the fixed central stem, never recenter the growing bounding box.
  plant.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(plant),size=b.getSize(new THREE.Vector3());
  const width=[0,.14,.28,.47,.60][STAGE],height=[0,.10,.20,.35,.45][STAGE];
  const sx=width/Math.max(size.x,size.z), sy=(height-.025)/(b.max.y-.025);
  plant.traverse(o=>{if(o.isMesh){const a=o.geometry.getAttribute('position');for(let i=0;i<a.count;i++){a.setXYZ(i,a.getX(i)*sx,.025+(a.getY(i)+o.position.y-.025)*sy,a.getZ(i)*sx);}o.position.set(0,0,0);a.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();}});
  // Terrain contact repair only: retain the upper stem ring and all approved foliage.
  // Run after growth scaling, so root allowance is the same 3 mm at every stage.
  const terrainStem=plant.children.find(o=>o.name==='Mesh_CentralStem');
  terrainStem.geometry=copyGeometry(terrainStem.geometry);
  const stemPositions=terrainStem.geometry.getAttribute('position');
  const originalStemBottom=terrainStem.geometry.boundingBox.min.y;
  for(let i=0;i<stemPositions.count;i++){
    if(Math.abs(stemPositions.getY(i)-originalStemBottom)<0.0000001)stemPositions.setY(i,-0.003);
  }
  stemPositions.needsUpdate=true;
  terrainStem.geometry.computeVertexNormals();
  terrainStem.geometry.computeBoundingBox();
  // Merge compatible material meshes; retain semantic component ranges.
  const groups=[{mat:dark,name:'Leaves_Dark'},{mat:light,name:'Leaves_Light_And_Stem'},{mat:pale,name:'Head_Pale'}];
  for(const group of groups){
    const members=plant.children.filter(o=>o.isMesh&&o.material===group.mat);if(!members.length)continue;
    const positions=[],indices=[],ranges=[];
    for(const o of members){const a=o.geometry.getAttribute('position'),ix=o.geometry.index,off=positions.length/3,start=indices.length/3;
      for(let i=0;i<a.count;i++)positions.push(a.getX(i),a.getY(i),a.getZ(i));
      for(let i=0;i<ix.count;i++)indices.push(ix.getX(i)+off);
      ranges.push({name:o.name,triangleStart:start,triangleCount:ix.count/3});plant.remove(o);
    }
    const part=createPart(group.name,mesh(positions,indices),group.mat,{parent:plant});part.userData.components=ranges;
  }
  root.userData={placementRoot:[0,0,0],growthStage:STAGE,leafCount:n,soilOptionalNode:'Mesh_SoilMound',units:'metres',up:'+Y',forward:'+X',right:'+Z',stateSubstitution:true};
  return root;
}

