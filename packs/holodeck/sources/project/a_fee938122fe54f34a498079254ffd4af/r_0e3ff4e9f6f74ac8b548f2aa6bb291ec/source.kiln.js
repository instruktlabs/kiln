const meta = { name: 'statue-bronze', role: 'poi' };

// Aged-bronze trefoil knot standing on its lowest lobe, raised on a cast collar
// over a moulded limestone plinth. The knot's open face is toward +X.
const PLINTH_H = 1.1;
const KNOT_S = 0.29;        // knot units -> metres
const TUBE_R = 0.085;
const COLLAR_H = 0.2;

// Verdigris (#5f7a62) over brown bronze (#6b4e2e): green patina gathers on upward,
// rain-washed surfaces; sheltered undersides and worn edges keep the brown.
// Kiln 1.3.1's GLB bridge drops vertex colours, so the patina is split into two
// material groups (two primitives of one mesh) with a noisy threshold.
function patinaGroups(src, seed, bias) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const pos = g.attributes.position;
  const triCount = pos.count / 3;
  const green = [], brown = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, 3 * t); b.fromBufferAttribute(pos, 3 * t + 1); c.fromBufferAttribute(pos, 3 * t + 2);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3;
    const streak = Math.sin(9 * x + 3 * Math.sin(4 * y + seed) + 11 * z + 2 * y);
    const blot = Math.sin(17 * y + 6 * x - 8 * z + seed) * Math.sin(13 * z - 5 * y + 2 * seed);
    const score = bias + 0.9 * n.y + 0.3 * streak + 0.25 * blot;
    (score > 0 ? green : brown).push(t);
  }
  // weld identical corners back into an indexed buffer (groups index into it)
  const order = green.concat(brown);
  const names = Object.keys(g.attributes);
  const data = names.map(() => []);
  const index = [];
  const seen = new Map();
  for (const t of order) {
    for (let v = 0; v < 3; v++) {
      const src = 3 * t + v;
      let key = '';
      for (const name of names) {
        const at = g.attributes[name];
        for (let j = 0; j < at.itemSize; j++) key += at.array[src * at.itemSize + j].toFixed(5) + ',';
      }
      let id = seen.get(key);
      if (id === undefined) {
        id = seen.size;
        seen.set(key, id);
        names.forEach((name, k) => {
          const at = g.attributes[name];
          for (let j = 0; j < at.itemSize; j++) data[k].push(at.array[src * at.itemSize + j]);
        });
      }
      index.push(id);
    }
  }
  const out = new THREE.BufferGeometry();
  names.forEach((name, k) => out.setAttribute(name, new THREE.BufferAttribute(new Float32Array(data[k]), g.attributes[name].itemSize)));
  out.setIndex(index);
  out.addGroup(0, green.length * 3, 0);
  out.addGroup(green.length * 3, brown.length * 3, 1);
  return out;
}
function patinaPart(name, geo, mats, seed, bias, opts) {
  const part = createPart(name, patinaGroups(geo, seed, bias), mats[0], opts);
  part.material = mats;
  return part;
}

