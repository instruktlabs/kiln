const meta = { name: 'euv-scanner' };
const B0 = 1.9, B1 = 2.0;   // family stripe band
const TAU = Math.PI * 2;
const AXES = { x: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], y: [[0, 1, 0], [0, 0, 1], [1, 0, 0]], z: [[0, 0, 1], [1, 0, 0], [0, 1, 0]] };

function ringPt(ax, c, t, r, a) {
  const A = AXES[ax], cs = Math.cos(a), sn = Math.sin(a);
  return [c[0] + A[0][0] * t + r * (cs * A[1][0] + sn * A[2][0]),
          c[1] + A[0][1] * t + r * (cs * A[1][1] + sn * A[2][1]),
          c[2] + A[0][2] * t + r * (cs * A[1][2] + sn * A[2][2])];
}
function radialDir(ax, a) {
  const A = AXES[ax], cs = Math.cos(a), sn = Math.sin(a);
  return [cs * A[1][0] + sn * A[2][0], cs * A[1][1] + sn * A[2][1], cs * A[1][2] + sn * A[2][2]];
}

function newBatch() {
  const P = [], N = [], U = [], I = [];
  const UVQ = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const emit = (v, n) => {
    const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2];
    const wx = v[2][0] - v[0][0], wy = v[2][1] - v[0][1], wz = v[2][2] - v[0][2];
    const gx = uy * wz - uz * wy, gy = uz * wx - ux * wz, gz = ux * wy - uy * wx;
    let ax = 0, ay = 0, az = 0;
    for (let k = 0; k < v.length; k++) { ax += n[k][0]; ay += n[k][1]; az += n[k][2]; }
    const flip = (gx * ax + gy * ay + gz * az) < 0;
    const isQuad = v.length === 4;
    const ord = isQuad ? (flip ? [0, 3, 2, 1] : [0, 1, 2, 3]) : (flip ? [0, 2, 1] : [0, 1, 2]);
    const base = P.length / 3;
    for (let i = 0; i < ord.length; i++) {
      const k = ord[i];
      P.push(v[k][0], v[k][1], v[k][2]); N.push(n[k][0], n[k][1], n[k][2]); U.push(UVQ[i][0], UVQ[i][1]);
    }
    if (isQuad) I.push(base, base + 1, base + 2, base, base + 2, base + 3); else I.push(base, base + 1, base + 2);
  };
  const quad = (a, b, c, d, dir) => emit([a, b, c, d], [dir, dir, dir, dir]);
  const box = (x0, y0, z0, x1, y1, z1, skip) => {
    const sk = skip || '';
    const S = (f) => sk.indexOf(f) < 0;
    if (S('+x')) quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
    if (S('-x')) quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]);
    if (S('+y')) quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
    if (S('-y')) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    if (S('+z')) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    if (S('-z')) quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
  };
  const tube = (ax, c, t0, t1, r0, r1, seg, inward) => {
    const s = inward ? -1 : 1;
    for (let k = 0; k < seg; k++) {
      const a0 = TAU * k / seg, a1 = TAU * (k + 1) / seg;
      const d0 = radialDir(ax, a0), d1 = radialDir(ax, a1);
      const n0 = [d0[0] * s, d0[1] * s, d0[2] * s], n1 = [d1[0] * s, d1[1] * s, d1[2] * s];
      emit([ringPt(ax, c, t0, r0, a0), ringPt(ax, c, t0, r0, a1), ringPt(ax, c, t1, r1, a1), ringPt(ax, c, t1, r1, a0)], [n0, n1, n1, n0]);
    }
  };
  const disc = (ax, c, t, r, seg, sgn) => {
    const A = AXES[ax][0], n = [A[0] * sgn, A[1] * sgn, A[2] * sgn], ctr = ringPt(ax, c, t, 0, 0);
    for (let k = 0; k < seg; k++) emit([ctr, ringPt(ax, c, t, r, TAU * k / seg), ringPt(ax, c, t, r, TAU * (k + 1) / seg)], [n, n, n]);
  };
  const annulus = (ax, c, t, rin, rout, seg, sgn) => {
    const A = AXES[ax][0], n = [A[0] * sgn, A[1] * sgn, A[2] * sgn];
    for (let k = 0; k < seg; k++) {
      const a0 = TAU * k / seg, a1 = TAU * (k + 1) / seg;
      emit([ringPt(ax, c, t, rin, a0), ringPt(ax, c, t, rout, a0), ringPt(ax, c, t, rout, a1), ringPt(ax, c, t, rin, a1)], [n, n, n, n]);
    }
  };
  const count = () => I.length / 3;
  const geo = () => meshGeo({ positions: P, indices: I, normals: N, uvs: U });
  return { poly: emit, quad, box, tube, disc, annulus, count, geo };
}

function newSet() {
  const map = {};
  const get = (k) => { if (!map[k]) map[k] = newBatch(); return map[k]; };
  const keys = () => Object.keys(map).filter((k) => map[k].count() > 0);
  return { get, keys, map };
}

