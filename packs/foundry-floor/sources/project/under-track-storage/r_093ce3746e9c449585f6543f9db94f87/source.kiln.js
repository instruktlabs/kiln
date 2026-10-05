const meta = { name: 'Under-track storage shelf' };

// ---- asset constants (metres; +X forward, +Y up, +Z right; datum = seat plane Y = 0 = frame rim, pin tops 1 mm below) ----
const SLAB = { hx: 0.6, hz: 0.3, y0: -0.08, y1: -0.014 };  // shelf 1.2 x 0.6, 0.08 thick below the seat plane; plate top sits in a pocket
const FRAME_W = 0.04;                                       // perimeter frame rim, top at Y = 0
const SEAT_X = [-0.3, 0.3];                                 // seatA, seatB
const PIN = { rb: 0.010, rt: 0.006, y0: -0.014, y1: -0.001, n: 8, at: [[0.10, 0], [-0.05, 0.0866], [-0.05, -0.0866]] };  // three kinematic pins per seat
const GUARD = { x0: 0.565, x1: 0.595, hz: 0.295, y0: -0.005, y1: 0.06 };  // 0.06 m lips at both X ends
const LAMP = { hx: 0.02, y0: -0.05, y1: -0.02, z0: 0.29, z1: 0.312 };     // one per seat on the +Z edge
const ROD = { x: 0.5, z: 0.45, r: 0.025, y0: -0.04, y1: 2.8, n: 8 };     // four hanger rods up to the ceiling
const BRACKET = { hx: 0.02, y0: -0.075, y1: -0.02, z0: 0.285, z1: 0.46 };
const LOD = { inset: 0.002, r: 0.023 };
const PALETTE = {
  alu: ['aluminium-extrusion', 0xA8AEB4, 0.45, 1.0],
  graphite: ['trim-graphite', 0x3B4148, 0.5, 0.1],
  steel: ['stainless', 0xB9BEC3, 0.35, 1.0],
  green: ['status-green', 0x22B14C, 0.4, 0.0],
};

// ===== SHARED RAIL SECTION (text identical in oht-rail-straight, oht-rail-curve and oht-rail-switch) =====
// Section seen from behind, looking along travel: u = lateral (positive to the right of travel), v = height above the underside.
const RAIL_W = 0.30;        // overall width
const RAIL_H = 0.20;        // overall height, underside at v = 0
const RAIL_SLOT = 0.03;     // half-width of the 60 mm underside slot
const RAIL_CAV = 0.13;      // half-width of the vehicle cavity (20 mm side walls)
const RAIL_LIP = 0.02;      // lip thickness = cavity floor height
const RAIL_ROOF = 0.18;     // cavity ceiling height (20 mm top wall)
const RAIL_CHAMFER = 0.03;  // 45 degree lower-edge facet, accent orange
const RAIL_BAND = 0.07;     // top of the vertical accent band on both side walls
const PLATE_T = 0.01;       // join plate thickness along the rail
const PLATE_O = 0.002;      // join plate overhang beyond the section (sides and top)
const RAIL_HW = RAIL_W / 2;

// Clockwise seen from behind. Edge k runs from point k to point k + 1. RAIL_EDGE_MAT: 0 = aluminium-extrusion, 1 = accent-amhs.
const RAIL_PROFILE = [
  [-(RAIL_HW - RAIL_CHAMFER), 0], [-RAIL_HW, RAIL_CHAMFER], [-RAIL_HW, RAIL_BAND], [-RAIL_HW, RAIL_H],
  [RAIL_HW, RAIL_H], [RAIL_HW, RAIL_BAND], [RAIL_HW, RAIL_CHAMFER], [RAIL_HW - RAIL_CHAMFER, 0],
  [RAIL_SLOT, 0], [RAIL_SLOT, RAIL_LIP], [RAIL_CAV, RAIL_LIP], [RAIL_CAV, RAIL_ROOF],
  [-RAIL_CAV, RAIL_ROOF], [-RAIL_CAV, RAIL_LIP], [-RAIL_SLOT, RAIL_LIP], [-RAIL_SLOT, 0],
];
const RAIL_EDGE_MAT = [1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0];

