// Foundry Floor S1: head half. Building frame per structures-contract.md:
// +X from the head toward the cross pass, +Y up (grade Y = 0), +Z toward the split.
// Origin on the hall centreline at the seam plane X = 0; the seam face is left open.
// Variant constants: every export changes only these two lines.
const hand = 'E'; // 'W' as built; 'E' mirrors the construction by negating every Z (no negative scales)
const far = true; // true builds the far shell: glazing plate, plain walls and the two roofs only

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
const N_T = far ? 20 : 40;  // stations along the taper = roof columns; 12 m in X in the full build, on the panel seams; 24 m in the far shell
const K_R = far ? 24 : 36;  // roof rows across Z; with grid()'s diagonal choice both tiers stay within 20 mm of the deck formula
// Revisions 2 and 3: panel seams, lit edges, roof monitor and ribs
const SEAM_STEP = 12, SEAM_W = 0.1, SEAM_D = 0.05;  // panel seams every 12 m, counted from the seam plane
const SEAM_LIP = 0.05, SEAM_LIP_TOP = 0.3;           // seams stop short of recessed bands and of the parapet
const TIP_SEAM_X0 = -939;   // tip-wall seams every 12 m from 6 m inside the front corner, as the fins run from Z = -526
const BAND_STOP_X = -12;    // recessed bands stop 12 m before the seam plane; the last 12 m are flush cladding
const EDGE_LIT_H = 0.3, PLINTH_LIT_H = 0.1;
const MON_HALF = 30, MON_H = 6, MON_LIT = [1, 5];
const RIB_X = [-72, -144, -216, -288, -360, -432], RIB_HALF = 1, RIB_H = 1.5;
const EMBED = 0.3;          // monitor and ribs reach this far into the deck, so they meet it without a gap

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

