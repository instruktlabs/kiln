const meta={name:'Honeywood closed barrel',role:'prop'};

function bucket(){return {positions:[],uvs:[],indices:[]};}
function face(b,pts,uv,normal){
 const a=pts[0],c=pts[1],d=pts[2]; const u=c.map((v,i)=>v-a[i]),v=d.map((v,i)=>v-a[i]);
 const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 if(n.reduce((s,x,i)=>s+x*normal[i],0)<0){pts=pts.slice().reverse();uv=uv.slice().reverse();}
 const k=b.positions.length/3;for(let i=0;i<pts.length;i++){b.positions.push(...pts[i]);b.uvs.push(...uv[i]);}
 for(let i=1;i<pts.length-1;i++)b.indices.push(k,k+i,k+i+1);
}
function finish(root,name,b,mat){createPart(name,meshGeo(b),mat,{parent:root});}

async function build(){
 const root=createRoot('Barrel');const wood=await compilePortableMaterialSpecV2({"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Farm honey wood (subdued grain derivative)","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.metallic-roughness"}}});const metal=await compilePortableMaterialSpecV2({"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Brushed neutral metal","roughness":1,"metalness":1,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.67c9159b792a918da293bffc9468ed8834957dd51d83ce290af980a72a9065d0.metallic-roughness"}}});
 metal.color.setHex(0x555c62); metal.roughness=1;
 const w=bucket(),m=bucket();const N=16;const levels=[[0,.269],[.035,.279],[.18,.303],[.36,.319],[.54,.319],[.72,.303],[.865,.279],[.9,.269]];
 function radius(y){for(let i=1;i<levels.length;i++)if(y<=levels[i][0]){const a=levels[i-1],b=levels[i];return a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0]);}return .269;}
 function p(a,y,r){return [Math.cos(a)*r,y,Math.sin(a)*r];}
 for(let s=0;s<N;s++)for(let j=0;j<levels.length-1;j++)for(let q=0;q<3;q++){
 const ts=[0,.035,.965,1],a=(s+ts[q])*Math.PI*2/N,b=(s+ts[q+1])*Math.PI*2/N;
 const y0=levels[j][0],y1=levels[j+1][0];const r0=levels[j][1],r1=levels[j+1][1];
 const da=q===0?.0025:0,db=q===2?.0025:0;
 face(w,[p(a,y0,r0-da),p(b,y0,r0-db),p(b,y1,r1-db),p(a,y1,r1-da)],[[a*.3,y0],[b*.3,y0],[b*.3,y1],[a*.3,y1]],[Math.cos((a+b)/2),0,Math.sin((a+b)/2)]);
 }
 // Watertight 48-corner lip and ground cap match every stave seam exactly.
 const uv=pts=>pts.map(v=>[v[2]+.5,v[0]+.5]);
 const rim=[];for(let i=0;i<N;i++)for(const t of [0,.035,.965])rim.push({a:(i+t)*Math.PI*2/N,r:t===0?.2665:.269});
 for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];
 let pts=[p(a.a,.9,a.r),p(b.a,.9,b.r),p(b.a,.879,.243),p(a.a,.879,.243)];face(w,pts,uv(pts),[0,1,0]);
 pts=[p(a.a,.879,.243),p(b.a,.879,.243),p(b.a,.874,.243),p(a.a,.874,.243)];face(w,pts,uv(pts),[-Math.cos(a.a),0,-Math.sin(a.a)]);
 pts=[[0,0,0],p(a.a,0,a.r),p(b.a,0,b.r)];face(w,pts,uv(pts),[0,-1,0]);
 pts=[[0,.874,0],p(a.a,.874,.243),p(b.a,.874,.243)];face(w,pts,uv(pts),[0,1,0]);
 }
 // Five complete fitted lid plank solids, scored joints backed by the closed shell.
 const disk=Array.from({length:N},(_,i)=>p(i*Math.PI*2/N,.883,.244));
 function clip(poly,z,keep){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],aa=(a[2]-z)*keep>=0,bb=(b[2]-z)*keep>=0;if(aa)out.push(a);if(aa!==bb){const t=(z-a[2])/(b[2]-a[2]);out.push(a.map((v,k)=>v+t*(b[k]-v)));}}return out;}
 for(let k=0;k<5;k++){const lo=-.25+k*.1+.002,hi=lo+.096;const poly=clip(clip(disk,lo,1),hi,-1);if(poly.length<3)continue;
 face(w,poly,poly.map(v=>[v[2]+.5,v[0]+.5+k*.17]),[0,1,0]);
 const lower=poly.map(v=>[v[0],.872,v[2]]);face(w,lower,uv(lower),[0,-1,0]);
 for(let j=0;j<poly.length;j++){const q=(j+1)%poly.length;const pts=[poly[j],poly[q],lower[q],lower[j]];const dx=poly[q][0]-poly[j][0],dz=poly[q][2]-poly[j][2];face(w,pts,uv(pts),[dz,0,-dx]);}
 }
 // Three closed hoop solids, following the same stave profile with 1 mm embed.
 for(const yc of [.13,.45,.77]){const y0=yc-.032,y1=yc+.032;for(let i=0;i<N;i++){
 const a=i*Math.PI*2/N,b=(i+1)*Math.PI*2/N,r0=radius(y0),r1=radius(y1);const rings=[[y0,r0-.001],[y0,r0+.006],[y1,r1+.006],[y1,r1-.001]];
 for(let j=0;j<4;j++){const t=rings[j],u=rings[(j+1)%4];const pts=[p(a,t[0],t[1]),p(b,t[0],t[1]),p(b,u[0],u[1]),p(a,u[0],u[1])];const norm=j===0?[0,-1,0]:j===2?[0,1,0]:[Math.cos((a+b)/2)*(j===3?-1:1),0,Math.sin((a+b)/2)*(j===3?-1:1)];face(m,pts,[[a*.3,t[0]],[b*.3,t[0]],[b*.3,u[0]],[a*.3,u[0]]],norm);}
 }}
 finish(root,'Closed_staves_lid_base',w,wood);finish(root,'Three_fitted_hoops',m,metal);return root;
}
