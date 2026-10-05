// Authored deterministic geometry, metre units, Y up, origin at ground.
function randomSeed(seed) { let x=seed; return function() { x=(1664525*x+1013904223)>>>0; return x/4294967296; }; }
function bag() { return {positions:[],indices:[]}; }
function vertex(b,p) { const i=b.positions.length/3; b.positions.push(...p); return i; }
function tri(b,a,c,d) { b.indices.push(a,c,d); }
function vec(p) { return new THREE.Vector3(...p); }
function tube(b,path,radii,sides=8,twist=0,groundBase=false) {
  const rings=[];
  for(let k=0;k<path.length;k++) {
    let t=vec(path[Math.min(k+1,path.length-1)]).sub(vec(path[Math.max(0,k-1)])).normalize();
    if(k===0 && groundBase) t=new THREE.Vector3(0,1,0);
    const u=new THREE.Vector3(1,0,0); if(Math.abs(t.x)>.85) u.set(0,0,1);
    u.addScaledVector(t,-u.dot(t)).normalize(); const v=t.clone().cross(u).normalize();
    const ring=[];
    for(let j=0;j<sides;j++) {
      const a=j*2*Math.PI/sides+twist*k/(path.length-1);
      const r=radii[k]*(1+.10*Math.sin(j*3.7+k*.8));
      ring.push(vertex(b,vec(path[k]).addScaledVector(u,Math.cos(a)*r).addScaledVector(v,Math.sin(a)*r).toArray()));
    }
    rings.push(ring);
  }
  for(let k=0;k<rings.length-1;k++) for(let j=0;j<sides;j++) {
    const a=rings[k][j], c=rings[k][(j+1)%sides], d=rings[k+1][j], e=rings[k+1][(j+1)%sides];
    tri(b,a,c,d); tri(b,c,e,d);
  }
  const base=vertex(b,path[0]), top=vertex(b,path[path.length-1]);
  for(let j=0;j<sides;j++) { tri(b,base,rings[0][(j+1)%sides],rings[0][j]); tri(b,top,rings[rings.length-1][j],rings[rings.length-1][(j+1)%sides]); }
}
function leaf(b,base,direction,length,width,lobed=false,roll=0) {
  const d=vec(direction).normalize(); let s=d.clone().cross(new THREE.Vector3(0,1,0)); if(s.length()<.01) s.set(1,0,0); s.normalize();
  const n=s.clone().cross(d).normalize(); s.applyAxisAngle(d,roll); n.copy(s).cross(d).normalize();
  // Broad five-lobed fig outline or narrow lanceolate olive/shrub outline.
  const outline=lobed ? [[0,0],[.22,.28],[.36,.48],[.45,.29],[.58,.58],[.69,.31],[1,0],[.69,-.31],[.58,-.58],[.45,-.29],[.36,-.48],[.22,-.28]] : [[0,0],[.43,.5],[1,0],[.43,-.5]];
  const p=vec(base), rim=outline.map(q=>vertex(b,p.clone().addScaledVector(d,length*q[0]).addScaledVector(s,width*q[1]).addScaledVector(n,-length*.09*q[0]*q[0]).toArray()));
  const upper=vertex(b,p.clone().addScaledVector(d,length*.48).addScaledVector(n,length*.04).toArray());
  const lower=vertex(b,p.clone().addScaledVector(d,length*.48).addScaledVector(n,-length*.025).toArray());
  for(let j=0;j<rim.length;j++) { tri(b,upper,rim[j],rim[(j+1)%rim.length]); tri(b,lower,rim[(j+1)%rim.length],rim[j]); }
}
function finish(root,wood,foliage,colors) {
  const bark=gameMaterial(colors[0],{roughness:.96,flatShading:false}); bark.name='Bark';
  createPart('ConnectedWood',creaseNormals(meshGeo(wood),{angle:48}),bark,{parent:root});
  foliage.forEach((b,i)=>{ const m=gameMaterial(colors[i+1],{roughness:.88,flatShading:true}); m.name='Foliage_'+i; const g=meshGeo(b).toNonIndexed(); g.computeVertexNormals(); createPart('Foliage_'+i,g,m,{parent:root}); });
  root.userData={units:'metres',groundDatum:0,seeded:true,purpose:'Reusable courtyard vegetation',historicalStatus:'Art direction; not a historical reconstruction'};
  return root;
}

const meta={name:'Mediterranean courtyard cypress'};
function build() {
  const root=createRoot('MediterraneanCypress'),wood=bag(),foliage=[bag(),bag()],rng=randomSeed(3103);
  const spine=[[0,0,0],[0,.30,0],[.015,.90,.0],[-.04,1.7,.025],[.025,2.6,.02],[-.035,3.6,-.015],[.04,4.7,.0],[.005,5.8,.025],[.025,6.8,.02]];
  tube(wood,spine,[.16,.14,.12,.10,.084,.066,.05,.033,.009],8,.25,true);
  // A single closed, many-station lobed envelope: no cone stacks or spherical clumps.
  const radii=[.34,.56,.64,.70,.72,.69,.65,.63,.57,.53,.47,.40,.34,.27,.21,.14,.08];
  const rings=[];
  for(let k=0;k<radii.length;k++) {
    const y=.67+k*.375, ring=[], cx=.04*Math.sin(k*.65),cz=.035*Math.cos(k*.70);
    for(let j=0;j<14;j++) {
      const a=j*2*Math.PI/14, r=radii[k]*(1+.095*Math.sin(j*2.7+k*.8)+.07*Math.sin(j*.8-k*.9));
      ring.push(vertex(foliage[0],[cx+r*Math.cos(a),y+.045*Math.sin(j*1.8+k*.9),cz+r*Math.sin(a)]));
    } rings.push(ring);
  }
  for(let k=0;k<rings.length-1;k++)for(let j=0;j<14;j++){const a=rings[k][j],c=rings[k][(j+1)%14],d=rings[k+1][j],e=rings[k+1][(j+1)%14];tri(foliage[0],a,d,c);tri(foliage[0],c,d,e);}
  const bottom=vertex(foliage[0],[0,.62,0]),tip=vertex(foliage[0],[.02,7.0,.015]);
  for(let j=0;j<14;j++){tri(foliage[0],bottom,rings[0][j],rings[0][(j+1)%14]);tri(foliage[0],tip,rings[16][(j+1)%14],rings[16][j]);}
  // Upturned compressed sprays break the outline in staggered positions; roots sit within the envelope.
  for(let k=0;k<12;k++)for(let j=0;j<8;j++) {
    const y=1.0+k*.46, ri=Math.min(15,Math.floor((y-.67)/.375)),r=radii[ri],a=j*2.399+k*.37;
    const base=[Math.cos(a)*r*.74,y,Math.sin(a)*r*.74];
    const end=[Math.cos(a)*r*1.035,y+.30+.10*rng(),Math.sin(a)*r*1.035];
    if(j<2){const start=spine[Math.min(7,Math.floor(y/.9)+1)];tube(wood,[start,base,end],[.02,.009,.003],5);}
    for(let q=0;q<2;q++)leaf(foliage[(j+k+q)%2],base,[Math.cos(a)*.4,.88,Math.sin(a)*.4],.36+.12*rng(),.13+.03*rng(),false,(q?1:-1)*.5);
  }
  return finish(root,wood,foliage,[0x66583f,0x354a33,0x45583b]);
}
