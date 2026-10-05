const meta = { name: 'ffu-ceiling-module' };

// ---- constants (metres); filter face at Y = 0, root at the centre of the filter face ----
const MODULE = 3.6;            // planning-grid pitch on X and Z
const HALF = MODULE / 2;
const CELL_X = 1.2;            // FFU cell, 3 along X
const CELL_Z = 0.6;            // FFU cell, 6 along Z
const NX = 3;
const NZ = 6;
const BAR_W = 0.04;            // T-bar face width; the two module-edge bars are half width so tiled modules meet as one 40 mm bar
const BAR_H = 0.01;            // bar underside hangs 10 mm below the filter face (faces are inset 10 mm above the bars)
const LIGHT_ROW = 2;           // cell row centred at Z = -0.3
const LIGHT_Z = -HALF + (LIGHT_ROW + 0.5) * CELL_Z;
const TOP = 0.4;               // hanger rod tops
const HOUSING_H = 0.28;
const COLLAR_R = 0.14;
const COLLAR_H = 0.06;
const COLLAR_SIDES = 6;
const ROD_W = 0.012;
const ROD_POS = [-0.6, 0.6];   // rod grid nodes (x and z)
const LOD_Y = 0.01;            // lod1 sits 10 mm above the filter face, occluded from below (the GLB cannot store a hidden flag)
const OPEN_X = CELL_X - BAR_W; // clear opening of one cell
const OPEN_Z = CELL_Z - BAR_W;
const LIGHT_NAME = 'light-strip-white';
const LIGHT_HEX = '#F4F6F8';

const PALETTE = {
  'ffu-filter-white': [0xF1F3F4, 0.90, 0.0],
  'aluminium-extrusion': [0xA8AEB4, 0.45, 1.0],
  'galvanized-duct': [0xA3A8AB, 0.50, 0.8],
};

// grid lines: cross bars run along Z at X lines, long bars run along X at Z lines (plus the light-row centre bar)
const X_LINES = [-HALF, -HALF + CELL_X, -HALF + 2 * CELL_X, HALF];
const Z_LINES = [-HALF, -1.2, -0.6, LIGHT_Z, 0, 0.6, 1.2, HALF];

// ---- helpers ----
function makeMesh() {
  const pos = [], nor = [], idx = [];
  function quad(a, b, c, d, n) {
    let q = [a, b, c, d];
    let ns = Array.isArray(n[0]) ? n : [n, n, n, n];
    const f = [0, 1, 2].map((i) => ns[0][i] + ns[1][i] + ns[2][i] + ns[3][i]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * f[0] + cy * f[1] + cz * f[2] < 0) { q = [a, d, c, b]; ns = [ns[0], ns[3], ns[2], ns[1]]; }
    const base = pos.length / 3;
    q.forEach((p, i) => { pos.push(p[0], p[1], p[2]); nor.push(ns[i][0], ns[i][1], ns[i][2]); });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const api = {
    quad,
    up(x0, x1, z0, z1, y) { quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0]); },
    down(x0, x1, z0, z1, y) { quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0]); },
    wallX(x, z0, z1, y0, y1, nx) { quad([x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0], [nx, 0, 0]); },
    wallZ(z, x0, x1, y0, y1, nz) { quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, nz]); },
    ring(cx, cz, y0, y1, r, sides) {
      for (let k = 0; k < sides; k++) {
        const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        quad([cx + r * c0, y0, cz + r * s0], [cx + r * c1, y0, cz + r * s1], [cx + r * c1, y1, cz + r * s1], [cx + r * c0, y1, cz + r * s0],
          [[c0, 0, s0], [c1, 0, s1], [c1, 0, s1], [c0, 0, s0]]);
      }
    },
    geo() { return meshGeo({ positions: pos, indices: idx, normals: nor }); },
    tris() { return idx.length / 3; },
  };
  return api;
}

async function makeMaterials(lightName, lightHex) {
  const out = {};
  for (const [name, [hex, rough, metal]] of Object.entries(PALETTE)) {
    const m = gameMaterial(hex, { roughness: rough, metalness: metal, flatShading: false });
    m.name = name;
    out[name] = m;
  }
  const light = await materialRecipe('kiln.material.emissive.v1', {
    baseColor: lightHex, roughness: 0.5, emissiveColor: lightHex, emissiveIntensity: 1, doubleSided: true,
  });
  light.name = lightName;
  out['light'] = light;
  return out;
}

function addNode(parent, name, geometry, material) {
  const node = new THREE.Mesh(geometry, material);
  node.name = name;
  parent.add(node);
  return node;
}

// bar footprint on its grid line; module-edge bars are half width and lie inside the footprint
function span(lines, i) {
  const p = lines[i], h = BAR_W / 2;
  return [i === 0 ? p : p - h, i === lines.length - 1 ? p : p + h];
}
const cellX = (i) => -HALF + (i + 0.5) * CELL_X;
const cellZ = (j) => -HALF + (j + 0.5) * CELL_Z;

