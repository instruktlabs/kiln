// Foundry Floor S1: head half. Building frame per structures-contract.md:
// +X from the head toward the cross pass, +Y up (grade Y = 0), +Z toward the split.
// Origin on the hall centreline at the seam plane X = 0; the seam face is left open.
// Variant constants: every export changes only these two lines.
const hand = 'W'; // 'W' as built; 'E' mirrors the construction by negating every Z (no negative scales)
const far = false; // true builds the far shell: glazing plate, plain walls and the two roofs only

const meta = { name: 's1-head-' + hand + (far ? '-far' : ''), role: 'building' };

const S = hand === 'E' ? -1 : 1;

// ---- Contract dimensions (hand W, metres) ----
const X_FRONT = -945;       // front glazing plane
const X_BAR = -480;         // bar / taper boundary
const Z_TIP = -532;         // tip face
const Z_SPLIT = 190;        // split face
const Z_SEAM_OUT = -190;    // outer face at the seam
const WALL = 0.6;           // exterior wall thickness
const SLAB_IN = 0.3;        // slabs end this far inside exterior faces
const DECK_T = 0.6;         // roof deck thickness
const PLINTH_H = 3, PLINTH_P = 0.2;
const PARAPET_H = 1.2, PARAPET_W = 0.6;
const BANDS = [[8, 14], [30, 36]];   // glazing bands at the two cleanroom levels
const RECESS = 0.3;
const REVEALS = [22, 44], REVEAL_HALF = 0.3, REVEAL_P = 0.3;
const FIN_W = 0.4, FIN_D = 0.6, FIN_Z0 = -526, FIN_STEP = 12, FIN_COUNT = 60;
const ENT_Z0 = 150, ENT_Z1 = 190, ENT_H = 12;
const PORTAL_X0 = -945.6, PORTAL_X1 = -943.6, PORTAL_T = 1.2, PORTAL_TZ = 0.2;
const ATR_X1 = -800, ATR_Z0 = 40;    // atrium void X -945..-800, Z 40..190
const ATR_PARAPET_T = 0.3;
const GLASS_T = 0.05;       // glazing that is seen from inside gets a back face this far in
const N_T = far ? 12 : 24;  // stations along the taper = roof columns over the taper
const K_R = far ? 12 : 24;  // roof rows across Z

// [part, bottom Y, top Y, material, omit top, omit bottom]; waffle + clean floor stack without hidden faces
const SLABS = [
  ['floorSlab', 0.0, 0.5, 'conc', false, true],
  ['waffleSlabL1', 6.5, 7.4, 'conc', true, false],
  ['cleanFloorL1', 7.4, 8.0, 'tile', false, true],
  ['ffuCeilingL1', 14.0, 14.4, 'ffu', false, false],
  ['slabL2', 21.4, 22.5, 'conc', false, false],
  ['waffleSlabL2', 28.5, 29.4, 'conc', true, false],
  ['cleanFloorL2', 29.4, 30.0, 'tile', false, true],
  ['ffuCeilingL2', 36.0, 36.4, 'ffu', false, false],
  ['topSlab', 43.4, 44.0, 'conc', false, false],
];
const ATR_PARAPET_BASES = [8.0, 14.4, 22.5, 30.0, 36.4, 44.0];
const ATRIUM_FLOOR_LOC = [-870, 0.6, 115];

// ---- Roof formulas (contract) ----
function barHeight(z) { return 46 + 24 * (z + 532) / 722; }
function deckTop(x, z) {
  const b = barHeight(z);
  return x <= X_BAR ? b : 46 + (b - 46) * (-x / 480);
}
const H = p => deckTop(p[0], p[1]);   // p = [x, z]
const c = y => () => y;

// ---- Plan edges as functions of the offset o (o > 0 outward from the exterior face) ----
const MBK = 342 / (Math.hypot(480, 342) + 480);            // mitre factor at the tip/taper corner
function mB(o) { return [X_BAR + MBK * o, Z_TIP - o]; }       // tip/taper corner
function mC(o) { return [X_FRONT - o, Z_TIP - o]; }           // front/tip corner
function mD(o) { return [X_FRONT - o, Z_SPLIT + o]; }         // front/split corner
function seamOut(o) { return [0, Z_SEAM_OUT - o]; }          // taper layers meet the hall section at X = 0
function taperPt(o, u) {                                      // u = 0 at the seam, 1 at the tip corner
  const a = seamOut(o), b = mB(o);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}
