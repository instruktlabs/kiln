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
function tuft(b,center,size,phase) {
  // Small asymmetric flattened foliar hull, with three noncollapsed rings.
  const rings=[], ys=[-.65,0,.64], widths=[.61,1,.68], count=7;
  const tiltedVertex=(p)=>{
    const x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2],rx=.38*Math.sin(phase*1.3),rz=.32*Math.cos(phase*.9);
    const yy=y*Math.cos(rx)-z*Math.sin(rx),zz=y*Math.sin(rx)+z*Math.cos(rx);
    return vertex(b,[center[0]+x*Math.cos(rz)-yy*Math.sin(rz),center[1]+x*Math.sin(rz)+yy*Math.cos(rz),center[2]+zz]);
  };
  for(let k=0;k<3;k++) {
    const ring=[];
    for(let j=0;j<count;j++) {
      const a=j*2*Math.PI/count+phase, wave=1+.15*Math.sin(j*2.9+phase+k*.71);
      ring.push(tiltedVertex([center[0]+size[0]*widths[k]*wave*Math.cos(a)+size[0]*.13*k,center[1]+size[1]*(ys[k]+.13*Math.sin(j*2.1+phase)),center[2]+size[2]*widths[k]*wave*Math.sin(a)]));
    } rings.push(ring);
  }
  for(let k=0;k<2;k++)for(let j=0;j<count;j++){const a=rings[k][j],c=rings[k][(j+1)%count],d=rings[k+1][j],e=rings[k+1][(j+1)%count];tri(b,a,d,c);tri(b,c,d,e);}
  const bottom=tiltedVertex([center[0]-.1*size[0],center[1]-size[1],center[2]]),top=tiltedVertex([center[0]+.23*size[0],center[1]+size[1],center[2]+.1*size[2]]);
  for(let j=0;j<count;j++){tri(b,bottom,rings[0][j],rings[0][(j+1)%count]);tri(b,top,rings[2][(j+1)%count],rings[2][j]);}
}
function finish(root,wood,foliage,colors) {
  const bark=gameMaterial(colors[0],{roughness:.96,flatShading:false}); bark.name='Bark';
  createPart('ConnectedWood',creaseNormals(meshGeo(wood),{angle:48}),bark,{parent:root});
  foliage.forEach((b,i)=>{ const m=gameMaterial(colors[i+1],{roughness:.88,flatShading:true}); m.name='Foliage_'+i; const g=meshGeo(b).toNonIndexed(); g.computeVertexNormals(); createPart('Foliage_'+i,g,m,{parent:root}); });
  root.userData={units:'metres',groundDatum:0,seeded:true,purpose:'Reusable courtyard vegetation',historicalStatus:'Art direction; not a historical reconstruction'};
  return root;
}

const meta={name:'Low courtyard shrub'};
function build() {
  const root=createRoot('CourtyardShrub'),wood=bag(),foliage=[bag(),bag()],rng=randomSeed(641);
  const stump=[[0,0,0],[0,.06,0],[.015,.12,.01]]; tube(wood,stump,[.050,.042,.027],6,.1,true);
  for(let i=0;i<8;i++) {
    const a=i*2.399, from=stump[1], extent=.34+.17*rng(),height=.52+.18*rng(), end=[Math.cos(a)*extent,height,Math.sin(a)*extent];
    const mid=[end[0]*.56,.22,end[2]*.56]; tube(wood,[from,mid,end],[.032,.020,.006],4);
    tuft(foliage[i%2],vec(mid).lerp(vec(end),.5).toArray(),[.30,.25,.28],i*.67);
    for(let j=0;j<2;j++) {
      const aa=a+(j-1)*.70, start=j===0?mid:end, tip=vec(start).add(new THREE.Vector3(Math.cos(aa)*.15,.06+.04*rng(),Math.sin(aa)*.15)).toArray();
      tube(wood,[start,tip],[.01,.003],4);
      for(let k=0;k<5;k++) {
        const base=vec(start).lerp(vec(tip),.12+k*.20).toArray(),angle=aa+(k%2?-.85:.85);
        leaf(foliage[(i+j+k)%2],base,[Math.cos(angle),.1+.8*rng(),Math.sin(angle)],.21+.05*rng(),.16+.035*rng(),false,.3);
      }
    }
  }
  const heightScale=0.91; // Bake scale into geometry; reusable root remains identity.
  [wood,...foliage].forEach(b=>{for(let i=1;i<b.positions.length;i+=3)b.positions[i]*=heightScale;});
  return finish(root,wood,foliage,[0x6b5943,0x5e7148,0x78845a]);
}