// Join plate: outer frame 2 mm larger than the section on the sides and top, flush with the underside, cavity and slot left open.
const PLATE_HW = RAIL_HW + PLATE_O;
const PLATE_TOP = RAIL_H + PLATE_O;
const PLATE_OUTLINE = [
  [-PLATE_HW, 0], [-PLATE_HW, PLATE_TOP], [PLATE_HW, PLATE_TOP], [PLATE_HW, 0],
  [RAIL_SLOT, 0], [RAIL_SLOT, RAIL_LIP], [RAIL_CAV, RAIL_LIP], [RAIL_CAV, RAIL_ROOF],
  [-RAIL_CAV, RAIL_ROOF], [-RAIL_CAV, RAIL_LIP], [-RAIL_SLOT, RAIL_LIP], [-RAIL_SLOT, 0],
];
const PLATE_TRIS = [[1, 2, 8], [2, 7, 8], [0, 1, 9], [1, 8, 9], [2, 3, 6], [2, 6, 7], [0, 9, 10], [0, 10, 11], [3, 4, 5], [3, 5, 6]];
const RECT_TRIS = [[0, 1, 2], [0, 2, 3]];
function rectOutline(u0, u1, v0, v1) { return [[u0, v0], [u0, v1], [u1, v1], [u1, v0]]; }

function railMaterial(name, hex, roughness, metalness) {
  const m = gameMaterial(hex, { roughness: roughness, metalness: metalness, flatShading: false });
  m.name = name;
  return m;
}

// A station is a section plane: c = centreline point at underside height, e = unit lateral (+u), t = unit heading.
function stationAt(x, z, headingDeg) {
  const h = (headingDeg * Math.PI) / 180, s = Math.sin(h), c = Math.cos(h);
  return { c: [x, 0, z], e: [-s, 0, c], t: [c, 0, s] };
}
// Station on a right-hand circle about (cx, cz); headingDeg 0 = heading +X at the point directly -Z of the centre.
function arcStation(cx, cz, radius, headingDeg) {
  const h = (headingDeg * Math.PI) / 180, s = Math.sin(h), c = Math.cos(h);
  return { c: [cx + radius * s, 0, cz - radius * c], e: [-s, 0, c], t: [c, 0, s] };
}

function newGeo(grouped) { return { p: [], n: [], i: [], g: [], grouped: grouped }; }
function pushV(G, x, y, z, nx, ny, nz) { G.p.push(x, y, z); G.n.push(nx, ny, nz); return G.p.length / 3 - 1; }
function stationPoint(st, q) { return [st.c[0] + q[0] * st.e[0], st.c[1] + q[1], st.c[2] + q[0] * st.e[2]]; }
function finishGeo(G) {
  const geo = meshGeo({ positions: G.p, normals: G.n, indices: G.i });
  const merged = [];
  for (const g of G.g) {
    const last = merged[merged.length - 1];
    if (last && last[2] === g[2] && last[0] + last[1] === g[0]) last[1] += g[1]; else merged.push([g[0], g[1], g[2]]);
  }
  for (const g of merged) geo.addGroup(g[0], g[1], g[2]);
  return geo;
}

// Side walls of an outline swept through consecutive stations. Crisp corners (per-edge vertices), normals follow the station frame.
function sweepWalls(G, stations, outline, edgeMat) {
  const n = outline.length, base = [];
  for (const st of stations) {
    base.push(G.p.length / 3);
    for (let k = 0; k < n; k++) {
      const a = outline[k], b = outline[(k + 1) % n];
      const du = b[0] - a[0], dv = b[1] - a[1], len = Math.hypot(du, dv);
      const nu = -dv / len, nv = du / len;
      for (const q of [a, b]) {
        const w = stationPoint(st, q);
        pushV(G, w[0], w[1], w[2], nu * st.e[0], nv, nu * st.e[2]);
      }
    }
  }
  const maxMat = Math.max(...edgeMat);
  for (let m = 0; m <= maxMat; m++) {
    const start = G.i.length;
    for (let s = 0; s + 1 < stations.length; s++) {
      for (let k = 0; k < n; k++) {
        if (edgeMat[k] !== m) continue;
        const a0 = base[s] + 2 * k, b0 = a0 + 1, a1 = base[s + 1] + 2 * k, b1 = a1 + 1;
        G.i.push(a0, b0, b1, a0, b1, a1);
      }
    }
    if (G.grouped && G.i.length > start) G.g.push([start, G.i.length - start, m]);
  }
}

