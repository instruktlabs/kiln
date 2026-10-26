const meta = { name: 'statue-monolith', role: 'poi' };

// Abstract carved monolith: a tapering, twisted, grooved shaft pierced by an oculus,
// standing on a low wide stepped plinth. Faces +X.
const PLINTH_W = 1.4;    // footprint of the foot course
const PLINTH_H = 0.4;
const SHAFT_H = 2.45;    // before the slanted top cut
const SHAFT_HALF = 0.34; // half-width at the base
const TAPER = 0.5;       // top scale
const TWIST = 75;        // degrees over the height
const OCULUS_Y = 1.45;   // above the plinth top
const OCULUS_R = 0.13;

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
  const root = createRoot('StatueMonolith');

  const travertine = await materialRecipe('kiln.material.stone.v1', { baseColor: '#b39d76', roughness: 0.9 });
  const limestone = await materialRecipe('kiln.material.stone.v1', { baseColor: '#c9b48c', roughness: 0.9 });
  const weathered = await materialRecipe('kiln.material.stone.v1', { baseColor: '#9c8d70', roughness: 0.95 });

  // ---------- stepped plinth: 4-segment revolutions turned 45 deg give square courses ----------
  const R = Math.SQRT2;
  const course = async (pts) => creaseNormals(await revolveProfile(pts.map(([w, y]) => [w * R, y]), { segments: 4, smooth: false }), { angle: 40 });
  const footGeo = await course([[0, 0], [0.7, 0], [0.7, 0.07], [0.69, 0.08], [0, 0.08]]);
  createPart('PlinthFoot', footGeo, weathered, { parent: root, rotation: [0, 45, 0] });
  const plinthGeo = await course([
    [0, 0.08], [0.675, 0.08], [0.675, 0.17], [0.655, 0.19], [0.62, 0.19], [0.62, 0.2],
    [0.53, 0.2], [0.53, 0.212], [0.545, 0.225], [0.545, 0.375], [0.53, 0.39], [0.515, PLINTH_H], [0, PLINTH_H],
  ]);
  createPart('Plinth', plinthGeo, limestone, { parent: root, rotation: [0, 45, 0] });

  // ---------- shaft cross-section: chamfered square with a V-groove down every face ----------
  const h = SHAFT_HALF, c = 0.06, gw = 0.075, gd = 0.075;
  const prof = [];
  // walk the four faces counter-clockwise; each face: chamfer corner, groove at its centre
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const local = [[h, -h + c], [h, -gw], [h - gd, 0], [h, gw], [h, h - c]];
    for (const [u, v] of local) prof.push([u * ca - v * sa, u * sa + v * ca]);
  }
  const shaftGeo = await extrudeProfile(prof, {
    depth: SHAFT_H, axis: 'y', center: false, twist: TWIST, taper: TAPER, divisions: 36, bevel: 0.012, segments: 2,
  });
  const shaft = createPart('ShaftBlank', shaftGeo, travertine, { position: [0, PLINTH_H - 0.01, 0] });

  // oculus pierced front to back (along X), with a slanted top cut falling toward the back
  // bore with flared (countersunk) mouths so the rim reads as carved wherever the twisted faces cross it
  const bore = [[0, -0.7], [OCULUS_R + 0.62 * 0.45, -0.7], [OCULUS_R, -0.08], [OCULUS_R, 0.08], [OCULUS_R + 0.62 * 0.45, 0.7], [0, 0.7]];
  const oc = await revolveProfile(bore, { axis: 'x', segments: 40 });
  const ocu = new THREE.Mesh(oc, travertine);
  ocu.position.set(0, PLINTH_H + OCULUS_Y, 0);
  ocu.updateMatrixWorld(true);
  const cap = new THREE.Mesh(boxGeo(2, 1, 2), travertine);
  cap.position.set(0, PLINTH_H + SHAFT_H - 0.1 + 0.5, 0);
  cap.rotation.set(0, 0, 18 * Math.PI / 180);
  cap.updateMatrixWorld(true);
  // two incised bands low on the shaft: they bite the corners and leave the grooved faces whole
  const bands = [];
  for (const [i, by] of [[0, 0.26], [1, 0.34]].map(([i, y]) => [i, y])) {
    const sc = 1 - (1 - TAPER) * by / SHAFT_H;
    const ring = await extrudeProfile([[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]], {
      depth: 0.035, axis: 'y', center: true, holes: [circleProfile(0.31 * sc, 48)],
    });
    const m = new THREE.Mesh(ring, travertine);
    m.position.set(0, PLINTH_H - 0.01 + by, 0);
    m.updateMatrixWorld(true);
    bands.push(m);
  }
  const carved = await boolDiff('Shaft', shaft, ocu, cap, ...bands);
  carved.geometry = creaseNormals(carved.geometry, { angle: 35 });
  carved.material = travertine;
  root.add(carved);

  mergeByMaterial(root, new Map([[travertine, 'Shaft_Travertine'], [limestone, 'Plinth_Limestone'], [weathered, 'Plinth_Weathered']]));
  return root;
}