function makeMaterials() {
  const g = (name, hex, r, m, ex) => {
    const mt = gameMaterial(hex, Object.assign({ roughness: r, metalness: m, flatShading: false }, ex || {}));
    mt.name = name;
    return mt;
  };
  const glass = g('glass-smoked', 0x5E6A73, 0.10, 0.0);
  glass.transparent = true; glass.opacity = 0.6;
  return {
    white: g('tool-shell-white', 0xE8EBEE, 0.55, 0.0),
    grey: g('tool-panel-grey', 0xC5CBD1, 0.60, 0.0),
    dark: g('trim-graphite', 0x3B4148, 0.50, 0.1),
    steel: g('stainless', 0xB9BEC3, 0.35, 1.0),
    teal: g('accent-litho', 0x2E8B8B, 0.50, 0.0),
    glass: glass,
    screen: g('screen-glow', 0x9FD3F5, 0.30, 0.0, { emissive: 0x9FD3F5, emissiveIntensity: 1.0 }),
  };
}

function named(name, parent, pos) {
  const o = createPivot('tmp', pos || [0, 0, 0], parent);
  o.name = name;
  return o;
}

// emits a part from a set: one material -> a single mesh named exactly `name`; several -> group `name` with one mesh per material
function flushPart(S, M, name, parent) {
  const ks = S.keys();
  if (ks.length === 1) {
    const p = createPart(name, S.map[ks[0]].geo(), M[ks[0]], { parent: parent });
    p.name = name;
    return p;
  }
  const grp = named(name, parent);
  ks.forEach((k) => {
    const p = createPart(name + '_' + k, S.map[k].geo(), M[k], { parent: grp });
    p.name = name + '_' + k;
  });
  return grp;
}

// box whose Y range is split so the family stripe band is flush (teal) inside the skin material
function bandBox(S, wk, x0, y0, z0, x1, y1, z1, skip) {
  const sk = skip || '';
  if (y1 <= B0 + 1e-9 || y0 >= B1 - 1e-9) { S.get(wk).box(x0, y0, z0, x1, y1, z1, sk); return; }
  const lo = y0 < B0 - 1e-9, hi = y1 > B1 + 1e-9;
  if (lo) S.get(wk).box(x0, y0, z0, x1, B0, z1, sk + '+y');
  S.get('teal').box(x0, Math.max(y0, B0), z0, x1, Math.min(y1, B1), z1, sk + (lo ? '-y' : '') + (hi ? '+y' : ''));
  if (hi) S.get(wk).box(x0, B1, z0, x1, y1, z1, sk + '-y');
}

// rectangle (y0..y1 by u0..u1) minus holes -> list of remaining rectangles
function tileRect(y0, y1, u0, u1, holes) {
  const ys = [y0, y1];
  holes.forEach((h) => { ys.push(h.y0, h.y1); });
  const yb = Array.from(new Set(ys.filter((v) => v >= y0 - 1e-9 && v <= y1 + 1e-9))).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < yb.length - 1; i++) {
    const a = yb[i], b = yb[i + 1], mid = (a + b) / 2;
    if (b - a < 1e-9) continue;
    const hs = holes.filter((h) => h.y0 <= mid && h.y1 >= mid).sort((p, q) => p.u0 - q.u0);
    let u = u0;
    hs.forEach((h) => { if (h.u0 > u + 1e-9) out.push({ y0: a, y1: b, u0: u, u1: h.u0 }); u = Math.max(u, h.u1); });
    if (u1 > u + 1e-9) out.push({ y0: a, y1: b, u0: u, u1: u1 });
  }
  return out;
}

// flat face at X = x facing dir (+1 / -1), Z = u axis
function faceX(batch, x, dir, r) {
  batch.quad([x, r.y0, r.u0], [x, r.y1, r.u0], [x, r.y1, r.u1], [x, r.y0, r.u1], [dir, 0, 0]);
}
// flat face at Z = z facing dir (+1 / -1), X = u axis
function faceZ(batch, z, dir, r) {
  batch.quad([r.u0, r.y0, z], [r.u1, r.y0, z], [r.u1, r.y1, z], [r.u0, r.y1, z], [0, 0, dir]);
}
// ---------------- shared helpers: wall panels, reveals, frames, doors, clips ----------------
const SEAM = 0.012;   // panel seam width
const LOD_E = 0.002;  // lod1 sits this far inside the detailed skins

// flat face at Y = y facing dir (+1 / -1); Z = y0..y1, X = u0..u1
function faceY(batch, y, dir, r) {
  batch.quad([r.u0, y, r.y0], [r.u1, y, r.y0], [r.u1, y, r.y1], [r.u0, y, r.y1], [0, dir, 0]);
}

function uniq(a) {
  const s = a.map((v) => Math.round(v * 1e6) / 1e6).sort((p, q) => p - q), o = [];
  s.forEach((v) => { if (!o.length || v - o[o.length - 1] > 1e-6) o.push(v); });
  return o;
}

