function bucket(){return{p:[],n:[],uv:[],c:[]};}
function add(b,geo,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1],tint=1,uvMode='stone',grainAxis=1){
 let g=geo.index?geo.toNonIndexed():geo.clone();
 const p0=g.getAttribute('position'),n0=g.getAttribute('normal'),uv=[];
 for(let i=0;i<p0.count;i++){
  const p=[p0.getX(i),p0.getY(i),p0.getZ(i)],n=[n0.getX(i),n0.getY(i),n0.getZ(i)];
  const a=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));let u,v;
  if(uvMode==='wood'){
   if(a===grainAxis){const axes=[0,1,2].filter(x=>x!==grainAxis),x=p[axes[0]],z=p[axes[1]];u=Math.hypot(x,z)*14;v=Math.atan2(z,x)/6.283;}
   else{const across=[0,1,2].find(x=>x!==grainAxis&&x!==a);u=p[across]/.24;v=p[grainAxis]/.8;}
  }else{const axes=a===0?[2,1]:a===1?[0,2]:[0,1];u=(p[axes[0]]+pos[axes[0]])/.55;v=(p[axes[1]]+pos[axes[1]])/.55;}
  uv.push(u,v);
 }
 g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(...scale)));
 const p=g.getAttribute('position'),n=g.getAttribute('normal');
 for(let i=0;i<p.count;i++){b.p.push(p.getX(i),p.getY(i),p.getZ(i));b.n.push(n.getX(i),n.getY(i),n.getZ(i));b.uv.push(uv[i*2],uv[i*2+1]);b.c.push(tint,tint,tint);}
}
function finish(root,name,b,mat){const g=new THREE.BufferGeometry();for(const[k,a,s]of[['position',b.p,3],['normal',b.n,3],['uv',b.uv,2],['color',b.c,3]])g.setAttribute(k,new THREE.Float32BufferAttribute(a,s));mat.vertexColors=true;return createPart(name,g,mat,{parent:root});}
async function materials(){
 const wood=await materialRecipe('kiln.material.wood.v1',{baseColor:'#a89378',roughness:.78,textureResources:{baseColor:'kiln.texture.weathered-planks-albedo.v1',normal:'kiln.texture.weathered-planks-normal.v1'}});
 const stone=await materialRecipe('kiln.material.stone.v1',{baseColor:'#a8afb1',roughness:.96,textureResources:{baseColor:'kiln.texture.rough-concrete-albedo.v1',normal:'kiln.texture.rough-concrete-normal.v1'}});
 const tex=proceduralTexture({schemaVersion:2,size:128,name:'SnowFine',layers:[{op:'noise',colorA:0xe9eded,colorB:0xfafbf9,scale:40,octaves:2,seed:71}]});
 return{wood,stone,snow:pbrMaterial({albedo:tex,roughness:.96,metalness:0}),iron:new THREE.MeshStandardMaterial({color:0x343938,roughness:.62,metalness:.65})};
}
async function bevel(w,h,d,r){return await roundedBoxGeo(w,h,d,r,{style:'chamfer',segments:2});}
function weather(g,seed,amount){const p=g.getAttribute('position');for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i),s=Math.sin(x*19+y*23+seed)*Math.cos(z*21-y*31+seed);p.setXYZ(i,x+amount*s,y+amount*Math.sin(x*34+z*23+seed),z+amount*Math.sin(x*29+y*31+seed));}g.computeVertexNormals();return g;}
function snowPatch(b,p,s,seed){const g=new THREE.SphereGeometry(1,12,7);weather(g,seed,.07);add(b,g,p,[0,0,0],s,.98,'stone');}

const meta={name:'Cabin pier / dressed granite and joined timber',role:'prop'};
async function build(){
 const root=createRoot('DressedStonePier'),mat=await materials(),stone=bucket(),wood=bucket(),iron=bucket(),snow=bucket();
 add(stone,await bevel(.875,1.469,.875,.01),[0,.7345,0],[0,0,0],[1,1,1],.43);
 for(let row=0;row<6;row++){
  const split=row%2?.08:-.07, widths=[.47+split,.47-split];
  for(let side=0;side<2;side++)for(let i=0;i<2;i++){
   const w=widths[i]-.016,x=i===0?-.48+w/2:.48-w/2,z=(side===0?-.24:.24)+(row%2?-.006:.006);
   const g=weather(await bevel(w,.218,.455,.021),row*7+side*3+i,.0065);
   add(stone,g,row%2?[z,.12+row*.242,-x]:[x,.12+row*.242,z],[0,(row%2)*Math.PI/2+(row+side+i)%2*.013,0],[1,1,1],.78+.06*((row+side*2+i)%4));
  }
 }
 add(wood,weather(await bevel(1.18,.22,1.12,.009),24,.0017),[0,1.095,0],[0,0,0],[1,1,1],1,'wood',0);
 // Subdivided end faces retain radial end-grain UVs between corners.
 for(const side of [-1,1]){const g=new THREE.PlaneGeometry(1.084,.184,28,8);g.rotateY(side*Math.PI/2);add(wood,g,[side*.5913,1.095,0],[0,0,0],[1,1,1],1,'wood',0);}
 // Forged straps wrap the cap and have visible recessed fasteners.
 for(const x of [-.43,.43]){
  add(iron,await bevel(.062,.012,1.115,.002),[x,1.2,0]);
  for(const z of [-.557,.557]){
   add(iron,await bevel(.062,.19,.009,.002),[x,1.105,z]);
   for(const y of [1.055,1.15]){const g=new THREE.CylinderGeometry(.014,.016,.009,8);g.rotateX(Math.PI/2);add(iron,g,[x,y,z+(z>0?.008:-.008)]);}
  }
 }
 // Broken windward accumulations keep the loaded timber contact legible.
 for(const [x,z,sx,sy,sz,seed] of [[-.35,.49,.22,.041,.08,14],[-.12,.51,.15,.032,.055,15],[.29,-.49,.25,.047,.08,17],[.02,-.50,.12,.030,.057,18]])snowPatch(snow,[x,1.226,z],[sx,sy,sz],seed);
 for(let i=0;i<2;i++)snowPatch(snow,[-.3+i*.15,.744,-.478],[.12,.012,.025],38+i);
 // Six actual courses fit the 1.5–1.7m foundation gap with near-uniform world scaling.
 for(const b of [wood,iron,snow])for(let i=1;i<b.p.length;i+=3)b.p[i]+=.484;
 finish(root,'DressedGraniteAndRecessedJoints',stone,mat.stone);finish(root,'TimberCapEndgrain',wood,mat.wood);finish(root,'ForgedStrapsAndPins',iron,mat.iron);finish(root,'ContactSnowPockets',snow,mat.snow);
 return root;
}
