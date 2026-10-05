const meta = { name: 'coater-developer-track' };

// ---------------- layout constants (metres; +X front, +Y up, +Z right) ----------------
const HW = 1.6;                                  // half width (Z)
const X_FRONT = 4.0, X_EFEM_BACK = 2.9, X_PROC_BACK = -3.3, X_BACK = -4.0;
const H_BODY = 2.3, H_IFACE = 2.4, H_TOP = 2.6;  // efem/process roof, interface roof, fan filter and duct tops
const PL_H = 0.10, PL_IN = 0.03;                 // plinth height and inset from the skin
const B0 = 1.9, B1 = 2.0;                        // family stripe band
const WT = 0.08;                                 // side wall thickness of the process block
const SILL = 0.9, HEAD = 2.1;                    // window sill and head
const WIN_X = [-2.45, -0.95, 0.55, 2.05], WIN_W = 1.2;
const CORR = 0.45;                               // half width of the robot corridor
const LP_Z = [-0.7575, -0.2525, 0.2525, 0.7575]; // load-port mounts, 0.505 pitch
const ROBOT_X0 = 2.5, ROBOT_X1 = -2.5;           // robot travel
const MOD_TOP = 0.95;                            // top of the coater / bake module bases
const CUP_SEG = 20, PLATE_SEG = 16, DUCT_SEG = 24;
const LOD_E = 0.002;                             // lod1 sits this far inside the detailed skins
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
  return { quad, box, tube, disc, annulus, count, geo };
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

function addCup(S, cx, y0, cz, R, H, Rin, D, seg) {
  const c = [cx, 0, cz];
  S.get('steel').tube('y', c, y0, y0 + H, R, R, seg, false);
  S.get('steel').annulus('y', c, y0 + H, Rin, R, seg, 1);
  S.get('dark').tube('y', c, y0 + H - D, y0 + H, Rin, Rin, seg, true);
  S.get('dark').disc('y', c, y0 + H - D, Rin, seg, 1);
}

function addPlate(S, cx, y0, cz, R, T, seg) {
  const c = [cx, 0, cz];
  S.get('steel').tube('y', c, y0, y0 + T, R, R, seg, false);
  S.get('steel').disc('y', c, y0 + T, R, seg, 1);
  S.get('steel').disc('y', c, y0, R, seg, -1);
}

function addDuct(S, cx, cz, seg) {
  const c = [cx, 0, cz];
  S.get('steel').tube('y', c, H_BODY, H_BODY + 0.05, 0.33, 0.33, seg, false);
  S.get('steel').annulus('y', c, H_BODY + 0.05, 0.26, 0.33, seg, 1);
  S.get('steel').tube('y', c, H_BODY + 0.05, H_TOP, 0.26, 0.26, seg, false);
  S.get('steel').annulus('y', c, H_TOP, 0.21, 0.26, seg, 1);
  S.get('dark').tube('y', c, H_TOP - 0.12, H_TOP, 0.21, 0.21, seg, true);
  S.get('dark').disc('y', c, H_TOP - 0.12, 0.21, seg, 1);
}

