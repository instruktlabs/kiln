const meta={name:"Wheat",role:"prop"};

function bucket(){return {p:[],uv:[]};}
function tri(b,a,c,d){for(const v of [a,c,d]){b.p.push(...v);b.uv.push(v[0]/0.5,v[1]);}}
function addGeo(b,g){const p=g.getAttribute('position'),ix=g.index;for(let i=0;i<(ix?ix.count:p.count);i++){let j=ix?ix.getX(i):i;const x=p.getX(j),y=p.getY(j),z=p.getZ(j);b.p.push(x,y,z);b.uv.push(x/0.5,y);}g.dispose();}
function rod(b,a,c,r0,r1,n=5){const av=new THREE.Vector3(...a),cv=new THREE.Vector3(...c),d=cv.clone().sub(av);const g=new THREE.CylinderGeometry(r1,r0,d.length(),n,1,false);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...av.add(cv).multiplyScalar(.5).toArray());addGeo(b,g);}
function finish(b,name,mat,parent){return createPart(name,meshGeo({positions:b.p,uvs:b.uv}),mat,{parent});}
function solid(color){return new THREE.MeshStandardMaterial({color,roughness:0.92,metalness:0,flatShading:true});}
function mound(b,rx,rz,h,n=12){const low=[],high=[];for(let i=0;i<n;i++){const t=i*2*Math.PI/n,rr=1+0.055*Math.sin(i*2.7);low.push([rx*Math.cos(t)*rr,0,rz*Math.sin(t)*rr]);high.push([rx*.77*Math.cos(t)*rr,h*.73,rz*.77*Math.sin(t)*rr]);}for(let i=0;i<n;i++){let j=(i+1)%n;tri(b,[0,0,0],low[i],low[j]);tri(b,low[i],high[i],low[j]);tri(b,low[j],high[i],high[j]);tri(b,high[i],[0,h,0],high[j]);}}
function thickLeaf(b,origin,angle,L,W,rise){const outline=[[0,0],[.48,-.52],[1,0],[.48,.52]];const cv=(u,v,y)=>[origin[0]+Math.cos(angle)*u*L-Math.sin(angle)*v*W,origin[1]+y+u*rise,origin[2]+Math.sin(angle)*u*L+Math.cos(angle)*v*W];const center=cv(.45,0,.024),bottom=cv(.45,0,.012);for(let i=0;i<outline.length;i++){let j=(i+1)%outline.length;const a=cv(...outline[i],0),c=cv(...outline[j],0),ad=[a[0],a[1]-.008,a[2]],cd=[c[0],c[1]-.008,c[2]];tri(b,center,c,a);tri(b,bottom,ad,cd);tri(b,a,c,ad);tri(b,c,cd,ad);}}

async function build(){
const root=createRoot('Wheat'),plant=createRoot('Plant');root.add(plant);
const straw=await compilePortableMaterialSpecV2({"schemaVersion":2,"model":"pbrMetallicRoughness","name":"Farm compressed golden straw","baseColor":16777215,"roughness":1,"metalness":0,"emissiveIntensity":1,"alphaMode":"opaque","alphaCutoff":0.5,"doubleSided":false,"textures":{"baseColor":{"kind":"resource","resourceId":"kiln.library.583eb73450267db85733ef488259788e70e2757cf650d09ef84ea807f41a9279.base-color"},"normal":{"kind":"resource","resourceId":"kiln.library.583eb73450267db85733ef488259788e70e2757cf650d09ef84ea807f41a9279.normal"},"metallicRoughness":{"kind":"resource","resourceId":"kiln.library.583eb73450267db85733ef488259788e70e2757cf650d09ef84ea807f41a9279.metallic-roughness"}}});straw.flatShading=true;straw.normalScale.set(.18,.18);
const stems=bucket(),heads=bucket(),blades=bucket(),soil=bucket();
const heights=[.90,.78,.85,.72,.83,.76,.88,.70,.81,.75,.86,.79];
for(let i=0;i<12;i++){
 const a=i*2.399963,r=.040+.087*Math.sqrt(i/11),x=Math.cos(a)*r,z=Math.sin(a)*r,h=heights[i];
 const lx=.022*Math.cos(a+.5),lz=.024*Math.sin(a-.2),base=[x*.66,.018,z*.66],neck=[x+lx,h-.18,z+lz],tip=[x+lx*1.6,h,z+lz*1.6];
 rod(stems,base,neck,.007,.0045);rod(stems,neck,tip,.0045,.0018);
 for(let k=0;k<4;k++)for(let s of [-1,1]){
  const t=k/4,cx=neck[0]+(tip[0]-neck[0])*t,cz=neck[2]+(tip[2]-neck[2])*t,cy=neck[1]+.02+k*.037;
  const side=a+.45,rad=.023*(1-k*.12),out=[Math.cos(side)*s,0,Math.sin(side)*s];
  const g=new THREE.OctahedronGeometry(1,0);g.scale(rad,.041,.016);g.rotateZ(s*.34);g.rotateY(-side);g.translate(cx+out[0]*.010,cy,cz+out[2]*.010);addGeo(heads,g);
 }
 const leafY=.35+(i%3)*.065, tLeaf=(leafY-base[1])/(neck[1]-base[1]); const anchor=base.map((v,j)=>v+(neck[j]-v)*tLeaf);
 thickLeaf(blades,anchor,a,.13,.033,.13);
}
mound(soil,.197,.181,.032);
finish(soil,'Soil',solid(0x785334),root);finish(stems,'Stalks',straw,plant);finish(heads,'TwelveSeedHeads',straw,plant);finish(blades,'StrawLeaves',straw,plant);
return root;
}