// panelled face: seams, teal stripe, holes (no face) and flush fills. pl: 'z' (u = X), 'x' (u = Z), 'y' (u = X, v = Z)
function wallFace(S, pl, c, dir, a0, a1, y0, y1, o) {
  const holes = o.holes || [], fills = o.fills || [], base = o.base || 'white';
  const seams = (o.seams || []).map((s) => [Math.max(a0, s - SEAM / 2), Math.min(a1, s + SEAM / 2)]).filter((v) => v[1] - v[0] > 1e-6);
  const face = pl === 'x' ? faceX : (pl === 'y' ? faceY : faceZ);
  const us = [a0, a1];
  holes.concat(fills).forEach((h) => { us.push(h.u0, h.u1); });
  seams.forEach((v) => { us.push(v[0], v[1]); });
  const ub = uniq(us.filter((v) => v >= a0 - 1e-9 && v <= a1 + 1e-9));
  for (let i = 0; i < ub.length - 1; i++) {
    const p = ub[i], q = ub[i + 1], mu = (p + q) / 2;
    const ys = [y0, y1];
    if (o.band) ys.push(B0, B1);
    holes.concat(fills).forEach((h) => { if (mu > h.u0 && mu < h.u1) ys.push(h.y0, h.y1); });
    const yb = uniq(ys.filter((v) => v >= y0 - 1e-9 && v <= y1 + 1e-9));
    let run = null;
    const flush = () => { if (run && run.k) face(S.get(run.k), c, dir, { y0: run.a, y1: run.b, u0: p, u1: q }); run = null; };
    for (let j = 0; j < yb.length - 1; j++) {
      const a = yb[j], b = yb[j + 1], m = (a + b) / 2;
      let k = base;
      if (o.band && m > B0 && m < B1) k = 'teal';
      fills.forEach((f) => { if (mu > f.u0 && mu < f.u1 && m > f.y0 && m < f.y1) k = f.k; });
      if (k === base && seams.some((v) => mu > v[0] && mu < v[1])) k = 'dark';
      if (holes.some((h) => mu > h.u0 && mu < h.u1 && m > h.y0 && m < h.y1)) k = null;
      if (run && run.k === k) run.b = b; else { flush(); run = { k: k, a: a, b: b }; }
    }
    flush();
  }
}

// four faces lining a rectangular hole, pointing into it; z0..z1 is the depth range
function reveal(B, x0, x1, y0, y1, z0, z1) {
  faceX(B, x0, 1, { y0: y0, y1: y1, u0: z0, u1: z1 });
  faceX(B, x1, -1, { y0: y0, y1: y1, u0: z0, u1: z1 });
  faceY(B, y0, 1, { y0: z0, y1: z1, u0: x0, u1: x1 });
  faceY(B, y1, -1, { y0: z0, y1: z1, u0: x0, u1: x1 });
}

// open frame of square bars: four corner posts plus bottom / top / mid loops
function frameBox(B, x0, x1, z0, z1, y0, y1, mids, sb) {
  const bs = 0.08, base = sb ? '-y' : '';
  [[x0, z0], [x1 - bs, z0], [x0, z1 - bs], [x1 - bs, z1 - bs]].forEach((p) => { B.box(p[0], y0, p[1], p[0] + bs, y1, p[1] + bs, base); });
  [y0, y1 - bs].concat(mids || []).forEach((h, i) => {
    const sk = i === 0 ? base : '';
    [z0, z1 - bs].forEach((z) => { B.box(x0 + bs, h, z, x1 - bs, h + bs, z + bs, '-x+x' + sk); });
    [x0, x1 - bs].forEach((x) => { B.box(x, h, z0 + bs, x + bs, h + bs, z1 - bs, '-z+z' + sk); });
  });
}

// group at pos with one child mesh per material (used for parts that move or rotate)
function flushAt(S, M, name, parent, pos) {
  const g = named(name, parent, pos);
  S.keys().forEach((k) => {
    const p = createPart(name + '_' + k, S.map[k].geo(), M[k], { parent: g });
    p.name = name + '_' + k;
  });
  return g;
}

// raised louvre slats across a vent field (x0..x1 by z0..z1) on a roof at height y
function vent(S, x0, x1, z0, z1, y, n) {
  const W = S.get('white');
  for (let i = 0; i < n; i++) {
    const xa = x0 + (x1 - x0) * (i + 0.5) / n - 0.025;
    W.box(xa, y, z0 + 0.03, xa + 0.05, y + 0.035, z1 - 0.03, '-y');
  }
}
// roof panel over x0..x1, full width; vents are [x0, x1, z0, z1, slats]
function roof(S, y, x0, x1, o) {
  const vs = o.vents || [];
  const fills = vs.map((v) => ({ u0: v[0], u1: v[1], y0: v[2], y1: v[3], k: 'dark' }));
  wallFace(S, 'y', y, 1, x0, x1, -HZ, HZ, { seams: o.seams || [], fills: fills, holes: o.holes || [] });
  vs.forEach((v) => { vent(S, v[0], v[1], v[2], v[3], y, v[4]); });
}

