const meta={name:'Golden bound hay bale',role:'prop'};

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
 const root=createRoot('HayBale');const straw=await compilePortableMaterialSpecV2({"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Farm compressed golden straw","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.583eb73450267db85733ef488259788e70e2757cf650d09ef84ea807f41a9279.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.583eb73450267db85733ef488259788e70e2757cf650d09ef84ea807f41a9279.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.583eb73450267db85733ef488259788e70e2757cf650d09ef84ea807f41a9279.metallic-roughness"}}});straw.color.setHex(0xc9af78); const twine=gameMaterial(0x51432d,{roughness:.96});const b=bucket(),t=bucket();
 const xs=[-.5,-.465,-.31,-.282,-.27,-.258,-.23,.23,.258,.27,.282,.31,.465,.5];
 function profile(x){const end=Math.abs(x)>.465?.024:0;const squeeze=Math.abs(Math.abs(x)-.27)<.013?.012:0;const h=.25-end-squeeze,z=.25-end-squeeze,c=.045;return [[-z+c,-h],[z-c,-h],[z,-h+c],[z,h-c],[z-c,h],[-z+c,h],[-z,h-c],[-z,-h+c]];}
 function point(x,p){return [Math.abs(x)===.5?x*.994:x,p[1]+.25,p[0]];}
 for(let i=0;i<xs.length-1;i++){const a=profile(xs[i]),c=profile(xs[i+1]);for(let j=0;j<8;j++){const k=(j+1)%8;const pts=[point(xs[i],a[j]),point(xs[i+1],c[j]),point(xs[i+1],c[k]),point(xs[i],a[k])];const n=[0,(a[j][1]+a[k][1])/2,(a[j][0]+a[k][0])/2];const uv=pts.map(p=>[Math.abs(n[1])>Math.abs(n[2])?(p[2]+.25)/.5:p[1]/.5,p[0]+.5]);face(b,pts,uv,n);}}
 for(const x of [-.5,.5]){const ps=profile(x).map(p=>point(x,p));face(b,ps,ps.map(p=>[p[2]*3+.5,p[1]*3]),[x,0,0]);}
 // Closed shallow cut-stalk prisms; all share the straw draw call.
 for(const sign of [-1,1])for(let row=0;row<7;row++)for(let col=0;col<6;col++){
 const z=-.175+col*.066+(row%2)*.006,y=.07+row*.059;
 const x=sign*.5,deep=sign*.496;const ring=[[deep,y-.010,z-.007],[deep,y+.009,z-.007],[deep,y+.012,z+.004],[deep,y-.008,z+.004]],tip=[x,y,z];
 face(b,ring,ring.map(p=>[p[2]*3+.5,p[1]*3]),[-sign,0,0]);
 for(let j=0;j<4;j++){const a=ring[j],c=ring[(j+1)%4],pts=[a,c,tip];face(b,pts,pts.map(p=>[p[2]*3+.5,p[1]*3]),[sign,(a[1]+c[1])/2-y,(a[2]+c[2])/2-z]);}
 }
 // Each twine loop is a single closed swept six-sided cord; identical start/end indices.
 for(const x of [-.27,.27]){const prof=profile(x),rings=[];for(let j=0;j<8;j++){const p=prof[j],prev=prof[(j+7)%8],next=prof[(j+1)%8];let nz=p[0],ny=p[1];const l=Math.hypot(nz,ny);nz/=l;ny/=l;const ring=[];for(let k=0;k<6;k++){const a=k*Math.PI/3;ring.push([x+.009*Math.cos(a),.25+p[1]+ny*(.002+.009*Math.sin(a)),p[0]+nz*(.002+.009*Math.sin(a))]);}rings.push(ring);}
 for(let j=0;j<8;j++)for(let k=0;k<6;k++){const jj=(j+1)%8,kk=(k+1)%6;const pts=[rings[j][k],rings[jj][k],rings[jj][kk],rings[j][kk]];const a=(k+.5)*Math.PI/3;const mid=prof[j].map((v,i)=>(v+prof[jj][i])/2);face(t,pts,[[k/6,j/8],[k/6,(j+1)/8],[(k+1)/6,(j+1)/8],[(k+1)/6,j/8]],[Math.cos(a),mid[1]*Math.sin(a),mid[0]*Math.sin(a)]);}}
 finish(root,'Compressed_straw',b,straw);finish(root,'Two_continuous_twine_loops',t,twine);return root;
}