const US = [];
for (let i = 0; i <= N_T; i++) US.push(i / N_T);
const XS = US.map(u => -480 * u).reverse();                   // split-face stations, -480 .. 0
function taperLine(o) { return US.map(u => taperPt(o, u)); }
function tipLine(o) { return [mB(o), [X_FRONT, Z_TIP - o]]; }

// ---- Mesh construction in hand-W coordinates; hand E negates Z and reverses winding ----
function makePart(name, mats) {
  const pos = [];
  const idx = mats.map(() => []);
  const api = {};
  const push = (slot, a, b, cc) => {
    if (S > 0) idx[slot].push(a, b, cc); else idx[slot].push(a, cc, b);
  };
  // Convex polygon of [x, y, z] points; n is the intended outward normal.
  api.poly = (slot, pts, n) => {
    let q = [];
    for (const p of pts) {
      const l = q[q.length - 1];
      if (!l || Math.hypot(p[0] - l[0], p[1] - l[1], p[2] - l[2]) > 1e-6) q.push(p);
    }
    if (q.length > 2) {
      const f = q[0], l = q[q.length - 1];
      if (Math.hypot(f[0] - l[0], f[1] - l[1], f[2] - l[2]) <= 1e-6) q.pop();
    }
    if (q.length < 3) return;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    if (nx * n[0] + ny * n[1] + nz * n[2] < 0) q = [q[0]].concat(q.slice(1).reverse());
    const base = pos.length / 3;
    for (const p of q) pos.push(p[0], p[1], S * p[2]);
    for (let i = 1; i + 1 < q.length; i++) {
      const a = q[0], b = q[i], d = q[i + 1];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      if (area > 1e-9) push(slot, base, base + i, base + i + 1);
    }
  };
  // Vertical faces along plan points [x, z]; side +1 faces left of travel (outward on the exterior path).
  api.strip = (slot, pts, yb, yt, side) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      const tx = q[0] - p[0], tz = q[1] - p[1];
      if (Math.hypot(tx, tz) < 1e-6) continue;
      api.poly(slot, [[p[0], yb(p), p[1]], [q[0], yb(q), q[1]], [q[0], yt(q), q[1]], [p[0], yt(p), p[1]]],
        [-tz * side, 0, tx * side]);
    }
  };
  // Horizontal ribbon between two matched plan polylines at height y(p).
  api.band = (slot, A, B, y, up) => {
    for (let i = 0; i + 1 < A.length; i++) {
      const a = A[i], b = A[i + 1], cc = B[i + 1], d = B[i];
      api.poly(slot, [[a[0], y(a), a[1]], [b[0], y(b), b[1]], [cc[0], y(cc), cc[1]], [d[0], y(d), d[1]]],
        [0, up ? 1 : -1, 0]);
    }
  };
  // Shared-vertex surface over columns of plan points (smooth normals), heights from h(p).
  api.grid = (slot, cols, h, up) => {
    const R = cols[0].length;
    const base = pos.length / 3;
    const W = [];
    for (const col of cols) for (const p of col) { const y = h(p); W.push([p[0], y, p[1]]); pos.push(p[0], y, S * p[1]); }
    for (let ci = 0; ci + 1 < cols.length; ci++) {
      for (let r = 0; r + 1 < R; r++) {
        const a = ci * R + r, b = ci * R + r + 1, cc = (ci + 1) * R + r + 1, d = (ci + 1) * R + r;
        for (const t of [[a, b, cc], [a, cc, d]]) {
          const p0 = W[t[0]], p1 = W[t[1]], p2 = W[t[2]];
          const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
          const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
          const cy = uz * vx - ux * vz;
          if (Math.abs(cy) < 1e-9) continue;
          if ((cy > 0) === up) push(slot, base + t[0], base + t[1], base + t[2]);
          else push(slot, base + t[0], base + t[2], base + t[1]);
        }
      }
    }
  };
  // origin (hand-W [x, y, z]) places the node there with geometry relative to it.
  api.emit = (parent, origin) => {
    const all = [], used = [], groups = [];
    idx.forEach((I, s) => {
      if (!I.length) return;
      groups.push([all.length, I.length, used.length]);
      for (const v of I) all.push(v);
      used.push(mats[s]);
    });
    if (!all.length) return null;
    const geo = meshGeo({ positions: pos, indices: all });
    let mesh;
    if (used.length === 1) mesh = new THREE.Mesh(geo, used[0]);
    else {
      for (const g of groups) geo.addGroup(g[0], g[1], g[2]);
      mesh = new THREE.Mesh(geo, used);
    }
    mesh.name = name;
    if (origin) {
      geo.translate(-origin[0], -origin[1], -S * origin[2]);
      mesh.position.set(origin[0], origin[1], S * origin[2]);
    }
    parent.add(mesh);
    return mesh;
  };
  return api;
}

