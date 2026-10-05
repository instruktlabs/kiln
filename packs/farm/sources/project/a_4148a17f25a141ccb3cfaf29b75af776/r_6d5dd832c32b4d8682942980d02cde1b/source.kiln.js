const meta={name:'Faceted tree',role:'prop'};

function merge(gs) {
 const p=[], n=[], uv=[];
 for (const source of gs) {
  const g=source.index?source.toNonIndexed():source;
  g.computeVertexNormals();
  const pa=g.getAttribute('position'),na=g.getAttribute('normal'),ua=g.getAttribute('uv');
  for(let i=0;i<pa.count;i++){p.push(pa.getX(i),pa.getY(i),pa.getZ(i));n.push(na.getX(i),na.getY(i),na.getZ(i));uv.push(ua?ua.getX(i):0,ua?ua.getY(i):0);}
 }
 const out=new THREE.BufferGeometry();
 out.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
 out.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));
 out.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 return out;
}
function boulder(c,s,seed,floor) {
 const g=new THREE.IcosahedronGeometry(1,1),p=g.getAttribute('position');
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const r=1+0.07*Math.sin(x*4+seed)*Math.cos(z*5-seed)+0.035*Math.sin(y*7+seed);
  p.setXYZ(i,c[0]+s[0]*(x*r+0.09*y),Math.max(floor,c[1]+s[1]*y*r),c[2]+s[2]*(z*r+0.06*x));
 }
 g.computeVertexNormals(); return g;
}

function limb(stations) {
 const p=[],uv=[],ix=[],N=9;
 stations.forEach((v,j)=>{for(let i=0;i<=N;i++){const a=2*Math.PI*i/N;p.push(v[0]+v[3]*Math.cos(a),v[1],v[2]+v[3]*Math.sin(a));uv.push(i/N*2*Math.PI*v[3]/0.6,v[1]/1.2);}});
 for(let j=0;j<stations.length-1;j++)for(let i=0;i<N;i++){const a=j*(N+1)+i,b=a+N+1;ix.push(a,b,a+1,a+1,b,b+1);}
 const bot=p.length/3;p.push(...stations[0].slice(0,3));uv.push(.5,.5);
 const top=p.length/3;p.push(...stations[stations.length-1].slice(0,3));uv.push(.5,.5);
 for(let i=0;i<N;i++){ix.push(bot,i,i+1);const a=(stations.length-1)*(N+1)+i;ix.push(top,a+1,a);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);return g;
}
async function build(){
 const root=createRoot('FacetedTree');
 const wood=await compilePortableMaterialSpecV2({schemaVersion:2,model:'pbrMetallicRoughness',name:'Farm honey wood (subdued grain derivative)',baseColor:16777215,roughness:1,metalness:0,emissiveIntensity:1,alphaMode:'opaque',alphaCutoff:.5,doubleSided:false,textures:{baseColor:{kind:'resource',resourceId:'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.base-color'},normal:{kind:'resource',resourceId:'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.normal'},metallicRoughness:{kind:'resource',resourceId:'kiln.library.710f9ab0183deb86923b3c398286f9cbcb0eaea7ec50657a72fc83c2bd3c38cd.metallic-roughness'}}});
 wood.flatShading=true;wood.normalScale.set(.14,.14);wood.color.setHex(0xbe9b72);
 createPart('Trunk_and_major_branches',merge([
 limb([[0,0,0,.32],[.03,.25,.01,.255],[.06,1.15,.02,.205],[0,1.9,.04,.18],[.12,2.7,.03,.11],[.2,3.35,0,.045]]),
 limb([[.05,1.3,.01,.19],[.02,1.95,-.28,.16],[-.15,2.5,-.75,.105],[-.22,3,-.96,.04]]),
 limb([[.02,1.55,.05,.17],[-.05,2.13,.36,.14],[-.18,2.65,.83,.09],[-.3,3.06,1.05,.035]]),
 limb([[.01,1.8,.02,.16],[.4,2.3,.18,.12],[.77,2.87,.27,.045]]),
 limb([[0,1.95,0,.15],[-.4,2.45,-.02,.11],[-.82,3.08,.12,.04]])
 ]),wood,{parent:root});
 const moss=gameMaterial(0x798642,{roughness:1,metalness:0}),olive=gameMaterial(0x879447,{roughness:1,metalness:0}),sun=gameMaterial(0x94a04e,{roughness:1,metalness:0});
 createPart('Crown_west_and_east',merge([boulder([-.12,2.97,-.82],[1.05,.86,.96],2,1.86),boulder([-.22,2.95,.84],[1.05,.83,.94],6,1.86)]),moss,{parent:root});
 createPart('Crown_front_and_back',merge([boulder([.68,3.27,.06],[.92,.87,1.08],4,2.2),boulder([-.69,3.29,.03],[.93,.87,1.03],7,2.2)]),olive,{parent:root});
 createPart('Crown_upper_dome',boulder([.02,3.66,0],[1.12,.84,1.1],9,2.8),sun,{parent:root});
 return root;
}