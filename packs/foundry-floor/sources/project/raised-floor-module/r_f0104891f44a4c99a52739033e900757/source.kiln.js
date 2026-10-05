const meta = { name: 'raised-floor-module' };

// ---- constants (metres); top walking surface at Y = 0, root at the centre of the top surface ----
const MODULE = 3.6;            // planning-grid pitch on X and Z
const HALF = MODULE / 2;
const PITCH = 0.6;             // tile pitch, 6 x 6 tiles
const N = 6;
const TRIM_W = 0.02;           // edge trim strip, inside the footprint
const INNER = HALF - TRIM_W;   // trim inner edge
const GROOVE_W = 0.02;         // grout groove width
const GROOVE_D = 0.005;        // grout groove depth
const PERF_RECESS = 0.003;     // perforated panel top below tile top
const SLAB_T = 0.04;           // tile slab thickness (underside at -0.04)
const PLENUM = 0.6;            // pedestals reach Y = -0.6
const PERF_COLUMNS = [1, 4];   // tile columns along X (index 0..5) holding perforated tiles: X = -0.9 and +0.9
const PED_STEP = 1.2;          // pedestal grid, continues across module seams
const PED_BASE = 0.10;
const PED_STEM = 0.025;
const FOOT_H = 0.02;
const STR_W = 0.03;
const STR_H = 0.03;
const STR_X_BOTTOM = -SLAB_T - STR_H;         // stringers along X
const STR_Z_BOTTOM = -SLAB_T - STR_H + 0.005; // stringers along Z, offset so crossing bottoms are not coplanar
const LOD_Y = -0.02;           // mid-slab: the GLB cannot store a hidden flag, so lod1 stays occluded until the scene hides the detail

const PALETTE = {
  'floor-tile-grey': [0xD3D7DA, 0.70, 0.0],
  'tool-panel-grey': [0xC5CBD1, 0.60, 0.0],
  'stainless': [0xB9BEC3, 0.35, 1.0],
};

// ---- helpers ----
function makeMesh() {
  const pos = [], nor = [], idx = [];
  function quad(a, b, c, d, n) {
    let q = [a, b, c, d];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) q = [a, d, c, b];
    const base = pos.length / 3;
    for (const p of q) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const api = {
    quad,
    up(x0, x1, z0, z1, y) { quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]); },
    down(x0, x1, z0, z1, y) { quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0]); },
    wallX(x, z0, z1, y0, y1, nx) { quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [nx, 0, 0]); },
    wallZ(z, x0, x1, y0, y1, nz) { quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, nz]); },
    box(x0, x1, y0, y1, z0, z1, faces) {
      for (const f of faces) {
        if (f === '+x') api.wallX(x1, z0, z1, y0, y1, 1);
        else if (f === '-x') api.wallX(x0, z0, z1, y0, y1, -1);
        else if (f === '+z') api.wallZ(z1, x0, x1, y0, y1, 1);
        else if (f === '-z') api.wallZ(z0, x0, x1, y0, y1, -1);
        else if (f === '+y') api.up(x0, x1, z0, z1, y1);
        else if (f === '-y') api.down(x0, x1, z0, z1, y0);
      }
    },
    frustum(cx, cz, y0, y1, w0, w1) {
      const h = y1 - y0, d = (w0 - w1) / 2, l = Math.hypot(h, d);
      const a = w0 / 2, b = w1 / 2;
      quad([cx + a, y0, cz - a], [cx + a, y0, cz + a], [cx + b, y1, cz + b], [cx + b, y1, cz - b], [h / l, d / l, 0]);
      quad([cx - a, y0, cz - a], [cx - a, y0, cz + a], [cx - b, y1, cz + b], [cx - b, y1, cz - b], [-h / l, d / l, 0]);
      quad([cx - a, y0, cz + a], [cx + a, y0, cz + a], [cx + b, y1, cz + b], [cx - b, y1, cz + b], [0, d / l, h / l]);
      quad([cx - a, y0, cz - a], [cx + a, y0, cz - a], [cx + b, y1, cz - b], [cx - b, y1, cz - b], [0, d / l, -h / l]);
    },
    geo() { return meshGeo({ positions: pos, indices: idx, normals: nor }); },
    tris() { return idx.length / 3; },
  };
  return api;
}

function makeMaterials() {
  const out = {};
  for (const [name, [hex, rough, metal]] of Object.entries(PALETTE)) {
    const m = gameMaterial(hex, { roughness: rough, metalness: metal, flatShading: false });
    m.name = name;
    out[name] = m;
  }
  return out;
}

function addNode(parent, name, geometry, material) {
  const node = new THREE.Mesh(geometry, material);
  node.name = name;
  parent.add(node);
  return node;
}

// tile index k (0..5) -> pad extent between grout grooves; outer pads end at the trim
const line = (k) => -HALF + k * PITCH;
const lo = (k) => (k === 0 ? -INNER : line(k) + GROOVE_W / 2);
const hi = (k) => (k === N - 1 ? INNER : line(k + 1) - GROOVE_W / 2);