function mat(name, hex, roughness, metalness) {
  const m = gameMaterial(hex, { roughness, metalness });
  m.name = name;
  return m;
}

// Exterior face of a clad wall between plinth and deck, with the two recessed glazing bands.
function cladFace(part, ext, rec, top) {
  part.strip(0, ext, c(PLINTH_H), c(BANDS[0][0]), 1);
  part.strip(0, ext, c(BANDS[0][1]), c(BANDS[1][0]), 1);
  part.strip(0, ext, c(BANDS[1][1]), top, 1);
  for (const [y0, y1] of BANDS) {
    part.strip(1, rec, c(y0), c(y1), 1);
    part.band(0, rec, ext, c(y0), true);
    part.band(0, rec, ext, c(y1), false);
  }
}

// Roof columns from the front (X = -945) to the seam; every column carries the same rows.
function roofCols() {
  const colRows = (ext, inn, xs) => {
    const a = far ? ext : inn;
    const b = far ? [xs, Z_SPLIT] : [xs, Z_SPLIT - WALL];
    const rows = far ? [ext] : [ext, inn];
    for (let k = 1; k < K_R; k++) rows.push([a[0] + (b[0] - a[0]) * k / K_R, a[1] + (b[1] - a[1]) * k / K_R]);
    rows.push(b);
    if (!far) rows.push([xs, Z_SPLIT]);
    return rows;
  };
  const cols = [colRows([X_FRONT, Z_TIP], [X_FRONT, Z_TIP + WALL], X_FRONT)];
  for (let i = US.length - 1; i >= 0; i--) {
    const u = US[i];
    cols.push(colRows(taperPt(0, u), taperPt(-WALL, u), -480 * u));
  }
  return cols;
}