// service door in its hinge frame: hinge on the -x edge, outer face at z = 0 (facing sg), body inward by t
function buildDoorGeo(S, sg, w, y0, y1, t) {
  const Wd = S.get('white'), D = S.get('dark');
  const zi = -sg * t, zmin = Math.min(0, zi), zmax = Math.max(0, zi);
  wallFace(S, 'z', 0, sg, 0, w, y0, y1, { band: true, fills: [{ u0: w - 0.20, u1: w - 0.16, y0: 0.95, y1: 1.35, k: 'dark' }] });
  faceZ(D, zi, -sg, { y0: y0, y1: y1, u0: 0, u1: w });
  faceX(Wd, 0, -1, { y0: y0, y1: y1, u0: zmin, u1: zmax });
  faceX(Wd, w, 1, { y0: y0, y1: y1, u0: zmin, u1: zmax });
  faceY(Wd, y1, 1, { y0: zmin, y1: zmax, u0: 0, u1: w });
  faceY(Wd, y0, -1, { y0: zmin, y1: zmax, u0: 0, u1: w });
}

function smooth(t) { return t * t * (3 - 2 * t); }
// eased door swing keys about +Y; door A (+Z) uses sg = 1, door B (-Z) sg = -1
function doorKeys(sg, rev, dur, max, n) {
  const ks = [];
  for (let i = 0; i <= n; i++) {
    const f = smooth(i / n), a = max * (rev ? 1 - f : f);
    ks.push({ time: dur * i / n, rotation: [0, -sg * a, 0] });
  }
  return ks;
}


// ---------------- EUV layout (metres; +X front/handler, +Y up, +Z right) ----------------
const X_SRC = -4.6, X_ILL = -1.6, X_OPT = 1.6, X_WAF = 5.2, X_FRONT = 7.0;
const HZ = 2.0;
const H_ILL = 3.0, H_OPT = 3.3, H_RET = 4.0, H_WAF = 2.8, H_HAN = 2.4;
const RET = 1.4;                                  // reticle module half extent (X and Z)
const PL_H = 0.25, PL_X = 6.9, PL_Z = 1.9;        // plinth height, half X, half Z (0.1 m inset)
const WT = 0.06, IN = 0.03;                       // wafer shell wall, frame inset behind the skins
const CEIL = H_WAF - WT, LINER_X = X_WAF - WT;    // inside face of the wafer roof and of the front slab
const V_Y = 1.75, V_R = 1.1, V_X0 = -6.5, V_X1 = -5.1, V_D = 0.5;
const DUCT_X = -5.8, DUCT_R = 0.2;
const DOOR_X = 1.7, DOOR_W = 1.6, DOOR_Y0 = 0.30, DOOR_Y1 = 2.70, DOOR_MAX = 100;
const WIN = { x0: 3.5, x1: 5.1, y0: 0.6, y1: 1.6 };
const SCREEN = { x0: 6.0, x1: 6.6, y0: 1.3, y1: 1.8 };
const WAF_X = 4.3, ROB_X = 5.8;
const SEG = 36, SEG_C = 32, BOLTS = 20;

function buildPlinth(S) {
  const D = S.get('dark');
  const hx0 = -6.02, hx1 = -5.58, hz = 0.22;
  D.box(-PL_X, 0, -PL_Z, hx0, PL_H, PL_Z, '+x');
  D.box(hx1, 0, -PL_Z, PL_X, PL_H, PL_Z, '-x');
  D.box(hx0, 0, hz, hx1, PL_H, PL_Z, '-x+x');
  D.box(hx0, 0, -PL_Z, hx1, PL_H, -hz, '-x+x');
  faceX(D, hx0, 1, { y0: 0, y1: PL_H, u0: -hz, u1: hz });
  faceX(D, hx1, -1, { y0: 0, y1: PL_H, u0: -hz, u1: hz });
}

function buildFrame(S) {
  const B = S.get('grey');
  frameBox(B, X_SRC + IN, X_ILL - IN, -HZ + IN, HZ - IN, PL_H, H_ILL - IN, [1.46], true);
  frameBox(B, X_ILL + IN, X_OPT - IN, -HZ + IN, HZ - IN, PL_H, H_OPT - IN, [1.46], true);
  frameBox(B, X_OPT + 0.02, LINER_X - 0.02, -(HZ - WT - 0.02), HZ - WT - 0.02, PL_H, CEIL - 0.02, [1.72], true);
  frameBox(B, X_WAF + IN, X_FRONT - IN, -HZ + IN, HZ - IN, PL_H, H_HAN - IN, [1.46], true);
  [0.9, -0.9].forEach((z) => { B.box(-1.49, H_OPT - IN - 0.08, z - 0.04, 1.49, H_OPT - IN, z + 0.04, '-x+x+y'); });
  B.box(-1.37, 3.27, -1.37, 1.37, 3.35, 1.37);
  frameBox(B, -1.37, 1.37, -1.37, 1.37, 3.35, 3.97, [], true);
  B.box(-0.44, 3.35, -0.8, -0.36, 3.39, 0.8, '-y');
  B.box(0.36, 3.35, -0.8, 0.44, 3.39, 0.8, '-y');
  B.box(3.6, 0.90, -0.65, 5.0, 1.00, 0.65);
  [[3.6, -0.65], [4.9, -0.65], [3.6, 0.55], [4.9, 0.55]].forEach((p) => { B.box(p[0], PL_H, p[1], p[0] + 0.1, 0.90, p[1] + 0.1, '-y+y'); });
}

