const meta = { name: "Greek War Galley", role: "vehicle" };
async function build() {
  const root = createRoot("GreekWarGalley");
  const body = new THREE.Group(); body.name = "GalleyConstruction"; root.add(body);
  // Author in +X, then turn the complete ship to Troy's +Z convention.
  body.rotation.y = -Math.PI / 2;
  const timberSpec = {
    schemaVersion: 2, model: "pbrMetallicRoughness", name: "Troy timber",
    roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: "opaque", alphaCutoff: .5, doubleSided: false,
    textures: {
      baseColor: { kind: "resource", resourceId: "kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.base-color" },
      metallicRoughness: { kind: "resource", resourceId: "kiln.library.e62c1bd5bf46305aa50732b3a82cdd9c66da1c8b2d0f5e0fdd392656851feb5c.metallic-roughness" }
    }
  };
  const linenSpec = {
    schemaVersion: 2, model: "pbrMetallicRoughness", name: "Troy linen",
    roughness: 1, metalness: 1, emissiveIntensity: 1, alphaMode: "opaque", alphaCutoff: .5, doubleSided: true,
    textures: {
      baseColor: { kind: "resource", resourceId: "kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.base-color" },
      metallicRoughness: { kind: "resource", resourceId: "kiln.library.b3b5d252a37410d00716cf771f6e843e6dc142bad6747ad73f748bcd6e856de8.metallic-roughness" }
    }
  };
  const timber = await compilePortableMaterialSpecV2(timberSpec);
  const pitch = await compilePortableMaterialSpecV2({ ...timberSpec, name: "Pitch black timber", baseColor: 0x2b2420 });
  const linen = await compilePortableMaterialSpecV2(linenSpec);
  const blue = await compilePortableMaterialSpecV2({ ...linenSpec, name: "Greek blue woven sail marking", baseColor: 0x2f4a6b });
  const woodParts = [], blackParts = [], blueParts = [];
  function queue(geo, material, name, position = [0,0,0], rotation = [0,0,0]) {
    const mesh = new THREE.Mesh(geo, material); mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation.map(n => n * Math.PI / 180));
    mesh.updateMatrix();
    (material === pitch ? blackParts : material === blue ? blueParts : woodParts).push(mesh);
    return mesh;
  }
  function rod(name, a, b, r, material = timber, segments = 6) {
    const delta = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const mesh = new THREE.Mesh(cylinderGeo(r,r,delta.length(),segments), material);
    mesh.name = name; mesh.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
    mesh.updateMatrix();
    (material === pitch ? blackParts : woodParts).push(mesh);
  }
  function merged(parts) {
    const p=[], n=[], uv=[];
    for (const item of parts) {
      let geo = item.geometry.clone();
      if (geo.index) geo = geo.toNonIndexed();
      geo.applyMatrix4(item.matrix);
      const pa=geo.getAttribute("position"), na=geo.getAttribute("normal"), ua=geo.getAttribute("uv");
      for(let i=0;i<pa.count;i++) {
        p.push(pa.getX(i),pa.getY(i),pa.getZ(i)); n.push(na.getX(i),na.getY(i),na.getZ(i));
        uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
      }
    }
    return meshGeo({positions:p,normals:n,uvs:uv});
  }
  function facesGeometry(faces) {
    const p=[], uv=[];
    for(const face of faces) {
      for(const i of [0,1,2,0,2,3]) { p.push(...face[i]); uv.push(face[i][0],face[i][1]); }
    }
    return meshGeo({positions:p,uvs:uv});
  }
  // x, half beam, keel height, sheer height. A closed thick U-section leaves the cockpit open.
  const stations=[
    [-8.75,.10,2.55,3.65],[-8.25,.28,1.28,2.90],[-7.4,.62,.46,2.25],
    [-6.25,1.02,.14,1.96],[-4.8,1.37,.04,1.87],[-2.4,1.50,0,1.84],
    [0,1.53,0,1.84],[2.4,1.48,.01,1.87],[4.8,1.30,.10,1.98],
    [6.5,.91,.32,2.22],[7.6,.47,.80,2.66],[8.65,.08,1.68,3.35]
  ];
  function hullAt(x) {
    for(let i=0;i<stations.length-1;i++) {
      const a=stations[i],b=stations[i+1];
      if(x>=a[0] && x<=b[0]) {
        const t=(x-a[0])/(b[0]-a[0]);
        return { width:a[1]+(b[1]-a[1])*t, top:a[3]+(b[3]-a[3])*t };
      }
    }
    return {width:.1,top:3};
  }
  function deckPanel(name,x0,x1,y) {
    const w0=hullAt(x0).width*.80-.12,w1=hullAt(x1).width*.80-.12;
    const v=[[x0,y-.075,-w0],[x1,y-.075,-w1],[x1,y-.075,w1],[x0,y-.075,w0],
      [x0,y+.075,-w0],[x1,y+.075,-w1],[x1,y+.075,w1],[x0,y+.075,w0]];
    const faces=[[v[0],v[3],v[2],v[1]],[v[4],v[5],v[6],v[7]],
      [v[0],v[1],v[5],v[4]],[v[1],v[2],v[6],v[5]],
      [v[2],v[3],v[7],v[6]],[v[3],v[0],v[4],v[7]]];
    queue(facesGeometry(faces.map(face => face.slice().reverse())),timber,name);
  }
  function ring(s) {
    const [x,w,k,t]=s, inset=Math.min(.13,w*.36);
    const z=[-1,-.98,-.73,0,.73,.98,1], h=[1,.61,.18,0,.18,.61,1];
    const outer=z.map((v,i)=>[x,k+(t-k)*h[i],w*v]);
    const inner=z.map((v,i)=>[x,k+.14+(t-k-.14)*h[i],(w-inset)*v]).reverse();
    return outer.concat(inner);
  }
  const rings=stations.map(ring), hullFaces=[];
  for(let j=0;j<rings.length-1;j++) for(let i=0;i<14;i++) {
    const q=(i+1)%14;
    hullFaces.push([rings[j][i],rings[j+1][i],rings[j+1][q],rings[j][q]]);
  }
  let hull = facesGeometry(hullFaces);
  // Close the narrow end sections explicitly with a triangulated strip across the U wall.
  const endP=[], endUV=[];
  for(const end of [0,rings.length-1]) for(let i=0;i<6;i++) {
    let a=rings[end][i], b=rings[end][i+1], c=rings[end][12-i], d=rings[end][13-i];
    const quad=end===0 ? [a,b,c,d] : [d,c,b,a];
    for(const v of [quad[0],quad[1],quad[2],quad[0],quad[2],quad[3]]) {endP.push(...v);endUV.push(v[2],v[1]);}
  }
  queue(hull,pitch,"ThickOpenHull");
  queue(meshGeo({positions:endP,uvs:endUV}),pitch,"HullEndClosures");
  // Long timber gunwales, lower black wale and a substantial centre keel.
  for(const side of [-1,1]) {
    for(let j=0;j<stations.length-1;j++) {
      const a=stations[j],b=stations[j+1];
      rod("Gunwale_"+side+"_"+j,[a[0],a[3],side*a[1]],[b[0],b[3],side*b[1]],.085);
      rod("Wale_"+side+"_"+j,[a[0],a[2]+.64*(a[3]-a[2]),side*.97*a[1]],
        [b[0],b[2]+.64*(b[3]-b[2]),side*.97*b[1]],.045,pitch);
    }
  }
  for(let j=0;j<stations.length-1;j++) {
    const a=stations[j],b=stations[j+1];
    rod("Keel_"+j,[a[0],a[2]+.08,0],[b[0],b[2]+.08,0],.085,pitch);
  }
  // Rowers' footboards and transverse benches, with a clear centre passage.
  for(let z=-.72;z<=.73;z+=.36) queue(boxGeo(12.5,.10,.32),timber,"Footboard_"+z,[0,1.00,z]);
  for(let i=0;i<14;i++) {
    const x=-5.8+i*.89;
    const span=Math.min(2.58,2*(hullAt(x).width*.94-.16));
    queue(boxGeo(.27,.13,span),timber,"RowingBench_"+i,[x,1.50,0]);
    for(const side of [-1,1]) queue(boxGeo(.14,.48,.13),timber,"BenchLeg_"+i+"_"+side,[x,1.21,side*span*.35]);
  }
  deckPanel("SternPlatform",-7.7,-5.6,1.65);
  deckPanel("BowPlatform",5.75,7.35,1.77);
  // Short raised stern rail, joined to the sheer by uprights.
  for(const side of [-1,1]) {
    rod("SternRail_"+side,[-7.35,2.8,side*.59],[-5.85,2.40,side*1.10],.065);
    rod("SternRailPostA_"+side,[-7.35,2.25,side*.59],[-7.35,2.8,side*.59],.06);
    rod("SternRailPostB_"+side,[-5.85,1.98,side*1.10],[-5.85,2.40,side*1.10],.06);
  }
  // One tapered mast and transverse yard. Mast foot enters its load-bearing socket.
  const mastX=.35, yardY=8.65, yardX=.53, sailHalfWidth=3.85;
  queue(boxGeo(.65,.35,.65),timber,"MastSocket",[mastX,1.12,0]);
  queue(cylinderGeo(.105,.19,8.05,8),timber,"Mast",[mastX,5.075,0]);
  rod("Yard",[yardX,yardY,-4.12],[yardX,yardY,4.12],.105);
  // Sail shares this equation with its bolt ropes and woven blue emblem.
  function sailPoint(u,v,offset=0) {
    const z=(u*2-1)*sailHalfWidth*(1-.12*(1-v));
    const bottom=4.28-.42*Math.sin(Math.PI*u);
    const y=bottom+(yardY-bottom)*v;
    const x=yardX+.85*Math.sin(Math.PI*u)*Math.sin(Math.PI*v)+offset;
    return [x,y,z];
  }
  const p=[],uv=[],idx=[], nu=16,nv=10;
  for(let j=0;j<=nv;j++) for(let i=0;i<=nu;i++) {p.push(...sailPoint(i/nu,j/nv));uv.push(i/nu*8,j/nv*9);}
  for(let j=0;j<nv;j++) for(let i=0;i<nu;i++) {
    const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1; idx.push(a,c,b,b,c,d);
  }
  const sail=createPart("SetLinenSail",meshGeo({positions:p,indices:idx,uvs:uv}),linen,{parent:body});
  markOpenShell(sail,"A deliberately thin, double-sided linen sail.");
  for(let i=0;i<16;i++) {
    rod("SailFoot_"+i,sailPoint(i/16,0),sailPoint((i+1)/16,0),.027);
    rod("SailHead_"+i,sailPoint(i/16,1),sailPoint((i+1)/16,1),.026);
  }
  for(const u of [0,1]) for(let j=0;j<10;j++) rod("SailLeech_"+u+"_"+j,sailPoint(u,j/10),sailPoint(u,(j+1)/10),.027);
  // Simple blue woven vertical bands, conforming to the billowing sail.
  for(const u0 of [.16,.81]) {
    const bp=[],buv=[],bi=[];
    for(let j=0;j<=10;j++) for(let i=0;i<=1;i++) {bp.push(...sailPoint(u0+i*.035,j/10,.012));buv.push(i,j/10);}
    for(let j=0;j<10;j++){const a=j*2;bi.push(a,a+2,a+1,a+1,a+2,a+3);}
    queue(meshGeo({positions:bp,indices:bi,uvs:buv}),blue,"GreekSailBand_"+u0);
  }
  // Standing rigging and the sheets tied to the hull, clear of the set sail.
  rod("Forestay",[mastX,9.05,0],[7.4,2.44,0],.035);
  rod("Backstay",[mastX,9.05,0],[-7.3,2.4,0],.035);
  for(const side of [-1,1]) {
    rod("Shroud_"+side,[mastX,8.95,0],[-1.5,1.9,side*1.48],.031);
    rod("YardBrace_"+side,[yardX,yardY,side*4.03],[-5.8,2.0,side*1.1],.03);
    rod("SailSheet_"+side,sailPoint(side===-1?0:1,0),[4.5,1.96,side*1.28],.033);
  }
  // Fourteen matched oars per side; broadened blades are solid six-sided prisms.
  function blade(name,a,b,width,thickness) {
    const forward=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
    const cross=new THREE.Vector3(1,0,0);
    cross.addScaledVector(forward,-cross.dot(forward)).normalize();
    const normal=new THREE.Vector3().crossVectors(forward,cross).normalize();
    const points=[];
    for(const [t,w] of [[0,.34],[.12,1],[.87,1],[1,.72]]) for(const side of [-1,1])
      points.push(new THREE.Vector3(...a).lerp(new THREE.Vector3(...b),t).addScaledVector(cross,side*width/2*w));
    const shape=[0,2,4,6,7,5,3,1], verts=[];
    for(const s of [-1,1]) for(const v of shape) verts.push(points[v].clone().addScaledVector(normal,s*thickness/2).toArray());
    const pp=verts.flat(),ii=[];
    for(let i=1;i<7;i++){ii.push(0,i+1,i);ii.push(8,8+i,9+i);}
    for(let i=0;i<8;i++){const q=(i+1)%8;ii.push(i,q,8+q,i,8+q,8+i);}
    queue(meshGeo({positions:pp,indices:ii,uvs:verts.flatMap(v=>[v[0],v[2]])}),timber,name);
  }
  for(let i=0;i<14;i++) for(const side of [-1,1]) {
    const x=-5.8+i*.89;
    const section=hullAt(x), pivot=[x,section.top+.05,side*section.width];
    const throat=[x-.50,.57,side*4.13],tip=[x-.67,.21,side*5.00];
    const lever=(section.width-.30)/(4.13-section.width);
    const start=[x+.50*lever,pivot[1]+(pivot[1]-.57)*lever,side*.30];
    rod("OarShaft_"+i+"_"+side,start,throat,.055);
    blade("OarBlade_"+i+"_"+side,throat,tip,.27,.065);
    rod("TholePin_"+i+"_"+side,[x-.065,section.top-.06,side*section.width],[x-.065,section.top+.23,side*section.width],.045);
  }
  // Starboard quarter steering oar, larger than the rowing blades.
  const steeringA=[-6.2,2.35,1.0],steeringB=[-8.0,.69,2.38],steeringC=[-8.7,.15,2.92];
  rod("SteeringOarShaft",steeringA,steeringB,.082);
  blade("SteeringOarBlade",steeringB,steeringC,.48,.085);
  rod("SteeringMount",[-6.8,2.10,.79],[-6.8,1.7967,1.46],.08);
  // Converging prow with a simple blue bow accent, avoiding later-period trireme furniture.
  for(const side of [-1,1]) {
    queue(boxGeo(.65,.08,.025),blue,"BowFactionMark_"+side,[6.25,2.12,side*.98],[0,side*14,0]);
  }
  createPart("PitchHullAndKeel",merged(blackParts),pitch,{parent:body});
  createPart("TimberMastOarsAndRigging",merged(woodParts),timber,{parent:body});
  const blueMesh=createPart("GreekBlueSailBands",merged(blueParts),blue,{parent:body});
  markOpenShell(blueMesh,"Thin woven bands applied to the sail.");
  root.userData = { design: "Troy pack, 18 m class black galley with single set sail and 28 rowing oars", forward: "+Z", units: "metres" };
  return root;
}