const meta={name:"Woodland shrub"};

function cardGeo(w,h){return meshGeo({positions:[0,0,0,w,0,0,w,h,0,0,h,0],indices:[0,1,2,0,2,3],uvs:[0,1,1,1,1,0,0,0]});}
function card(name,w,h,material,region,position,rotation,parent){
 const g=remapUVToAtlas(cardGeo(w,h),material.map,region,{inputOrigin:'top-left',mode:'texel-center'});
 const p=createPart(name,g,material,{position,rotation,parent});markOpenShell(p,'Intended MASK vegetation/web sheet, no solid-volume claim');return p;
}
function tube(a,b,r0,r1,n=7){
 const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),axis=B.clone().sub(A).normalize();
 const u=new THREE.Vector3(0,0,1).cross(axis).normalize();if(u.length()<.1)u.set(1,0,0);
 const v=axis.clone().cross(u).normalize(),verts=[],uvs=[];
 const L=A.distanceTo(B),circ=2*Math.PI*(r0+r1)/2;
 function at(t,ang,r){return A.clone().lerp(B,t).addScaledVector(u,Math.cos(ang)*r).addScaledVector(v,Math.sin(ang)*r);}
 function face(p,q,r,uv){verts.push(...p.toArray(),...q.toArray(),...r.toArray());uvs.push(...uv);}
 for(let i=0;i<n;i++){const ang=i*2*Math.PI/n,ang2=(i+1)*2*Math.PI/n,p=at(0,ang,r0),q=at(0,ang2,r0),s=at(1,ang,r1),t=at(1,ang2,r1);
 face(p,q,t,[i*circ/n,0,(i+1)*circ/n,0,(i+1)*circ/n,L]);face(p,t,s,[i*circ/n,0,(i+1)*circ/n,L,i*circ/n,L]);
 face(A,q,p,[.5,.5,.5+Math.cos(ang2)*r0,.5+Math.sin(ang2)*r0,.5+Math.cos(ang)*r0,.5+Math.sin(ang)*r0]);
 face(B,s,t,[.5,.5,.5+Math.cos(ang)*r1,.5+Math.sin(ang)*r1,.5+Math.cos(ang2)*r1,.5+Math.sin(ang2)*r1]);}
 return meshGeo({positions:verts,uvs});
}
function stoneGeo(){
 const rings=[[0,.53,.40],[.24,.78,.57],[.65,.65,.48],[.92,.32,.29]],N=9,P=[],I=[],UV=[],groups=[];
 const centers=rings.map((r,j)=>[.09*Math.sin(j*1.7),r[0],.04*Math.cos(j*2)]);
 const pts=rings.map((r,j)=>Array.from({length:N},(_,i)=>{const a=i*2*Math.PI/N;const f=1+.12*Math.sin(i*2.6+j*.9);return [centers[j][0]+Math.cos(a)*r[1]*f,r[0],centers[j][2]+Math.sin(a)*r[2]*f];}));
 function tri(a,b,c,slot){const start=P.length/3;P.push(...a,...b,...c);I.push(start,start+1,start+2);
 const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),C=new THREE.Vector3(...c),normal=B.sub(A).cross(C.sub(A));
 const abs=[Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)],dominant=abs.indexOf(Math.max(...abs));
 for(const p of [a,b,c])UV.push(p[(dominant+1)%3],p[(dominant+2)%3]);groups.push({start:start,count:3,materialIndex:slot});}
 for(let j=0;j<3;j++)for(let i=0;i<N;i++){const k=(i+1)%N,slot=j===2&&i%4!==0?1:0;tri(pts[j][i],pts[j+1][i],pts[j+1][k],slot);tri(pts[j][i],pts[j+1][k],pts[j][k],slot);}
 for(let i=0;i<N;i++){const k=(i+1)%N;tri(centers[0],pts[0][i],pts[0][k],0);tri(centers[3],pts[3][k],pts[3][i],1);}
 const g=meshGeo({positions:P,indices:I,uvs:UV});for(const group of groups)g.addGroup(group.start,group.count,group.materialIndex);return g;
}