function buildSkins(S) {
  const D = S.get('dark'), Wd = S.get('white');
  const dh = { u0: DOOR_X - 0.003, u1: DOOR_X + DOOR_W + 0.003, y0: DOOR_Y0 - 0.003, y1: DOOR_Y1 + 0.003 };
  const wh = { u0: WIN.x0, u1: WIN.x1, y0: WIN.y0, y1: WIN.y1 };
  const sh = { u0: SCREEN.x0, u1: SCREEN.x1, y0: SCREEN.y0, y1: SCREEN.y1 };
  const fl = (a, b, y0, y1) => [{ u0: a, u1: b, y0: y0, y1: y1, k: 'dark' }];
  [1, -1].forEach((s) => {
    wallFace(S, 'z', s * HZ, s, X_SRC, X_ILL, PL_H, H_ILL, { band: true, seams: [-4.6, -3.6, -2.6, -1.6], fills: fl(-4.3, -1.9, 2.15, 2.6) });
    wallFace(S, 'z', s * HZ, s, X_ILL, X_OPT, PL_H, H_OPT, { band: true, seams: [-1.6, -0.53, 0.53, 1.6], fills: fl(-1.3, 1.3, 2.15, 2.6) });
    const holes = s > 0 ? [dh, wh] : [dh];
    wallFace(S, 'z', s * HZ, s, X_OPT, X_WAF, PL_H, H_WAF, { band: true, seams: [1.6, 3.4, 5.2], holes: holes });
    wallFace(S, 'z', s * (HZ - WT), -s, X_OPT, LINER_X, PL_H, CEIL, { base: 'dark', holes: holes });
    reveal(D, dh.u0, dh.u1, dh.y0, dh.y1, Math.min(s * HZ, s * (HZ - WT)), Math.max(s * HZ, s * (HZ - WT)));
    if (s > 0) {
      reveal(D, wh.u0, wh.u1, wh.y0, wh.y1, HZ - 0.02, HZ);
      reveal(D, wh.u0, wh.u1, wh.y0, wh.y1, HZ - WT, HZ - WT + 0.02);
    }
    wallFace(S, 'z', s * HZ, s, X_WAF, X_FRONT, PL_H, H_HAN, { band: true, seams: [5.2, 5.6, 7.0], fills: s > 0 ? fl(5.95, 6.65, 1.25, 1.85) : [], holes: s > 0 ? [sh] : [] });
    wallFace(S, 'z', s * RET, s, -RET, RET, H_OPT, H_RET, { seams: [-RET, 0, RET], fills: fl(-1.1, 1.1, 3.55, 3.85) });
    wallFace(S, 'x', s * RET, s, -RET, RET, H_OPT, H_RET, { seams: [-RET, 0, RET], fills: fl(-1.1, 1.1, 3.55, 3.85) });
  });
  wallFace(S, 'x', X_SRC, -1, -HZ, HZ, PL_H, H_ILL, {});
  wallFace(S, 'x', X_ILL, -1, -HZ, HZ, H_ILL, H_OPT, {});
  faceX(D, X_OPT, 1, { y0: PL_H, y1: CEIL, u0: -HZ, u1: HZ });
  faceX(Wd, X_OPT, 1, { y0: CEIL, y1: H_OPT, u0: -HZ, u1: HZ });
  wallFace(S, 'x', X_WAF, 1, -HZ, HZ, H_HAN, H_WAF, {});
  faceX(D, LINER_X, -1, { y0: PL_H, y1: CEIL, u0: -(HZ - WT), u1: HZ - WT });
  wallFace(S, 'x', X_FRONT, 1, -HZ, HZ, PL_H, H_HAN, { band: true, fills: fl(-0.9, 0.9, 0.5, 1.7) });
  roof(S, H_ILL, X_SRC, X_ILL, { seams: [-3.6, -2.6], vents: [[-4.3, -2.0, 0.4, 1.5, 8], [-4.3, -2.0, -1.5, -0.4, 8]] });
  roof(S, H_OPT, X_ILL, X_OPT, { seams: [-0.53, 0.53], holes: [{ u0: -RET, u1: RET, y0: -RET, y1: RET }], vents: [[-1.3, 1.3, 1.5, 1.9, 8], [-1.3, 1.3, -1.9, -1.5, 8]] });
  roof(S, H_WAF, X_OPT, X_WAF, { seams: [3.4], vents: [[2.0, 4.8, 0.4, 1.5, 9], [2.0, 4.8, -1.5, -0.4, 9]] });
  roof(S, H_HAN, X_WAF, X_FRONT, { seams: [5.6], vents: [[5.5, 6.5, 0.4, 1.5, 5], [5.5, 6.5, -1.5, -0.4, 5]] });
  faceY(Wd, H_RET, 1, { y0: -RET, y1: RET, u0: -RET, u1: RET });
  faceY(D, PL_H, -1, { y0: PL_Z, y1: HZ, u0: X_SRC, u1: X_FRONT });
  faceY(D, PL_H, -1, { y0: -HZ, y1: -PL_Z, u0: X_SRC, u1: X_FRONT });
  faceY(D, PL_H, -1, { y0: -PL_Z, y1: PL_Z, u0: PL_X, u1: X_FRONT });
}

