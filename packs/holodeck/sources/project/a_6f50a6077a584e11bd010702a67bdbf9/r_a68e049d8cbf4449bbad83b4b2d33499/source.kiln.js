function bucket(){return{p:[],n:[],uv:[],c:[]};}
function add(b,geo,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1],tint=1,uvMode='stone',grainAxis=1){
 let g=geo.index?geo.toNonIndexed():geo.clone();
 const p0=g.getAttribute('position'),n0=g.getAttribute('normal'),uv=[];
 for(let i=0;i<p0.count;i++){
  const p=[p0.getX(i),p0.getY(i),p0.getZ(i)],n=[n0.getX(i),n0.getY(i),n0.getZ(i)];
  const a=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));let u,v;
  if(uvMode==='wood'){
   if(a===grainAxis){const axes=[0,1,2].filter(x=>x!==grainAxis),x=p[axes[0]],z=p[axes[1]];u=Math.hypot(x,z)*5;v=Math.atan2(z,x)/6.283;}
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
 const stone=await materialRecipe('kiln.material.stone.v1',{baseColor:'#c1c0b8',roughness:.96,textureResources:{baseColor:'kiln.texture.rock-face-albedo.v1',normal:'kiln.texture.rock-face-normal.v1'}});
 const tex=proceduralTexture({schemaVersion:2,size:128,name:'SnowFine',layers:[{op:'noise',colorA:0xe9eded,colorB:0xfafbf9,scale:40,octaves:2,seed:71}]});
 return{wood,stone,snow:pbrMaterial({albedo:tex,roughness:.96,metalness:0}),iron:new THREE.MeshStandardMaterial({color:0x343938,roughness:.62,metalness:.65})};
}
async function bevel(w,h,d,r){return await roundedBoxGeo(w,h,d,r,{style:'chamfer',segments:2});}
function weather(g,seed,amount){const p=g.getAttribute('position');for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i),s=Math.sin(x*19+y*23+seed)*Math.cos(z*21-y*31+seed);p.setXYZ(i,x+amount*s,y+amount*Math.sin(x*34+z*23+seed),z+amount*Math.sin(x*29+y*31+seed));}g.computeVertexNormals();return g;}
function snowPatch(b,p,s,seed){const g=new THREE.SphereGeometry(1,12,7);weather(g,seed,.07);add(b,g,p,[0,seed,0],s,.98,'stone');}

const meta={name:'Cabin glazing / rebated timber bay',role:'prop'};
const QA_CONTEXT=false;
async function build(){
 const root=createRoot('RebatedGlazingBay'),mat=await materials(),wood=bucket(),iron=bucket();
 for(const z of [-.56,.56])add(wood,await bevel(.18,2.2,.12,.006),[0,1.1,z],[0,0,0],[1,1,1],1,'wood',1);
 for(const y of [.06,2.14])add(wood,await bevel(.18,.12,1,.006),[0,y,0],[0,0,0],[1,1,1],1,'wood',2);
 // Glazing stops, recessed beads and four pairs of pegged mortise joints.
 for(const x of [-.042,.055]){
  for(const z of [-.492,.492])add(wood,await bevel(.026,1.964,.024,.003),[x,1.1,z],[0,0,0],[1,1,1],.8,'wood',1);
  for(const y of [.125,2.075])add(wood,await bevel(.026,.024,.964,.003),[x,y,0],[0,0,0],[1,1,1],.8,'wood',2);
 }
 for(const z of [-.56,.56])for(const y of [.17,2.03])for(const x of [-.09,.09]){
  let g=new THREE.CylinderGeometry(.011,.011,.002,10);g.rotateZ(Math.PI/2);add(wood,g,[x,y,z],[0,0,0],[1,1,1],.63,'wood',0);
 }
 for(const z of [-.482,.482])add(iron,await bevel(.012,1.93,.009,.002),[.011,1.1,z]);
 for(const y of [.136,2.064])add(iron,await bevel(.012,.009,.964,.002),[.011,y,0]);
 finish(root,'JoinedTimberAndGlazingStops',wood,mat.wood);finish(root,'RecessedWeatherSeal',iron,mat.iron);
 const glass=new THREE.MeshStandardMaterial({color:0xe6eef1,transparent:true,opacity:.075,roughness:.10,metalness:0,side:THREE.DoubleSide,depthWrite:false});
 const pane=new THREE.PlaneGeometry(.964,1.928);pane.rotateY(Math.PI/2);
 createPart('SingleDoubleSidedGlass',pane,glass,{parent:root,position:[.018,1.1,0]});
 if(QA_CONTEXT){
  // Unsaved optical test fixture, not world composition or a distributable asset.
  const front=new THREE.MeshStandardMaterial({color:0xc2d2dd,roughness:.9}),back=new THREE.MeshStandardMaterial({color:0x905632,roughness:.8});
  createPart('WitnessOutsideBlue',new THREE.BoxGeometry(.06,1.2,.6),front,{parent:root,position:[1.25,1.05,0]});
  createPart('WitnessInsideAmber',new THREE.BoxGeometry(.06,1.2,.6),back,{parent:root,position:[-1.25,1.05,0]});
  for(let j=0;j<5;j++)for(const x of [-1.20,1.20])createPart('ContrastWitness'+j+'_'+x,new THREE.BoxGeometry(.015,.055,.52),new THREE.MeshStandardMaterial({color:j%2?0xeeeeee:0x333333,roughness:1}),{parent:root,position:[x,.65+j*.2,0]});
 }
 return root;
}
