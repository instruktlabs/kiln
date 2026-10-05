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
function tuft(b,center,size,phase) {
  // Retained crown mass: rounded rings with shallow integrated foliage lobes.
  const first=b.positions.length,rings=[],ys=[-.78,-.28,.28,.78],widths=[.49,.94,.96,.53],count=14;
  const tiltedVertex=(p)=>{
    const x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2],rx=.38*Math.sin(phase*1.3),rz=.32*Math.cos(phase*.9);
    const yy=y*Math.cos(rx)-z*Math.sin(rx),zz=y*Math.sin(rx)+z*Math.cos(rx);
    return vertex(b,[center[0]+x*Math.cos(rz)-yy*Math.sin(rz),center[1]+x*Math.sin(rz)+yy*Math.cos(rz),center[2]+zz]);
  };
  for(let k=0;k<ys.length;k++) {
    const ring=[];
    for(let j=0;j<count;j++) {
      const a=j*2*Math.PI/count+phase,wave=1+.055*Math.sin(5*a+phase*.7)+.035*Math.sin(2*a-phase+k*.35);
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

const meta={name:'Spreading courtyard fig'};
function build() {
  const root=createRoot('SpreadingFig'),wood=bag(),foliage=[bag(),bag(),bag()],rng=randomSeed(923);
  const trunk=[[0,0,0],[0,.30,0],[.08,.72,-.04],[-.02,1.10,.02],[.13,1.46,.0],[.14,1.78,.05]];
  tube(wood,trunk,[.235,.21,.18,.17,.145,.11],9,.16,true);
  for(let j=0;j<4;j++){const a=j*1.57+.4;tube(wood,[[0,.15,0],[.30*Math.cos(a),.08,.30*Math.sin(a)],[.46*Math.cos(a),.025,.46*Math.sin(a)]],[.12,.06,.022],6);}
  const shoots=[];
  for(let i=0;i<7;i++) {
    const a=i*2.399+.2, from=trunk[3+i%3], reach=1.42+.36*rng(), height=2.68+.50*rng();
    const p1=[from[0]+.58*Math.cos(a),from[1]+.27,from[2]+.58*Math.sin(a)], p2=[reach*.80*Math.cos(a),height-.17,reach*.80*Math.sin(a)],p3=[reach*Math.cos(a),height,reach*Math.sin(a)];
    tube(wood,[from,p1,p2,p3],[.125,.095,.048,.013],8,.15);
    for(let j=0;j<4;j++) {
      const start=j===0?p1:p2, aa=a+(j-1.4)*.65, r2=j===2?reach*.48:reach+.30+.12*rng();
      const end=[Math.cos(aa)*r2,height+(j===0?-.65:j===2?.62:.10)+.20*rng(),Math.sin(aa)*r2];
      const mid=vec(start).lerp(vec(end),.65).toArray(); mid[1]+=.13;
      tube(wood,[start,mid,end],[.043,.022,.005],5);
      shoots.push({mid,end,a:aa});
    }
  }
  // Large solid five-lobed leaves fan from connected terminal shoots.
  shoots.forEach((sh,i)=>{
    tuft(foliage[i%3],vec(sh.mid).lerp(vec(sh.end),.55).toArray(),[.61,.35,.58],i*.71);
    for(let j=0;j<3;j++) {
      const base=vec(sh.mid).lerp(vec(sh.end),.10+j*.40).toArray(), side=j%2===0?1:-1, angle=sh.a+side*(.65+.20*rng());
      retainDetailSample(foliage[(i+j)%3],base,[Math.cos(angle),-.25+1.25*rng(),Math.sin(angle)],.59+.18*rng(),.64+.16*rng(),true,side*(.22+.32*rng()));
    }
  });
  fitCrownEnvelope(foliage,[[0,-1,2.4322996139526367],[0,1,2.5514142513275146],[1,1,4.188881317774455],[2,-1,2.608553647994995],[2,1,2.5112311840057373]]);
  const heightScale=0.96; // Bake scale into geometry; reusable root remains identity.
  [wood,...foliage].forEach(b=>{for(let i=1;i<b.positions.length;i+=3)b.positions[i]*=heightScale;});
  return finish(root,wood,foliage,[0x796c53,0x536944,0x657c4d,0x768754]);
}
