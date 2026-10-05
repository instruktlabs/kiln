const meta = { name: 'OHT rail curve' };

// ---- asset constants (metres; +X forward, +Y up, +Z right; datum = track underside at Y = 0) ----
const CURVE_R = 1.8;                                    // centreline radius
const ARC_CX = 0, ARC_CZ = 1.8;                         // arc centre; start (0,0,0) heading +X, end (1.8,0,1.8) heading +Z
const BODY_SEGS = 12;                                   // sweep segments of trackBody and powerLine (45 degrees is a vertex)
const LOD_SEGS = 6;                                     // flat chord segments of lod1
const HANGER_HEADINGS = [30, 60];                       // degrees along the 90 degree arc
const HANGER_TOP = 1.10;                                // upper face of the ceiling plates (world 6.0 with the rail at 4.9)
const ROD_R = 0.008;
const ROD_SEG = 12;
const CLAMP = { hx: 0.04, hz: 0.05, top: 0.23 };        // clamp block on the rail top, sunk 1 mm into it
const CEIL_PLATE = { hx: 0.08, hz: 0.08, t: 0.01 };     // top plate that meets the FFU face
const POWER = { u0: -0.154, u1: -0.149, v0: 0.09, v1: 0.15 };  // dark power bar on the OUTER (-u) side of the arc, 4 mm proud of the wall
const LOD_INSET = 0.002;
const PALETTE = {
  alu: ['aluminium-extrusion', 0xA8AEB4, 0.45, 1.0],
  graphite: ['trim-graphite', 0x3B4148, 0.5, 0.1],
  accent: ['accent-amhs', 0xE07B22, 0.5, 0.0],
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

// Closed prism through any number of stations (caps at both ends).
function addSweep(G, stations, outline, tris, edgeMat) {
  capOutline(G, stations[stations.length - 1], outline, tris, 1, 0);
  capOutline(G, stations[0], outline, tris, -1, 0);
  sweepWalls(G, stations, outline, edgeMat || outline.map(() => 0));
}

// Standard LOD migration, 2026-09-30. Original branches and animation targets
// remain intact; only identity wrappers and declared LOD metadata are added.
// Coverage is derived from the existing rail far distance (25 m),
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
  const root = createRoot('oht-rail-curve');
  const alu = railMaterial(...PALETTE.alu);
  const graphite = railMaterial(...PALETTE.graphite);
  const accent = railMaterial(...PALETTE.accent);

  const deg = 180 / Math.PI;
  const arc = (headingDeg) => arcStation(ARC_CX, ARC_CZ, CURVE_R, headingDeg);
  const delta = (PLATE_T / CURVE_R) * deg;                // arc angle taken by one join plate at the centreline
  const stations = [];
  for (let k = 0; k <= BODY_SEGS; k++) stations.push(arc(delta + ((90 - 2 * delta) * k) / BODY_SEGS));

  // trackBody: the shared section swept along the arc between the two join plates
  const body = newGeo(true);
  sweepWalls(body, stations, RAIL_PROFILE, RAIL_EDGE_MAT);
  railPart(root, 'trackBody', finishGeo(body), [alu, accent]);

  // powerLine: slim dark bar on the outer wall, sharing the body stations so it hugs every chord
  const power = newGeo(false);
  addSweep(power, stations, rectOutline(POWER.u0, POWER.u1, POWER.v0, POWER.v1), RECT_TRIS);
  railPart(root, 'powerLine', finishGeo(power), graphite);

  // hangers: at 30 and 60 degrees; clamp block, rod and ceiling plate aligned to the local tangent
  const hang = newGeo(false);
  for (const h of HANGER_HEADINGS) {
    const st = arc(h), cx = st.c[0], cz = st.c[2];
    const along = (d) => stationAt(cx + d * st.t[0], cz + d * st.t[2], h);
    addPrism(hang, along(-CLAMP.hx), along(CLAMP.hx), rectOutline(-CLAMP.hz, CLAMP.hz, RAIL_H - 0.001, CLAMP.top), RECT_TRIS);
    addRod(hang, cx, cz, ROD_R, CLAMP.top - 0.01, HANGER_TOP - CEIL_PLATE.t / 2, ROD_SEG);
    addPrism(hang, along(-CEIL_PLATE.hx), along(CEIL_PLATE.hx), rectOutline(-CEIL_PLATE.hz, CEIL_PLATE.hz, HANGER_TOP - CEIL_PLATE.t, HANGER_TOP), RECT_TRIS);
  }
  railPart(root, 'hangers', finishGeo(hang), alu);

  // joinPlates: thin flanges on the radial end planes, outer faces exactly on X = 0 and Z = 1.8
  const plates = newGeo(false);
  addPlate(plates, arc(0), arc(delta));
  addPlate(plates, arc(90 - delta), arc(90));
  railPart(root, 'joinPlates', finishGeo(plates), graphite);

  // lod1: six flat chord segments sharing radial joint planes, kept inside the detailed skin
  // (outer wall on the true arc 2 mm in; inner wall pushed so every chord stays at or outside the true inner arc + 2 mm)
  const psi = (LOD_INSET / CURVE_R) * deg;
  const lodStations = [];
  for (let k = 0; k <= LOD_SEGS; k++) lodStations.push(arc(psi + ((90 - 2 * psi) * k) / LOD_SEGS));
  const halfSeg = (90 - 2 * psi) / LOD_SEGS / 2 / deg;
  const uOut = -(RAIL_HW - LOD_INSET);
  const uIn = CURVE_R - (CURVE_R - RAIL_HW + LOD_INSET) / Math.cos(halfSeg);
  const lod = newGeo(true);
  addSweep(lod, lodStations, rectOutline(uOut, uIn, LOD_INSET, RAIL_H - LOD_INSET), RECT_TRIS, [1, 0, 1, 0]);
  railPart(root, 'lod1', finishGeo(lod), [alu, accent]);

  railLocator(root, 'endA', 0, 0, 0);
  railLocator(root, 'endB', CURVE_R, 0, ARC_CZ);
  return applyFoundryStandardLod(root);
}