// ---------------- parts ----------------
function buildEfem(S) {
  // main body: front face is tiled below, bottom sits on the toe-kick
  bandBox(S, 'white', X_EFEM_BACK, PL_H, -HW, X_FRONT, H_BODY, HW, '+x-y+z-z');
  const vent = { y0: 0.30, y1: 0.85, u0: 3.05, u1: 3.85 };
  const sideHoles = [{ y0: B0, y1: B1, u0: X_EFEM_BACK, u1: X_FRONT }, vent];
  [1, -1].forEach((s) => {
    const zb = s * (HW - 0.02), zo = s * HW, zs = s * (HW - 0.004);
    tileRect(PL_H, H_BODY, X_EFEM_BACK, X_FRONT, sideHoles).forEach((r) => faceZ(S.get('white'), zo, s, r));
    faceZ(S.get('teal'), zo, s, { y0: B0, y1: B1, u0: X_EFEM_BACK, u1: X_FRONT });
    faceZ(S.get('dark'), zb, s, vent);
    S.get('dark').quad([vent.u0, vent.y0, zb], [vent.u1, vent.y0, zb], [vent.u1, vent.y0, zo], [vent.u0, vent.y0, zo], [0, 1, 0]);
    S.get('dark').quad([vent.u0, vent.y1, zb], [vent.u1, vent.y1, zb], [vent.u1, vent.y1, zo], [vent.u0, vent.y1, zo], [0, -1, 0]);
    S.get('dark').quad([vent.u0, vent.y0, zb], [vent.u0, vent.y1, zb], [vent.u0, vent.y1, zo], [vent.u0, vent.y0, zo], [1, 0, 0]);
    S.get('dark').quad([vent.u1, vent.y0, zb], [vent.u1, vent.y1, zb], [vent.u1, vent.y1, zo], [vent.u1, vent.y0, zo], [-1, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const y = 0.32 + i * 0.09;
      S.get('grey').box(3.07, y, Math.min(zb, zs), 3.83, y + 0.03, Math.max(zb, zs), s > 0 ? '-z' : '+z');
    }
  });
  const holes = [{ y0: B0, y1: B1, u0: -HW, u1: HW }];
  LP_Z.forEach((z) => { holes.push({ y0: 0.75, y1: 1.30, u0: z - 0.19, u1: z + 0.19 }); });
  holes.push({ y0: 1.30, y1: 1.80, u0: 1.15, u1: 1.50 });          // status screen opening (filled by statusScreen)
  tileRect(PL_H, H_BODY, -HW, HW, holes).forEach((r) => faceX(S.get('white'), X_FRONT, 1, r));
  faceX(S.get('teal'), X_FRONT, 1, { y0: B0, y1: B1, u0: -HW, u1: HW });
  LP_Z.forEach((z) => faceX(S.get('dark'), X_FRONT, 1, { y0: 0.75, y1: 1.30, u0: z - 0.19, u1: z + 0.19 }));
  // toe-kick
  S.get('dark').box(X_EFEM_BACK, 0, -(HW - PL_IN), X_FRONT - PL_IN, PL_H, HW - PL_IN, '-x');
  // mini fan filter (full-width housing so the signal tower mount sits on it)
  S.get('grey').box(2.98, H_BODY, -1.5, 3.92, H_TOP, 1.5, '-y+x');
  const grille = { y0: 2.37, y1: 2.53, u0: -1.32, u1: 1.32 };
  tileRect(H_BODY, H_TOP, -1.5, 1.5, [grille]).forEach((r) => faceX(S.get('grey'), 3.92, 1, r));
  faceX(S.get('dark'), 3.92, 1, grille);
}

function buildProcessBlock(S) {
  const winL = WIN_X.map((c) => c - WIN_W / 2), winR = WIN_X.map((c) => c + WIN_W / 2);
  const pil = [[X_PROC_BACK, winL[0]]];
  for (let i = 0; i < 3; i++) pil.push([winR[i], winL[i + 1]]);
  pil.push([winR[3], X_EFEM_BACK]);
  // plinth doubles as the interior floor
  S.get('dark').box(X_PROC_BACK, 0, -(HW - PL_IN), X_EFEM_BACK, PL_H, HW - PL_IN, '-x+x');
  [1, -1].forEach((s) => {
    const zi = s * (HW - WT), zo = s * HW, za = Math.min(zi, zo), zb = Math.max(zi, zo);
    const seams = [X_PROC_BACK, -1.7, -0.2, 1.3, X_EFEM_BACK];
    for (let i = 0; i < 4; i++) {
      const x0 = seams[i] + (i > 0 ? 0.005 : 0), x1 = seams[i + 1] - (i < 3 ? 0.005 : 0);
      const dsk = '-y' + (i === 0 ? '-x' : '') + (i === 3 ? '+x' : '') + (s > 0 ? '+z' : '-z');
      S.get('white').box(x0, PL_H, za, x1, SILL, zb, dsk);
      const hx = (i % 2 === 0) ? x1 - 0.09 : x0 + 0.09;
      const hole = { y0: 0.42, y1: 0.66, u0: hx - 0.015, u1: hx + 0.015 };
      tileRect(PL_H, SILL, x0, x1, [hole]).forEach((r) => faceZ(S.get('white'), zo, s, r));
      faceZ(S.get('dark'), zo, s, hole);
    }
    seams.slice(1, 4).forEach((c) => faceZ(S.get('dark'), zo - s * 0.004, s, { y0: PL_H, y1: SILL, u0: c - 0.005, u1: c + 0.005 }));            // lower plate
    pil.forEach((p) => {
      const sk = '-y+y' + (p[0] === X_PROC_BACK ? '-x' : '') + (p[1] === X_EFEM_BACK ? '+x' : '');
      bandBox(S, 'white', p[0], SILL, za, p[1], HEAD, zb, sk);                              // pillars
    });
    for (let i = 0; i < 4; i++) S.get('teal').box(winL[i], B0, za, winR[i], B1, zb, '-x+x'); // stripe rail across each opening
  });
  // roof
  S.get('white').box(X_PROC_BACK, HEAD, -HW, X_EFEM_BACK, H_BODY, HW, '-x+x');
  // interior: module bases, tier-2 shelf, posts, robot rails
  S.get('grey').box(X_PROC_BACK + 0.05, PL_H, -1.44, X_EFEM_BACK - 0.05, MOD_TOP, -CORR, '-y');
  S.get('grey').box(X_PROC_BACK + 0.05, PL_H, CORR, X_EFEM_BACK - 0.05, MOD_TOP, 1.44, '-y');
  S.get('grey').box(-3.2, 1.45, -1.44, 2.8, 1.50, -CORR, '');
  [-3.175, -1.7, -0.2, 1.3, 2.775].forEach((x) => {
    [-1.40, -0.50].forEach((z) => S.get('dark').box(x - 0.025, MOD_TOP, z - 0.025, x + 0.025, 1.45, z + 0.025, '-y+y'));
  });
  [-0.20, 0.20].forEach((z) => S.get('dark').box(-2.9, PL_H, z - 0.03, 2.9, PL_H + 0.03, z + 0.03, '-y+x'));
}

function buildWindows(S) {
  [1, -1].forEach((s) => {
    const za = s > 0 ? HW - WT - 0.055 : -(HW - WT - 0.015), zb = s > 0 ? HW - WT - 0.015 : -(HW - WT - 0.055);
    WIN_X.forEach((c) => S.get('glass').box(c - WIN_W / 2 - 0.03, SILL - 0.03, za, c + WIN_W / 2 + 0.03, HEAD + 0.03, zb, ''));
  });
}

function buildCups(S) {
  WIN_X.forEach((x) => {
    addCup(S, x, MOD_TOP, -0.95, 0.25, 0.30, 0.19, 0.22, CUP_SEG);
    addCup(S, x, 1.50, -0.95, 0.25, 0.30, 0.19, 0.22, CUP_SEG);
  });
}

function buildBakes(S) {
  WIN_X.forEach((x) => {
    for (let i = 0; i < 6; i++) addPlate(S, x, 0.98 + i * 0.13, 0.95, 0.30, 0.035, PLATE_SEG);
    S.get('dark').tube('y', [x, 0, 0.95], MOD_TOP, 0.98 + 5 * 0.13 + 0.035, 0.045, 0.045, 8, false);
  });
}

function buildRobot(S) {
  S.get('dark').box(-0.30, 0.13, -0.30, 0.30, 0.25, 0.30, '-y');
  S.get('grey').box(-0.24, 0.25, -0.24, 0.24, 0.72, 0.24, '-y+y');
  S.get('steel').tube('y', [0, 0, 0], 0.72, 1.52, 0.12, 0.12, 12, false);
  S.get('white').box(-0.17, 1.52, -0.17, 0.17, 1.70, 0.17, '-y');
  S.get('grey').box(-0.09, 1.70, -0.06, 0.09, 1.78, 0.34, '-y');
  S.get('grey').box(-0.09, 1.78, -0.34, 0.09, 1.86, 0.06, '-y');
  S.get('steel').box(-0.05, 1.86, -0.34, 0.05, 1.89, -0.02, '-y');
  S.get('steel').box(-0.05, 1.86, 0.02, 0.05, 1.89, 0.34, '-y');
}

function buildInterface(S) {
  bandBox(S, 'white', X_BACK, PL_H, -HW, X_PROC_BACK, H_IFACE, HW, '-x-y');
  const holes = [{ y0: B0, y1: B1, u0: -HW, u1: HW }, { y0: 0.35, y1: 1.80, u0: -0.9, u1: 0.9 }];
  tileRect(PL_H, H_IFACE, -HW, HW, holes).forEach((r) => faceX(S.get('white'), X_BACK, -1, r));
  faceX(S.get('teal'), X_BACK, -1, { y0: B0, y1: B1, u0: -HW, u1: HW });
  faceX(S.get('grey'), X_BACK, -1, { y0: 0.35, y1: 1.80, u0: -0.9, u1: 0.9 });
  S.get('dark').box(X_BACK, 0, -(HW - PL_IN), X_PROC_BACK, PL_H, HW - PL_IN, '+x');
}

function buildLod(S) {
  const e = LOD_E, zh = HW - e, xf = X_FRONT - e, xb = X_BACK + e, xm = X_PROC_BACK + e;
  S.get('dark').box(xb, 0, -(HW - PL_IN - e), X_FRONT - PL_IN - e, PL_H, HW - PL_IN - e, '');
  // main mass (efem + process block) with tiled sides: stripe and dark window band
  bandBox(S, 'white', xm, PL_H, -zh, xf, H_BODY - e, zh, '+z-z-y');
  const holes = [{ y0: B0, y1: B1, u0: xm, u1: xf }, { y0: SILL, y1: B0, u0: -3.05, u1: 2.65 }, { y0: B1, y1: HEAD, u0: -3.05, u1: 2.65 }];
  [1, -1].forEach((s) => {
    tileRect(PL_H, H_BODY - e, xm, xf, holes).forEach((r) => faceZ(S.get('white'), s * zh, s, r));
    faceZ(S.get('teal'), s * zh, s, { y0: B0, y1: B1, u0: xm, u1: xf });
    faceZ(S.get('dark'), s * zh, s, { y0: SILL, y1: B0, u0: -3.05, u1: 2.65 });
    faceZ(S.get('dark'), s * zh, s, { y0: B1, y1: HEAD, u0: -3.05, u1: 2.65 });
  });
  S.get('grey').box(2.98 + e, H_BODY - e, -1.5 + e, 3.92 - e, H_TOP - e, 1.5 - e, '-y');
  bandBox(S, 'white', xb, PL_H, -zh, xm, H_IFACE - e, zh, '-y');
  [[1.0, -0.8], [-1.4, 0.8]].forEach((d) => {
    S.get('steel').tube('y', [d[0], 0, d[1]], H_BODY - e, H_TOP - e, 0.255, 0.255, 8, false);
    S.get('steel').disc('y', [d[0], 0, d[1]], H_TOP - e, 0.255, 8, 1);
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
  const root = createRoot('coater-developer-track');
  root.name = 'coater-developer-track';

  const parts = [
    ['efem', buildEfem], ['processBlock', buildProcessBlock], ['windows', buildWindows], ['coaterCups', buildCups],
    ['bakeStacks', buildBakes], ['interfaceBlock', buildInterface],
  ];
  parts.forEach((p) => { const S = newSet(); p[1](S); flushPart(S, M, p[0], root); });

  const ducts = newSet();
  addDuct(ducts, 1.0, -0.8, DUCT_SEG);
  addDuct(ducts, -1.4, 0.8, DUCT_SEG);
  flushPart(ducts, M, 'roofDucts', root);

  const scr = newSet();
  scr.get('screen').box(X_FRONT - 0.01, 1.30, 1.15, X_FRONT, 1.80, 1.50, '');
  flushPart(scr, M, 'statusScreen', root);

  const rob = named('centralRobot', root, [ROBOT_X0, 0, 0]);
  const rs = newSet(); buildRobot(rs);
  rs.keys().forEach((k) => { const p = createPart('centralRobot_' + k, rs.map[k].geo(), M[k], { parent: rob }); p.name = 'centralRobot_' + k; });

  const lod = newSet(); buildLod(lod);
  flushPart(lod, M, 'lod1', root);

  named('lp1', root, [X_FRONT, 0, LP_Z[0]]);
  named('lp2', root, [X_FRONT, 0, LP_Z[1]]);
  named('lp3', root, [X_FRONT, 0, LP_Z[2]]);
  named('lp4', root, [X_FRONT, 0, LP_Z[3]]);
  named('scannerInterface', root, [X_BACK, 0, 0]);
  named('signalTowerMount', root, [3.8, H_TOP, 1.45]);
  return applyFoundryStandardLod(root);
}

function animate(root) {
  return [
    createClip('RobotShuttle', 4, [
      positionTrack('centralRobot', [
        { time: 0, position: [ROBOT_X0, 0, 0] },
        { time: 1.8, position: [ROBOT_X1, 0, 0] },
        { time: 2.0, position: [ROBOT_X1, 0, 0] },
        { time: 3.8, position: [ROBOT_X0, 0, 0] },
        { time: 4.0, position: [ROBOT_X0, 0, 0] },
      ], 'LINEAR'),
    ]),
  ];
}
