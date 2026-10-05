// Original cabbage growth family. CC0-1.0. Metres; fixed planting root [0,0,0].
const STAGE = 2;
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
async function build(){
  const root=createRoot('CabbageSlot');
  const soil=await compilePortableMaterialSpecV2(SOIL_SPEC);soil.name='Shared_seeded_soil';soil.metalness=0;soil.normalScale.set(.18,.18);
  createPart('SoilMound',mound(),soil,{parent:root});
  const plant=createRoot('Plant');root.add(plant);
  const dark=gameMaterial(0x647238,{roughness:.94,metalness:0,flatShading:false});dark.name='Cabbage_dark';
  const light=gameMaterial(0x94A046,{roughness:.93,metalness:0,flatShading:false});light.name='Cabbage_light';
  const pale=gameMaterial(0xb7bd78,{roughness:.95,metalness:0,flatShading:false});pale.name='Cabbage_pale_head';
  const n=[0,2,5,8,5][STAGE];
  createPart('CentralStem',cylinderGeo(STAGE===1?.005:.010,STAGE===1?.007:.013,.040,8),light,{position:[0,.029,0],parent:plant});
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
    for(let i=0;i<3;i++)createPart('HeadWrap_'+(i+1),blade(0,0,.255,i*2*Math.PI/3+.3,0,i,true),pale,{parent:plant});
  }
  // Scale about the fixed central stem, never recenter the growing bounding box.
  plant.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(plant),size=b.getSize(new THREE.Vector3());
  const width=[0,.14,.28,.47,.60][STAGE],height=[0,.10,.20,.35,.45][STAGE];
  const sx=width/Math.max(size.x,size.z), sy=(height-.025)/(b.max.y-.025);
  plant.traverse(o=>{if(o.isMesh){const a=o.geometry.getAttribute('position');for(let i=0;i<a.count;i++){a.setXYZ(i,a.getX(i)*sx,.025+(a.getY(i)+o.position.y-.025)*sy,a.getZ(i)*sx);}o.position.set(0,0,0);a.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();}});
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