function addModule(target, mats, withLod) {
  // gridBars: cross bars continuous along Z, long bars in three segments between them; walls run through crossings
  const bars = makeMesh();
  for (let i = 0; i < X_LINES.length; i++) {
    const [xa, xb] = span(X_LINES, i);
    bars.down(xa, xb, -HALF, HALF, -BAR_H);
    bars.up(xa, xb, -HALF, HALF, 0);
    bars.wallX(xa, -HALF, HALF, -BAR_H, 0, -1);
    bars.wallX(xb, -HALF, HALF, -BAR_H, 0, 1);
  }
  for (let k = 0; k < Z_LINES.length; k++) {
    const [za, zb] = span(Z_LINES, k);
    for (let i = 0; i < X_LINES.length - 1; i++) {
      const x0 = span(X_LINES, i)[1], x1 = span(X_LINES, i + 1)[0];
      bars.down(x0, x1, za, zb, -BAR_H);
      bars.up(x0, x1, za, zb, 0);
    }
    bars.wallZ(za, -HALF, HALF, -BAR_H, 0, -1);
    bars.wallZ(zb, -HALF, HALF, -BAR_H, 0, 1);
  }

  // ffuFaces, ffuHousings, lightCells
  const faces = makeMesh(), hous = makeMesh(), strips = makeMesh();
  const sub = (OPEN_Z - BAR_W) / 2;   // half of the light-cell opening on either side of the centre bar
  for (let i = 0; i < NX; i++) {
    const xc = cellX(i), x0 = xc - OPEN_X / 2, x1 = xc + OPEN_X / 2;
    for (let j = 0; j < NZ; j++) {
      const zc = cellZ(j), z0 = zc - OPEN_Z / 2, z1 = zc + OPEN_Z / 2;
      if (j === LIGHT_ROW) {
        strips.down(x0, x1, z0, z0 + sub, 0);
        strips.down(x0, x1, z1 - sub, z1, 0);
        continue;
      }
      faces.down(x0, x1, z0, z1, 0);
      hous.wallX(x1, z0, z1, 0, HOUSING_H, 1);
      hous.wallX(x0, z0, z1, 0, HOUSING_H, -1);
      hous.wallZ(z1, x0, x1, 0, HOUSING_H, 1);
      hous.wallZ(z0, x0, x1, 0, HOUSING_H, -1);
      hous.up(x0, x1, z0, z1, HOUSING_H);
      hous.ring(xc, zc, HOUSING_H, HOUSING_H + COLLAR_H, COLLAR_R, COLLAR_SIDES);
    }
  }

  // rodHangers: four square rods from the grid crossings up to Y = TOP
  const rods = makeMesh();
  for (const x of ROD_POS) for (const z of ROD_POS) {
    const a = x - ROD_W / 2, b = x + ROD_W / 2, c = z - ROD_W / 2, d = z + ROD_W / 2;
    rods.wallX(b, c, d, 0, TOP, 1);
    rods.wallX(a, c, d, 0, TOP, -1);
    rods.wallZ(d, a, b, 0, TOP, 1);
    rods.wallZ(c, a, b, 0, TOP, -1);
    rods.up(a, b, c, d, TOP);
  }

  addNode(target, 'gridBars', bars.geo(), mats['aluminium-extrusion']);
  addNode(target, 'ffuFaces', faces.geo(), mats['ffu-filter-white']);
  addNode(target, 'ffuHousings', hous.geo(), mats['galvanized-duct']);
  addNode(target, 'lightCells', strips.geo(), mats['light']);
  addNode(target, 'rodHangers', rods.geo(), mats['aluminium-extrusion']);

  let lodTris = 0;
  if (withLod) {
    // lod1: one white ceiling plane in two pieces around one emissive light-line strip, no overlaps
    const lodFace = makeMesh();
    lodFace.down(-HALF, HALF, -HALF, LIGHT_Z - OPEN_Z / 2, LOD_Y);
    lodFace.down(-HALF, HALF, LIGHT_Z + OPEN_Z / 2, HALF, LOD_Y);
    const lodStrip = makeMesh();
    lodStrip.down(-HALF, HALF, LIGHT_Z - OPEN_Z / 2, LIGHT_Z + OPEN_Z / 2, LOD_Y);
    const lod = new THREE.Group();
    lod.name = 'lod1';
    target.add(lod);
    addNode(lod, 'lod1Face', lodFace.geo(), mats['ffu-filter-white']);
    addNode(lod, 'lod1Strip', lodStrip.geo(), mats['light']);
    lodTris = lodFace.tris() + lodStrip.tris();
  }
  return { gridBars: bars.tris(), ffuFaces: faces.tris(), ffuHousings: hous.tris(), lightCells: strips.tris(), rodHangers: rods.tris(), lod1: lodTris };
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

async function build() {
  const root = createRoot('ffu-ceiling-module');
  const mats = await makeMaterials(LIGHT_NAME, LIGHT_HEX);
  addModule(root, mats, true);
  return applyFoundryStandardLod(root);
}
