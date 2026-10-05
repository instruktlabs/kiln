const meta = { name: 'duv-immersion-scanner' };
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

// ---------------- DUV immersion scanner: constants (metres, +X front, +Y up, +Z right) ----------------
const X_B = -2.75, X_I = -1.0, X_L = 1.0, X_F = 2.75;      // back, illuminator|lens, lens|handler, front
const HZ = 1.6;                                            // half width
const H_ILL = 2.4, H_LENS = 3.0, H_HAN = 2.4;              // section heights; the lens module is the highest part
const PL_H = 0.2, PL_I = 0.06, PL_Z = HZ - PL_I;           // plinth height, inset behind the skins
const WT = 0.06, IN = 0.03;                                // liner wall thickness, frame inset
const CEIL = H_HAN - WT, CEIL_L = H_LENS - WT, LINER_X = X_F - WT;
const DOOR_X = -0.85, DOOR_W = 1.7, DOOR_Y0 = 0.30, DOOR_Y1 = 2.45, DOOR_MAX = 100;
const WIN = { x0: 1.2, x1: 2.1, y0: 0.7, y1: 1.6 };
const SCREEN = { x0: 2.30, x1: 2.65, y0: 1.25, y1: 1.65 };
const DUCT_X = -2.4, DUCT_W = 0.2, DUCT_Y = 2.05;
const STAGE_Y = 0.72;                                      // pedestal top = wafer stage underside
const SEG_L = 40, BOLTS = 16;

// square-section bar from p to q (width w); up is any unit vector not parallel to the bar
function bar(B, p, q, w, up) {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], L = Math.hypot(d[0], d[1], d[2]);
  const n = d.map((t) => t / L);
  const u0 = [n[1] * up[2] - n[2] * up[1], n[2] * up[0] - n[0] * up[2], n[0] * up[1] - n[1] * up[0]];
  const lu = Math.hypot(u0[0], u0[1], u0[2]), u = u0.map((t) => t / lu);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const h = w / 2, K = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (s, a, b) => [0, 1, 2].map((i) => s[i] + u[i] * a * h + v[i] * b * h);
  const c0 = K.map((k) => at(p, k[0], k[1])), c1 = K.map((k) => at(q, k[0], k[1]));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const m = [0, 1, 2].map((t) => (c0[i][t] + c0[j][t]) / 2 - p[t]);
    const lm = Math.hypot(m[0], m[1], m[2]) || 1;
    B.quad(c0[i], c0[j], c1[j], c1[i], m.map((t) => t / lm));
  }
  B.quad(c0[0], c0[1], c0[2], c0[3], n.map((t) => -t));
  B.quad(c1[0], c1[1], c1[2], c1[3], n);
}

// small studs around a flange centred on (cx, cz): n square studs of width w and height h at radius r, base at y
function studs(B, cx, cz, y, r, n, w, h) {
  for (let k = 0; k < n; k++) {
    const a = TAU * k / n, ca = Math.cos(a), sa = Math.sin(a), hw = w / 2;
    const P = (u, v, yy) => [cx + r * ca + u * ca - v * sa, yy, cz + r * sa + u * sa + v * ca];
    const ring = (yy) => [P(-hw, -hw, yy), P(hw, -hw, yy), P(hw, hw, yy), P(-hw, hw, yy)];
    const b = ring(y), t = ring(y + h);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const m = [(b[i][0] + b[j][0]) / 2 - (cx + r * ca), 0, (b[i][2] + b[j][2]) / 2 - (cz + r * sa)];
      const l = Math.hypot(m[0], m[2]) || 1;
      B.quad(b[i], b[j], t[j], t[i], [m[0] / l, 0, m[2] / l]);
    }
    B.quad(t[0], t[1], t[2], t[3], [0, 1, 0]);
  }
}

// lining of a rectangular hole in an X-normal wall: z0..z1 by y0..y1, depth x0..x1
function revealX(B, z0, z1, y0, y1, x0, x1) {
  faceZ(B, z0, 1, { y0: y0, y1: y1, u0: x0, u1: x1 });
  faceZ(B, z1, -1, { y0: y0, y1: y1, u0: x0, u1: x1 });
  faceY(B, y0, 1, { y0: z0, y1: z1, u0: x0, u1: x1 });
  faceY(B, y1, -1, { y0: z0, y1: z1, u0: x0, u1: x1 });
}