function addModule(target, withLod) {
  const mats = makeMaterials();
  const solidCols = [];
  for (let i = 0; i < N; i++) if (!PERF_COLUMNS.includes(i)) solidCols.push(i);
  const groups = [];
  for (const i of solidCols) {
    const g = groups[groups.length - 1];
    if (g && g[g.length - 1] === i - 1) g.push(i); else groups.push([i]);
  }

  // tiles: one slab, groove floor plus raised tile pads; walls run through groove crossings
  const t = makeMesh();
  t.up(-INNER, INNER, -INNER, INNER, -GROOVE_D);
  for (const i of solidCols) {
    for (let j = 0; j < N; j++) t.up(lo(i), hi(i), lo(j), hi(j), 0);
    t.wallX(lo(i), -INNER, INNER, -GROOVE_D, 0, -1);
    t.wallX(hi(i), -INNER, INNER, -GROOVE_D, 0, 1);
  }
  for (const g of groups) {
    const x0 = lo(g[0]), x1 = hi(g[g.length - 1]);
    for (let j = 0; j < N; j++) {
      t.wallZ(lo(j), x0, x1, -GROOVE_D, 0, -1);
      t.wallZ(hi(j), x0, x1, -GROOVE_D, 0, 1);
    }
  }
  t.down(-HALF, HALF, -HALF, HALF, -SLAB_T);

  // perforatedTiles: twelve recessed panels
  const p = makeMesh();
  for (const i of PERF_COLUMNS) for (let j = 0; j < N; j++) p.up(lo(i), hi(i), lo(j), hi(j), -PERF_RECESS);

  // edgeTrim: 20 mm border at groove level, outer wall covers the slab edge
  const e = makeMesh();
  const yT = -GROOVE_D;
  e.up(-HALF, HALF, -HALF, -INNER, yT);
  e.up(-HALF, HALF, INNER, HALF, yT);
  e.up(-HALF, -INNER, -INNER, INNER, yT);
  e.up(INNER, HALF, -INNER, INNER, yT);
  e.wallX(-HALF, -HALF, HALF, -SLAB_T, yT, -1);
  e.wallX(HALF, -HALF, HALF, -SLAB_T, yT, 1);
  e.wallZ(-HALF, -HALF, HALF, -SLAB_T, yT, -1);
  e.wallZ(HALF, -HALF, HALF, -SLAB_T, yT, 1);

  // pedestals: 3 x 3 on a 1.2 m grid, flared foot, post, stringers along X and Z
  const ped = makeMesh();
  const P = [-PED_STEP, 0, PED_STEP];
  for (const x of P) for (const z of P) {
    ped.frustum(x, z, -PLENUM, -PLENUM + FOOT_H, PED_BASE, PED_STEM);
    ped.box(x - PED_STEM / 2, x + PED_STEM / 2, -PLENUM + FOOT_H, STR_X_BOTTOM, z - PED_STEM / 2, z + PED_STEM / 2, ['+x', '-x', '+z', '-z']);
  }
  for (const z of P) ped.box(-HALF, HALF, STR_X_BOTTOM, -SLAB_T, z - STR_W / 2, z + STR_W / 2, ['-y', '+z', '-z', '+x', '-x']);
  for (const x of P) ped.box(x - STR_W / 2, x + STR_W / 2, STR_Z_BOTTOM, -SLAB_T, -HALF, HALF, ['-y', '+x', '-x', '+z', '-z']);

  addNode(target, 'tiles', t.geo(), mats['floor-tile-grey']);
  addNode(target, 'perforatedTiles', p.geo(), mats['tool-panel-grey']);
  addNode(target, 'edgeTrim', e.geo(), mats['floor-tile-grey']);
  addNode(target, 'pedestals', ped.geo(), mats['stainless']);

  let lodTris = 0;
  if (withLod) {
    // lod1: flat top in three pieces plus the two perforated rows as darker strips, no overlaps
    const lodFloor = makeMesh();
    for (const g of groups) lodFloor.up(g[0] === 0 ? -HALF : line(g[0]), g[g.length - 1] === N - 1 ? HALF : line(g[g.length - 1] + 1), -HALF, HALF, LOD_Y);
    const lodBands = makeMesh();
    for (const i of PERF_COLUMNS) lodBands.up(line(i), line(i + 1), -HALF, HALF, LOD_Y);
    const lod = new THREE.Group();
    lod.name = 'lod1';
    target.add(lod);
    addNode(lod, 'lod1Floor', lodFloor.geo(), mats['floor-tile-grey']);
    addNode(lod, 'lod1Bands', lodBands.geo(), mats['tool-panel-grey']);
    lodTris = lodFloor.tris() + lodBands.tris();
  }
  return { tiles: t.tris(), perforatedTiles: p.tris(), edgeTrim: e.tris(), pedestals: ped.tris(), lod1: lodTris };
}

// ---- build ----
// Standard LOD migration, 2026-09-30. Original branches and animation targets
// remain intact; only identity wrappers and declared LOD metadata are added.
// Coverage is derived from the existing building far distance (15 m),
// at 50 degrees vertical FOV and 16:9. The final zero keeps the coarse tier.
function applyFoundryStandardLod(root) {
  const coarse = root.children.find((node) => node.name === 'lod1');
  if (!coarse) throw new Error('Expected one root-level lod1 branch');
  const detail = new THREE.Group(); detail.name = 'LOD0';
  const distant = new THREE.Group(); distant.name = 'LOD1';
  for (const child of [...root.children]) {
    if (child === coarse) continue;
    let hasMesh = false;
    child.traverse((node) => { if (node.isMesh) hasMesh = true; });
    if (hasMesh) detail.add(child);
  }
  // Older authors hid this overlapping proxy. Standard off-scene LOD membership
  // now controls its selection; all other authored visibility is preserved.
  coarse.visible = true;
  distant.add(coarse);
  root.add(detail, distant);
  root.updateMatrixWorld(true);
  const radius = new THREE.Box3().setFromObject(detail).getSize(new THREE.Vector3()).length() / 2;
  const coverage = Math.min(1, Math.PI * (radius / (2 * 15 * Math.tan(25 * Math.PI / 180))) ** 2 / (16 / 9));
  defineLod([detail, distant], { screenCoverage: [coverage, 0] });
  return root;
}

function build() {
  const root = createRoot('raised-floor-module');
  addModule(root, true);
  return applyFoundryStandardLod(root);
}