// ellipsoidal dome closing a vessel end: rim ring at xc, tip at xc + dir * depth
function dome(B, xc, dir, R, depth, seg, rings) {
  const rho = (k) => (k >= rings ? 0 : R * Math.cos(Math.PI / 2 * k / rings));
  const uu = (k) => depth * Math.sin(Math.PI / 2 * k / rings);
  const P = (k, a) => ringPt('x', [xc, V_Y, 0], dir * uu(k), rho(k), a);
  const Nn = (k, a) => {
    const nx = dir * uu(k) / (depth * depth), nr = rho(k) / (R * R), l = Math.hypot(nx, nr), d = radialDir('x', a);
    return [nx / l, nr * d[1] / l, nr * d[2] / l];
  };
  for (let k = 0; k < rings; k++) {
    for (let j = 0; j < seg; j++) {
      const a0 = TAU * j / seg, a1 = TAU * (j + 1) / seg;
      if (k === rings - 1) B.poly([P(k, a0), P(k, a1), P(k + 1, a0)], [Nn(k, a0), Nn(k, a1), Nn(k + 1, a0)]);
      else B.poly([P(k, a0), P(k, a1), P(k + 1, a1), P(k + 1, a0)], [Nn(k, a0), Nn(k, a1), Nn(k + 1, a1), Nn(k + 1, a0)]);
    }
  }
}
function boltRing(B, xFace, dirOut, rho, n) {
  for (let i = 0; i < n; i++) {
    const p = ringPt('x', [xFace, V_Y, 0], 0, rho, TAU * (i + 0.5) / n);
    B.tube('x', p, 0, dirOut * 0.02, 0.02, 0.02, 6);
    B.disc('x', p, dirOut * 0.02, 0.02, 6, dirOut);
  }
}

function buildVessel(S) {
  const St = S.get('steel'), G = S.get('grey'), D = S.get('dark'), c = [0, V_Y, 0];
  St.tube('x', c, V_X0, V_X1, V_R, V_R, SEG);
  dome(St, V_X0, -1, V_R, V_D, SEG, 6);
  dome(St, V_X1, 1, V_R, V_D, SEG, 6);
  [[V_X0, V_X0 + 0.08, -1], [V_X1 - 0.08, V_X1, 1]].forEach((f) => {
    G.tube('x', c, f[0], f[1], 1.16, 1.16, SEG);
    G.annulus('x', c, f[0], V_R, 1.16, SEG, -1);
    G.annulus('x', c, f[1], V_R, 1.16, SEG, 1);
    boltRing(D, f[2] < 0 ? f[0] : f[1], f[2], 1.13, BOLTS);
  });
  [1, -1].forEach((sg) => {
    const pc = [-6.0, V_Y, 0];
    G.tube('z', pc, sg * 1.0, sg * 1.34, 0.25, 0.25, 16);
    G.disc('z', pc, sg * 1.34, 0.25, 16, sg);
    G.tube('z', pc, sg * 1.26, sg * 1.34, 0.30, 0.30, 16);
    G.annulus('z', pc, sg * 1.34, 0.25, 0.30, 16, sg);
  });
  const dc = [-5.6, 0, 0];
  St.tube('y', dc, 2.78, 3.45, 0.12, 0.12, 16);
  St.disc('y', dc, 3.45, 0.12, 16, 1);
  G.tube('y', dc, 3.28, 3.36, 0.17, 0.17, 16);
  G.annulus('y', dc, 3.36, 0.12, 0.17, 16, 1);
  [-6.45, -5.45].forEach((x) => {
    G.box(x, PL_H, -1.0, x + 0.30, 0.40, 1.0, '-y');
    G.box(x, 0.40, -0.75, x + 0.30, 0.55, 0.75, '-y');
    D.box(x, 0.55, -0.30, x + 0.30, 0.68, 0.30, '-y');
  });
}

function buildDuct(S) {
  const St = S.get('steel'), c = [DUCT_X, 0, 0];
  St.tube('y', c, 0, 0.70, DUCT_R, DUCT_R, 24);
  St.disc('y', c, 0, DUCT_R, 24, -1);
  [[0.36, 0.42], [0.54, 0.60]].forEach((r) => {
    St.tube('y', c, r[0], r[1], 0.24, 0.24, 24);
    St.annulus('y', c, r[0], DUCT_R, 0.24, 24, -1);
    St.annulus('y', c, r[1], DUCT_R, 0.24, 24, 1);
  });
  St.tube('y', c, PL_H, 0.30, 0.34, 0.34, 24);
  St.annulus('y', c, 0.30, DUCT_R, 0.34, 24, 1);
}