function buildPlinth(S) {
  const D = S.get('dark');
  const x0 = X_B + PL_I, hx0 = DUCT_X - 0.22, hx1 = DUCT_X + 0.22, hz = 0.22;
  D.box(x0, 0, -PL_Z, hx0, PL_H, PL_Z, '+x');
  D.box(hx1, 0, -PL_Z, X_F, PL_H, PL_Z, '-x');
  D.box(hx0, 0, hz, hx1, PL_H, PL_Z, '-x+x');
  D.box(hx0, 0, -PL_Z, hx1, PL_H, -hz, '-x+x');
  faceX(D, hx0, 1, { y0: 0, y1: PL_H, u0: -hz, u1: hz });
  faceX(D, hx1, -1, { y0: 0, y1: PL_H, u0: -hz, u1: hz });
}

function buildFrame(S) {
  const B = S.get('grey');
  const zl = HZ - WT - 0.02;
  frameBox(B, X_B + IN, X_I - IN, -HZ + IN, HZ - IN, PL_H, H_ILL - IN, [1.2], true);
  frameBox(B, X_I + 0.02, X_L - 0.02, -zl, zl, PL_H, CEIL_L - 0.02, [1.62, 2.45], true);
  frameBox(B, X_L + 0.02, LINER_X - 0.02, -zl, zl, PL_H, CEIL - 0.02, [1.72], true);
  [1, -1].forEach((s) => {
    const z = s * (HZ - IN - 0.04), xa = X_B + IN + 0.08, xb = X_I - IN - 0.08;
    [[PL_H + 0.08, 1.2], [1.28, H_ILL - IN - 0.08]].forEach((r) => {
      bar(B, [xa, r[0], z], [xb, r[1], z], 0.04, [0, 0, 1]);
      bar(B, [xa, r[1], z], [xb, r[0], z], 0.04, [0, 0, 1]);
    });
  });
  [0.87, -0.87].forEach((z) => { B.box(-0.90, CEIL_L - 0.10, z - 0.04, 0.90, CEIL_L - 0.02, z + 0.04, '-x+x'); });
  [0.54, -0.54].forEach((z) => { B.box(-0.90, 1.62, z - 0.04, 0.90, 1.70, z + 0.04, '-x+x'); });
  B.box(-0.6, PL_H, -0.6, 0.6, STAGE_Y, 0.6, '-y');
  [-1.15, 0.55].forEach((z) => { B.box(-2.0, PL_H, z, -1.2, 1.15, z + 0.6, '-y'); });
  B.box(1.45, 0.90, -0.55, 2.35, 1.00, 0.55);
  [[1.45, -0.55], [2.25, -0.55], [1.45, 0.45], [2.25, 0.45]].forEach((p) => { B.box(p[0], PL_H, p[1], p[0] + 0.1, 0.90, p[1] + 0.1, '-y+y'); });
  B.box(1.62, 1.00, -0.30, 1.98, 1.03, 0.06, '-y');
  for (let k = 0; k < 10; k++) { B.box(1.65, 1.06 + 0.05 * k, -0.27, 1.95, 1.072 + 0.05 * k, 0.03); }
  [[1.62, -0.30], [1.95, -0.30], [1.62, 0.03], [1.95, 0.03]].forEach((p) => { B.box(p[0], 1.03, p[1], p[0] + 0.03, 1.54, p[1] + 0.03); });
  B.box(1.62, 1.54, -0.30, 1.98, 1.57, 0.06, '-y');
  const AX = 2.20, AZ = 0.38;
  B.tube('y', [AX, 0, AZ], 1.00, 1.14, 0.09, 0.09, 20);
  B.disc('y', [AX, 0, AZ], 1.14, 0.09, 20, 1);
  B.box(1.75, 1.14, AZ - 0.035, AX + 0.035, 1.19, AZ + 0.035);
  B.tube('y', [1.78, 0, AZ], 1.19, 1.27, 0.06, 0.06, 16);
  B.disc('y', [1.78, 0, AZ], 1.27, 0.06, 16, 1);
  B.box(1.75, 1.27, 0.15, 1.81, 1.31, AZ + 0.06);
  B.box(1.76, 1.285, 0.0, 1.80, 1.30, 0.15);
}