// ---------- draw-call consolidation: exactly one welded, indexed mesh per distinct material ----------
// Bakes every mesh's world transform, buckets triangles by material (honouring geometry groups),
// welds identical position+normal corners (hard creases keep their split normals) and replaces
// the parts with one named mesh per material. The materials carry no textures, so UVs are dropped.
function mergeByMaterial(root, names) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const mesh of meshes) {
    const g = mesh.geometry, pos = g.attributes.position, nrm = g.attributes.normal;
    nm.getNormalMatrix(mesh.matrixWorld);
    const idx = g.index ? g.index.array : null;
    const count = idx ? idx.length : pos.count;
    const groups = (Array.isArray(mesh.material) && g.groups.length) ? g.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const grp of groups) {
      const mat = Array.isArray(mesh.material) ? mesh.material[grp.materialIndex] : mesh.material;
      if (!buckets.has(mat)) buckets.set(mat, { map: new Map(), pos: [], nrm: [], index: [] });
      const b = buckets.get(mat);
      const end = Math.min(count, grp.start + grp.count);
      for (let k = grp.start; k < end; k++) {
        const v = idx ? idx[k] : k;
        p.fromBufferAttribute(pos, v).applyMatrix4(mesh.matrixWorld);
        n.fromBufferAttribute(nrm, v).applyMatrix3(nm).normalize();
        const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)},${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)}`;
        let id = b.map.get(key);
        if (id === undefined) {
          id = b.pos.length / 3;
          b.map.set(key, id);
          b.pos.push(p.x, p.y, p.z);
          b.nrm.push(n.x, n.y, n.z);
        }
        b.index.push(id);
      }
    }
  }
  for (const mesh of meshes) mesh.parent.remove(mesh);
  for (const child of [...root.children]) root.remove(child);
  for (const [mat, b] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nrm), 3));
    geo.setIndex(b.index);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const name = names.get(mat) || 'Merged';
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    root.add(m);
  }
  return root;
}

async function build() {
  const root = createRoot('StatueBronze');

  const limestone = await materialRecipe('kiln.material.stone.v1', { baseColor: '#d6c8a8', roughness: 0.88 });
  const weathered = await materialRecipe('kiln.material.stone.v1', { baseColor: '#9c8d70', roughness: 0.94 });
  const verdigris = await materialRecipe('kiln.material.painted-metal.v1', { baseColor: '#5f7a62', roughness: 0.72, metalness: 0.25 });
  const brownBronze = await materialRecipe('kiln.material.painted-metal.v1', { baseColor: '#6b4e2e', roughness: 0.45, metalness: 0.75 });
  const bronze = [verdigris, brownBronze];

  // ---------- plinth: square mouldings via 4-segment revolutions turned 45 deg ----------
  const R = Math.SQRT2;
  const course = async (pts) => creaseNormals(await revolveProfile(pts.map(([w, y]) => [w * R, y]), { segments: 4, smooth: false }), { angle: 40 });
  createPart('PlinthFoot', await course([[0, 0], [0.5, 0], [0.5, 0.09], [0.49, 0.1], [0, 0.1]]), weathered, { parent: root, rotation: [0, 45, 0] });
  const prof = [[0, 0.1], [0.475, 0.1]];
  for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + Math.PI * i / 5; prof.push([0.455 + 0.02 * Math.cos(a), 0.135 + 0.035 * Math.sin(a)]); }
  prof.push([0.44, 0.172], [0.44, 0.185]);
  for (let i = 1; i <= 4; i++) { const a = Math.PI / 2 * i / 4; prof.push([0.405 + 0.035 * Math.cos(a) * Math.cos(a), 0.185 + 0.045 * Math.sin(a)]); }
  prof.push([0.4, 0.232], [0.4, 0.88], [0.412, 0.885], [0.412, 0.9]);
  for (let i = 1; i <= 5; i++) { const a = Math.PI / 2 * i / 5; prof.push([0.412 + 0.05 * Math.sin(a), 0.9 + 0.07 * (1 - Math.cos(a))]); }
  prof.push([0.48, 0.97], [0.48, 1.05], [0.47, 1.06], [0.458, 1.075], [0.452, PLINTH_H], [0, PLINTH_H]);
  createPart('Plinth', await course(prof), limestone, { parent: root, rotation: [0, 45, 0] });

  // ---------- cast bronze base plate and collar ----------
  patinaPart('BasePlate', await roundedBoxGeo(0.46, 0.035, 0.36, 0.012, { segments: 2 }), bronze, 1, -0.3, { parent: root, position: [0, PLINTH_H + 0.0165, 0] });
  const collarProf = [[0, 0], [0.12, 0], [0.12, 0.025], [0.085, 0.06], [0.062, 0.12], [0.075, COLLAR_H], [0.09, COLLAR_H + 0.03], [0, COLLAR_H + 0.03]];
  patinaPart('Collar', await revolveProfile(collarProf, { segments: 28 }), bronze, 2, -0.2, { parent: root, position: [0, PLINTH_H + 0.03, 0] });

  // ---------- trefoil knot in the YZ plane (faces +X), lowest lobe at t = PI ----------
  const N = 150;
  const knotPts = [], radii = [], sect = [];
  const knotBottom = -3 * KNOT_S - 1.22 * TUBE_R;
  const lift = PLINTH_H + 0.03 + COLLAR_H - knotBottom - 0.035; // sink the lobe into the collar cup
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const a = Math.sin(t) + 2 * Math.sin(2 * t);
    const b = Math.cos(t) - 2 * Math.cos(2 * t);
    const c = -Math.sin(3 * t);
    knotPts.push([c * KNOT_S * 0.95, b * KNOT_S + lift, a * KNOT_S * 0.84]);
    // swell on the outer lobes, pinch through the crossings
    radii.push(TUBE_R * (1 + 0.22 * Math.cos(3 * t + Math.PI)));
    sect.push([1, 0.82]);
  }
  const knotGeo = taperedTube(knotPts, radii, { closed: true, radialSegments: 22, sectionScale: sect });
  patinaPart('Knot', knotGeo, bronze, 3, 0.15, { parent: root });

  mergeByMaterial(root, new Map([[verdigris, 'Bronze_Verdigris'], [brownBronze, 'Bronze_Brown'], [limestone, 'Plinth_Limestone'], [weathered, 'Plinth_Weathered']]));
  return root;
}