function buildIllum(S) {
  const St = S.get('steel'), G = S.get('grey'), D = S.get('dark');
  const XS = [-4.05, -3.35, -2.65, -1.95], YS = [1.10, 1.55, 2.00, 2.45], L = 0.55, R = 0.30;
  XS.forEach((x, i) => {
    const c = [0, YS[i], 0], xa = x - L / 2, xb = x + L / 2;
    St.tube('x', c, xa, xb, R, R, SEG_C);
    St.disc('x', c, xa, R, SEG_C, -1);
    St.disc('x', c, xb, R, SEG_C, 1);
    G.tube('x', c, x - 0.05, x + 0.05, R + 0.04, R + 0.04, SEG_C);
    G.annulus('x', c, x - 0.05, R, R + 0.04, SEG_C, -1);
    G.annulus('x', c, x + 0.05, R, R + 0.04, SEG_C, 1);
    D.box(x - 0.2, PL_H, -0.2, x + 0.2, YS[i] - R + 0.03, 0.2, '-y');
    St.tube('y', [x, 0, 0], YS[i] + R - 0.03, YS[i] + R + 0.08, 0.09, 0.09, 12);
    St.disc('y', [x, 0, 0], YS[i] + R + 0.08, 0.09, 12, 1);
  });
}

function buildColumn(S) {
  const St = S.get('steel'), G = S.get('grey'), c = [0, 0, 0];
  [[PL_H, 0.60, 0.85], [0.60, 1.55, 0.70], [1.65, 2.55, 0.60], [2.55, 3.27, 0.45]].forEach((t) => { St.tube('y', c, t[0], t[1], t[2], t[2], SEG_C); });
  St.annulus('y', c, 0.60, 0.70, 0.85, SEG_C, 1);
  St.annulus('y', c, 2.55, 0.45, 0.60, SEG_C, 1);
  G.tube('y', c, 1.55, 1.65, 0.80, 0.80, SEG_C);
  G.annulus('y', c, 1.55, 0.70, 0.80, SEG_C, -1);
  G.annulus('y', c, 1.65, 0.60, 0.80, SEG_C, 1);
}

function buildRetStage(S) {
  const St = S.get('steel'), D = S.get('dark'), G = S.get('grey');
  St.box(-0.5, 3.39, -0.4, 0.5, 3.47, 0.4, '-y');
  D.box(-0.42, 3.47, -0.32, 0.42, 3.50, 0.32, '-y');
  [-0.3, 0.3].forEach((z) => { G.box(-0.47, 3.47, z - 0.04, -0.42, 3.53, z + 0.04, '-y'); G.box(0.42, 3.47, z - 0.04, 0.47, 3.53, z + 0.04, '-y'); });
}

function buildWafStage(S) {
  const St = S.get('steel'), D = S.get('dark'), G = S.get('grey');
  G.box(-0.4, 1.0, -0.4, 0.4, 1.12, 0.4, '-y');
  St.tube('y', [0, 0, 0], 1.12, 1.16, 0.15, 0.15, 24);
  St.disc('y', [0, 0, 0], 1.16, 0.15, 24, 1);
  D.box(-0.38, 1.12, -0.36, 0.38, 1.135, -0.31, '-y');
  D.box(-0.38, 1.12, 0.31, 0.38, 1.135, 0.36, '-y');
  St.box(0.34, 1.12, -0.30, 0.40, 1.17, 0.30, '-y');
  St.box(-0.40, 1.12, -0.30, -0.34, 1.17, 0.30, '-y');
}

function buildRobot(S) {
  const St = S.get('steel'), D = S.get('dark'), G = S.get('grey');
  D.tube('y', [0, 0, 0], PL_H, 0.70, 0.28, 0.28, 24);
  D.disc('y', [0, 0, 0], 0.70, 0.28, 24, 1);
  St.tube('y', [0, 0, 0], 0.70, 0.90, 0.18, 0.18, 20);
  St.disc('y', [0, 0, 0], 0.90, 0.18, 20, 1);
  G.box(0, 0.90, -0.10, 0.50, 1.00, 0.10, '-y');
  St.tube('y', [0.5, 0, 0], 0.90, 1.10, 0.10, 0.10, 16);
  St.disc('y', [0.5, 0, 0], 1.10, 0.10, 16, 1);
  G.box(0.5, 1.00, -0.08, 0.90, 1.10, 0.08, '-y');
  D.box(0.80, 1.10, -0.12, 1.10, 1.13, 0.12);
}

function buildScreen(S) {
  S.get('screen').box(SCREEN.x0, SCREEN.y0, HZ - 0.03, SCREEN.x1, SCREEN.y1, HZ);
}

