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
// Retain sampling order so removing detail cannot change v1 branch endpoints.
function retainDetailSample() {}
function fitCrownEnvelope(bags, targets) {
  // Adjust rounded outer profiles while keeping every clump center fixed.
  const clumps=bags.flatMap(b=>(b.clumps||[]).map(c=>({b,...c})));
  for(const [axis,sign,target] of targets) {
    const edge=c=>{let m=-Infinity;for(let i=c.first+axis;i<c.last;i+=3)m=Math.max(m,sign*c.b.positions[i]);return m;};
    const stretch=(c,t)=>{const center=c.center[axis],e=edge(c),factor=(t-sign*center)/(e-sign*center);
      for(let i=c.first+axis;i<c.last;i+=3){const d=sign*(c.b.positions[i]-center);if(d>0)c.b.positions[i]=center+sign*d*factor;}
    };
    for(const c of clumps)if(edge(c)>target)stretch(c,target);
    let outer=clumps[0];for(const c of clumps)if(edge(c)>edge(outer))outer=c;
    if(edge(outer)<target)stretch(outer,target);
  }
}
function finish(root,wood,foliage,colors) {
  const bark=gameMaterial(colors[0],{roughness:.96,flatShading:false}); bark.name='Bark';
  createPart('ConnectedWood',creaseNormals(meshGeo(wood),{angle:48}),bark,{parent:root});
  foliage.forEach((b,i)=>{ if(!b.indices.length)return; const m=gameMaterial(colors[i+1],{roughness:.88,flatShading:false}); m.name='Foliage_'+i; const g=creaseNormals(meshGeo(b),{angle:42}); createPart('Foliage_'+i,g,m,{parent:root}); });
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
  const branchEnds=[];
  // Upturned compressed sprays break the outline in staggered positions; roots sit within the envelope.
  for(let k=0;k<12;k++)for(let j=0;j<8;j++) {
    const y=1.0+k*.46, ri=Math.min(15,Math.floor((y-.67)/.375)),r=radii[ri],a=j*2.399+k*.37;
    const base=[Math.cos(a)*r*.74,y,Math.sin(a)*r*.74];
    const end=[Math.cos(a)*r*1.035,y+.30+.10*rng(),Math.sin(a)*r*1.035];
    if(j<2){const start=spine[Math.min(7,Math.floor(y/.9)+1)];tube(wood,[start,base,end],[.02,.009,.003],5);branchEnds.push(end);}
    for(let q=0;q<2;q++)retainDetailSample(foliage[(j+k+q)%2],base,[Math.cos(a)*.4,.88,Math.sin(a)*.4],.36+.12*rng(),.13+.03*rng(),false,(q?1:-1)*.5);
  }
  const baseRings=[];
  for(let k=0;k<radii.length;k++) {
    const y=.67+k*.375,ring=[],cx=.04*Math.sin(k*.65),cz=.035*Math.cos(k*.70);
    for(let j=0;j<14;j++){
      const a=j*2*Math.PI/14,r=radii[k]*(1+.095*Math.sin(j*2.7+k*.8)+.07*Math.sin(j*.8-k*.9));
      ring.push([cx+r*Math.cos(a),y+.045*Math.sin(j*1.8+k*.9),cz+r*Math.sin(a)]);
    }baseRings.push(ring);
  }
  const coverPoint=(p)=>{
    const outward=new THREE.Vector3(p.x,0,p.z).normalize();let cover=0;
    for(const end of branchEnds){
      const da=Math.atan2(Math.sin(Math.atan2(p.z,p.x)-Math.atan2(end[2],end[0])),Math.cos(Math.atan2(p.z,p.x)-Math.atan2(end[2],end[0])));
      const weight=Math.exp(-2*((p.y-end[1])/.48)**2-2*(da/.48)**2);
      const need=Math.max(0,Math.hypot(end[0],end[2])+.045-Math.hypot(p.x,p.z));
      cover=Math.max(cover,need*weight);
    }return p.addScaledVector(outward,cover);
  };
  // Subtle broad billows are part of the continuous crown surface, never separate spikes.
  for(let k=0;k<16;k++)for(let j=0;j<14;j++){
    const corners=[vec(baseRings[k][j]),vec(baseRings[k][(j+1)%14]),vec(baseRings[k+1][j]),vec(baseRings[k+1][(j+1)%14])],patch=[];
    for(let v=0;v<3;v++)for(let u=0;u<3;u++){
      const s=u/2,t=v/2,p=corners[0].clone().lerp(corners[1],s).lerp(corners[2].clone().lerp(corners[3],s),t);
      const outward=new THREE.Vector3(p.x,0,p.z).normalize();
      p.addScaledVector(outward,.008*Math.sin(Math.PI*s)*Math.sin(Math.PI*t)*(1+.3*Math.sin(j*.8+k*.5)));
      coverPoint(p);
      patch.push(vertex(foliage[0],p.toArray()));
    }
    for(let v=0;v<2;v++)for(let u=0;u<2;u++){const a=patch[v*3+u],c=patch[v*3+u+1],d=patch[(v+1)*3+u],e=patch[(v+1)*3+u+1];tri(foliage[0],a,d,c);tri(foliage[0],c,d,e);}
  }
  const bottom=vertex(foliage[0],[0,.62,0]),tip=vertex(foliage[0],[.02,7.0,.015]);
  for(let j=0;j<14;j++)for(let q=0;q<2;q++){
    const sample=(row,t)=>coverPoint(vec(baseRings[row][j]).lerp(vec(baseRings[row][(j+1)%14]),t)).toArray();
    const a=vertex(foliage[0],sample(0,q/2)),c=vertex(foliage[0],sample(0,(q+1)/2));tri(foliage[0],bottom,a,c);
    const d=vertex(foliage[0],sample(16,q/2)),e=vertex(foliage[0],sample(16,(q+1)/2));tri(foliage[0],tip,e,d);
  }
  foliage[0].clumps=[{center:[0,3.5,0],first:0,last:foliage[0].positions.length}];
  fitCrownEnvelope(foliage,[[0,-1,.7496466636657715],[0,1,.7611351013183594],[1,1,7],[2,-1,.7579506039619446],[2,1,.7405250072479248]]);
  return finish(root,wood,foliage,[0x66583f,0x354a33,0x45583b]);
}