function buildSkins(S) {
  const D = S.get('dark'), Wd = S.get('white');
  const dh = { u0: DOOR_X - 0.003, u1: DOOR_X + DOOR_W + 0.003, y0: DOOR_Y0 - 0.003, y1: DOOR_Y1 + 0.003 };
  const wh = { u0: WIN.x0, u1: WIN.x1, y0: WIN.y0, y1: WIN.y1 };
  const sh = { u0: SCREEN.x0, u1: SCREEN.x1, y0: SCREEN.y0, y1: SCREEN.y1 };
  const fl = (a, b, y0, y1) => [{ u0: a, u1: b, y0: y0, y1: y1, k: 'dark' }];
  [1, -1].forEach((s) => {
    wallFace(S, 'z', s * HZ, s, X_B, X_I, PL_H, H_ILL, { band: true, seams: [-2.0, -1.0], fills: fl(-2.45, -1.3, 2.08, 2.3) });
    wallFace(S, 'z', s * HZ, s, X_I, X_L, PL_H, H_LENS, { band: true, seams: [-1.0, 1.0], holes: [dh], fills: fl(-0.75, 0.75, 2.62, 2.8) });
    wallFace(S, 'z', s * (HZ - WT), -s, X_I, X_L, PL_H, CEIL_L, { base: 'dark', holes: [dh] });
    reveal(D, dh.u0, dh.u1, dh.y0, dh.y1, Math.min(s * HZ, s * (HZ - WT)), Math.max(s * HZ, s * (HZ - WT)));
    wallFace(S, 'z', s * HZ, s, X_L, X_F, PL_H, H_HAN, { band: true, seams: [1.0, 2.175, 2.75], holes: s > 0 ? [wh, sh] : [], fills: fl(1.2, 2.55, 2.08, 2.3) });
    wallFace(S, 'z', s * (HZ - WT), -s, X_L, LINER_X, PL_H, CEIL, { base: 'dark', holes: s > 0 ? [wh, sh] : [] });
    if (s > 0) {
      reveal(D, wh.u0, wh.u1, wh.y0, wh.y1, HZ - 0.02, HZ);
      reveal(D, wh.u0, wh.u1, wh.y0, wh.y1, HZ - WT, HZ - WT + 0.02);
    }
  });
  const dHole = { u0: -DUCT_W - 0.003, u1: DUCT_W + 0.003, y0: DUCT_Y - DUCT_W - 0.003, y1: DUCT_Y + DUCT_W + 0.003 };
  wallFace(S, 'x', X_B, -1, -HZ, HZ, PL_H, H_ILL, { holes: [dHole], fills: [{ u0: -0.32, u1: 0.32, y0: DUCT_Y - 0.32, y1: DUCT_Y + 0.32, k: 'dark' }] });
  revealX(D, dHole.u0, dHole.u1, dHole.y0, dHole.y1, X_B, X_B + 0.06);
  wallFace(S, 'x', X_I, -1, -HZ, HZ, H_ILL, H_LENS, {});
  faceX(D, X_I + 0.02, 1, { y0: PL_H, y1: CEIL_L, u0: -(HZ - WT), u1: HZ - WT });
  faceX(D, X_L - 0.02, -1, { y0: PL_H, y1: CEIL_L, u0: -(HZ - WT), u1: HZ - WT });
  faceX(D, X_L, 1, { y0: PL_H, y1: CEIL, u0: -(HZ - WT), u1: HZ - WT });
  faceX(Wd, X_L, 1, { y0: CEIL, y1: H_LENS, u0: -HZ, u1: HZ });
  faceX(D, LINER_X, -1, { y0: PL_H, y1: CEIL, u0: -(HZ - WT), u1: HZ - WT });
  wallFace(S, 'x', X_F, 1, -HZ, HZ, PL_H, H_HAN, { band: true, seams: [-1.0, 1.0], fills: fl(-0.95, 0.95, 0.45, 1.65) });
  roof(S, H_ILL, X_B, X_I, { seams: [-2.0], vents: [[-2.4, -1.3, 0.35, 1.3, 8], [-2.4, -1.3, -1.3, -0.35, 8]] });
  wallFace(S, 'y', H_LENS, 1, X_I, X_L, -HZ, HZ, { seams: [0], fills: [{ u0: -0.75, u1: 0.75, y0: 1.05, y1: 1.5, k: 'dark' }, { u0: -0.75, u1: 0.75, y0: -1.5, y1: -1.05, k: 'dark' }] });
  roof(S, H_HAN, X_L, X_F, { seams: [2.175], vents: [[1.2, 2.5, 0.4, 1.3, 7], [1.2, 2.5, -1.3, -0.4, 7]] });
  D.box(2.5, H_HAN, 1.35, 2.7, H_HAN + 0.03, 1.55, '-y');
  faceY(D, PL_H, -1, { y0: PL_Z, y1: HZ, u0: X_B, u1: X_F });
  faceY(D, PL_H, -1, { y0: -HZ, y1: -PL_Z, u0: X_B, u1: X_F });
  faceY(D, PL_H, -1, { y0: -PL_Z, y1: PL_Z, u0: X_B, u1: X_B + PL_I });
}

