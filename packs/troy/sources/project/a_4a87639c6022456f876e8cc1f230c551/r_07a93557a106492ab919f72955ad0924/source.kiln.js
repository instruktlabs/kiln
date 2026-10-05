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
// Keep argument sampling order to preserve the exact deterministic v1 wood geometry.
function retainDetailSample() {}
function tuft(b,center,size,phase,growth) {
  // Retained crown mass: rounded rings with shallow integrated foliage lobes.
  const first=b.positions.length,rings=[],ys=[-.78,-.28,.28,.78],widths=[.49,.98,1.06,1.02],count=12;
  const tiltedVertex=(p)=>{
    const x=p[0]-center[0],rawY=p[1]-center[1],y=rawY>0?rawY*1.65:rawY,z=p[2]-center[2],rx=.38*Math.sin(phase*1.3),rz=.32*Math.cos(phase*.9);
    const yy=y*Math.cos(rx)-z*Math.sin(rx),zz=y*Math.sin(rx)+z*Math.cos(rx);
    const lift=Math.max(0,rawY/size[1]);
    return vertex(b,[center[0]+x*Math.cos(rz)-yy*Math.sin(rz)+lift*.95*(growth[0]-center[0]),center[1]+x*Math.sin(rz)+yy*Math.cos(rz),center[2]+zz+lift*.95*(growth[2]-center[2])]);
  };
  for(let k=0;k<ys.length;k++) {
    const ring=[];
    for(let j=0;j<count;j++) {
      const a=j*2*Math.PI/count+phase,wave=1+.055*Math.sin(3*a+phase*.7)+.035*Math.sin(2*a-phase+k*.35);
      ring.push(tiltedVertex([center[0]+size[0]*widths[k]*wave*Math.cos(a)+size[0]*.086*k,center[1]+size[1]*(ys[k]+.05*Math.sin(3*a+phase)),center[2]+size[2]*widths[k]*wave*Math.sin(a)]));
    } rings.push(ring);
  }
  for(let k=0;k<rings.length-1;k++)for(let j=0;j<count;j++){const a=rings[k][j],c=rings[k][(j+1)%count],d=rings[k+1][j],e=rings[k+1][(j+1)%count];tri(b,a,d,c);tri(b,c,d,e);}
  const bottom=tiltedVertex([center[0]-.1*size[0],center[1]-size[1],center[2]]),top=tiltedVertex([center[0]+.23*size[0],center[1]+size[1],center[2]+.1*size[2]]);
  for(let j=0;j<count;j++){tri(b,bottom,rings[0][j],rings[0][(j+1)%count]);tri(b,top,rings[3][(j+1)%count],rings[3][j]);}
  if(!b.clumps)b.clumps=[];b.clumps.push({center:center.slice(),first,last:b.positions.length});
}
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

const meta={name:'Low courtyard shrub'};
function build() {
  const root=createRoot('CourtyardShrub'),wood=bag(),foliage=[bag(),bag()],rng=randomSeed(641);
  const stump=[[0,0,0],[0,.06,0],[.015,.12,.01]]; tube(wood,stump,[.050,.042,.027],6,.1,true);
  for(let i=0;i<8;i++) {
    const a=i*2.399, from=stump[1], extent=.34+.17*rng(),height=.52+.18*rng(), end=[Math.cos(a)*extent,height,Math.sin(a)*extent];
    const mid=[end[0]*.56,.22,end[2]*.56]; tube(wood,[from,mid,end],[.032,.020,.006],4);
    tuft(foliage[i%2],vec(mid).lerp(vec(end),.5).toArray(),[.30,.25,.28],i*.67,end);
    for(let j=0;j<2;j++) {
      const aa=a+(j-1)*.70, start=j===0?mid:end, tip=vec(start).add(new THREE.Vector3(Math.cos(aa)*.15,.06+.04*rng(),Math.sin(aa)*.15)).toArray();
      tube(wood,[start,tip],[.01,.003],4);
      for(let k=0;k<5;k++) {
        const base=vec(start).lerp(vec(tip),.12+k*.20).toArray(),angle=aa+(k%2?-.85:.85);
        retainDetailSample(foliage[(i+j+k)%2],base,[Math.cos(angle),.1+.8*rng(),Math.sin(angle)],.21+.05*rng(),.16+.035*rng(),false,.3);
      }
    }
  }
  fitCrownEnvelope(foliage,[[0,-1,0.652458667755127],[0,1,0.7227158546447754],[1,1,0.8781534629863696],[2,-1,0.6363281011581421],[2,1,0.7010627388954163]]);
  const heightScale=0.91; // Bake scale into geometry; reusable root remains identity.
  [wood,...foliage].forEach(b=>{for(let i=1;i<b.positions.length;i+=3)b.positions[i]*=heightScale;});
  return finish(root,wood,foliage,[0x6b5943,0x5e7148,0x78845a]);
}