function build() {
  const root = createRoot('s1HeadHalf');
  const M = {
    clad: mat('cladding-warm-grey', 0xC9C4BA, 0.85, 0.0),
    dark: mat('cladding-dark', 0x6E6A63, 0.80, 0.0),
    roof: mat('roof-membrane', 0xB8B5AE, 0.90, 0.0),
    glass: mat('glazing-dark', 0x1E2A33, 0.15, 0.0),
    trim: mat('trim-graphite', 0x3B4148, 0.50, 0.1),
    conc: mat('concrete', 0x9C9A94, 0.95, 0.0),
    tile: mat('floor-tile-grey', 0xD3D7DA, 0.70, 0.0),
    ffu: mat('ffu-filter-white', 0xF1F3F4, 0.90, 0.0),
  };

  // ---- Roofs: bar deck rises across Z; taper deck warps to 46 at the seam ----
  const cols = roofCols();
  const roofBar = makePart('roofBar', [M.roof]);
  roofBar.grid(0, cols.slice(0, 2), H, true);
  if (!far) roofBar.grid(0, cols.slice(0, 2), p => H(p) - DECK_T, false);
  roofBar.emit(root);
  const roofTaper = makePart('roofTaper', [M.roof]);
  roofTaper.grid(0, cols.slice(1), H, true);
  if (!far) roofTaper.grid(0, cols.slice(1), p => H(p) - DECK_T, false);
  roofTaper.emit(root);

  // ---- Front glazing (X = -945) ----
  const fg = makePart('frontGlazing', [M.glass]);
  if (far) {
    fg.poly(0, [[X_FRONT, 0, Z_TIP], [X_FRONT, 0, Z_SPLIT], [X_FRONT, barHeight(Z_SPLIT), Z_SPLIT],
      [X_FRONT, barHeight(Z_TIP), Z_TIP]], [-1, 0, 0]);
  } else {
    for (const [x, nx] of [[X_FRONT, -1], [X_FRONT + GLASS_T, 1]]) {
      fg.poly(0, [[x, PLINTH_H, Z_TIP], [x, PLINTH_H, ENT_Z0], [x, ENT_H, ENT_Z0], [x, ENT_H, Z_TIP]], [nx, 0, 0]);
      fg.poly(0, [[x, ENT_H, Z_TIP], [x, ENT_H, ENT_Z0], [x, barHeight(ENT_Z0), ENT_Z0],
        [x, barHeight(Z_TIP), Z_TIP]], [nx, 0, 0]);
      fg.poly(0, [[x, ENT_H, ENT_Z0], [x, ENT_H, ENT_Z1], [x, barHeight(ENT_Z1), ENT_Z1],
        [x, barHeight(ENT_Z0), ENT_Z0]], [nx, 0, 0]);
    }
  }
  fg.emit(root);

  // ---- Tip wall (Z = -532) and taper wall ((-480, -532) to (0, -190)) ----
  const tipWall = makePart('tipWall', [M.clad, M.glass]);
  const taperWall = makePart('taperWall', [M.clad, M.glass]);
  if (far) {
    tipWall.strip(0, tipLine(0), c(0), H, 1);
    taperWall.strip(0, taperLine(0), c(0), H, 1);
  } else {
    cladFace(tipWall, tipLine(0), tipLine(-RECESS), H);
    tipWall.strip(0, [mB(-WALL), [X_FRONT + GLASS_T, Z_TIP + WALL]], c(0), p => H(p) - DECK_T, -1);
    cladFace(taperWall, taperLine(0), taperLine(-RECESS), H);
    taperWall.strip(0, taperLine(-WALL), c(0), p => H(p) - DECK_T, -1);
  }
  tipWall.emit(root);
  taperWall.emit(root);

  // ---- Split wall (Z = +190) ----
  const sw = makePart('splitWall', [M.clad, M.glass]);
  const zo = Z_SPLIT, zi = Z_SPLIT - WALL, zr = Z_SPLIT - RECESS, zg = Z_SPLIT - GLASS_T;
  const rect = (slot, x0, x1, y0, y1, z, nz) => sw.poly(slot, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, nz]);
  if (far) {
    rect(1, X_FRONT, X_BAR, PLINTH_H, 30, zo, 1);
    rect(0, X_FRONT, X_BAR, 0, PLINTH_H, zo, 1);
    rect(0, X_FRONT, X_BAR, 30, H([X_BAR, zo]), zo, 1);
    sw.strip(0, XS.map(x => [x, zo]), c(0), H, 1);
  } else {
    // atrium face: glazing Y 3..30 in front of X = -480, clear of the portal's +Z jamb
    for (const [z, nz] of [[zo, 1], [zg, -1]]) {
      rect(1, X_FRONT, PORTAL_X1, ENT_H, 30, z, nz);
      rect(1, PORTAL_X1, X_BAR, ENT_H, 30, z, nz);
      rect(1, PORTAL_X1, X_BAR, PLINTH_H, ENT_H, z, nz);
    }
    rect(0, X_FRONT, X_BAR, 30, 36, zo, 1);
    rect(0, X_FRONT, X_BAR, 36, H([X_BAR, zo]), zo, 1);
    rect(0, X_FRONT + GLASS_T, X_BAR, 30, H([X_BAR, zi]) - DECK_T, zi, -1);
    // soffit over the atrium glazing; behind the void the cleanFloorL2 top closes the inner 0.3 m
    sw.poly(0, [[X_FRONT, 30, zi], [ATR_X1, 30, zi], [ATR_X1, 30, Z_SPLIT - SLAB_IN], [ATR_X1, 30, zo], [X_FRONT, 30, zo]], [0, -1, 0]);
    sw.poly(0, [[ATR_X1, 30, Z_SPLIT - SLAB_IN], [X_BAR, 30, Z_SPLIT - SLAB_IN], [X_BAR, 30, zo], [ATR_X1, 30, zo]], [0, -1, 0]);
    // clad wall behind X = -480 with the two recessed glazing bands (0.3 m jamb at the start)
    const XR = [X_BAR, X_BAR + RECESS].concat(XS.slice(1));
    const ext = XR.map(x => [x, zo]);
    const extR = XR.slice(1).map(x => [x, zo]);
    const rec = XR.slice(1).map(x => [x, zr]);
    sw.strip(0, ext, c(PLINTH_H), c(BANDS[0][0]), 1);
    sw.strip(0, ext, c(BANDS[0][1]), c(BANDS[1][0]), 1);
    sw.strip(0, ext, c(BANDS[1][1]), H, 1);
    for (const [y0, y1] of BANDS) {
      rect(0, X_BAR, X_BAR + RECESS, y0, y1, zo, 1);
      sw.poly(0, [[X_BAR + RECESS, y0, zr], [X_BAR + RECESS, y0, zo], [X_BAR + RECESS, y1, zo],
        [X_BAR + RECESS, y1, zr]], [1, 0, 0]);
      sw.strip(1, rec, c(y0), c(y1), 1);
      sw.band(0, rec, extR, c(y0), true);
      sw.band(0, rec, extR, c(y1), false);
    }
    sw.strip(0, XS.map(x => [x, zi]), c(0), p => H(p) - DECK_T, -1);
    sw.poly(0, [[X_BAR, 0, zi], [X_BAR, 0, zo], [X_BAR, 30, zo], [X_BAR, 30, zi]], [-1, 0, 0]);
  }
  sw.emit(root);

  if (!far) {
    // ---- Front fins every 12 m ----
    const fins = makePart('frontFins', [M.trim]);
    for (let k = 0; k < FIN_COUNT; k++) {
      const z = FIN_Z0 + FIN_STEP * k, z0 = z - FIN_W / 2, z1 = z + FIN_W / 2;
      const y0 = z0 >= ENT_Z0 && z1 <= ENT_Z1 ? ENT_H + PORTAL_T : 0;
      const x0 = X_FRONT - FIN_D, x1 = X_FRONT;
      const t0 = barHeight(z0), t1 = barHeight(z1);
      fins.poly(0, [[x0, y0, z0], [x0, y0, z1], [x0, t1, z1], [x0, t0, z0]], [-1, 0, 0]);
      fins.poly(0, [[x0, y0, z0], [x1, y0, z0], [x1, t0, z0], [x0, t0, z0]], [0, 0, -1]);
      fins.poly(0, [[x0, y0, z1], [x1, y0, z1], [x1, t1, z1], [x0, t1, z1]], [0, 0, 1]);
      fins.poly(0, [[x0, t0, z0], [x1, t0, z0], [x1, t1, z1], [x0, t1, z1]], [0, 1, 0]);
    }
    fins.emit(root);

    // ---- Plinth, 0.2 proud, around every exterior face ----
    const plinth = makePart('plinth', [M.dark]);
    const zStart = ENT_Z0 - PORTAL_T / 2;   // front run ends inside the portal jamb
    const runs = [
      [[[0, Z_SEAM_OUT], [X_BAR, Z_TIP], [X_FRONT, Z_TIP], [X_FRONT, zStart]],
        [seamOut(PLINTH_P), mB(PLINTH_P), mC(PLINTH_P), [X_FRONT - PLINTH_P, zStart]]],
      [[[PORTAL_X1, Z_SPLIT], [0, Z_SPLIT]], [[PORTAL_X1, Z_SPLIT + PLINTH_P], [0, Z_SPLIT + PLINTH_P]]],
    ];
    for (const [a, b] of runs) {
      plinth.strip(0, b, c(0), c(PLINTH_H), 1);
      plinth.strip(0, a, c(0), c(PLINTH_H), -1);
      plinth.band(0, a, b, c(PLINTH_H), true);
    }
    plinth.emit(root);

    // ---- Level reveals at Y 22 and 44 on the clad faces ----
    const reveals = makePart('levelReveals', [M.trim]);
    for (const y of REVEALS) {
      const yb = c(y - REVEAL_HALF), yt = c(y + REVEAL_HALF);
      const xSplit = y < 30 ? X_BAR : X_FRONT;
      const rr = [
        [[[0, Z_SEAM_OUT], [X_BAR, Z_TIP], [X_FRONT, Z_TIP]],
          [seamOut(REVEAL_P), mB(REVEAL_P), [X_FRONT, Z_TIP - REVEAL_P]], 'end'],
        [[[xSplit, Z_SPLIT], [0, Z_SPLIT]], [[xSplit, Z_SPLIT + REVEAL_P], [0, Z_SPLIT + REVEAL_P]], 'start'],
      ];
      for (const [a, b, capAt] of rr) {
        reveals.strip(0, b, yb, yt, 1);
        reveals.band(0, a, b, yt, true);
        reveals.band(0, a, b, yb, false);
        const pa = capAt === 'end' ? a[a.length - 1] : a[0], pb = capAt === 'end' ? b[b.length - 1] : b[0];
        reveals.poly(0, [[pa[0], yb(), pa[1]], [pb[0], yb(), pb[1]], [pb[0], yt(), pb[1]], [pa[0], yt(), pa[1]]], [-1, 0, 0]);
      }
    }
    reveals.emit(root);

    // ---- Roof edge parapet along every roof edge except the seam ----
    const edge = makePart('roofEdge', [M.trim]);
    const outer = [], inner = [];
    for (const u of US) { outer.push(taperPt(0, u)); inner.push(taperPt(-PARAPET_W, u)); }
    outer.push([X_FRONT, Z_TIP]); inner.push(mC(-PARAPET_W));
    outer.push([X_FRONT, Z_SPLIT]); inner.push(mD(-PARAPET_W));
    for (const x of XS) { outer.push([x, Z_SPLIT]); inner.push([x, Z_SPLIT - PARAPET_W]); }
    const pTop = p => H(p) + PARAPET_H;
    edge.strip(0, outer, H, pTop, 1);
    edge.strip(0, inner, H, pTop, -1);
    edge.band(0, inner, outer, pTop, true);
    edge.emit(root);

    // ---- Entrance portal: a U frame 2 m deep, clear opening Z 150..190, Y 0..12 ----
    const portal = makePart('entrancePortal', [M.trim]);
    const zA = ENT_Z0 - PORTAL_T, zB = ENT_Z0, zC = ENT_Z1, zD = ENT_Z1 + PORTAL_TZ;
    const yH = ENT_H, yT = ENT_H + PORTAL_T, px0 = PORTAL_X0, px1 = PORTAL_X1;
    for (const [x, nx] of [[px0, -1], [px1, 1]]) {
      portal.poly(0, [[x, 0, zA], [x, 0, zB], [x, yH, zB], [x, yT, zA]], [nx, 0, 0]);
      portal.poly(0, [[x, yH, zB], [x, yH, zC], [x, yT, zD], [x, yT, zA]], [nx, 0, 0]);
      portal.poly(0, [[x, 0, zC], [x, 0, zD], [x, yT, zD], [x, yH, zC]], [nx, 0, 0]);
    }
    portal.poly(0, [[px0, 0, zA], [px1, 0, zA], [px1, yT, zA], [px0, yT, zA]], [0, 0, -1]);
    portal.poly(0, [[px0, yT, zA], [px1, yT, zA], [px1, yT, zD], [px0, yT, zD]], [0, 1, 0]);
    portal.poly(0, [[px0, 0, zD], [px1, 0, zD], [px1, yT, zD], [px0, yT, zD]], [0, 0, 1]);
    portal.poly(0, [[px0, 0, zB], [px1, 0, zB], [px1, yH, zB], [px0, yH, zB]], [0, 0, 1]);
    portal.poly(0, [[px0, yH, zB], [px1, yH, zB], [px1, yH, zC], [px0, yH, zC]], [0, -1, 0]);
    portal.poly(0, [[px0, 0, zC], [px1, 0, zC], [px1, yH, zC], [px0, yH, zC]], [0, 0, -1]);
    portal.emit(root);

    // ---- Slab stack over the head plan, atrium void cut out ----
    const xf = X_FRONT + SLAB_IN, zt = Z_TIP + SLAB_IN, zs = Z_SPLIT - SLAB_IN;
    const t0 = mB(-SLAB_IN), t1 = seamOut(-SLAB_IN);
    const pieceA = [[xf, zt], [ATR_X1, zt], [ATR_X1, ATR_Z0], [xf, ATR_Z0]];
    const pieceB = [t1, [0, zs], [ATR_X1, zs], [ATR_X1, ATR_Z0], [ATR_X1, zt], t0];
    for (const [name, y0, y1, key, noTop, noBottom] of SLABS) {
      const sp = makePart(name, [M[key]]);
      for (const piece of [pieceA, pieceB]) {
        if (!noTop) sp.poly(0, piece.map(p => [p[0], y1, p[1]]), [0, 1, 0]);
        if (!noBottom) sp.poly(0, piece.map(p => [p[0], y0, p[1]]), [0, -1, 0]);
      }
      // exterior edges stay open: they sit inside the clad walls or 0.3 m behind opaque glazing
      sp.strip(0, [[ATR_X1, zs], [ATR_X1, ATR_Z0], [xf, ATR_Z0]], c(y0), c(y1), -1);
      if (name === 'floorSlab') {
        // riser under the atrium floor edge in the entrance opening
        sp.poly(0, [[X_FRONT, 0, ENT_Z0], [X_FRONT, 0, ENT_Z1], [X_FRONT, y1, ENT_Z1], [X_FRONT, y1, ENT_Z0]], [-1, 0, 0]);
      }
      sp.emit(root);
    }

    // ---- Atrium floor plate over the void footprint ----
    const af = makePart('atriumFloor', [M.tile]);
    const ya = 0.5, yb = 0.6;
    af.poly(0, [[X_FRONT, yb, ATR_Z0], [ATR_X1, yb, ATR_Z0], [ATR_X1, yb, Z_SPLIT], [X_FRONT, yb, Z_SPLIT]], [0, 1, 0]);
    af.poly(0, [[X_FRONT, ya, ATR_Z0], [ATR_X1, ya, ATR_Z0], [ATR_X1, ya, Z_SPLIT], [X_FRONT, ya, Z_SPLIT]], [0, -1, 0]);
    af.poly(0, [[ATR_X1, ya, ATR_Z0], [ATR_X1, ya, Z_SPLIT], [ATR_X1, yb, Z_SPLIT], [ATR_X1, yb, ATR_Z0]], [1, 0, 0]);
    af.poly(0, [[X_FRONT, ya, ATR_Z0], [ATR_X1, ya, ATR_Z0], [ATR_X1, yb, ATR_Z0], [X_FRONT, yb, ATR_Z0]], [0, 0, -1]);
    af.poly(0, [[X_FRONT, ya, ENT_Z0], [X_FRONT, ya, ENT_Z1], [X_FRONT, yb, ENT_Z1], [X_FRONT, yb, ENT_Z0]], [-1, 0, 0]);
    // the part doubles as the atriumFloor locator: its node sits at (-870, 0.6, 115)
    af.emit(root, ATRIUM_FLOOR_LOC);

    // ---- Atrium parapets on every slab edge the void cuts ----
    const ap = makePart('atriumParapets', [M.trim]);
    // parapets run to the back faces of the glazing; their open ends abut the glass
    const gx = X_FRONT + GLASS_T, gz = Z_SPLIT - GLASS_T;
    const vo = [[gx, ATR_Z0], [ATR_X1, ATR_Z0], [ATR_X1, gz]];
    const vi = [[gx, ATR_Z0 - ATR_PARAPET_T], [ATR_X1 + ATR_PARAPET_T, ATR_Z0 - ATR_PARAPET_T], [ATR_X1 + ATR_PARAPET_T, gz]];
    for (const y of ATR_PARAPET_BASES) {
      const y1 = y + PARAPET_H;
      ap.strip(0, vo, c(y), c(y1), 1);
      ap.strip(0, vi, c(y), c(y1), -1);
      ap.band(0, vo, vi, c(y1), true);
    }
    ap.emit(root);
  }

  // ---- Locators ----
  const loc = (name, x, y, z) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, S * z);
    root.add(o);
  };
  loc('seam', 0, 0, 0);
  loc('entrance', -945, 0, 170);
  if (far) loc('atriumFloor', ATRIUM_FLOOR_LOC[0], ATRIUM_FLOOR_LOC[1], ATRIUM_FLOOR_LOC[2]);
  loc('barL1', -712, 8.0, -171);
  loc('barL2', -712, 30.0, -171);
  return root;
}