function buildDuct(S) {
  const St = S.get('steel'), c = [DUCT_X, 0, 0], R = DUCT_W, FR = 0.27, EH = 0.24;
  St.tube('y', c, 0, DUCT_Y - EH, R, R, 24);
  St.box(DUCT_X - EH, DUCT_Y - EH, -EH, DUCT_X + EH, DUCT_Y + EH, EH);
  St.tube('x', [0, DUCT_Y, 0], X_B, DUCT_X - EH, R, R, 24);
  St.disc('x', [0, DUCT_Y, 0], X_B, R, 24, -1);
  [0.55, 0.95, 1.55].forEach((y) => {
    St.tube('y', c, y, y + 0.06, FR, FR, 24);
    St.annulus('y', c, y, R, FR, 24, -1);
    St.annulus('y', c, y + 0.06, R, FR, 24, 1);
    studs(St, DUCT_X, 0, y + 0.06, 0.235, 8, 0.04, 0.03);
  });
  St.tube('y', c, PL_H, 0.28, 0.24, 0.24, 24);
  St.annulus('y', c, 0.28, R, 0.24, 24, 1);
  studs(St, DUCT_X, 0, 0.28, 0.22, 8, 0.03, 0.03);
}

function buildColumn(S) {
  const St = S.get('steel'), G = S.get('grey'), c = [0, 0, 0];
  St.tube('y', c, 1.05, 1.70, 0.32, 0.32, SEG_L);
  St.disc('y', c, 1.05, 0.32, SEG_L, -1);
  St.tube('y', c, 1.70, 1.80, 0.55, 0.55, SEG_L);
  St.annulus('y', c, 1.70, 0.32, 0.55, SEG_L, -1);
  St.annulus('y', c, 1.80, 0.42, 0.55, SEG_L, 1);
  studs(St, 0, 0, 1.80, 0.49, BOLTS, 0.05, 0.03);
  St.tube('y', c, 1.80, 2.50, 0.42, 0.42, SEG_L);
  [[1.20, 1.24], [1.35, 1.39], [1.50, 1.54]].forEach((r) => {
    St.tube('y', c, r[0], r[1], 0.36, 0.36, SEG_L);
    St.annulus('y', c, r[0], 0.32, 0.36, SEG_L, -1);
    St.annulus('y', c, r[1], 0.32, 0.36, SEG_L, 1);
  });
  [[2.05, 2.15], [2.30, 2.36]].forEach((r) => {
    G.tube('y', c, r[0], r[1], 0.47, 0.47, SEG_L);
    G.annulus('y', c, r[0], 0.42, 0.47, SEG_L, -1);
    G.annulus('y', c, r[1], 0.42, 0.47, SEG_L, 1);
  });
  St.box(-0.55, 2.50, -0.55, 0.55, 2.56, 0.55, '-y');
  [-0.3, 0.3].forEach((x) => { St.box(x - 0.03, 2.56, -0.5, x + 0.03, 2.62, 0.5, '-y'); });
}

function buildHood(S) {
  const D = S.get('dark'), c = [0, 0, 0];
  D.tube('y', c, 0.91, 1.05, 0.40, 0.40, SEG_L);
  D.tube('y', c, 0.91, 1.05, 0.20, 0.20, SEG_L, true);
  D.annulus('y', c, 0.91, 0.20, 0.40, SEG_L, -1);
  D.annulus('y', c, 1.05, 0.32, 0.40, SEG_L, 1);
}

function buildRetStage(S) {
  const D = S.get('dark'), G = S.get('grey'), St = S.get('steel');
  D.box(-0.45, 2.62, -0.25, 0.45, 2.68, 0.25, '-y');
  D.box(-0.30, 2.62, 0.25, 0.30, 2.70, 0.34, '-y');
  D.box(-0.30, 2.62, -0.34, 0.30, 2.70, -0.25, '-y');
  G.box(-0.30, 2.68, -0.15, 0.30, 2.72, 0.15, '-y');
  St.box(-0.20, 2.72, -0.15, 0.20, 2.735, 0.15, '-y');
  [[-0.20, -0.15], [0.17, -0.15], [-0.20, 0.12], [0.17, 0.12]].forEach((p) => { St.box(p[0], 2.735, p[1], p[0] + 0.03, 2.755, p[1] + 0.03, '-y'); });
  [-0.36, 0.36].forEach((x) => { St.box(x - 0.04, 2.68, -0.20, x + 0.04, 2.74, 0.20, '-y'); });
}

