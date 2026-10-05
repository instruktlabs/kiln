const meta = { name: 'OHT rail switch' };

// ---- asset constants (metres; +X forward, +Y up, +Z right; datum = track underside at Y = 0) ----
const MAIN_LEN = 1.8;                                   // main line (0,0,0) -> (1.8,0,0)
const BRANCH_R = 1.8;                                   // both branches: quarter circles of radius 1.8
const DIV_CX = 0, DIV_CZ = 1.8;                         // diverge arc centre: (0,0) heading +X -> (1.8,1.8) heading +Z
const MER_CX = 1.8, MER_CZ = 1.8;                       // merge arc centre: (0,1.8) heading -Z -> (1.8,0) heading +X
const BRANCH_SEGS = 12;                                 // sweep segments per branch body: 13 stations like the curve piece (45 degrees is a vertex, centreline chord sag 3.8 mm)
const THROAT_LAST = 5;                                  // the six stations nearest the main line (to 37.6 degrees) carry the throat inset: a branch leaves the main footprint at 32 degrees and the crossing of the two branches ends near 38 degrees
const THROAT_INSET = { diverge: 0.001, merge: 0.002 };  // metres pulled into the material; the branches cross each other at x = 0.9, so the two values differ
const LOD_SEGS = 4;                                     // chord segments per lod1 branch
const HANGER_X = [0.3, 0.9, 1.5];                       // three rods on the main line; the middle one rises from the control box
const HANGER_TOP = 1.10;                                // upper face of the ceiling plates (world 6.0 with the rail at 4.9)
const ROD_R = 0.008;
const ROD_SEG = 12;
const CLAMP = { hx: 0.04, hz: 0.05, top: 0.23 };
const CEIL_PLATE = { hx: 0.08, hz: 0.08, t: 0.01 };
const POWER = { u0: 0.149, u1: 0.154, v0: 0.09, v1: 0.15 };   // same bar as the straight rail: +Z side of the main line
const BOX = { x: 0.9, hx: 0.075, hz: 0.065, top: 0.30 };      // control box on the rail top at the midpoint
const BAND = { v0: 0.24, v1: 0.26, out: 0.0015 };             // accent band around the control box
const GATE = { pivot: [0.15, 1.65], dir: [1, -1], heel: -0.015, len: 0.30, heelT: 0.008, toeT: 0.002, y0: 0.04, y1: 0.18 };  // y1 = cavity roof height
const GATE_DEG = 8;                                     // Toggle swing, towards the branch side (+Z)
const TOGGLE_S = 0.6;
const LOD_INSET = 0.002;
const PALETTE = {
  alu: ['aluminium-extrusion', 0xA8AEB4, 0.45, 1.0],
  graphite: ['trim-graphite', 0x3B4148, 0.5, 0.1],
  accent: ['accent-amhs', 0xE07B22, 0.5, 0.0],
  panel: ['tool-panel-grey', 0xC5CBD1, 0.6, 0.0],
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

// Closed prism through any number of stations; every wall and both caps use material index `mat` unless edgeMat is given.
function addSweepM(G, stations, outline, tris, edgeMat, capMat) {
  capOutline(G, stations[stations.length - 1], outline, tris, 1, capMat);
  capOutline(G, stations[0], outline, tris, -1, capMat);
  sweepWalls(G, stations, outline, edgeMat);
}

// The shared section with every face moved d metres into its own material (each face stays parallel to the shared section's face).
function insetProfile(d) {
  if (d === 0) return RAIL_PROFILE;
  const n = RAIL_PROFILE.length;
  const out = RAIL_PROFILE.map((a, k) => {
    const b = RAIL_PROFILE[(k + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  });
  return RAIL_PROFILE.map((p, k) => {
    const n1 = out[(k + n - 1) % n], n2 = out[k], s = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    return [p[0] - (d * (n1[0] + n2[0])) / s, p[1] - (d * (n1[1] + n2[1])) / s];
  });
}

// Like sweepWalls, but every station has its own outline (same topology), so the section can change along the sweep.
function sweepWallsVar(G, stations, outlines, edgeMat) {
  const n = outlines[0].length, base = [];
  stations.forEach((st, s) => {
    base.push(G.p.length / 3);
    for (let k = 0; k < n; k++) {
      const a = outlines[s][k], b = outlines[s][(k + 1) % n];
      const du = b[0] - a[0], dv = b[1] - a[1], len = Math.hypot(du, dv);
      const nu = -dv / len, nv = du / len;
      for (const q of [a, b]) {
        const w = stationPoint(st, q);
        pushV(G, w[0], w[1], w[2], nu * st.e[0], nv, nu * st.e[2]);
      }
    }
  });
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

// Convex solid from vertices and quad faces; each face is wound outward automatically.
function addConvex(G, verts, faces, mat) {
  const c = [0, 0, 0];
  for (const v of verts) { c[0] += v[0] / verts.length; c[1] += v[1] / verts.length; c[2] += v[2] / verts.length; }
  const start = G.i.length;
  for (const f of faces) {
    let [a, b, d, e] = f.map((k) => verts[k]);
    let n = [
      (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]),
      (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]),
      (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]),
    ];
    const fc = [(a[0] + b[0] + d[0] + e[0]) / 4 - c[0], (a[1] + b[1] + d[1] + e[1]) / 4 - c[1], (a[2] + b[2] + d[2] + e[2]) / 4 - c[2]];
    if (n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] < 0) { [b, e] = [e, b]; n = n.map((x) => -x); }
    const len = Math.hypot(n[0], n[1], n[2]);
    const base = G.p.length / 3;
    for (const v of [a, b, d, e]) pushV(G, v[0], v[1], v[2], n[0] / len, n[1] / len, n[2] / len);
    G.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  if (G.grouped) G.g.push([start, G.i.length - start, mat]);
}

// Guide blade in pivot-local coordinates: heel at the pivot, tapering towards the free end, top flush under the cavity roof.
function bladeGeo(dir) {
  const x0 = dir * GATE.heel, x1 = dir * (GATE.heel + GATE.len);
  const v = [
    [x0, GATE.y0, -GATE.heelT], [x1, GATE.y0, -GATE.toeT], [x1, GATE.y0, GATE.toeT], [x0, GATE.y0, GATE.heelT],
    [x0, GATE.y1, -GATE.heelT], [x1, GATE.y1, -GATE.toeT], [x1, GATE.y1, GATE.toeT], [x0, GATE.y1, GATE.heelT],
  ];
  const G = newGeo(false);
  addConvex(G, v, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], 0);
  return finishGeo(G);
}