function canopyCard(name,w,h,material,position,rotation,parent){const source=cardGeo(w,h);source.translate(-w/2,-h/2,0);const g=remapUVToAtlas(source,material.map,'bush-leaf',{inputOrigin:'top-left',mode:'texel-center'});const p=createPart(name,g,material,{position,rotation,parent});markOpenShell(p,'Intended woodland MASK leaf cluster');}
async function build(){const root=createRoot('Bush');const leaf=await compilePortableMaterialSpecV3({"schemaVersion":3,"model":"pbrMetallicRoughness","name":"Forest foliage-atlas","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"mask","alphaCutoff":0.5,"doubleSided":true,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.dfdba9380ac1581b5598954ef7230a2241dfc579170cabb91770514807e38fd5.base-color","sampler":{"minFilter":"nearest","magFilter":"nearest","wrapS":"clamp-to-edge","wrapT":"clamp-to-edge"}}}}),bark=await compilePortableMaterialSpecV3({"schemaVersion":3,"model":"pbrMetallicRoughness","name":"Pine bark / broken plates","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.d61ad77c00cb644f52fe0377e7f1edf659d0cfcaf0981f85f1f2d8a119707e24.base-color","sampler":{"minFilter":"nearest-mipmap-linear","magFilter":"nearest","wrapS":"repeat","wrapT":"repeat"}}}});
for(let i=0;i<5;i++){const a=i*2.39996,x=Math.cos(a)*.15,z=Math.sin(a)*.15,h=[.42,.60,.48,.72,.55][i];createPart('WoodyStem_'+i,tube([0,0,0],[x,h,z],.021,.007,5),bark,{parent:root});createPart('Fork_'+i,tube([x*.5,h*.5,z*.5],[x*1.6,h*.86,z*1.6],.012,.004,5),bark,{parent:root});}
for(let i=0;i<20;i++){const a=i*2.39996;canopyCard('CanopyCluster_'+i,.85+(i%3)*.045,.76,leaf,[.12*Math.sin(a),.57+.13*Math.sin(i*1.7),.13*Math.cos(a)],[[0,39,76,-33][i%4],i*137.5,-12+24*Math.sin(i)],root);}return consolidateRenderParts(root);}

// Source-local consolidation only. It keeps the original procedural builders,
// triangle corners, material instances, rig and named rest frames editable.
function consolidateRenderParts(root){
 root.updateWorldMatrix(true,true);const rootInverse=root.matrixWorld.clone().invert(),groups=new Map(),parts=[];
 root.traverse(n=>{if(n.isMesh){if(Array.isArray(n.material))throw new Error('Consolidation requires one material per source part');parts.push(n);}});
 for(const n of parts){let g=groups.get(n.material);if(!g){g={material:n.material,parts:[],skin:!!n.isSkinnedMesh};groups.set(n.material,g);}if(g.skin!==!!n.isSkinnedMesh)throw new Error('Mixed skin/static material requires separate grouping');g.parts.push(n);}
 let groupIndex=0;
 for(const group of groups.values()){
  const positions=[],normals=[],uvs=[],indices=[],weights=[],ranges=[],first=group.parts[0],bones=group.skin?first.skeleton.bones:null;
  for(const n of group.parts){const geometry=n.geometry,p=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv'),si=geometry.getAttribute('skinIndex'),sw=geometry.getAttribute('skinWeight'),matrix=rootInverse.clone().multiply(n.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),start=positions.length/9;
   if(group.skin&&(!n.bindMatrix.equals(first.bindMatrix)||n.skeleton.bones.length!==bones.length||n.skeleton.bones.some((b,i)=>b!==bones[i])||n.skeleton.boneInverses.some((m,i)=>!m.equals(first.skeleton.boneInverses[i]))))throw new Error('Source skin bind compatibility changed');
   for(let i=0;i<(geometry.index?.count??p.count);i++){const k=geometry.index?geometry.index.getX(i):i,P=new THREE.Vector3().fromBufferAttribute(p,k).applyMatrix4(matrix),N=new THREE.Vector3().fromBufferAttribute(normal,k).applyNormalMatrix(normalMatrix);positions.push(...P.toArray());normals.push(...N.toArray());uvs.push(uv.getX(k),uv.getY(k));if(group.skin){for(let j=0;j<4;j++){indices.push(si.getComponent(k,j));weights.push(sw.getComponent(k,j));}}}
   ranges.push({name:n.name,startTriangle:start,triangleCount:positions.length/9-start});
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  // Combined body/leg atlas UVs are intentionally manual full-sheet coordinates.
  // No single named-region stamp is copied onto a mixed-region mesh. Exact source
  // mappings remain in the original builders and the editable triangle ranges.
  const name=group.skin?'SpiderSurface':group.material.alphaTest>0?'FoliageSurface':group.material.name==='Pine bark / broken plates'?'BarkSurface':group.material.name==='Cut endgrain'?'CutSurfaceCombined':'EyeSurface';
  const combined=group.skin?createSkinnedPart(name,geometry,group.material,{parent:root,bones,indices,weights}):createPart(name,geometry,group.material,{parent:root});combined.userData.consolidatedParts=ranges;if(group.material.alphaTest>0)markOpenShell(combined,'Original double-sided MASK foliage cards; intentional open sheets');
  for(const n of group.parts){const marker=new THREE.Object3D();marker.name=n.name;marker.position.copy(n.position);marker.quaternion.copy(n.quaternion);marker.scale.copy(n.scale);marker.userData.consolidatedTriangleRange=ranges.find(r=>r.name===n.name);const parent=n.parent;for(const child of [...n.children])marker.add(child);parent.add(marker);n.removeFromParent();}
  groupIndex++;
 }
 return root;
}
