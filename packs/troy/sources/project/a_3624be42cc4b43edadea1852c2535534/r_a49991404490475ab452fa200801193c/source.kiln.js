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

const meta={name:'Mature courtyard olive'};
function build() {
  const root=createRoot('MatureOlive'), wood=bag(), foliage=[bag(),bag(),bag()], rng=randomSeed(1807);
  const trunk=[[0,0,0],[.01,.35,0],[-.13,.92,.05],[.10,1.45,-.07],[.07,1.97,.02],[-.15,2.42,.04],[.0,2.86,.12]];
  tube(wood,trunk,[.36,.31,.28,.27,.235,.19,.020],10,.53,true);
  for(let j=0;j<5;j++) { const a=j*1.256+.17; tube(wood,[[0,.23,0],[.40*Math.cos(a),.115,.40*Math.sin(a)],[.67*Math.cos(a),.035,.67*Math.sin(a)]],[.20,.10,.03],7,.25); }
  // Forks begin at exact retained trunk stations. Shoots begin on exact bough stations.
  const tips=[];
  for(let i=0;i<6;i++) {
    const a=i*2.399+.3, start=trunk[i%3+3], reach=1.55+.52*rng(), top=3.65+.75*rng();
    const p1=[start[0]+.50*Math.cos(a),start[1]+.46,start[2]+.50*Math.sin(a)];
    const p2=[Math.cos(a)*reach*.78,top-.40,Math.sin(a)*reach*.78];
    const p3=[Math.cos(a)*reach,top,Math.sin(a)*reach];
    tube(wood,[start,p1,p2,p3],[.16-i*.008,.11,.056,.018],6,.3);
    for(let j=0;j<3;j++) {
      const from=j===0?p1:p2, aa=a+(j-1)*.91+.20;
      const reach2=j===2?reach*.40:reach+(j===0?.06:.43);
      const end=[Math.cos(aa)*reach2,p3[1]+(j===0?-.85:j===1?.30:.48)+.13*rng(),Math.sin(aa)*reach2];
      const mid=vec(from).lerp(vec(end),.63).toArray(); mid[1]+=.14;
      tube(wood,[from,mid,end],[j===0?.06:.045,.025,.006],5,.17);
      tips.push({mid,end,a:aa});
    }
  }
  // Attached sprays with paired lanceolate leaves distributed across crown levels.
  tips.forEach((tip,i)=>{
    for(let k=0;k<2;k++) {
      const aa=tip.a+(k===0?-.6:.6), from=k===0?tip.mid:tip.end;
      const end=vec(from).add(new THREE.Vector3(Math.cos(aa)*.52,.18+.18*rng(),Math.sin(aa)*.52)).toArray();
      tube(wood,[from,end],[.012,.003],4,0);
      tuft(foliage[(i+k)%3],vec(from).lerp(vec(end),.38).toArray(),[.43+.09*Math.sin(i),.29,.36+.07*Math.cos(i)],i*.73+k*1.4);
      for(let j=0;j<3;j++) for(let side=-1;side<=1;side+=2) {
        const t=.16+j*.34, base=vec(from).lerp(vec(end),t).toArray(), angle=aa+side*(.75+.18*rng());
        leaf(foliage[(i+j+k)%3],base,[Math.cos(angle),-.15+.95*rng(),Math.sin(angle)],.37+.14*rng(),.135+.05*rng(),false,side*(.1+.55*rng()));
      }
    }
  });
  const heightScale=0.94; // Bake scale into geometry; reusable root remains identity.
  [wood,...foliage].forEach(b=>{for(let i=1;i<b.positions.length;i+=3)b.positions[i]*=heightScale;});
  return finish(root,wood,foliage,[0x6b5943,0x73816a,0x87947c,0x9aa38b]);
}