// Flat cap on a station plane. sign +1 faces along the heading, -1 faces against it.
function capOutline(G, st, outline, tris, sign, mat) {
  const b = G.p.length / 3, start = G.i.length;
  for (const q of outline) {
    const w = stationPoint(st, q);
    pushV(G, w[0], w[1], w[2], sign * st.t[0], 0, sign * st.t[2]);
  }
  for (const t of tris) {
    if (sign > 0) G.i.push(b + t[0], b + t[1], b + t[2]); else G.i.push(b + t[0], b + t[2], b + t[1]);
  }
  if (G.grouped) G.g.push([start, G.i.length - start, mat]);
}

// Closed prism between two stations (caps first so equal-material groups merge).
function addPrism(G, sA, sB, outline, tris, edgeMat) {
  capOutline(G, sB, outline, tris, 1, 0);
  capOutline(G, sA, outline, tris, -1, 0);
  sweepWalls(G, [sA, sB], outline, edgeMat || outline.map(() => 0));
}
function addPlate(G, sA, sB) { addPrism(G, sA, sB, PLATE_OUTLINE, PLATE_TRIS); }

// Open vertical cylinder (both ends are buried in neighbouring solids).
function addRod(G, x, z, r, y0, y1, seg) {
  const b = G.p.length / 3;
  for (let j = 0; j < seg; j++) {
    const a = (2 * Math.PI * j) / seg, cx = Math.cos(a), cz = Math.sin(a);
    pushV(G, x + r * cx, y0, z + r * cz, cx, 0, cz);
    pushV(G, x + r * cx, y1, z + r * cz, cx, 0, cz);
  }
  for (let j = 0; j < seg; j++) {
    const j2 = (j + 1) % seg;
    G.i.push(b + 2 * j2, b + 2 * j, b + 2 * j + 1, b + 2 * j2, b + 2 * j + 1, b + 2 * j2 + 1);
  }
}

function railPart(parent, name, geo, material) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
function railLocator(parent, name, x, y, z) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
// ===== END SHARED RAIL SECTION =====

// Flat-shaded quad; a,b,c,d in any order around the face, n = outward unit normal (winding is fixed to match n).
function quad(G, a, b, c, d, n) {
  const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const t = b; b = d; d = t; }
  const i0 = pushV(G, a[0], a[1], a[2], n[0], n[1], n[2]);
  const i1 = pushV(G, b[0], b[1], b[2], n[0], n[1], n[2]);
  const i2 = pushV(G, c[0], c[1], c[2], n[0], n[1], n[2]);
  const i3 = pushV(G, d[0], d[1], d[2], n[0], n[1], n[2]);
  G.i.push(i0, i1, i2, i0, i2, i3);
}
function tri(G, a, b, c, n) {
  const cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  if (cy * n[1] < 0) { const t = b; b = c; c = t; }
  const i0 = pushV(G, a[0], a[1], a[2], n[0], n[1], n[2]);
  const i1 = pushV(G, b[0], b[1], b[2], n[0], n[1], n[2]);
  const i2 = pushV(G, c[0], c[1], c[2], n[0], n[1], n[2]);
  G.i.push(i0, i1, i2);
}
function addBox(G, x0, x1, y0, y1, z0, z1) {
  quad(G, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]);
  quad(G, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
  quad(G, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  quad(G, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
  quad(G, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
  quad(G, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
}
// Vertical n-sided frustum, vertices on the +X and +Z axes when n is a multiple of 4; flat side normals.
function addFrustum(G, cx, cz, rb, rt, y0, y1, n, capTop, capBottom) {
  const ring = (r, y) => {
    const v = [];
    for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k) / n; v.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]); }
    return v;
  };
  const bot = ring(rb, y0), top = ring(rt, y1);
  const slope = (rb - rt) / (y1 - y0), len = Math.hypot(1, slope);
  for (let k = 0; k < n; k++) {
    const am = (2 * Math.PI * (k + 0.5)) / n;
    quad(G, bot[k], bot[(k + 1) % n], top[(k + 1) % n], top[k], [Math.cos(am) / len, slope / len, Math.sin(am) / len]);
  }
  if (capTop) for (let k = 1; k < n - 1; k++) tri(G, top[0], top[k], top[k + 1], [0, 1, 0]);
  if (capBottom) for (let k = 1; k < n - 1; k++) tri(G, bot[0], bot[k], bot[k + 1], [0, -1, 0]);
}

