const meta={name:"mossy-rock"};

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
 for(let j=0;j<3;j++)for(let i=0;i<N;i++){const k=(i+1)%N,slot=j===2&&[1,2,6].includes(i)?1:0;tri(pts[j][i],pts[j+1][i],pts[j+1][k],slot);tri(pts[j][i],pts[j+1][k],pts[j][k],slot);}
 for(let i=0;i<N;i++){const k=(i+1)%N;tri(centers[0],pts[0][i],pts[0][k],0);tri(centers[3],pts[3][k],pts[3][i],[1,2,6].includes(i)?1:0);}
 const g=meshGeo({positions:P,indices:I,uvs:UV});for(const group of groups)g.addGroup(group.start,group.count,group.materialIndex);return g;
}

async function build(){const root=createRoot('MossyRock');const stone=await compilePortableMaterialSpecV3({"schemaVersion":3,"model":"pbrMetallicRoughness","name":"Cold stone / planar strata","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.fdc98fb92c073a8d9d864ea0fd010da243ec07dfbe8acb614604281572a8a961.base-color","sampler":{"minFilter":"nearest-mipmap-linear","magFilter":"nearest","wrapS":"repeat","wrapT":"repeat"}}}}),moss=await compilePortableMaterialSpecV3({"schemaVersion":3,"model":"pbrMetallicRoughness","name":"Rock moss / clustered lichen","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.2590cc5768410914ffaf521949da5cc5f54f58a8f689bb5c5c44540a27f9a37f.base-color","sampler":{"minFilter":"nearest-mipmap-linear","magFilter":"nearest","wrapS":"repeat","wrapT":"repeat"}}}});const mesh=new THREE.Mesh(stoneGeo(),[stone,moss]);mesh.name='Mesh_Rock';root.add(mesh);return root;}