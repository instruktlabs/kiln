const BARK={"schemaVersion": 3, "model": "pbrMetallicRoughness", "name": "Muted birch bark", "roughness": 1, "metalness": 0, "emissiveIntensity": 1, "alphaMode": "opaque", "alphaCutoff": 0.5, "doubleSided": false, "textures": {"baseColor": {"kind": "resource", "resourceId": "kiln.library.bb4d112777b64cf81ee3dad0e4d597be9cc0a35d138264e4a4846dc68c6521ea.base-color", "sampler": {"minFilter": "nearest-mipmap-linear", "magFilter": "nearest", "wrapS": "repeat", "wrapT": "repeat"}}}};
const LEAVES={"schemaVersion": 3, "model": "pbrMetallicRoughness", "name": "Birch olive branching leaf clusters", "roughness": 1, "metalness": 0, "emissiveIntensity": 1, "alphaMode": "mask", "alphaCutoff": 0.5, "doubleSided": true, "textures": {"baseColor": {"kind": "resource", "resourceId": "kiln.library.5872d875306f73530fc14746b38ab4c3414182f796ebd5d342fc50c660f4abd7.base-color", "sampler": {"minFilter": "nearest", "magFilter": "nearest", "wrapS": "clamp-to-edge", "wrapT": "clamp-to-edge"}}}};
const meta={name:'Nightman slender woodland birch',role:'fill'};
// Original authored stations and sprig arrangements; no imported geometry or pixels.
const MAIN=[[0,0,0,.22],[.025,.45,-.02,.164],[.055,1.6,.015,.142],[.13,2.7,.04,.112],[.19,3.65,.075,.089],[.20,4.55,.09,.065],[.12,5.45,.15,.042],[.19,6.25,.18,.018],[.13,6.75,.23,.004]];
const BRANCHES=[
 {at:3,tip:[-1.30,3.86,.64],bend:[-.54,3.30,.35]},
 {at:4,tip:[1.58,4.60,.55],bend:[.80,4.18,.29]},
 {at:4,tip:[-.54,4.76,-1.47],bend:[-.10,4.11,-.64]},
 {at:5,tip:[1.05,5.34,-1.14],bend:[.65,4.97,-.51]},
 {at:5,tip:[-.95,5.15,1.26],bend:[-.26,4.78,.71]},
 {at:5,tip:[-1.46,5.67,-.12],bend:[-.72,5.15,-.02]},
 {at:6,tip:[.87,6.26,1.20],bend:[.38,5.91,.64]},
 {at:6,tip:[-1.12,6.12,-.82],bend:[-.48,5.89,-.29]},
 {at:6,tip:[1.39,6.01,-.20],bend:[.77,5.78,.02]},
 {at:7,tip:[-.49,6.73,.63],bend:[-.14,6.53,.36]},
 {at:7,tip:[.49,6.87,-.30],bend:[.36,6.58,-.10]}
];
function buffer(){return {p:[],uv:[]};}
function face(out,points,coords){for(const i of [0,1,2,0,2,3]){out.p.push(...points[i]);out.uv.push(...coords[i]);}}
function triangle(out,points,coords){for(let i=0;i<3;i++){out.p.push(...points[i]);out.uv.push(...coords[i]);}}
function vector(p){return new THREE.Vector3(...p.slice(0,3));}
function tube(out,stations,sides=7){let traveled=0;const rings=[],dist=[];
 for(let k=0;k<stations.length;k++){const s=stations[k],axis=vector(stations[Math.min(k+1,stations.length-1)]).sub(vector(stations[Math.max(0,k-1)])).normalize(),ref=Math.abs(axis.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0),u=new THREE.Vector3().crossVectors(ref,axis).normalize(),v=new THREE.Vector3().crossVectors(axis,u).normalize();if(k)traveled+=vector(s).distanceTo(vector(stations[k-1]));dist.push(traveled);rings.push(Array.from({length:sides},(_,i)=>{const a=i*2*Math.PI/sides,ir=1+.065*Math.sin(i*3.3+k*.8);return vector(s).addScaledVector(u,Math.cos(a)*s[3]*ir).addScaledVector(v,Math.sin(a)*s[3]*ir).toArray();}));}
 for(let k=0;k<rings.length-1;k++)for(let i=0;i<sides;i++){const q=(i+1)%sides,repeat=2*Math.PI*Math.max(stations[k][3],stations[k+1][3])/.5;face(out,[rings[k][i],rings[k][q],rings[k+1][q],rings[k+1][i]],[[i/sides*repeat,dist[k]],[(i+1)/sides*repeat,dist[k]],[(i+1)/sides*repeat,dist[k+1]],[i/sides*repeat,dist[k+1]]]);}
 for(let end of [0,rings.length-1])for(let i=1;i<sides-1;i++){const ids=end?[0,i,i+1]:[0,i+1,i];triangle(out,ids.map(n=>rings[end][n]),ids.map(n=>[.5+.4*Math.cos(n*2*Math.PI/sides),.5+.4*Math.sin(n*2*Math.PI/sides)]));}
}
function mesh(out,name,mat,root){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out.p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(out.uv,2));g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.name=name;root.add(m);return m;}
function card(out,start,width,height,yaw,lean){const up=new THREE.Vector3(Math.sin(lean)*Math.cos(yaw),Math.cos(lean),Math.sin(lean)*Math.sin(yaw)),right=new THREE.Vector3(-Math.sin(yaw),0,Math.cos(yaw)),normal=new THREE.Vector3().crossVectors(right,up),rows=[];for(let i=0;i<3;i++){const mid=vector(start).addScaledVector(up,i*height/2).addScaledVector(normal,i===1?.045:0);rows.push([mid.clone().addScaledVector(right,-width/2).toArray(),mid.clone().addScaledVector(right,width/2).toArray()]);}for(let i=0;i<2;i++)face(out,[rows[i][0],rows[i][1],rows[i+1][1],rows[i+1][0]],[[0,i/2],[1,i/2],[1,(i+1)/2],[0,(i+1)/2]]);return up;}
async function build(){const root=createRoot('WoodlandBirch'),bark=await compilePortableMaterialSpecV3(BARK),leaf=await compilePortableMaterialSpecV3(LEAVES),wood=buffer(),leaves=buffer();tube(wood,MAIN); for(let i=0;i<wood.p.length;i+=3)if(wood.p[i+1]<.02)wood.p[i+1]=0;
 const joints=[];
 BRANCHES.forEach((b,i)=>{const start=MAIN[b.at],r=start[3]*.56,stations=[start.slice(0,3).concat(r),b.bend.concat(r*.57),b.tip.concat(.008)];tube(wood,stations,5);joints.push({name:'Branch_'+i,parentStation:b.at,base:start.slice(0,3),tip:b.tip});
  for(let k=0;k<14;k++){const a=k*2.399+i*.83,spread=.13+(k%3)*.15,start=vector(b.tip).add(new THREE.Vector3(Math.cos(a)*spread,(k%5-2)*.18,Math.sin(a)*spread)).toArray(),yaw=a+.6,lean=.38+.225*(k%7);const up=card(leaves,start,.73+(k%3)*.07,.82+(k%2)*.12,yaw,lean);tube(wood,[b.tip.concat(.005),vector(start).addScaledVector(up,.07).toArray().concat(.002)],3);}
 });
 const crown=mesh(leaves,'Birch_Foliage',leaf,root);markOpenShell(crown,'Intentional double-sided MASK leaf sprig cards; alpha shapes, open sheets and canopy gaps are authored.');mesh(wood,'Birch_TrunkAndBranches',bark,root);
 for(const [name,pos]of [['tree_root',[0,0,0]],['trunk_contact',[0,.45,0]],['canopy_origin',[.1,4.9,.1]]]){const a=new THREE.Object3D();a.name=name;a.position.set(...pos);root.add(a);}
 root.userData.birchInterfaces={version:1,trunkRadiusAtPlayer:.142,baseRadius:.22,branches:joints,foliageSprigs:154,foliageBackfaces:'double-sided MASK .5',axes:'+X forward/+Y up/+Z right'};return root;
}