function buildLod(S) {
  const e = LOD_E, W = S.get('white'), St = S.get('steel'), D = S.get('dark');
  const y0 = PL_H - e, z = HZ - e;
  D.box(-PL_X + e, 0, -PL_Z + e, PL_X - e, PL_H - e, PL_Z - e);
  bandBox(S, 'white', X_SRC + e, y0, -z, X_ILL, H_ILL - e, z, '-y-x+x');
  faceX(W, X_SRC + e, -1, { y0: y0, y1: H_ILL - e, u0: -z, u1: z });
  faceX(W, X_ILL + e, -1, { y0: H_ILL - e, y1: H_OPT - e, u0: -z, u1: z });
  bandBox(S, 'white', X_ILL, y0, -z, X_OPT, H_OPT - e, z, '-y-x+x');
  faceX(W, X_OPT - e, 1, { y0: H_WAF - e, y1: H_OPT - e, u0: -z, u1: z });
  bandBox(S, 'white', X_OPT, y0, -z, X_WAF - e, H_WAF - e, z, '-y-x+z');
  wallFace(S, 'z', z, 1, X_OPT, X_WAF - e, y0, H_WAF - e, { band: true, holes: [{ u0: WIN.x0, u1: WIN.x1, y0: WIN.y0, y1: WIN.y1 }] });
  reveal(D, WIN.x0, WIN.x1, WIN.y0, WIN.y1, z - 0.06, z);
  faceZ(D, z - 0.06, 1, { y0: WIN.y0, y1: WIN.y1, u0: WIN.x0, u1: WIN.x1 });
  bandBox(S, 'white', X_WAF - e, y0, -z, X_FRONT - e, H_HAN - e, z, '-y-x');
  W.box(-RET + e, H_OPT - e, -RET + e, RET - e, H_RET - e, RET - e, '-y');
  St.tube('x', [0, V_Y, 0], V_X0, V_X1, V_R - e, V_R - e, 24);
  dome(St, V_X0, -1, V_R - e, V_D - e, 24, 1);
  dome(St, V_X1, 1, V_R - e, V_D - e, 24, 1);
}

function buildSkinsPart(M, root) {
  const skins = named('skins', root);
  const ss = newSet(); buildSkins(ss);
  ss.keys().forEach((k) => {
    const p = createPart('skins_' + k, ss.map[k].geo(), M[k], { parent: skins });
    p.name = 'skins_' + k;
  });
  const vw = newSet(); vw.get('glass').box(WIN.x0, WIN.y0, HZ - 0.04, WIN.x1, WIN.y1, HZ - 0.02);
  flushPart(vw, M, 'viewWindow', skins);
  [1, -1].forEach((s) => {
    const ds = newSet(); buildDoorGeo(ds, s, DOOR_W, DOOR_Y0, DOOR_Y1, WT);
    flushAt(ds, M, s > 0 ? 'serviceDoorA' : 'serviceDoorB', skins, [DOOR_X, 0, s * HZ]);
  });
}

// Standard LOD migration, 2026-09-30. Original branches and animation targets
// remain intact; only identity wrappers and declared LOD metadata are added.
// Coverage is derived from the existing tool far distance (38 m),
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
  const coverage = Math.min(1, Math.PI * (radius / (2 * 38 * Math.tan(25 * Math.PI / 180))) ** 2 / (16 / 9));
  defineLod([detail, distant], { screenCoverage: [coverage, 0] });
  return root;
}

function build() {
  const M = makeMaterials();
  const root = createRoot('euv-scanner');
  root.name = 'euv-scanner';
  [['plinth', buildPlinth], ['frame', buildFrame], ['sourceVessel', buildVessel], ['laserBeamDuct', buildDuct],
   ['illuminatorOptics', buildIllum], ['opticsColumn', buildColumn], ['statusScreen', buildScreen]].forEach((p) => {
    const S = newSet(); p[1](S); flushPart(S, M, p[0], root);
  });
  buildSkinsPart(M, root);
  const rs = newSet(); buildRetStage(rs); flushAt(rs, M, 'reticleStage', root, [0, 0, 0]);
  const ws = newSet(); buildWafStage(ws); flushAt(ws, M, 'waferStage', root, [WAF_X, 0, 0]);
  const hr = newSet(); buildRobot(hr); flushAt(hr, M, 'handlerRobot', root, [ROB_X, 0, 0]);
  const lod = newSet(); buildLod(lod);
  flushPart(lod, M, 'lod1', root);
  named('trackInterface', root, [X_FRONT, 0, 0]);
  named('laserEntry', root, [DUCT_X, 0, 0]);
  named('signalTowerMount', root, [6.8, 2.4, 1.8]);
  return applyFoundryStandardLod(root);
}

function animate(root) {
  const DUR = 3, N = 12;
  const swing = (rev) => [rotationTrack('serviceDoorA', doorKeys(1, rev, DUR, DOOR_MAX, N), 'LINEAR'), rotationTrack('serviceDoorB', doorKeys(-1, rev, DUR, DOOR_MAX, N), 'LINEAR')];
  const K = [[0, 0, 0], [0.6, -0.15, -0.15], [1.8, -0.15, 0.15], [2.1, 0, 0.15], [3.3, 0, -0.15], [3.6, 0.15, -0.15], [4.8, 0.15, 0.15], [6.0, 0, 0]];
  return [
    createClip('ServiceOpen', DUR, swing(false)),
    createClip('ServiceClose', DUR, swing(true)),
    createClip('Expose', 6, [
      positionTrack('waferStage', K.map((k) => ({ time: k[0], position: [WAF_X + k[1], 0, k[2]] })), 'LINEAR'),
      positionTrack('reticleStage', K.map((k) => ({ time: k[0], position: [0, 0, -k[2]] })), 'LINEAR'),
    ]),
  ];
}