// Standard LOD migration, 2026-09-30. Original branches and animation targets
// remain intact; only identity wrappers and declared LOD metadata are added.
// Coverage is derived from the existing storage far distance (25 m),
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
  const coverage = Math.min(1, Math.PI * (radius / (2 * 25 * Math.tan(25 * Math.PI / 180))) ** 2 / (16 / 9));
  defineLod([detail, distant], { screenCoverage: [coverage, 0] });
  return root;
}

function build() {
  const root = createRoot('under-track-storage');
  const alu = railMaterial(...PALETTE.alu);
  const graphite = railMaterial(...PALETTE.graphite);
  const steel = railMaterial(...PALETTE.steel);
  const green = railMaterial(...PALETTE.green);

  // shelf: slab plus a perimeter frame whose rim is the seat plane; the FOUPs rest on the pins inside the pocket
  const shelf = newGeo(false);
  const { hx, hz, y0, y1 } = SLAB;
  addBox(shelf, -hx, hx, y0, y1, -hz, hz);
  addBox(shelf, hx - FRAME_W, hx, y1, 0, -hz, hz);
  addBox(shelf, -hx, -hx + FRAME_W, y1, 0, -hz, hz);
  addBox(shelf, -hx + FRAME_W, hx - FRAME_W, y1, 0, hz - FRAME_W, hz);
  addBox(shelf, -hx + FRAME_W, hx - FRAME_W, y1, 0, -hz, -hz + FRAME_W);
  railPart(root, 'shelf', finishGeo(shelf), alu);

  // pins: three per seat, tops 1 mm under the seat plane so a FOUP at Y = 0 touches without intersecting
  const pins = newGeo(false);
  for (const sx of SEAT_X) for (const [dx, dz] of PIN.at) addFrustum(pins, sx + dx, dz, PIN.rb, PIN.rt, PIN.y0, PIN.y1, PIN.n, true, false);
  railPart(root, 'pins', finishGeo(pins), steel);

  // guardRails: low lips on the frame rim at both X ends
  const guard = newGeo(false);
  addBox(guard, GUARD.x0, GUARD.x1, GUARD.y0, GUARD.y1, -GUARD.hz, GUARD.hz);
  addBox(guard, -GUARD.x1, -GUARD.x0, GUARD.y0, GUARD.y1, -GUARD.hz, GUARD.hz);
  railPart(root, 'guardRails', finishGeo(guard), graphite);

  // occupancyLamps: one small lamp per seat on the +Z edge
  const lamps = newGeo(false);
  for (const sx of SEAT_X) addBox(lamps, sx - LAMP.hx, sx + LAMP.hx, LAMP.y0, LAMP.y1, LAMP.z0, LAMP.z1);
  railPart(root, 'occupancyLamps', finishGeo(lamps), green);

  // rods: four octagonal extrusions up to Y = 2.8, each on a short bracket that reaches back to the shelf edge
  const rods = newGeo(false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * ROD.x, z = sz * ROD.z;
    addFrustum(rods, x, z, ROD.r, ROD.r, ROD.y0, ROD.y1, ROD.n, true, true);
    addBox(rods, x - BRACKET.hx, x + BRACKET.hx, BRACKET.y0, BRACKET.y1, sz > 0 ? BRACKET.z0 : -BRACKET.z1, sz > 0 ? BRACKET.z1 : -BRACKET.z0);
  }
  railPart(root, 'rods', finishGeo(rods), alu);

  // lod1: slab, four diamond columns and two cross bars, everything 2 mm inside the detailed skin
  const lod = newGeo(false);
  const li = LOD.inset;
  addBox(lod, -hx + li, hx - li, y0 + li, y1 - li, -hz + li, hz - li);
  for (const sx of [-1, 1]) {
    addBox(lod, sx * ROD.x - 0.018, sx * ROD.x + 0.018, BRACKET.y0 + li, BRACKET.y1 - li, -ROD.z, ROD.z);
    for (const sz of [-1, 1]) addFrustum(lod, sx * ROD.x, sz * ROD.z, LOD.r, LOD.r, ROD.y0 + 0.01, ROD.y1 - li, 4, true, false);
  }
  railPart(root, 'lod1', finishGeo(lod), alu);

  railLocator(root, 'seatA', SEAT_X[0], 0, 0);
  railLocator(root, 'seatB', SEAT_X[1], 0, 0);
  return applyFoundryStandardLod(root);
}