function buildWafStage(S) {
  const D = S.get('dark'), St = S.get('steel'), G = S.get('grey');
  D.box(-0.35, STAGE_Y, -0.35, 0.35, 0.86, 0.35, '-y');
  St.tube('y', [0, 0, 0], 0.86, 0.89, 0.15, 0.15, 48);
  St.disc('y', [0, 0, 0], 0.89, 0.15, 48, 1);
  St.box(0.35, 0.76, -0.30, 0.38, 0.86, 0.30);
  St.box(-0.30, 0.76, 0.35, 0.30, 0.86, 0.38);
  [-0.29, 0.23].forEach((z) => { G.box(-0.30, 0.86, z, 0.30, 0.90, z + 0.06, '-y'); });
}

function buildScreen(S) {
  S.get('screen').box(SCREEN.x0, SCREEN.y0, HZ - WT - 0.02, SCREEN.x1, SCREEN.y1, HZ);
}

function buildLod(S) {
  const e = LOD_E, W = S.get('white'), D = S.get('dark');
  const y0 = PL_H - e, z = HZ - e;
  D.box(X_B + PL_I + e, 0, -PL_Z + e, X_F - e, PL_H - e, PL_Z - e);
  bandBox(S, 'white', X_B + e, y0, -z, X_I, H_ILL - e, z, '-y+x');
  bandBox(S, 'white', X_I, y0, -z, X_L, H_LENS - e, z, '-y-x+x');
  faceX(W, X_I, -1, { y0: H_ILL - e, y1: H_LENS - e, u0: -z, u1: z });
  faceX(W, X_L, 1, { y0: H_HAN - e, y1: H_LENS - e, u0: -z, u1: z });
  bandBox(S, 'white', X_L, y0, -z, X_F - e, H_HAN - e, z, '-y-x+z');
  wallFace(S, 'z', z, 1, X_L, X_F - e, y0, H_HAN - e, { band: true, holes: [{ u0: WIN.x0, u1: WIN.x1, y0: WIN.y0, y1: WIN.y1 }] });
  reveal(D, WIN.x0, WIN.x1, WIN.y0, WIN.y1, z - 0.06, z);
  faceZ(D, z - 0.06, 1, { y0: WIN.y0, y1: WIN.y1, u0: WIN.x0, u1: WIN.x1 });
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
  const root = createRoot('duv-immersion-scanner');
  root.name = 'duv-immersion-scanner';
  [['plinth', buildPlinth], ['frame', buildFrame], ['laserDuct', buildDuct], ['lensColumn', buildColumn],
   ['immersionHood', buildHood], ['statusScreen', buildScreen]].forEach((p) => {
    const S = newSet(); p[1](S); flushPart(S, M, p[0], root);
  });
  buildSkinsPart(M, root);
  const rs = newSet(); buildRetStage(rs); flushAt(rs, M, 'reticleStage', root, [0, 0, 0]);
  const ws = newSet(); buildWafStage(ws); flushAt(ws, M, 'waferStage', root, [0, 0, 0]);
  const lod = newSet(); buildLod(lod);
  flushPart(lod, M, 'lod1', root);
  named('trackInterface', root, [X_F, 0, 0]);
  named('signalTowerMount', root, [2.6, 2.4, 1.45]);
  return applyFoundryStandardLod(root);
}

function animate(root) {
  const DUR = 3, N = 12;
  const swing = (rev) => [rotationTrack('serviceDoorA', doorKeys(1, rev, DUR, DOOR_MAX, N), 'LINEAR'), rotationTrack('serviceDoorB', doorKeys(-1, rev, DUR, DOOR_MAX, N), 'LINEAR')];
  const K = [[0, 0, 0], [0.5, -0.1, -0.1], [1.5, -0.1, 0.1], [2.0, 0.1, 0.1], [3.0, 0.1, -0.1], [4.0, 0, 0]];
  return [
    createClip('ServiceOpen', DUR, swing(false)),
    createClip('ServiceClose', DUR, swing(true)),
    createClip('Expose', 4, [
      positionTrack('waferStage', K.map((k) => ({ time: k[0], position: [k[1], 0, k[2]] })), 'LINEAR'),
      positionTrack('reticleStage', K.map((k) => ({ time: k[0], position: [0, 0, -k[2]] })), 'LINEAR'),
    ]),
  ];
}
