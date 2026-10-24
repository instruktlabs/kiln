const meta={name:'Winter cabin / amber lantern',role:'prop'};

function texture(name,a,b,scale,seed,stripes) {
 const layers=[{op:'noise',colorA:a,colorB:b,scale,octaves:3,seed}];
 if(stripes) layers.push({op:'stripes',colorA:0x999999,colorB:0xffffff,count:stripes,angleDeg:0,blend:'multiply',opacity:0.25});
 return proceduralTexture({schemaVersion:2,size:256,usage:'albedo',name,layers});
}
function surface(name,a,b,rough,scale,seed,stripes) {
 const albedo=texture(name,a,b,scale,seed,stripes);
 return pbrMaterial({albedo,normal:normalMapFromHeight(albedo,{strength:1.2}),roughness:rough,metalness:0});
}
function collector() {return {p:[],n:[],uv:[]};}
function addGeo(b,g,pos=[0,0,0],rot=[0,0,0],sc=[1,1,1]) {
 let geo=g.index?g.toNonIndexed():g.clone();
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
 const m=new THREE.Matrix4().compose(new THREE.Vector3(...pos),q,new THREE.Vector3(...sc));
 geo.applyMatrix4(m);
 const p=geo.getAttribute('position'),n=geo.getAttribute('normal'),uv=geo.getAttribute('uv');
 for(let i=0;i<p.count;i++){b.p.push(p.getX(i),p.getY(i),p.getZ(i));b.n.push(n.getX(i),n.getY(i),n.getZ(i));b.uv.push(uv?uv.getX(i):p.getX(i),uv?uv.getY(i):p.getY(i));}
}
function finish(root,name,b,mat) {
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));
 return createPart(name,g,mat,{parent:root});
}
function box(b,size,pos,rot=[0,0,0]) {addGeo(b,new THREE.BoxGeometry(...size),pos,rot);}

function build(){
 const root=createRoot('AmberLantern');
 const metal=collector(),core=collector();
 const iron=new THREE.MeshStandardMaterial({color:0x303b3b,roughness:.45,metalness:.72});
 const warm=new THREE.MeshStandardMaterial({color:0xc9b18a,emissive:0xffa04b,emissiveIntensity:.46,roughness:.76});
 const glass=new THREE.MeshStandardMaterial({color:0xdcc79c,transparent:true,opacity:.15,roughness:.2,metalness:0,side:THREE.DoubleSide,depthWrite:false});
 box(metal,[.28,.045,.28],[0,.0225,0]);box(metal,[.29,.04,.29],[0,.43,0]);
 for(const x of [-.113,.113])for(const z of [-.113,.113])box(metal,[.022,.37,.022],[x,.235,z]);
 addGeo(metal,new THREE.ConeGeometry(.24,.13,4),[0,.51,0],[0,Math.PI/4,0]);
 addGeo(metal,new THREE.TorusGeometry(.06,.009,5,14),[0,.61,0]);
 addGeo(core,new THREE.CylinderGeometry(.044,.048,.22,12),[0,.16,0]);
 addGeo(core,new THREE.SphereGeometry(.033,8,6),[0,.30,0],[0,0,0],[.7,1.8,.7]);
 finish(root,'IronHousing',metal,iron);finish(root,'WarmCore',core,warm);
 createPart('GlazedEnclosure',new THREE.BoxGeometry(.212,.335,.212),glass,{position:[0,.235,0],parent:root});
 return root;
}