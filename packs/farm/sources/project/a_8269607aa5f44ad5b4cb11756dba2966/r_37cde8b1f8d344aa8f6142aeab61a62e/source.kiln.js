const meta={name:'Rock cluster',role:'prop'};

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

function build(){
 const root=createRoot('RockCluster');
 // Five original deterministic closed stones; 4 cm intentional ground embedding.
 const stones=[
 {name:'Keystone',c:[-.1,.26,-.08],s:[.43,.34,.40],seed:14},
 {name:'EastShoulder',c:[.06,.18,.40],s:[.31,.26,.33],seed:22},
 {name:'EastToe',c:[-.34,.12,.48],s:[.24,.18,.27],seed:31},
 {name:'WestShoulder',c:[.19,.14,-.43],s:[.30,.21,.32],seed:41},
 {name:'WestToe',c:[-.33,.10,-.46],s:[.25,.16,.29],seed:53}
 ];
 const stone=gameMaterial(0xa39d8c,{roughness:.96,metalness:0});
 const g=merge(stones.map(v=>boulder(v.c,v.s,v.seed,-.04)));
 const part=createPart('Five_adjoining_stones',g,stone,{parent:root});
 part.userData.stones=stones.map((v,i)=>({name:v.name,firstTriangle:i*80,triangleCount:80,center:v.c}));
 return root;
}