function build() {
  const root = createRoot('oht-rail-switch');
  const alu = railMaterial(...PALETTE.alu);
  const graphite = railMaterial(...PALETTE.graphite);
  const accent = railMaterial(...PALETTE.accent);
  const panel = railMaterial(...PALETTE.panel);

  const deg = 180 / Math.PI;
  const delta = (PLATE_T / BRANCH_R) * deg;             // arc angle taken by one join plate at the centreline
  const divArc = (h) => arcStation(DIV_CX, DIV_CZ, BRANCH_R, h);
  const merArc = (h) => arcStation(MER_CX, MER_CZ, BRANCH_R, h);
  const arcStations = (arc, h0, h1, n) => { const s = []; for (let k = 0; k <= n; k++) s.push(arc(h0 + ((h1 - h0) * k) / n)); return s; };

  // mainTrack: straight section between the two end plates, with the dark power bar on the +Z wall
  const mainSt = [stationAt(PLATE_T, 0, 0), stationAt(MAIN_LEN - PLATE_T, 0, 0)];
  const main = newGeo(true);
  sweepWalls(main, mainSt, RAIL_PROFILE, RAIL_EDGE_MAT);
  addSweepM(main, mainSt, rectOutline(POWER.u0, POWER.u1, POWER.v0, POWER.v1), RECT_TRIS, [2, 2, 2, 2], 2);
  railPart(root, 'mainTrack', finishGeo(main), [alu, accent, graphite]);

  // branches: the shared section swept round each quarter circle. Each branch is a group holding its body and the plate at its far end,
  // so hiding a branch hides its plate. The stations nearest the main line (the throat) are inset into the material so no face is
  // coplanar with mainTrack; beyond them the section returns to the full profile, which meets the far-end plate exactly.
  const branch = (name, plateName, arc, h0, h1, plateH0, plateH1, inset, throatFirst) => {
    const group = new THREE.Object3D();
    group.name = name;
    root.add(group);
    const stations = arcStations(arc, h0, h1, BRANCH_SEGS);
    const outlines = stations.map((_, k) => insetProfile((throatFirst ? k : BRANCH_SEGS - k) <= THROAT_LAST ? inset : 0));
    const body = newGeo(true);
    sweepWallsVar(body, stations, outlines, RAIL_EDGE_MAT);
    railPart(group, name + 'Track', finishGeo(body), [alu, accent]);
    const plate = newGeo(false);
    addPlate(plate, arc(plateH0), arc(plateH1));
    railPart(group, plateName, finishGeo(plate), graphite);
  };
  branch('branchDiverge', 'branchEndPlate', divArc, delta, 90 - delta, 90 - delta, 90, THROAT_INSET.diverge, true);
  branch('branchMerge', 'branchStartPlate', merArc, -90 + delta, -delta, -90, -90 + delta, THROAT_INSET.merge, false);

  // gates: blades hinged on the main centreline; the node origin IS the pivot, so a Y rotation swings the blade about it
  GATE.pivot.forEach((px, k) => {
    const g = railPart(root, k === 0 ? 'gateDiverge' : 'gateMerge', bladeGeo(GATE.dir[k]), graphite);
    g.position.set(px, 0, 0);
  });

  // controlBox: grey housing on the rail top at the midpoint with an accent band
  const box = newGeo(true);
  const along = (x) => stationAt(x, 0, 0);
  addSweepM(box, [along(BOX.x - BOX.hx), along(BOX.x + BOX.hx)], rectOutline(-BOX.hz, BOX.hz, RAIL_H - 0.001, BOX.top), RECT_TRIS, [0, 0, 0, 0], 0);
  addSweepM(box, [along(BOX.x - BOX.hx - BAND.out), along(BOX.x + BOX.hx + BAND.out)], rectOutline(-BOX.hz - BAND.out, BOX.hz + BAND.out, BAND.v0, BAND.v1), RECT_TRIS, [1, 1, 1, 1], 1);
  railPart(root, 'controlBox', finishGeo(box), [panel, accent]);

  // hangers: clamp block, rod and ceiling plate at each x; the middle rod rises from the control box instead of a clamp
  const hang = newGeo(false);
  for (const x of HANGER_X) {
    const onBox = Math.abs(x - BOX.x) < 1e-6;
    if (!onBox) addPrism(hang, along(x - CLAMP.hx), along(x + CLAMP.hx), rectOutline(-CLAMP.hz, CLAMP.hz, RAIL_H - 0.001, CLAMP.top), RECT_TRIS);
    addRod(hang, x, 0, ROD_R, (onBox ? BOX.top : CLAMP.top) - 0.01, HANGER_TOP - CEIL_PLATE.t / 2, ROD_SEG);
    addPrism(hang, along(x - CEIL_PLATE.hx), along(x + CEIL_PLATE.hx), rectOutline(-CEIL_PLATE.hz, CEIL_PLATE.hz, HANGER_TOP - CEIL_PLATE.t, HANGER_TOP), RECT_TRIS);
  }
  railPart(root, 'hangers', finishGeo(hang), alu);

  // joinPlates: mainA and mainB only (they also close the branch ends that share them); the branchEnd / branchStart plates belong to their branch groups
  const plates = newGeo(false);
  addPlate(plates, stationAt(0, 0, 0), stationAt(PLATE_T, 0, 0));
  addPlate(plates, stationAt(MAIN_LEN - PLATE_T, 0, 0), stationAt(MAIN_LEN, 0, 0));
  railPart(root, 'joinPlates', finishGeo(plates), graphite);

  // lod1 (group): plain low-poly stand-ins, 2 mm inside the detailed skin; one child per branch so the scene can pick
  const lod1 = new THREE.Object3D();
  lod1.name = 'lod1';
  root.add(lod1);
  const lodBox = (name, stations, u0, u1) => {
    const G = newGeo(true);
    addSweepM(G, stations, rectOutline(u0, u1, LOD_INSET, RAIL_H - LOD_INSET), RECT_TRIS, [1, 0, 1, 0], 0);
    railPart(lod1, name, finishGeo(G), [alu, accent]);
  };
  lodBox('lod1Main', [stationAt(LOD_INSET, 0, 0), stationAt(MAIN_LEN - LOD_INSET, 0, 0)], -(RAIL_HW - LOD_INSET), RAIL_HW - LOD_INSET);
  const psi = (LOD_INSET / BRANCH_R) * deg;
  const halfSeg = (90 - 2 * psi) / LOD_SEGS / 2 / deg;
  const uIn = BRANCH_R - (BRANCH_R - RAIL_HW + LOD_INSET) / Math.cos(halfSeg);
  lodBox('lod1BranchDiverge', arcStations(divArc, psi, 90 - psi, LOD_SEGS), -(RAIL_HW - LOD_INSET), uIn);
  lodBox('lod1BranchMerge', arcStations(merArc, -90 + psi, -psi, LOD_SEGS), -(RAIL_HW - LOD_INSET), uIn);

  railLocator(root, 'mainA', 0, 0, 0);
  railLocator(root, 'mainB', MAIN_LEN, 0, 0);
  railLocator(root, 'branchEnd', BRANCH_R, 0, BRANCH_R);
  railLocator(root, 'branchStart', 0, 0, BRANCH_R);
  return root;
}

function animate() {
  return [createClip('Toggle', TOGGLE_S, [
    rotationTrack('gateDiverge', [{ time: 0, rotation: [0, 0, 0] }, { time: TOGGLE_S, rotation: [0, -GATE_DEG, 0] }]),
    rotationTrack('gateMerge', [{ time: 0, rotation: [0, 0, 0] }, { time: TOGGLE_S, rotation: [0, GATE_DEG, 0] }]),
  ])];
}