// ---- Roof formulas (contract revision 2: the bar deck is a quadratic wing across Z) ----
function barHeight(z) { const t = (190 - z) / 722; return 70 - 24 * t * t; }
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
function tipAt(o, s) {                                        // s = 0 at the front corner, 1 at the tip/taper mitre
  const a = [X_FRONT, Z_TIP - o], b = mB(o);
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
}
function taperZ(o, x) { const a = seamOut(o), b = mB(o); return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }

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
        // split each quad along the diagonal whose midpoint lies closer to the surface h
        const miss = (i, j) => Math.abs(h([(W[i][0] + W[j][0]) / 2, (W[i][2] + W[j][2]) / 2]) - (W[i][1] + W[j][1]) / 2);
        const split = miss(a, cc) <= miss(b, d) ? [[a, b, cc], [a, cc, d]] : [[a, b, d], [b, cc, d]];
        for (const t of split) {
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

function mat(name, hex, roughness, metalness, emissiveIntensity) {
  const opts = { roughness, metalness };
  if (emissiveIntensity !== undefined) { opts.emissive = hex; opts.emissiveIntensity = emissiveIntensity; }
  const m = gameMaterial(hex, opts);
  m.name = name;
  // contract convention: the GLB exporter drops emissiveIntensity, so the intensity is baked into the emissive colour
  if (emissiveIntensity !== undefined) { m.emissive.multiplyScalar(m.emissiveIntensity); m.emissiveIntensity = 1; }
  return m;
}

// Clad exterior of one face, built in (s, y): s runs along the face and f.at(o, s) is the plan point at offset o
// (o > 0 outward). Rows list flush intervals (cladding) and recess intervals (glazing bands); grooves are the panel
// seams cut into the flush cladding. Returns the s values of the top edge, which the parapet shares.
function facade(wall, seams, f) {
  const P = (o, s, y) => { const p = f.at(o, s); return [p[0], y, p[1]]; };
  const rowY = (v, s) => (v === 'top' ? f.top(s) : v);
  const dir = (s) => {
    const a = f.at(0, s - 1e-4), b = f.at(0, s + 1e-4), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / L, 0, (b[1] - a[1]) / L];
  };
  const within = (g, list) => list.some(([a, b]) => g[0] >= a - 1e-9 && g[1] <= b + 1e-9);
  const grooves = f.grooves.slice().sort((p, q) => p[0] - q[0]);
  const topS = new Set();
  for (const row of f.rows) {
    for (const [a, b] of row.flush) {
      const pieces = [];
      let s = a;
      for (const g of grooves.filter(g => within(g, [[a, b]]))) { if (g[0] > s + 1e-9) pieces.push([s, g[0]]); s = g[1]; }
      if (b > s + 1e-9) pieces.push([s, b]);
      for (const [p, q] of pieces) {
        const seq = row.y1 === 'top' ? [p].concat(f.stations.filter(t => t > p + 1e-9 && t < q - 1e-9), [q]) : [p, q];
        for (let i = 0; i + 1 < seq.length; i++) {
          const s0 = seq[i], s1 = seq[i + 1];
          wall.poly(0, [P(0, s0, row.y0), P(0, s1, row.y0), P(0, s1, rowY(row.y1, s1)), P(0, s0, rowY(row.y1, s0))], f.n);
        }
        if (row.y1 === 'top') seq.forEach(t => topS.add(t));
      }
    }
    for (const [a, b] of row.recess || []) {
      const y0 = row.y0, y1 = row.y1;
      wall.poly(1, [P(-RECESS, a, y0), P(-RECESS, b, y0), P(-RECESS, b, y1), P(-RECESS, a, y1)], f.n);
      wall.poly(0, [P(-RECESS, a, y0), P(-RECESS, b, y0), P(0, b, y0), P(0, a, y0)], [0, 1, 0]);
      wall.poly(0, [P(-RECESS, a, y1), P(-RECESS, b, y1), P(0, b, y1), P(0, a, y1)], [0, -1, 0]);
      for (const [s, sg] of [[a, 1], [b, -1]]) {
        if (!f.jambs.some(j => Math.abs(j - s) < 1e-9)) continue;
        const t = dir(s);
        wall.poly(0, [P(-RECESS, s, y0), P(0, s, y0), P(0, s, y1), P(-RECESS, s, y1)], [t[0] * sg, 0, t[2] * sg]);
      }
    }
  }
  for (const g of grooves) {
    const on = f.rows.map(row => within(g, row.flush));
    for (let i = 0; i < f.rows.length; i++) {
      if (!on[i]) continue;
      let j = i;
      while (j + 1 < f.rows.length && on[j + 1]) j++;
      const r0 = f.rows[i], r1 = f.rows[j], ga = g[0], gb = g[1];
      const lo = r0.y0 + (r0.y0 <= PLINTH_H + 1e-9 ? PLINTH_LIT_H : SEAM_LIP);
      const top = s => rowY(r1.y1, s), hi = s => top(s) - (r1.y1 === 'top' ? SEAM_LIP_TOP : SEAM_LIP);
      const t = dir((ga + gb) / 2);
      seams.poly(0, [P(-SEAM_D, ga, lo), P(-SEAM_D, gb, lo), P(-SEAM_D, gb, hi(gb)), P(-SEAM_D, ga, hi(ga))], f.n);
      if (Math.abs(ga - f.open) > 1e-9) seams.poly(0, [P(-SEAM_D, ga, lo), P(0, ga, lo), P(0, ga, hi(ga)), P(-SEAM_D, ga, hi(ga))], t);
      if (Math.abs(gb - f.open) > 1e-9) seams.poly(0, [P(-SEAM_D, gb, lo), P(0, gb, lo), P(0, gb, hi(gb)), P(-SEAM_D, gb, hi(gb))], [-t[0], 0, -t[2]]);
      seams.poly(0, [P(-SEAM_D, ga, lo), P(-SEAM_D, gb, lo), P(0, gb, lo), P(0, ga, lo)], [0, 1, 0]);
      seams.poly(0, [P(-SEAM_D, ga, hi(ga)), P(-SEAM_D, gb, hi(gb)), P(0, gb, hi(gb)), P(0, ga, hi(ga))], [0, -1, 0]);
      wall.poly(0, [P(0, ga, r0.y0), P(0, gb, r0.y0), P(0, gb, lo), P(0, ga, lo)], f.n);            // flush lip below the seam
      wall.poly(0, [P(0, ga, hi(ga)), P(0, gb, hi(gb)), P(0, gb, top(gb)), P(0, ga, top(ga))], f.n);  // flush lip above it
      if (r1.y1 === 'top') { topS.add(ga); topS.add(gb); }
      i = j;
    }
  }
  return [...topS].sort((p, q) => p - q);
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
    clad: mat('cladding-steel', 0xC9CDD1, 0.30, 1.0),
    dark: mat('plinth-graphite', 0x1C2128, 0.60, 0.3),
    roof: mat('roof-steel', 0xBFC4C9, 0.40, 1.0),
    glass: mat('glazing-dark', 0x1E2A33, 0.15, 0.0),
    trim: mat('trim-graphite', 0x3B4148, 0.50, 0.1),
    conc: mat('concrete', 0x9C9A94, 0.95, 0.0),
    tile: mat('floor-tile-grey', 0xD3D7DA, 0.70, 0.0),
    ffu: mat('ffu-filter-white', 0xF1F3F4, 0.90, 0.0),
    lit: mat('rooflight-warm', 0xFFE7C2, 0.40, 0.0, 0.6),
    edgeLit: mat('edge-lit', 0xFFE7C2, 0.40, 0.0, 1.0),
  };

  // ---- Roofs: the bar deck is a quadratic wing across Z; the taper deck warps to 46 at the seam ----
  const cols = roofCols();
  const roofBar = makePart('roofBar', [M.roof]);
  roofBar.grid(0, cols.slice(0, 2), H, true);
  if (!far) roofBar.grid(0, cols.slice(0, 2), p => H(p) - DECK_T, false);
  roofBar.emit(root);
  const roofTaper = makePart('roofTaper', [M.roof]);
  roofTaper.grid(0, cols.slice(1), H, true);
  if (!far) roofTaper.grid(0, cols.slice(1), p => H(p) - DECK_T, false);
  roofTaper.emit(root);
  // front-edge stations: the bar deck's rows along X = -945, plus the entrance edge
  const frontZ = cols[0].map(p => p[1]).filter(z => z > Z_TIP + 1e-9 && z < Z_SPLIT - 1e-9).concat([ENT_Z0]).sort((a, b) => a - b);

  // ---- Front glazing (X = -945) ----
  const fg = makePart('frontGlazing', [M.glass]);
  // glazing panels between the front stations, so the top follows the curved deck edge
  const glassStrip = (x, z0, z1, yb, yt, nx) => {
    const zs = [z0].concat(frontZ.filter(z => z > z0 + 1e-9 && z < z1 - 1e-9), [z1]);
    for (let i = 0; i + 1 < zs.length; i++) {
      const a = zs[i], b = zs[i + 1];
      fg.poly(0, [[x, yb(a), a], [x, yb(b), b], [x, yt(b), b], [x, yt(a), a]], [nx, 0, 0]);
    }
  };
  if (far) {
    glassStrip(X_FRONT, Z_TIP, Z_SPLIT, c(0), barHeight, -1);
  } else {
    for (const [x, nx] of [[X_FRONT, -1], [X_FRONT + GLASS_T, 1]]) {
      glassStrip(x, Z_TIP, ENT_Z0, c(PLINTH_H), c(ENT_H), nx);
      glassStrip(x, Z_TIP, ENT_Z0, c(ENT_H), barHeight, nx);
      glassStrip(x, ENT_Z0, ENT_Z1, c(ENT_H), barHeight, nx);
    }
  }
  fg.emit(root);

  // ---- Tip wall (Z = -532) and taper wall ((-480, -532) to (0, -190)) ----
  const tipWall = makePart('tipWall', [M.clad, M.glass]);
  const taperWall = makePart('taperWall', [M.clad, M.glass]);
  const seams = makePart('panelSeams', [M.trim]);
  const LT = Math.hypot(480, 342);                     // taper face length
  const bandRows = (flushR, flushB, recessB) => [
    { y0: PLINTH_H, y1: BANDS[0][0], flush: flushR },
    { y0: BANDS[0][0], y1: BANDS[0][1], flush: flushB, recess: recessB },
    { y0: BANDS[0][1], y1: BANDS[1][0], flush: flushR },
    { y0: BANDS[1][0], y1: BANDS[1][1], flush: flushB, recess: recessB },
    { y0: BANDS[1][1], y1: 'top', flush: flushR },
  ];
  let tipTop = [0, 1], taperTop = US;
  if (far) {
    tipWall.strip(0, tipLine(0), c(0), H, 1);
    taperWall.strip(0, taperLine(0), c(0), H, 1);
  } else {
    // tip wall: bands run the whole face; seams every 12 m from 6 m inside the front corner
    const dS = SEAM_W / 2 / (X_BAR - X_FRONT), tipGrooves = [];
    for (let x = TIP_SEAM_X0; x < X_BAR; x += SEAM_STEP) {
      const s = (x - X_FRONT) / (X_BAR - X_FRONT);
      tipGrooves.push([s - dS, s + dS]);
    }
    tipTop = facade(tipWall, seams, { at: tipAt, top: s => H(tipAt(0, s)), stations: [], n: [0, 0, -1],
      rows: bandRows([[0, 1]], [], [[0, 1]]), grooves: tipGrooves, jambs: [], open: Infinity });
    tipWall.strip(0, [mB(-WALL), [X_FRONT + GLASS_T, Z_TIP + WALL]], c(0), p => H(p) - DECK_T, -1);
    // taper wall: seams at X = 0, -12, -24 ... counted from the seam; bands stop at X = -12, flush cladding after
    const dU = SEAM_W / 2 / LT, uStop = -BAND_STOP_X / 480 - dU, taperGrooves = [[0, dU]];
    for (let k = 1; k * SEAM_STEP < 480; k++) {
      const u = k * SEAM_STEP / 480;
      taperGrooves.push([u - dU, u + dU]);
    }
    taperTop = facade(taperWall, seams, { at: taperPt, top: u => H(taperPt(0, u)), stations: US, n: [342 / LT, 0, -480 / LT],
      rows: bandRows([[0, 1]], [[0, uStop]], [[uStop, 1]]), grooves: taperGrooves, jambs: [uStop], open: 0 });
    taperWall.strip(0, taperLine(-WALL), c(0), p => H(p) - DECK_T, -1);
  }
  tipWall.emit(root);
  taperWall.emit(root);

  // ---- Split wall (Z = +190) ----
  const sw = makePart('splitWall', [M.clad, M.glass]);
  let splitTop = XS;
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
    rect(0, X_FRONT + GLASS_T, X_BAR, 30, H([X_BAR, zi]) - DECK_T, zi, -1);
    // soffit over the atrium glazing; behind the void the cleanFloorL2 top closes the inner 0.3 m
    sw.poly(0, [[X_FRONT, 30, zi], [ATR_X1, 30, zi], [ATR_X1, 30, Z_SPLIT - SLAB_IN], [ATR_X1, 30, zo], [X_FRONT, 30, zo]], [0, -1, 0]);
    sw.poly(0, [[ATR_X1, 30, Z_SPLIT - SLAB_IN], [X_BAR, 30, Z_SPLIT - SLAB_IN], [X_BAR, 30, zo], [ATR_X1, 30, zo]], [0, -1, 0]);
    // clad face: cladding above the atrium glazing and, behind X = -480, the wall with the two recessed bands
    // (0.3 m jamb at the start, stopping at X = -12); seams at X = 0, -12, -24 ... on every clad part
    const xJ = X_BAR + RECESS, xStop = BAND_STOP_X + SEAM_W / 2, splitGrooves = [[-SEAM_W / 2, 0]];
    for (let k = 1; -k * SEAM_STEP > X_FRONT; k++) splitGrooves.push([-k * SEAM_STEP - SEAM_W / 2, -k * SEAM_STEP + SEAM_W / 2]);
    const rows = bandRows([[X_BAR, 0]], [[X_BAR, xJ], [xStop, 0]], [[xJ, xStop]]);
    rows[3].flush = [[X_FRONT, xJ], [xStop, 0]];
    rows[4].flush = [[X_FRONT, 0]];
    splitTop = facade(sw, seams, { at: (o, x) => [x, Z_SPLIT + o], top: x => H([x, Z_SPLIT]), stations: XS, n: [0, 0, 1],
      rows, grooves: splitGrooves, jambs: [xJ, xStop], open: 0 });
    sw.strip(0, XS.map(x => [x, zi]), c(0), p => H(p) - DECK_T, -1);
    sw.poly(0, [[X_BAR, 0, zi], [X_BAR, 0, zo], [X_BAR, 30, zo], [X_BAR, 30, zi]], [-1, 0, 0]);
  }
  sw.emit(root);
  seams.emit(root);

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

    // ---- Roof edge parapet along every roof edge except the seam, on the walls' top-edge stations;
    //      the top 0.3 m of its outer face is the lit wing outline (edgeLights) ----
    const edge = makePart('roofEdge', [M.trim]);
    const lights = makePart('edgeLights', [M.edgeLit]);
    const outer = [], inner = [];
    const tipInner = s => { const a = mC(-PARAPET_W), b = mB(-PARAPET_W); return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]; };
    for (const u of taperTop) { outer.push(taperPt(0, u)); inner.push(taperPt(-PARAPET_W, u)); }
    for (const s of tipTop.slice().reverse()) if (s < 1 - 1e-9) { outer.push(tipAt(0, s)); inner.push(tipInner(s)); }
    for (const z of frontZ) { outer.push([X_FRONT, z]); inner.push([X_FRONT + PARAPET_W, z]); }
    outer.push([X_FRONT, Z_SPLIT]); inner.push(mD(-PARAPET_W));
    for (const x of splitTop) if (x > X_FRONT + 1e-9) { outer.push([x, Z_SPLIT]); inner.push([x, Z_SPLIT - PARAPET_W]); }
    const pTop = p => H(p) + PARAPET_H, pLit = p => pTop(p) - EDGE_LIT_H;
    edge.strip(0, outer, H, pLit, 1);
    lights.strip(0, outer, pLit, pTop, 1);
    edge.strip(0, inner, H, pTop, -1);
    edge.band(0, inner, outer, pTop, true);
    edge.emit(root);
    // lit strip on top of the plinth, as proud as the plinth
    for (const [a, b] of runs) {
      lights.strip(0, b, c(PLINTH_H), c(PLINTH_H + PLINTH_LIT_H), 1);
      lights.band(0, a, b, c(PLINTH_H + PLINTH_LIT_H), true);
    }
    lights.emit(root);

    // ---- Roof monitor on the taper centreline, 6 m above the local deck; open at the seam for the hall's monitor ----
    const mon = makePart('roofMonitor', [M.roof, M.lit, M.trim, M.clad]);
    const mz = [-MON_HALF, -MON_HALF / 2, 0, MON_HALF / 2, MON_HALF];
    mon.grid(0, XS.map(x => mz.map(z => [x, z])), p => H(p) + MON_H, true);
    for (const [zf, side] of [[MON_HALF, 1], [-MON_HALF, -1]]) {
      const line = XS.map(x => [x, zf]);
      mon.strip(2, line, p => H(p) - EMBED, p => H(p) + MON_LIT[0], side);
      mon.strip(1, line, p => H(p) + MON_LIT[0], p => H(p) + MON_LIT[1], side);
      mon.strip(2, line, p => H(p) + MON_LIT[1], p => H(p) + MON_H, side);
    }
    for (let i = 0; i + 1 < mz.length; i++) {
      const a = [X_BAR, mz[i]], b = [X_BAR, mz[i + 1]];
      mon.poly(3, [[a[0], H(a) - EMBED, a[1]], [b[0], H(b) - EMBED, b[1]], [b[0], H(b) + MON_H, b[1]], [a[0], H(a) + MON_H, a[1]]], [-1, 0, 0]);
    }
    mon.emit(root);

    // ---- Transverse roof ribs over the taper, parapet to parapet, cut at the monitor ----
    const ribs = makePart('roofRibs', [M.trim]);
    for (const xr of RIB_X) {
      const x0 = xr - RIB_HALF, x1 = xr + RIB_HALF;
      const spans = [[x => taperZ(-PARAPET_W, x), () => -MON_HALF, 0, [342 / LT, 0, -480 / LT]],
        [() => MON_HALF, () => Z_SPLIT - PARAPET_W, 1, [0, 0, 1]]];
      for (const [za, zb, capEnd, capN] of spans) {
        const seg = Math.max(2, Math.ceil(Math.max(zb(x0) - za(x0), zb(x1) - za(x1)) / 24));
        const col = x => { const out = []; for (let j = 0; j <= seg; j++) out.push([x, za(x) + (zb(x) - za(x)) * j / seg]); return out; };
        const c0 = col(x0), c1 = col(x1);
        ribs.grid(0, [c0, c1], p => H(p) + RIB_H, true);
        ribs.strip(0, c0, p => H(p) - EMBED, p => H(p) + RIB_H, 1);
        ribs.strip(0, c1, p => H(p) - EMBED, p => H(p) + RIB_H, -1);
        const e0 = capEnd ? c0[seg] : c0[0], e1 = capEnd ? c1[seg] : c1[0];   // end face above the parapet top
        ribs.poly(0, [[e0[0], H(e0) + PARAPET_H, e0[1]], [e1[0], H(e1) + PARAPET_H, e1[1]], [e1[0], H(e1) + RIB_H, e1[1]],
          [e0[0], H(e0) + RIB_H, e0[1]]], capN);
      }
    }
    ribs.emit(root);

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
