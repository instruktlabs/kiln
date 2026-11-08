// Heavy walking mech, ~6 m. Metres, +X forward, +Y up, +Z right. L = -Z, R = +Z.
// Every joint rests at identity rotation with asset-aligned axes, so a hinge is
// simply node.rotation.z (positive tips +X up to +Y; a hanging limb swings forward).
const meta = { name: 'Heavy Walker Mech', role: 'vehicle' };

const SK = {
  hip: [0, 3.42], knee: [0.70, 2.17], ankle: [-0.60, 1.12], toe: [0, 0.22],
  tipX: 0.95, toeH: 0.22, legZ: 0.86,
  waistY: 3.86,
  shoulder: [0.02, 5.00], elbow: [-0.12, 4.00], armZ: 1.60,
  cannon: [1.00, 4.00], wrist: [0.95, 4.00],
};

const WALK = { T: 2.4, keys: 120, duty: 0.64, stanceLen: 1.72, lift: 0.46, xC: 0.95, height: 3.34, bob: 0.055, sway: 0.11, surge: 0.03 };
WALK.stride = WALK.stanceLen / WALK.duty;
WALK.speed = WALK.stride / WALK.T;

const D2R = Math.PI / 180;
const TILE = 2.2;
const RAIL_SEED = 41077, SEED_AFTER_WRIST = 3018216793;

// ---------------------------------------------------------------- vectors
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vLen = (a) => Math.hypot(a[0], a[1], a[2]);
const vUnit = (a) => { const l = vLen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const vPerp = (d) => { const a = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; return vUnit(vCross(a, d)); };

// ---------------------------------------------------------------- colour (linear)
const lin = (hex) => {
  const f = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
};
const tone = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const PAINT = lin(0x87886f), PAINT2 = lin(0x6e715d), DARK = lin(0x4b4e4f), GUN = lin(0x404447), BONE = lin(0xcdc6ad), RUST = lin(0xa84a2c), PISTON = lin(0x6f7376), SUN = lin(0xaeac96);
// Gunmetal for machinery, and the wear palette
const GM = lin(0x7a8089), GM_D = lin(0x43474c), GM_L = lin(0xa4abb3), GM_H = lin(0xc9ced3), HEAT_A = lin(0x515c78), BARE = lin(0xa2a6ab), COPPER = lin(0x5a3019);
const BATCH_A = lin(0x7c8a62), BATCH_B = lin(0x90866a), DUST_D = lin(0x7a6c56), DUST_L = lin(0x8d7f68), OIL = lin(0x0d0b09), RUST_D = lin(0x74401f), GRIME = lin(0x15110d), SOOT = lin(0x0b0b0c);
// Wear atlas rows in texture V (see makeTextures), and the steel map's polished band
const CHIP_V = 0.195, CHIP_DEPTH = 0.135, GRIME_V0 = 0.25, GRIME_MID = 0.3125, GRIME_END = 0.375, RUN_V0 = 0.376, RUN_V1 = 0.874, DUST_V0 = 0.876, POLISH_V = 0.04, STEEL_V = 0.13;
const HAZ_Y = lin(0xe8ae1c), HAZ_K = lin(0x1a1b1d), SEAM = lin(0x0a0b0c), WEAR = lin(0xe6e3d4), STEEL = lin(0xbcc1c5), STEEL_D = lin(0x7f8387);
const RUB = lin(0x1c1d1f), CAB_R = lin(0xa8361f), CAB_Y = lin(0xc99a1e), CAB_K = lin(0x202225), CAB_B = lin(0x2d4f63), SUIT = lin(0x8f4f22), WHITE = [1, 1, 1];

// ---------------------------------------------------------------- walk solve
function pchipPeriodic(keys) {
  const n = keys.length, xs = keys.map((k) => k[0]), ys = keys.map((k) => k[1]);
  const h = (i) => (i + 1 < n ? xs[i + 1] : xs[0] + 1) - xs[i];
  const sl = (i) => (ys[(i + 1) % n] - ys[i]) / h(i);
  const m = xs.map((_, i) => {
    const p = (i + n - 1) % n, s0 = sl(p), s1 = sl(i);
    if (s0 * s1 <= 0) return 0;
    const h0 = h(p), h1 = h(i), w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
    return (w1 + w2) / (w1 / s0 + w2 / s1);
  });
  return (fIn) => {
    const f = fIn - Math.floor(fIn);
    let i = n - 1;
    for (let j = 0; j < n; j++) if (xs[j] <= f) i = j;
    const hh = h(i), fx = f < xs[i] ? f + 1 : f, t = (fx - xs[i]) / hh, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m[i] * hh + (-2 * t3 + 3 * t2) * ys[(i + 1) % n] + (t3 - t2) * m[(i + 1) % n] * hh;
  };
}
const b0 = WALK.duty;
const swingF = (s) => b0 + (1 - b0) * s;
// Foot pitch never goes positive: the toes stay lowest and set down first, then the sole rolls flat.
const PSI = pchipPeriodic([[0, 0], [0.50, 0], [b0, -24], [swingF(0.22), -27], [swingF(0.5), -13], [swingF(0.78), -4], [swingF(0.93), -0.8]]);
const GAMMA = pchipPeriodic([[0, 50], [0.32, 34], [0.50, 23], [b0, 22], [swingF(0.38), 50], [swingF(0.72), 57]]);

function footState(f) {
  const xf = WALK.xC + WALK.stanceLen / 2, S = WALK.stride;
  let cx, cy = 0;
  if (f < b0) cx = xf - S * f;
  else {
    const s = (f - b0) / (1 - b0), x0 = xf - WALK.stanceLen, x1 = xf, m = -S * (1 - b0), s2 = s * s, s3 = s2 * s;
    cx = (2 * s3 - 3 * s2 + 1) * x0 + (s3 - 2 * s2 + s) * m + (-2 * s3 + 3 * s2) * x1 + (s3 - s2) * m;
    // Zero height velocity at both ends with finite curvature; the peak falls early in the swing.
    const b = Math.sin(Math.PI * s * (1.35 - 0.35 * s));
    cy = WALK.lift * b * b;
  }
  return { cx, cy, psi: PSI(f) * D2R };
}

const wrapA = (a) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
const bone2 = (a, b) => [b[0] - a[0], b[1] - a[1]];
const BT = bone2(SK.hip, SK.knee), BS = bone2(SK.knee, SK.ankle), BM = bone2(SK.ankle, SK.toe);
const LT = Math.hypot(BT[0], BT[1]), LS = Math.hypot(BS[0], BS[1]), LM = Math.hypot(BM[0], BM[1]);
const AT0 = Math.atan2(BT[1], BT[0]), AS0 = Math.atan2(BS[1], BS[0]), AM0 = Math.atan2(BM[1], BM[0]);

function eulerQ(xDeg, yDeg, zDeg) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(xDeg * D2R, yDeg * D2R, zDeg * D2R, 'YXZ'));
}
const qx = (r) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), r);
const qz = (r) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r);

function solveLeg(sgn, f, pelvisPos, qP) {
  const foot = footState(f);
  const cp = Math.cos(foot.psi), sp = Math.sin(foot.psi);
  const px = foot.cx + (-SK.tipX * cp - SK.toeH * sp);
  const py = foot.cy + (-SK.tipX * sp + SK.toeH * cp);
  const pz = sgn * SK.legZ;
  const hipOff = new THREE.Vector3(0, 0, sgn * SK.legZ).applyQuaternion(qP);
  const dx = px - (pelvisPos[0] + hipOff.x), dy = py - (pelvisPos[1] + hipOff.y), dz = pz - (pelvisPos[2] + hipOff.z);
  const y2 = -Math.hypot(dy, dz);
  const rho = Math.atan2(dz / y2, dy / y2);
  const g = GAMMA(f) * D2R;
  const ax = dx - LM * Math.sin(g), ay = y2 + LM * Math.cos(g);
  const d = Math.min(Math.hypot(ax, ay), (LT + LS) * 0.995);
  const a = Math.acos(Math.max(-1, Math.min(1, (LT * LT + d * d - LS * LS) / (2 * LT * d))));
  const aT = Math.atan2(ay, ax) + a;
  const kx = LT * Math.cos(aT), ky = LT * Math.sin(aT);
  const aS = Math.atan2(ay - ky, ax - kx);
  const aM = Math.atan2(-Math.cos(g), Math.sin(g));
  const tH = wrapA(aT - AT0), tS = wrapA(aS - AS0), tM = wrapA(aM - AM0);
  const qHip = qP.clone().invert().multiply(qx(rho)).multiply(qz(tH));
  const qToe = qx(rho).multiply(qz(tM)).invert().multiply(qz(foot.psi));
  return { hip: qHip, knee: qz(wrapA(tS - tH)), ankle: qz(wrapA(tM - tS)), toe: qToe };
}

function walkPose(phi) {
  const tau = 2 * Math.PI, c1 = (a) => Math.cos(tau * (phi - a)), c2 = (a) => Math.cos(2 * tau * (phi - a));
  const pelvisPos = [WALK.surge * c2(0.20), WALK.height + WALK.bob * c2(0.34), -WALK.sway * c1(0.34)];
  const qP = eulerQ(-2.6 * c1(0.30), -5.5 * c1(0), -2.0 + 0.5 * c2(0.25));
  const fL = phi % 1, fR = (phi + 0.5) % 1;
  const shL = -8 * c1(0.04), shR = 6.5 * c1(0.04);
  return {
    pelvisPos, pelvisQ: qP,
    L: solveLeg(-1, fL, pelvisPos, qP), R: solveLeg(1, fR, pelvisPos, qP),
    waist: eulerQ(-1.9 * c1(0.38), 12.5 * c1(0.04), 2.0 + 0.4 * c2(0.30)),
    shoulderL: qz(shL * D2R), shoulderR: qz(shR * D2R),
    elbowL: qz(0.55 * 8 * c1(0.12) * D2R), elbowR: qz(-0.55 * 6.5 * c1(0.12) * D2R),
    pod: qz(1.1 * c2(0.42) * D2R),
  };
}

function rigNodes(root) {
  const n = (s) => root.getObjectByName('Joint_' + s);
  const o = { pelvis: n('Pelvis'), waist: n('Waist'), pod: n('MissilePod'), shoulderL: n('Shoulder_L'), shoulderR: n('Shoulder_R'), elbowL: n('Elbow_L'), elbowR: n('Elbow_R') };
  for (const s of ['L', 'R']) o[s] = { hip: n('Hip_' + s), knee: n('Knee_' + s), ankle: n('Ankle_' + s), toe: n('Toe_' + s) };
  return o;
}
function applyPose(N, p) {
  N.pelvis.position.set(p.pelvisPos[0], p.pelvisPos[1], p.pelvisPos[2]);
  N.pelvis.quaternion.copy(p.pelvisQ);
  N.waist.quaternion.copy(p.waist);
  N.pod.quaternion.copy(p.pod);
  N.shoulderL.quaternion.copy(p.shoulderL); N.shoulderR.quaternion.copy(p.shoulderR);
  N.elbowL.quaternion.copy(p.elbowL); N.elbowR.quaternion.copy(p.elbowR);
  for (const s of ['L', 'R']) for (const j of ['hip', 'knee', 'ankle', 'toe']) N[s][j].quaternion.copy(p[s][j]);
}
function rigList(N) {
  const out = [N.pelvis, N.waist, N.pod, N.shoulderL, N.shoulderR, N.elbowL, N.elbowR];
  for (const s of ['L', 'R']) for (const j of ['hip', 'knee', 'ankle', 'toe']) out.push(N[s][j]);
  return out;
}

// ---------------------------------------------------------------- mesh kit
function newell(P) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return vUnit([x, y, z]);
}
function centroid(P) { let c = [0, 0, 0]; for (const p of P) c = vAdd(c, p); return vMul(c, 1 / P.length); }
function triangulate(P, n) {
  const m = P.length;
  if (m === 3) return [[0, 1, 2]];
  let convex = true;
  for (let i = 0; i < m; i++) {
    const a = P[i], b = P[(i + 1) % m], c = P[(i + 2) % m];
    if (vDot(vCross(vSub(b, a), vSub(c, b)), n) < -1e-7) { convex = false; break; }
  }
  const out = [];
  if (convex) { for (let i = 1; i < m - 1; i++) out.push([0, i, i + 1]); return out; }
  const e1 = vUnit(vSub(P[1], P[0])), e2 = vCross(n, e1);
  const contour = P.map((p) => new THREE.Vector2(vDot(vSub(p, P[0]), e1), vDot(vSub(p, P[0]), e2)));
  for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const tn = vCross(vSub(P[t[1]], P[t[0]]), vSub(P[t[2]], P[t[0]]));
    out.push(vDot(tn, n) >= 0 ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]]);
  }
  return out;
}
function insetPoly(P, n, d) {
  const m = P.length, out = [];
  for (let i = 0; i < m; i++) {
    const p = P[i], a = P[(i + m - 1) % m], b = P[(i + 1) % m];
    const n1 = vCross(n, vUnit(vSub(p, a))), n2 = vCross(n, vUnit(vSub(b, p)));
    const mt = vUnit(vAdd(n1, n2)), den = Math.max(0.35, vDot(mt, n1));
    out.push(vAdd(p, vMul(mt, d / den)));
  }
  return out;
}

function createKit(root, MAT, COLORED, TEXTURED) {
  let G = null, matKey = 'armour', F = null, mir = 1, hullC = null, seed = 90125;
  const groups = [], pistons = [];
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const T = (p) => {
    let x = p[0], y = p[1], z = p[2];
    if (F) {
      const X = F.o[0] + F.u[0] * x + F.v[0] * y + F.w[0] * z;
      const Y = F.o[1] + F.u[1] * x + F.v[1] * y + F.w[1] * z;
      const Z = F.o[2] + F.u[2] * x + F.v[2] * y + F.w[2] * z;
      x = X; y = Y; z = Z;
    }
    return [x, y, mir < 0 ? -z : z];
  };
  const TN = (n) => {
    let x = n[0], y = n[1], z = n[2];
    if (F) {
      const X = F.u[0] * x + F.v[0] * y + F.w[0] * z, Y = F.u[1] * x + F.v[1] * y + F.w[1] * z, Z = F.u[2] * x + F.v[2] * y + F.w[2] * z;
      x = X; y = Y; z = Z;
    }
    return [x, y, mir < 0 ? -z : z];
  };
  const bucket = (key) => {
    const k = key || matKey;
    if (!G.b[k]) G.b[k] = { key: k, pos: [], nor: [], uv: [], col: [], idx: [] };
    return G.b[k];
  };
  const q8 = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
  // Colour grade by rest-pose height and facing: undersides sink into shadow, and everything below the
  // thigh goes progressively darker and dustier so the lower legs read as the dirtiest part of the machine.
  const addV = (b, a, n, c, u, v, al = 1) => {
    b.pos.push(a[0], a[1], a[2]); b.nor.push(n[0], n[1], n[2]); b.uv.push(u, v);
    let r = c[0], gr = c[1], bl = c[2];
    if (b.key !== 'decal') {
      // Sun bleaches paint on anything facing up.
      if (b.key === 'armour' && n[1] > 0.25) { const s = (n[1] - 0.25) * 0.34; r += (SUN[0] - r) * s; gr += (SUN[1] - gr) * s; bl += (SUN[2] - bl) * s; }
      if (b.key === 'armour' || b.key === 'steel') { const ao = 0.66 + 0.34 * (n[1] * 0.5 + 0.5); r *= ao; gr *= ao; bl *= ao; }
      if (a[1] < 2.6) {
        const rub = b.key === 'rubber', t = 1 - a[1] / 2.6, dark = 1 - (rub ? 0.08 : 0.44) * t, mix = (rub ? 0.14 : 0.58) * t * t;
        r = r * dark * (1 - mix) + DUST_D[0] * mix; gr = gr * dark * (1 - mix) + DUST_D[1] * mix; bl = bl * dark * (1 - mix) + DUST_D[2] * mix;
      }
    }
    b.col.push(q8(r), q8(gr), q8(bl), q8(al));
  };
  const tri = (b, i, j, k) => { if (mir < 0) b.idx.push(i, k, j); else b.idx.push(i, j, k); };
  const QUAD = [[0, 1, 2], [0, 2, 3]];
  const faceBasis = (n) => {
    let e2 = vSub([0, 1, 0], vMul(n, n[1]));
    if (vLen(e2) < 0.25) e2 = vSub([1, 0, 0], vMul(n, n[0]));
    e2 = vUnit(e2);
    return [vCross(e2, n), e2];
  };
  // Each chart sits somewhere inside the unit square so UVs can be stored as 16-bit. Steel keeps the
  // top of its map clear: that band is the polished finish for machined chamfers and bolt heads.
  const chartFit = (vals) => {
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo, k = span > 1 ? 1 / span : 1, off = span < 1 ? rnd() * (1 - span) : 0;
    return (x) => (x - lo) * k + off;
  };
  const emit = (pts, n, cols, tris, key, polish) => {
    const b = bucket(key), base = b.pos.length / 3, an = TN(n), [e1, e2] = faceBasis(an);
    const abs = pts.map(T), us = abs.map((a) => vDot(a, e1) / TILE), vs = abs.map((a) => vDot(a, e2) / TILE);
    const fu = chartFit(us), fv = chartFit(vs);
    abs.forEach((a, i) => {
      const c = Array.isArray(cols[0]) ? cols[i] : cols;
      let v = fv(vs[i]);
      if (b.key === 'steel') v = polish ? POLISH_V : STEEL_V + v * (1 - STEEL_V);
      addV(b, a, an, c, fu(us[i]), v);
    });
    for (const t of tris) tri(b, base + t[0], base + t[1], base + t[2]);
  };
  // Alpha-blended overlay from the wear atlas; keeps authored UVs and uses vertex alpha for soft fades.
  const decal = (pts, n, uvs, cols, alphas, tris) => {
    const b = bucket('decal'), base = b.pos.length / 3, an = TN(n);
    pts.forEach((p, i) => addV(b, T(p), an, Array.isArray(cols[0]) ? cols[i] : cols, uvs[i][0], uvs[i][1], alphas[i]));
    for (const t of tris || QUAD) tri(b, base + t[0], base + t[1], base + t[2]);
  };

  const kit = {};
  kit.rnd = rnd;
  kit.reseed = (s) => { seed = s; };
  kit.use = (g) => { G = g; };
  kit.mat = (k) => { matKey = k; };
  kit.frame = (f) => { F = f; };
  kit.mirror = (s) => { mir = s; };
  kit.hull = (p) => { hullC = p; };
  kit.bone = (a, b, z) => {
    const u = vUnit([b[0] - a[0], b[1] - a[1], 0]), w = [0, 0, 1];
    return { o: [a[0], a[1], z], u, v: vCross(w, u), w, L: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  };
  kit.at = (f, u, v, w) => [f.o[0] + f.u[0] * u + f.v[0] * v, f.o[1] + f.u[1] * u + f.v[1] * v, f.o[2] + w];
  kit.group = (name, parent, origin, label) => {
    const rel = parent ? vSub(origin, parent.origin) : origin;
    const node = createPivot(name, rel, parent ? parent.node : root);
    const g = { name, label: label || name, node, origin, b: {} };
    groups.push(g);
    return g;
  };

  kit.poly = (ptsIn, col, o = {}) => {
    let pts = ptsIn, n = newell(pts);
    if (o.out && vDot(n, o.out) < 0) { pts = [...pts].reverse(); n = vMul(n, -1); if (Array.isArray(col[0])) col = [...col].reverse(); }
    emit(pts, n, col, triangulate(pts, n), o.mat, o.polish);
    return n;
  };

  // Bevelled armour plate: front face at pts, bevel down to depth t. Some bevel runs are worn through to
  // bare metal and carry a chipped-paint decal onto the face; the rest stay painted with a lightly rubbed crest.
  kit.plate = (ptsIn, t = 0.05, o = {}) => {
    let P = ptsIn, n = newell(P);
    const out = o.out || (hullC ? vSub(centroid(P), hullC) : null);
    if (out && vDot(n, out) < 0) { P = [...P].reverse(); n = vMul(n, -1); }
    const c = o.c !== undefined ? o.c : Math.min(t * 0.8, 0.028);
    const inner = insetPoly(P, n, c);
    const painted = !o.mat && matKey === 'armour';
    const raw = o.col || PAINT;
    // Repaint batches: neighbouring plates never quite match.
    const batch = raw === PAINT || raw === PAINT2 ? vMix(raw, rnd() < 0.5 ? BATCH_A : BATCH_B, rnd() * 0.8) : raw;
    const base = tone(batch, 0.8 + rnd() * 0.34);
    const edgeCol = o.edge || WEAR, low = tone(vMix(base, RUST_D, 0.25), 0.28);
    const ys = P.map((p) => T(p)[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const shade = (p) => tone(base, 0.8 + 0.28 * (T(p)[1] - y0) / Math.max(0.05, y1 - y0));
    emit(inner, n, inner.map(shade), triangulate(inner, n), o.mat, o.polish);
    const m = P.length, drop = vMul(n, t), cen = centroid(inner);
    let area = 0, perim = 0;
    for (let i = 0; i < m; i++) {
      const a = inner[i], b = inner[(i + 1) % m];
      area += vDot(vCross(vSub(a, cen), vSub(b, cen)), n) / 2; perim += vLen(vSub(b, a));
    }
    const depth = Math.min(CHIP_DEPTH, (2 * area / Math.max(perim, 0.01)) * 0.9);
    const inside = (p) => inner.every((v, i) => vDot(vCross(vSub(inner[(i + 1) % m], v), vSub(p, v)), n) >= -1e-6);
    const chip = (a, b) => {
      const len = vLen(vSub(b, a));
      if (len < 0.05) return;
      const d = vUnit(vSub(b, a)), inw = vCross(n, d), lift = vMul(n, 0.0035);
      let D = depth;
      const fits = (dd) => inside(vAdd(a, vMul(inw, dd))) && inside(vAdd(b, vMul(inw, dd)));
      if (!fits(D)) D *= 0.5;
      if (!fits(D)) return;
      const ul = Math.min(1, len), u0 = rnd() * (1 - ul);
      decal([a, b, vAdd(b, vMul(inw, D)), vAdd(a, vMul(inw, D))].map((p) => vAdd(p, lift)), n,
        [[u0, 0], [u0 + ul, 0], [u0 + ul, CHIP_V], [u0, CHIP_V]], WHITE, [1, 1, 1, 1]);
    };
    const wearP = painted ? (o.wear === undefined ? 0.42 : o.wear) : 0;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, runs = Math.max(1, Math.min(3, Math.round(vLen(vSub(P[j], P[i])) / 0.42)));
      for (let k = 0; k < runs; k++) {
        const a0 = vMix(P[i], P[j], k / runs), a1 = vMix(P[i], P[j], (k + 1) / runs);
        const i0 = vMix(inner[i], inner[j], k / runs), i1 = vMix(inner[i], inner[j], (k + 1) / runs);
        const q = [vSub(a0, drop), vSub(a1, drop), i1, i0];
        if (rnd() < wearP && depth > 0.018) {
          // Bare metal that wears away along the run, so a long edge never reads as one bright bar.
          const dull = vMix(base, BARE, 0.3), flip = rnd() < 0.5;
          emit(q, newell(q), [tone(BARE, 0.34), tone(BARE, 0.34), flip ? BARE : dull, flip ? dull : BARE], QUAD, 'steel');
          chip(i0, i1);
        } else {
          const crest = vMix(base, edgeCol, 0.06 + rnd() * 0.14);
          emit(q, newell(q), [low, low, crest, crest], QUAD, o.mat, o.polish);
        }
      }
    }
    // Close the plate so an overhang stays solid when seen from behind.
    if (!o.noBack) {
      const backPts = [...P].reverse().map((p) => vSub(p, drop)), backN = vMul(n, -1);
      emit(backPts, backN, low, triangulate(backPts, backN), o.mat);
    }
    const Q = ptsIn;
    const h = { P, inner, n, t, col: base, painted, at: (s, tt, l = 0) => vAdd(vMix(vMix(Q[0], Q[1], s), vMix(Q[3], Q[2], s), tt), vMul(n, l)) };
    if (painted) kit.weather(h, y0, area, o.noDrip);
    return h;
  };

  // Plate-level weathering: dirt on the low edge, runs from the top, dust on anything near the ground.
  kit.weather = (h, y0, area, noDrip) => {
    if (area < 0.012) return;
    const inn = h.inner, m = inn.length, c = centroid(inn), lift = vMul(h.n, 0.003);
    let low = 0, lowY = Infinity;
    for (let i = 0; i < m; i++) { const y = (T(inn[i])[1] + T(inn[(i + 1) % m])[1]) / 2; if (y < lowY) { lowY = y; low = i; } }
    const a = inn[low], b = inn[(low + 1) % m], len = vLen(vSub(b, a));
    if (len > 0.06) {
      const d = vUnit(vSub(b, a)), inw = vCross(h.n, d), D = Math.min(0.075, Math.sqrt(area) * 0.3), ul = Math.min(1, len), u0 = rnd() * (1 - ul);
      decal([a, b, vAdd(b, vMul(inw, D)), vAdd(a, vMul(inw, D))].map((p) => vAdd(p, lift)), h.n,
        [[u0, GRIME_MID], [u0 + ul, GRIME_MID], [u0 + ul, GRIME_END], [u0, GRIME_END]], GRIME, [0.9, 0.9, 0.9, 0.9]);
    }
    if (!noDrip) {
      const count = Math.max(1, Math.min(5, Math.round(area * 11)));
      for (let i = 0; i < count; i++) {
        const s = vMix(vMix(inn[Math.floor(rnd() * m)], inn[Math.floor(rnd() * m)], rnd()), c, 0.16);
        const r = rnd(), kind = r < 0.5 ? 'rust' : r < 0.82 ? 'grime' : 'oil';
        kit.streak(h, s, 0.22 + rnd() * 0.55, 0.05 + rnd() * rnd() * 0.16, kind, true);
      }
    }
    if (y0 < 1.75 && !noDrip) {
      const e1 = vUnit(vSub(inn[1], inn[0])), e2 = vCross(h.n, e1), uvs = [], alphas = [];
      const u0 = 0.25 + rnd() * 0.5, v0 = 0.5;
      for (const p of inn) {
        const rel = vSub(p, c), su = Math.max(0, Math.min(1, u0 + vDot(rel, e1) / 1.6)), sv = Math.max(0, Math.min(1, v0 + vDot(rel, e2) / 0.8));
        uvs.push([su, DUST_V0 + sv * (1 - DUST_V0)]);
        alphas.push(Math.max(0, Math.min(1, (1.75 - T(p)[1]) / 1.1)) * 0.78);
      }
      decal(inn.map((p) => vAdd(p, vMul(h.n, 0.0025))), h.n, uvs, DUST_L, alphas, triangulate(inn, h.n));
    }
  };

  // A run down a plate along rest-pose gravity: 'rust', 'grime', 'oil' or 'soot'. Fades out by vertex alpha.
  kit.streak = (h, sIn, len, w, kind, fromTop) => {
    const dn = F ? [-F.u[1], -F.v[1], -F.w[1]] : [0, -1, 0];
    const flat = vSub(dn, vMul(h.n, vDot(dn, h.n)));
    if (vLen(flat) < 0.3) return;
    const d = vUnit(flat), inn = h.inner, m = inn.length, c = centroid(inn);
    const inside = (p) => inn.every((v, i) => vDot(vCross(vSub(inn[(i + 1) % m], v), vSub(p, v)), h.n) >= -1e-6);
    let s = sIn;
    if (fromTop && vDot(vSub(s, c), d) > 0) s = vSub(c, vSub(s, c));
    for (let k = 0; k < 6 && !inside(s); k++) s = vMix(s, c, 0.35);
    if (!inside(s)) return;
    let e = vAdd(s, vMul(d, len));
    for (let k = 0; k < 8 && !inside(e); k++) e = vMix(s, e, 0.75);
    if (vLen(vSub(e, s)) < 0.03) return;
    const sideDir = vCross(h.n, d);
    let hw = w / 2;
    for (let k = 0; k < 3 && !(inside(vAdd(s, vMul(sideDir, hw))) && inside(vSub(s, vMul(sideDir, hw)))); k++) hw *= 0.6;
    const side = vMul(sideDir, hw), lift = vMul(h.n, 0.003), A = vAdd(s, lift), B = vAdd(e, lift);
    const colIdx = kind === 'oil' ? 5 + Math.floor(rnd() * 3) : kind === 'soot' || kind === 'grime' ? 4 : Math.floor(rnd() * 4);
    const x0 = colIdx / 8 + 0.002, x1 = (colIdx + 1) / 8 - 0.002;
    const col = kind === 'oil' ? OIL : kind === 'soot' ? SOOT : kind === 'grime' ? GRIME : RUST_D;
    const al = kind === 'oil' ? 1 : kind === 'soot' ? 0.95 : 0.6 + rnd() * 0.3;
    decal([vSub(A, side), vSub(B, vMul(side, 0.6)), vAdd(B, vMul(side, 0.6)), vAdd(A, side)], h.n,
      [[x0, RUN_V0], [x0, RUN_V1], [x1, RUN_V1], [x1, RUN_V0]], col, [al, al * 0.22, al * 0.22, al]);
  };

  // Panel line: a dark groove with a thin lit lip, and grime settled into it, heavier on the low side.
  kit.seam = (h, a, b, w = 0.016, col = SEAM) => {
    const d = vUnit(vSub(b, a)), s = vMul(vCross(h.n, d), w / 2), l = vMul(h.n, 0.004);
    const A = vAdd(a, l), B = vAdd(b, l);
    emit([vSub(A, s), vSub(B, s), vAdd(B, s), vAdd(A, s)], h.n, col, QUAD);
    const lip = vMul(vUnit(s), 0.006), lit = vMix(h.col, WEAR, 0.3);
    emit([vAdd(A, s), vAdd(B, s), vAdd(vAdd(B, s), lip), vAdd(vAdd(A, s), lip)], h.n, lit, QUAD);
    if (!h.painted) return;
    const len = vLen(vSub(b, a));
    if (len < 0.05) return;
    const sd = vUnit(s), dn = F ? [-F.u[1], -F.v[1], -F.w[1]] : [0, -1, 0], shift = vMul(sd, vDot(sd, dn) >= 0 ? 0.012 : -0.012), half = vMul(sd, 0.05);
    const G0 = vAdd(vAdd(a, shift), vMul(h.n, 0.0032)), G1 = vAdd(vAdd(b, shift), vMul(h.n, 0.0032));
    const ul = Math.min(1, len), u0 = rnd() * (1 - ul);
    decal([vSub(G0, half), vSub(G1, half), vAdd(G1, half), vAdd(G0, half)], h.n,
      [[u0, GRIME_V0], [u0 + ul, GRIME_V0], [u0 + ul, GRIME_END], [u0, GRIME_END]], GRIME, [1, 1, 1, 1]);
  };
  kit.loop = (h, d = 0.05, w = 0.016) => {
    const pts = insetPoly(h.P, h.n, d);
    pts.forEach((p, i) => kit.seam(h, p, pts[(i + 1) % pts.length], w));
  };
  // Hex bolt head on the polished steel band. Larger heads get a bevel skirt so they catch a glint from any side.
  kit.bolt = (p, n, r = 0.022, col = GM) => {
    const b = bucket('steel'), base = b.pos.length / 3, e1 = vPerp(n), e2 = vCross(n, e1), an = TN(n);
    const rad = (i) => { const a = (i / 6) * 2 * Math.PI; return vAdd(vMul(e1, Math.cos(a)), vMul(e2, Math.sin(a))); };
    const domed = r >= 0.017, top = vAdd(p, vMul(n, domed ? 0.013 : 0.007));
    for (let i = 0; i < 6; i++) addV(b, T(vAdd(top, vMul(rad(i), r * (domed ? 0.6 : 1)))), an, col, (i + 0.5) / 6, domed ? POLISH_V : 0.5);
    for (let i = 1; i < 5; i++) tri(b, base, base + i, base + i + 1);
    if (domed) {
      const foot = b.pos.length / 3, bot = vAdd(p, vMul(n, 0.002));
      for (let i = 0; i < 6; i++) addV(b, T(vAdd(bot, vMul(rad(i), r))), TN(vUnit(vAdd(vMul(n, 0.5), vMul(rad(i), 0.87)))), tone(col, 0.72), (i + 0.5) / 6, POLISH_V);
      for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; tri(b, foot + i, foot + j, base + j); tri(b, foot + i, base + j, base + i); }
    }
  };
  kit.bolts = (h, d = 0.05, each = 1, r = 0.02) => {
    const pts = insetPoly(h.P, h.n, d);
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      for (let k = 0; k < each; k++) {
        const at = vMix(p, q, k / each);
        kit.bolt(at, h.n, r);
        if (h.painted && rnd() < 0.36) kit.streak(h, at, 0.14 + rnd() * 0.3, 0.05 + rnd() * 0.06, 'rust');
      }
    });
  };
  kit.hazard = (h, sw = 0.09, skewK = 1) => {
    const q0 = h.inner[0], q1 = h.inner[1], q2 = h.inner[2], q3 = h.inner[3];
    const L = vLen(vSub(q1, q0)), W = vLen(vSub(q3, q0)), ns = Math.max(2, Math.round(L / (2 * sw))), ds = 1 / (2 * ns), skew = (W / L) * skewK;
    const lift = vMul(h.n, 0.004);
    const map = (s, t) => vAdd(vMix(vMix(q0, q1, s), vMix(q3, q2, s), t), lift);
    for (let k = -ns - 2; k < ns + 2; k++) {
      const s0 = k * 2 * ds + ds / 2;
      let poly2 = [[s0, 0], [s0 + ds, 0], [s0 + ds + skew, 1], [s0 + skew, 1]];
      for (const [lim, sign] of [[0, 1], [1, -1]]) {
        const out = [];
        for (let i = 0; i < poly2.length; i++) {
          const a = poly2[i], b = poly2[(i + 1) % poly2.length];
          const da = (a[0] - lim) * sign, db = (b[0] - lim) * sign;
          if (da >= 0) out.push(a);
          if (da * db < 0) { const u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
        }
        poly2 = out;
        if (!poly2.length) break;
      }
      if (poly2.length >= 3) {
        const pts = poly2.map((p) => map(p[0], p[1]));
        const c = tone(HAZ_Y, 0.82 + rnd() * 0.24);
        const n = newell(pts);
        if (vDot(n, h.n) < 0) pts.reverse();
        emit(pts, h.n, c, triangulate(pts, h.n));
      }
    }
  };
  kit.hazardPlate = (pts, t, o = {}) => {
    const h = kit.plate(pts, t, { ...o, col: HAZ_K, edge: lin(0x77776c), noDrip: true });
    kit.hazard(h, o.sw || 0.09, o.skew === undefined ? 1 : o.skew);
    return h;
  };

  const SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', A: 'abcefg', E: 'afged', H: 'fgbec', K: 'fgecb', L: 'fed', M: 'abcef', R: 'abcefg', T: 'afe', '-': 'g' };
  kit.stencil = (o, rIn, u, str, hgt, col, nOut) => {
    const r = mir < 0 ? vMul(rIn, -1) : rIn, adv = hgt * 0.72, w = hgt * 0.5, th = hgt * 0.14;
    const start = mir < 0 ? vAdd(o, vMul(rIn, adv * str.length)) : o;
    const seg = (A, B, C, D) => {
      const lift = vMul(nOut, 0.005), pts = [A, B, C, D].map((p) => vAdd(p, lift));
      kit.poly(pts, col, { out: nOut });
    };
    [...str].forEach((ch, i) => {
      const org = vAdd(start, vMul(r, adv * i)), P = (x, y) => vAdd(org, vAdd(vMul(r, x * w), vMul(u, y * hgt)));
      const defs = { a: [0, 1, 1, 1], g: [0, 0.5, 1, 0.5], d: [0, 0, 1, 0], f: [0, 1, 0, 0.5], b: [1, 1, 1, 0.5], e: [0, 0.5, 0, 0], c: [1, 0.5, 1, 0] };
      for (const s of SEG7[ch] || '') {
        const [x0, y0, x1, y1] = defs[s], tx = th / w / 2, ty = th / hgt / 2;
        if (y0 === y1) seg(P(x0 - tx, y0 - ty), P(x1 + tx, y0 - ty), P(x1 + tx, y0 + ty), P(x0 - tx, y0 + ty));
        else seg(P(x0 - tx, y1 - ty), P(x0 + tx, y1 - ty), P(x0 + tx, y0 + ty), P(x0 - tx, y0 + ty));
      }
    });
  };

  // Revolved profile about an arbitrary axis; [d, r, col] entries, hard crease between bands.
  kit.lathe = (a, dirIn, prof, o = {}) => {
    const dir = vUnit(dirIn), seg = o.seg || 16, b = bucket(o.mat), col0 = o.col || GUN, isSteel = b.key === 'steel';
    const e1 = vPerp(dir), e2 = vCross(dir, e1);
    for (let i = 0; i < prof.length - 1; i++) {
      // [distance, radius, colour, polished?, colour at far end of this band]
      const [d0, r0, c0, pol, c1] = prof[i], [d1, r1] = prof[i + 1];
      if (r0 < 1e-4 && r1 < 1e-4) continue;
      const dd = d1 - d0, dr = r1 - r0, l = Math.hypot(dd, dr) || 1, base = b.pos.length / 3, colA = c0 || col0, colB = c1 || colA;
      const uK = Math.min(1, (2 * Math.PI * Math.max(r0, r1, 0.05)) / TILE), span = Math.min(1, Math.abs(dd) / TILE), v0 = rnd() * (1 - span);
      const vA = isSteel ? (pol ? POLISH_V : STEEL_V + v0 * (1 - STEEL_V)) : v0, vB = isSteel ? (pol ? POLISH_V : STEEL_V + (v0 + span) * (1 - STEEL_V)) : v0 + span;
      for (let k = 0; k <= seg; k++) {
        const th = (k / seg) * 2 * Math.PI, cs = Math.cos(th), sn = Math.sin(th);
        const rad = vAdd(vMul(e1, cs), vMul(e2, sn));
        const nn = vUnit(vAdd(vMul(rad, dd / l), vMul(dir, -dr / l)));
        const an = TN(nn), u = (k / seg) * uK;
        addV(b, T(vAdd(vAdd(a, vMul(dir, d0)), vMul(rad, r0))), an, colA, u, vA);
        addV(b, T(vAdd(vAdd(a, vMul(dir, d1)), vMul(rad, r1))), an, colB, u, vB);
      }
      for (let k = 0; k < seg; k++) {
        const i0 = base + k * 2, i1 = i0 + 1, i2 = i0 + 2, i3 = i0 + 3;
        if (r0 >= 1e-4 && r1 >= 1e-4) { tri(b, i0, i2, i3); tri(b, i0, i3, i1); }
        else if (r1 < 1e-4) tri(b, i0, i2, i1);
        else tri(b, i0, i3, i1);
      }
    }
  };
  kit.cyl = (a, c, r0, r1, o = {}) => {
    const L = vLen(vSub(c, a));
    kit.lathe(a, vSub(c, a), [[0, 0], [0, r0], [L, r1], [L, 0]], { seg: o.seg || 8, col: o.col, mat: o.mat });
  };

  const crPt = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t, f = (i) => 0.5 * (2 * p1[i] + (p2[i] - p0[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (3 * p1[i] - p0[i] - 3 * p2[i] + p3[i]) * t3);
    return [f(0), f(1), f(2)];
  };
  kit.tube = (ctrl, r, o = {}) => {
    const sp = o.sp || 3, seg = o.seg || 6, col = o.col || RUB, b = bucket(o.mat || 'rubber');
    const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]], path = [];
    for (let i = 1; i < P.length - 2; i++) for (let k = 0; k < sp; k++) path.push(crPt(P[i - 1], P[i], P[i + 1], P[i + 2], k / sp));
    path.push(ctrl[ctrl.length - 1]);
    let nrm = vPerp(vUnit(vSub(path[1], path[0]))), acc = 0;
    const base = b.pos.length / 3;
    path.forEach((p, i) => {
      const t = vUnit(vSub(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]));
      nrm = vUnit(vSub(nrm, vMul(t, vDot(nrm, t))));
      const bn = vCross(t, nrm);
      if (i) acc += vLen(vSub(p, path[i - 1]));
      for (let k = 0; k <= seg; k++) {
        const th = (k / seg) * 2 * Math.PI, rad = vAdd(vMul(nrm, Math.cos(th)), vMul(bn, Math.sin(th)));
        addV(b, T(vAdd(p, vMul(rad, r))), TN(rad), col, k / seg, acc / TILE);
      }
    });
    const stride = seg + 1;
    for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < seg; k++) {
      const a0 = base + i * stride + k, a1 = a0 + 1, c0 = a0 + stride, c1 = c0 + 1;
      tri(b, a0, a1, c1); tri(b, a0, c1, c0);
    }
  };
  kit.cables = (ctrl, spread, spec) => {
    spec.forEach((c, i) => {
      const off = (i - (spec.length - 1) / 2) * spread;
      const pts = ctrl.map((p, k) => (k === 0 || k === ctrl.length - 1 ? p : vAdd(p, [off * 0.7, off, 0])));
      kit.tube(pts, c.r, { col: c.col });
    });
  };

  kit.block = (c, s, o = {}) => {
    const ax = o.ax || [[1, 0, 0], [0, 1, 0], [0, 0, 1]], col = o.col || GUN, ch = o.c === undefined ? 0.012 : o.c, h = [s[0] / 2, s[1] / 2, s[2] / 2];
    const edge = o.edge || vMix(col, WEAR, 0.45), key = o.mat;
    const P = (x, y, z) => vAdd(c, vAdd(vAdd(vMul(ax[0], x), vMul(ax[1], y)), vMul(ax[2], z)));
    const q = (a, b, cc) => { const v = [0, 0, 0]; v[0] = a; v[1] = b; v[2] = cc; return P(v[0], v[1], v[2]); };
    for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
      const b1 = (a + 1) % 3, b2 = (a + 2) % 3, pts = [];
      for (const [s1, s2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const v = [0, 0, 0]; v[a] = sg * h[a]; v[b1] = s1 * (h[b1] - ch); v[b2] = s2 * (h[b2] - ch);
        pts.push(q(v[0], v[1], v[2]));
      }
      kit.poly(pts, col, { out: vMul(ax[a], sg), mat: key, polish: o.polish });
    }
    if (ch > 0) {
      for (let a = 0; a < 3; a++) {
        const b1 = (a + 1) % 3, b2 = (a + 2) % 3;
        for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
          const V = (w, t1, t2) => { const v = [0, 0, 0]; v[a] = w * (h[a] - ch); v[b1] = s1 * (h[b1] - t1); v[b2] = s2 * (h[b2] - t2); return q(v[0], v[1], v[2]); };
          kit.poly([V(-1, 0, ch), V(1, 0, ch), V(1, ch, 0), V(-1, ch, 0)], edge, { out: vAdd(vMul(ax[b1], s1), vMul(ax[b2], s2)), mat: key, polish: o.polish });
        }
      }
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        kit.poly([P(sx * h[0], sy * (h[1] - ch), sz * (h[2] - ch)), P(sx * (h[0] - ch), sy * h[1], sz * (h[2] - ch)), P(sx * (h[0] - ch), sy * (h[1] - ch), sz * h[2])], edge, { out: vAdd(vAdd(vMul(ax[0], sx), vMul(ax[1], sy)), vMul(ax[2], sz)), mat: key, polish: o.polish });
      }
    }
  };
  kit.beam = (a, b, s1, s2, o = {}) => {
    const u = vUnit(vSub(b, a)), up = o.up || (Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]), w = vUnit(vCross(u, up)), v = vCross(w, u);
    kit.block(vMix(a, b, 0.5), [vLen(vSub(b, a)), s1, s2], { ...o, ax: [u, v, w] });
  };

  kit.loft = (ringsIn, o = {}) => {
    let rings = ringsIn;
    const d = vSub(centroid(rings[1]), centroid(rings[0]));
    if (vDot(newell(rings[0]), d) < 0) rings = rings.map((r) => [...r].reverse());
    const col = o.col || DARK;
    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i], B = rings[i + 1], m = A.length;
      for (let j = 0; j < m; j++) {
        const k = (j + 1) % m, q = [A[j], A[k], B[k], B[j]];
        if (vLen(vSub(A[j], A[k])) < 1e-5 && vLen(vSub(B[j], B[k])) < 1e-5) continue;
        emit(q, newell(q), o.cols ? o.cols[i] || col : col, [[0, 1, 2], [0, 2, 3]], o.mat);
      }
    }
    if (o.capStart !== false) { const r = rings[0], n = vMul(newell(r), -1), R = [...r].reverse(); emit(R, n, col, triangulate(R, n), o.mat); }
    if (o.capEnd !== false) { const r = rings[rings.length - 1], n = newell(r); emit(r, n, col, triangulate(r, n), o.mat); }
  };

  // Machined joint drum in gunmetal: recessed face, boss, polished chamfers that take a sharp highlight.
  kit.drum = (c, axisIn, r, w, o = {}) => {
    const axis = vUnit(axisIn), seg = o.seg || Math.max(16, Math.round(r * 64)), a = vAdd(c, vMul(axis, -w / 2));
    const body = o.col || GM, rec = o.rec || GM_D, boss = o.boss || GM_L;
    const rim = Math.min(0.02, w * 0.12), dep = Math.min(0.03, w * 0.1), key = o.mat || 'steel';
    kit.lathe(a, axis, [
      [0, 0, boss], [0, r * 0.25, GM_H, 1], [dep * 0.3, r * 0.30, rec], [dep, r * 0.30, rec], [dep, r * 0.74, body], [0, r * 0.80, body], [0, r * 0.94, GM_H, 1], [rim, r, body],
      [w - rim, r, GM_H, 1], [w, r * 0.94, body], [w, r * 0.80, body], [w - dep, r * 0.74, rec], [w - dep, r * 0.30, boss], [w, r * 0.30, boss], [w, 0, boss],
    ], { seg, mat: key, polish: o.polish });
    const prev = matKey; matKey = key;
    const e1 = vPerp(axis), e2 = vCross(axis, e1);
    const nb = o.bolts === undefined ? 8 : o.bolts;
    // Bolts on the +axis face only: every drum's other face is buried in the limb.
    for (let i = 0; i < nb; i++) {
      const th = (i / nb) * 2 * Math.PI, rad = vAdd(vMul(e1, Math.cos(th)), vMul(e2, Math.sin(th)));
      kit.bolt(vAdd(vAdd(c, vMul(axis, w / 2 - dep)), vMul(rad, r * 0.53)), axis, Math.min(0.024, r * 0.09), GM_L);
    }
    if (o.gear) {
      const tw = ((2 * Math.PI * r) / o.gear) * 0.5;
      for (let i = 0; i < o.gear; i++) {
        const th = (i / o.gear) * 2 * Math.PI, rad = vAdd(vMul(e1, Math.cos(th)), vMul(e2, Math.sin(th))), tan = vCross(axis, rad);
        kit.block(vAdd(c, vMul(rad, r + 0.012)), [0.034, tw, w * (o.gearW || 0.5)], { ax: [rad, tan, axis], c: 0, col: GM_L, polish: true, mat: key, polish: o.polish });
      }
    }
    matKey = prev;
  };

  kit.vent = (q0, q1, q2, q3, o = {}) => {
    const n = newell([q0, q1, q2, q3]), N = o.n || 5, slat = o.col || GUN;
    kit.poly([q0, q1, q2, q3], o.base || tone(GUN, 0.25), { out: n, mat: o.glow });
    const lift = vMul(n, o.depth || 0.022);
    for (let i = 0; i < N; i++) {
      const t0 = (i + 0.08) / N, t1 = (i + 0.72) / N;
      const a = vAdd(vMix(q0, q3, t0), lift), b = vAdd(vMix(q1, q2, t0), lift), c = vMix(q1, q2, t1), d = vMix(q0, q3, t1);
      kit.poly([a, b, vAdd(c, vMul(lift, 0.25)), vAdd(d, vMul(lift, 0.25))], [slat, slat, vMix(slat, WEAR, 0.3), vMix(slat, WEAR, 0.3)], {});
    }
  };


  // Louvre vent set into a quad plate, addressed in the plate's own s,t.
  kit.ventOn = (h, s0, s1, t0, t1, o = {}) => {
    const l = 0.004;
    let q = [h.at(s0, t0, l), h.at(s1, t0, l), h.at(s1, t1, l), h.at(s0, t1, l)];
    if (vDot(newell(q), h.n) < 0) q = [q[1], q[0], q[3], q[2]];
    kit.vent(q[0], q[1], q[2], q[3], o);
    q.forEach((p, i) => kit.seam({ ...h, painted: false }, p, q[(i + 1) % 4], 0.012));
  };

  // Raised sub-plate on a quad plate, addressed in its s,t. Keeps the layering consistent wherever it is used.
  kit.onPlate = (h, s0, s1, t0, t1, lift, o = {}) => {
    const q = [h.at(s0, t0, lift), h.at(s1, t0, lift), h.at(s1, t1, lift), h.at(s0, t1, lift)];
    return kit.plate(q, lift + 0.012, { out: h.n, noBack: true, ...o });
  };

  // Thin heat fins standing off a quad plate.
  kit.fins = (h, s0, s1, t0, t1, count, stand = 0.05, col = GM) => {
    const prev = matKey; matKey = 'steel';
    const A = h.at(s0, t0), B = h.at(s1, t0), Cc = h.at(s0, t1), run = vUnit(vSub(B, A)), acr = vSub(Cc, A), lenS = vLen(vSub(B, A)), lenT = vLen(acr), across = vUnit(acr);
    for (let i = 0; i < count; i++) {
      const c = vAdd(vAdd(vMix(A, B, (i + 0.5) / count), vMul(acr, 0.5)), vMul(h.n, stand / 2));
      kit.block(c, [0.012, lenT, stand], { ax: [run, across, h.n], c: 0, col, polish: i % 2 === 0 });
    }
    matKey = prev;
    return lenS;
  };

  // Faceted armour shell over a list of sections: a dark core, then a bevelled plate per facet with a small gap
  // at each station. Section: { u, vf, vr, wo, wi, c } in the current frame. Returns { out, rear, in, front } per span.
  kit.shell = (st, o = {}) => {
    const ring = (s) => [[s.u, s.vf, s.wo - s.c], [s.u, s.vf - s.c, s.wo], [s.u, s.vr + s.c, s.wo], [s.u, s.vr, s.wo - s.c], [s.u, s.vr, -s.wi + s.c], [s.u, s.vr + s.c, -s.wi], [s.u, s.vf - s.c, -s.wi], [s.u, s.vf, -s.wi + s.c]];
    kit.loft(st.map(ring), { col: o.core || DARK });
    const names = { 1: 'out', 3: 'rear', 5: 'in', 7: 'front' }, t = o.t || 0.03, gap = o.gap || 0.012, cols = o.cols || {}, out = [];
    for (let i = 0; i < st.length - 1; i++) {
      const A = ring(st[i]), B = ring(st[i + 1]), g = gap / Math.max(0.05, Math.abs(st[i + 1].u - st[i].u)), sec = {};
      const ax = [(st[i].u + st[i + 1].u) / 2, (st[i].vf + st[i].vr + st[i + 1].vf + st[i + 1].vr) / 4, (st[i].wo - st[i].wi + st[i + 1].wo - st[i + 1].wi) / 4];
      for (let j = 0; j < 8; j++) {
        const k = (j + 1) % 8, Q0 = [vMix(A[j], B[j], g), vMix(A[k], B[k], g), vMix(A[k], B[k], 1 - g), vMix(A[j], B[j], 1 - g)];
        const fo = vSub(centroid(Q0), ax), nn = newell(Q0), lift = vMul(nn, (vDot(nn, fo) < 0 ? -1 : 1) * t), Q = Q0.map((p) => vAdd(p, lift));
        if (names[j]) sec[names[j]] = kit.plate(Q, t + 0.012, { out: fo, col: cols[names[j]] || PAINT, noBack: true });
        else kit.plate(Q, t + 0.012, { out: fo, col: cols.chamfer || PAINT2, noBack: true, c: 0.01, wear: 0.6, noDrip: true });
      }
      out.push(sec);
    }
    return out;
  };
  // Clevis ears either side of a piston pin, from the anchor back to the bone surface.
  kit.lug = (A, base, zc, o = {}) => {
    const w = o.w || 0.085, ear = o.ear || 0.085, foot = o.foot || 0.12, t = o.t || 0.03;
    const d = vUnit(vSub(base, A)), p = [-d[1], d[0], 0];
    const pts = (z) => [
      [A[0] + p[0] * ear, A[1] + p[1] * ear, z], [A[0] - d[0] * ear, A[1] - d[1] * ear, z], [A[0] - p[0] * ear, A[1] - p[1] * ear, z],
      [base[0] - p[0] * foot, base[1] - p[1] * foot, z], [base[0] + p[0] * foot, base[1] + p[1] * foot, z],
    ];
    const col = o.col || GUN;
    kit.plate(pts(zc + w), t, { out: [0, 0, 1], col, c: 0.012 });
    kit.plate(pts(zc - w), t, { out: [0, 0, -1], col, c: 0.012 });
  };

  kit.piston = (name, gA, A, gB, B, o = {}) => { pistons.push({ name, gA, A, gB, B, mir, o, F }); };
  kit.pistonList = () => pistons;

  kit.buildPiston = (p, minSpan, maxSpan) => {
    const { name, gA, A, gB, B, o } = p;
    mir = p.mir; F = null;
    const sgn = mir;
    const actual = (q) => [q[0], q[1], q[2] * sgn];
    const cylG = kit.group('Piston_' + name + '_Cyl', gA, actual(A), 'Piston_' + name + '_Cyl');
    const rodG = kit.group('Piston_' + name + '_Rod', gB, actual(B), 'Piston_' + name + '_Rod');
    const dir = vUnit(vSub(B, A)), back = vMul(dir, -1);
    const r = o.r || 0.09, rr = o.rod || r * 0.56;
    // Equal cylinder and rod: the rod stays inserted past full Walk extension, the gland clears the rod end at its shortest.
    const Lc = Math.max(0.2, Math.min((maxSpan + Math.max(0.18, 0.2 * maxSpan)) / 2, minSpan - 0.05)), Lr = Lc;
    const zAxis = [0, 0, 1], body = PISTON;
    // Cylinder
    kit.use(cylG); kit.mat('steel');
    kit.drum(A, zAxis, r * 0.72, 0.13, { bolts: 0, seg: 12, boss: STEEL });
    const col1 = vMix(body, WEAR, 0.5);
    kit.lathe(A, dir, [
      [r * 0.5, 0, GM_D], [r * 0.5, r * 1.16, GM], [r * 1.5, r * 1.16, GM_H, 1], [r * 1.65, r, body],
      [Lc - r * 1.3, r, GM_D], [Lc - r * 1.3, r * 1.14, GM], [Lc - r * 0.35, r * 1.14, GM_H, 1], [Lc, r * 0.75, GM_L], [Lc, 0, GM_L],
    ], { seg: o.seg || 14 });
    const s2 = vUnit(vCross(dir, [0, 0, 1]));
    const hoseOff = vMul(s2, r + 0.016);
    const hp = (d) => vAdd(vAdd(A, vMul(dir, d)), hoseOff);
    kit.tube([vAdd(A, vMul(dir, r * 1.2)), hp(r * 1.7), hp(Lc * 0.5), hp(Lc - r * 1.6), vAdd(A, vMul(dir, Lc - r * 0.9))], Math.max(0.011, r * 0.14), { col: o.hose || CAB_K, sp: 2, seg: 5 });
    // Rod
    kit.use(rodG); kit.mat('steel');
    kit.drum(B, zAxis, rr * 1.16, 0.12, { bolts: 0, seg: 12, boss: STEEL });
    kit.lathe(B, back, [[rr * 0.8, 0, STEEL_D], [rr * 0.8, rr * 1.24, STEEL_D], [rr * 2.1, rr * 1.24, STEEL_D], [rr * 2.3, rr, STEEL_D], [rr * 2.3, 0, STEEL_D]], { seg: 12 });
    kit.mat('chrome');
    kit.lathe(B, back, [[rr * 2.3, rr], [Lr, rr], [Lr, 0]], { seg: o.seg || 12, mat: 'chrome' });
    // Aim constraint data, usable from runtime code as well as by the baked clip.
    const dA = actual(dir);
    cylG.node.userData = { aimAt: rodG.node.name, aimRestDir: dA };
    rodG.node.userData = { aimAt: cylG.node.name, aimRestDir: vMul(dA, -1) };
  };

  kit.flush = () => {
    for (const g of groups) {
      for (const key of Object.keys(g.b)) {
        const b = g.b[key];
        if (!b.idx.length) continue;
        const n = b.pos.length / 3, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          pos[i * 3] = b.pos[i * 3] - g.origin[0]; pos[i * 3 + 1] = b.pos[i * 3 + 1] - g.origin[1]; pos[i * 3 + 2] = b.pos[i * 3 + 2] - g.origin[2];
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nor), 3));
        // 16-bit normalised UVs, and none at all on untextured materials: most of the file is vertex data.
        if (TEXTURED[key]) {
          const uv16 = new Uint16Array(b.uv.length);
          for (let i = 0; i < b.uv.length; i++) uv16[i] = Math.round(Math.max(0, Math.min(1, b.uv[i])) * 65535);
          geo.setAttribute('uv', new THREE.BufferAttribute(uv16, 2, true));
        }
        if (COLORED[key]) geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(b.col), 4, true));
        geo.setIndex(b.idx);
        geo.computeBoundingBox(); geo.computeBoundingSphere();
        createPart(g.label + '_' + key, geo, MAT[key], { parent: g.node });
      }
    }
  };
  return kit;
}

// ---------------------------------------------------------------- textures
function makeTextures() {
  const prng = (s0) => { let s = s0 >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const rand = prng(7);

  // ---- Paint: broad sun-fade, mottling and rub marks, deliberately no spots. Chips live in the wear atlas.
  const fades = [];
  for (let i = 0; i < 12; i++) {
    const w = 90 + Math.round(rand() * 170), h = 70 + Math.round(rand() * 150), x = Math.round(rand() * (512 - w)), y = Math.round(rand() * (512 - h)), light = rand() < 0.5;
    fades.push({ op: 'paint', shape: { kind: 'ellipse', x, y, width: w, height: h }, rgba: light ? [255, 255, 250, 255] : [118, 114, 102, 255], opacity: light ? 28 : 24 });
  }
  const strokes = (n, wMin, wMax, lMin, lMax) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = 20 + Math.round(rand() * 470), y = 20 + Math.round(rand() * 470), a = rand() * 6.28, l = lMin + rand() * (lMax - lMin);
      out.push({ kind: 'line', from: [x, y], to: [Math.max(0, Math.min(511, Math.round(x + Math.cos(a) * l))), Math.max(0, Math.min(511, Math.round(y + Math.sin(a) * l)))], width: wMin + Math.round(rand() * (wMax - wMin)) });
    }
    return out;
  };
  const rubs = strokes(10, 4, 14, 30, 110), scratches = strokes(14, 1, 1, 30, 150);
  const ramp = [];
  for (let i = 0; i < 16; i++) { const k = 148 + i * 7; ramp.push((k << 16) | (k << 8) | Math.round(k * 0.972)); }
  const albedo = proceduralTexture({
    schemaVersion: 3, width: 512, height: 512, usage: 'albedo', name: 'Armour_Paint_Albedo',
    operations: [
      { op: 'legacy-v2', spec: { schemaVersion: 2, size: 512, usage: 'albedo', layers: [
        { op: 'solid', color: 0xf4f4f0 },
        { op: 'noise', colorA: 0x9e9c90, colorB: 0xffffff, scale: 4, octaves: 4, seed: 41, blend: 'multiply', opacity: 0.95 },
        { op: 'noise', colorA: 0xd2d0c6, colorB: 0xffffff, scale: 30, octaves: 2, seed: 77, blend: 'multiply', opacity: 0.6 },
      ] } },
      ...fades,
      ...rubs.map((s) => ({ op: 'paint', shape: s, rgba: [255, 255, 250, 255], opacity: 34 })),
      ...scratches.map((s) => ({ op: 'paint', shape: s, rgba: [255, 255, 250, 255], opacity: 80 })),
    ],
    palette: { colors: ramp, dither: 'none' },
  });
  const mr = proceduralTexture({
    schemaVersion: 3, width: 512, height: 512, usage: 'metallicRoughness', name: 'Armour_Paint_MR',
    operations: [
      { op: 'legacy-v2', spec: { schemaVersion: 2, size: 512, usage: 'metallicRoughness', layers: [
        { op: 'solid', color: 0xffa80c },
        { op: 'noise', colorA: 0xff8808, colorB: 0xffc410, scale: 5, octaves: 2, seed: 41 },
      ] } },
      ...rubs.map((s) => ({ op: 'paint', shape: s, rgba: [255, 118, 40, 255], opacity: 90 })),
      ...scratches.map((s) => ({ op: 'paint', shape: s, rgba: [255, 110, 120, 255] })),
    ],
  });
  const seamOps = [];
  const H = (y, x0, x1) => { seamOps.push({ op: 'paint', shape: { kind: 'rectangle', x: x0, y, width: x1 - x0, height: 2 }, rgba: [128, 72, 235, 255] }); seamOps.push({ op: 'paint', shape: { kind: 'rectangle', x: x0, y: y + 2, width: x1 - x0, height: 2 }, rgba: [128, 184, 235, 255] }); };
  const Vt = (x, y0, y1) => { seamOps.push({ op: 'paint', shape: { kind: 'rectangle', x, y: y0, width: 2, height: y1 - y0 }, rgba: [72, 128, 235, 255] }); seamOps.push({ op: 'paint', shape: { kind: 'rectangle', x: x + 2, y: y0, width: 2, height: y1 - y0 }, rgba: [184, 128, 235, 255] }); };
  H(70, 0, 512); H(255, 60, 400); H(410, 0, 512); Vt(90, 70, 410); Vt(330, 0, 255); Vt(460, 255, 512);
  const area = { x: 24, y: 24, width: 464, height: 464 };
  const nrm = proceduralTexture({
    schemaVersion: 3, width: 512, height: 512, usage: 'normal', name: 'Armour_Normal', background: [128, 128, 255, 255],
    operations: [
      ...seamOps,
      { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 26, height: 18 }, rgba: [112, 144, 246, 255], count: 24, seed: 55, area },
      { op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 6, height: 6 }, rgba: [150, 150, 245, 255], count: 90, seed: 56, area },
      ...scratches.map((s) => ({ op: 'paint', shape: s, rgba: [104, 152, 248, 255] })),
    ],
  });

  // ---- Gunmetal: real metal with brushed variation; the top band is the polished finish for chamfers and bolts.
  const steelMR = proceduralTexture({
    schemaVersion: 3, width: 256, height: 256, usage: 'metallicRoughness', name: 'Gunmetal_MR',
    operations: [
      { op: 'legacy-v2', spec: { schemaVersion: 2, size: 256, usage: 'metallicRoughness', layers: [
        { op: 'solid', color: 0xff60be },
        { op: 'noise', colorA: 0xff50b4, colorB: 0xff78c8, scale: 9, octaves: 2, seed: 3 },
        { op: 'stripes', colorA: 0xff58ba, colorB: 0xff6cc2, count: 48, angleDeg: 90, opacity: 0.5 },
      ] } },
      { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 256, height: 28 }, rgba: [255, 34, 226, 255] },
    ],
  });

  // ---- Wear atlas. Rows, in texture V: chipped edge, panel grime, eight run columns (rust x5, oil x3), dust.
  const chipShape = (w, h) => ({ kind: 'polygon', points: [[0, Math.round(h * 0.4)], [Math.round(w * 0.3), 0], [Math.round(w * 0.75), Math.round(h * 0.1)], [w, Math.round(h * 0.5)], [Math.round(w * 0.7), h], [Math.round(w * 0.25), Math.round(h * 0.85)]] });
  // Chipped band: the straight edge is the plate edge (y = 0), the jagged side bites into the paint in clusters.
  const jag = (seed, maxD) => {
    const r = prng(seed), p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28, pts = [[0, 0]], n = 60;
    for (let i = 0; i <= n; i++) {
      const x = Math.max(0, Math.min(512, Math.round(((i + (i > 0 && i < n ? (r() - 0.5) * 0.8 : 0)) / n) * 512))), th = (x / 512) * 6.283;
      const env = Math.max(0, 0.5 * Math.sin(th * 3 + p1) + 0.35 * Math.sin(th * 7 + p2) + 0.18 * Math.sin(th * 13 + p3) + 0.36);
      const q = r(), tooth = 0.22 + 0.95 * q * Math.sqrt(q);
      pts.push([x, Math.round(maxD * Math.min(1, env) * tooth)]);
    }
    pts.push([512, 0]);
    return { kind: 'polygon', points: pts };
  };
  const band = (seed, cy, half) => {
    const r = prng(seed), n = 30, top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const x = Math.round((i / n) * 512);
      top.push([x, Math.round(cy - half * (0.45 + 0.55 * r()))]);
      bot.push([x, Math.round(cy + half * (0.45 + 0.55 * r()))]);
    }
    return { kind: 'polygon', points: [...top, ...bot.reverse()] };
  };
  const taper = (r, cx, y0, len, w0) => {
    const L = [], R = [], n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = w0 * (0.4 + 0.6 * Math.min(1, t * 4)) * Math.pow(1 - t, 0.7) + 1, y = Math.round(y0 + t * len), j = (r() - 0.5) * w0 * 0.2;
      L.push([Math.round(cx - w / 2 + j), y]); R.push([Math.round(cx + w / 2 + j), y]);
    }
    return { kind: 'polygon', points: [...L, ...R.reverse()] };
  };
  const WHITE8 = [255, 255, 255, 255], METAL8 = [164, 168, 172, 255], PRIMER8 = [84, 78, 66, 255], fleck = { x: 4, y: 2, width: 500, height: 66 };
  const wearOps = [
    { op: 'paint', shape: jag(11, 90), rgba: PRIMER8 },
    { op: 'paint', shape: jag(11, 66), rgba: METAL8 },
    { op: 'stamps', shape: chipShape(6, 4), rgba: METAL8, count: 34, seed: 41, area: { x: 4, y: 2, width: 500, height: 34 } },
    { op: 'stamps', shape: chipShape(13, 9), rgba: PRIMER8, count: 30, seed: 42, area: fleck },
    { op: 'stamps', shape: chipShape(9, 6), rgba: METAL8, count: 30, seed: 42, area: fleck },
    { op: 'paint', shape: band(21, 160, 30), rgba: WHITE8, opacity: 76 },
    { op: 'paint', shape: band(22, 160, 18), rgba: WHITE8, opacity: 110 },
    { op: 'paint', shape: band(23, 160, 8), rgba: WHITE8, opacity: 180 },
  ];
  const r2 = prng(91);
  for (let c = 0; c < 8; c++) {
    const cx = 32 + c * 64, oil = c >= 5;
    wearOps.push({ op: 'paint', shape: taper(r2, cx, 192, 180 + r2() * 70, 22 + r2() * 18), rgba: WHITE8, opacity: oil ? 205 : 165 });
    wearOps.push({ op: 'paint', shape: taper(r2, cx + (r2() - 0.5) * 8, 192, 90 + r2() * 70, 8 + r2() * 8), rgba: WHITE8, opacity: oil ? 225 : 185 });
    for (let k = 0; k < 2; k++) {
      const ox = Math.round(cx + (r2() - 0.5) * 34);
      wearOps.push({ op: 'paint', shape: { kind: 'line', from: [ox, 192], to: [Math.round(ox + (r2() - 0.5) * 8), Math.round(300 + r2() * 145)], width: 1 + Math.round(r2() * 2) }, rgba: WHITE8, opacity: oil ? 235 : 195 });
    }
  }
  wearOps.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: 448, width: 512, height: 64 }, rgba: WHITE8, opacity: 58 });
  // This row is 4:1 stretched on the mech, so the grit is drawn wide and flat to land round.
  wearOps.push({ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 6, height: 2 }, rgba: WHITE8, count: 90, seed: 61, area: { x: 2, y: 450, width: 504, height: 58 }, opacity: 90 });
  wearOps.push({ op: 'stamps', shape: { kind: 'ellipse', x: 0, y: 0, width: 3, height: 1 }, rgba: WHITE8, count: 30, seed: 62, area: { x: 2, y: 450, width: 504, height: 58 }, opacity: 120 });
  const wearA = proceduralTexture({ schemaVersion: 3, width: 512, height: 512, usage: 'albedo', name: 'Wear_Atlas', operations: wearOps });
  // Bare metal in the chip row and glossy oil in the oil columns; matte everywhere else.
  const wearMR = proceduralTexture({
    schemaVersion: 3, width: 64, height: 64, usage: 'metallicRoughness', name: 'Wear_Atlas_MR', background: [255, 216, 0, 255],
    operations: [
      { op: 'paint', shape: { kind: 'rectangle', x: 0, y: 0, width: 64, height: 13 }, rgba: [255, 84, 165, 255] },
      { op: 'paint', shape: { kind: 'rectangle', x: 40, y: 24, width: 24, height: 32 }, rgba: [255, 44, 26, 255] },
    ],
  });
  return { albedo, mr, nrm, steelMR, wearA, wearMR };
}

// ---------------------------------------------------------------- legs
function buildLeg(kit, side, pelvisG) {
  const z0 = SK.legZ, s = side === 'L' ? -1 : 1;
  kit.mirror(s);
  const hipG = kit.group('Hip_' + side, pelvisG, [SK.hip[0], SK.hip[1], s * z0], 'Thigh_' + side);
  const kneeG = kit.group('Knee_' + side, hipG, [SK.knee[0], SK.knee[1], s * z0], 'Shin_' + side);
  const ankleG = kit.group('Ankle_' + side, kneeG, [SK.ankle[0], SK.ankle[1], s * z0], 'Meta_' + side);
  const toeG = kit.group('Toe_' + side, ankleG, [SK.toe[0], SK.toe[1], s * z0], 'Foot_' + side);
  [hipG, kneeG, ankleG, toeG].forEach((g) => { g.node.userData = { hinge: g === hipG ? 'ball (z=flex)' : g === toeG ? 'ball (z=flex)' : 'z' }; });

  const thF = kit.bone(SK.hip, SK.knee, z0), shF = kit.bone(SK.knee, SK.ankle, z0), mtF = kit.bone(SK.ankle, SK.toe, z0);
  const ring = (u, vf, vr, wh) => [[u, vf, wh], [u, vf, -wh], [u, vr, -wh], [u, vr, wh]];
  const sideP = (w, pts, t, o = {}) => kit.plate(pts.map((p) => [p[0], p[1], w]), t, { out: [0, 0, Math.sign(w)], ...o });

  // ---- Thigh
  kit.use(hipG); kit.frame(thF); kit.hull([thF.L / 2, 0, 0]); kit.mat('steel');
  kit.drum([0, 0, 0], [0, 0, 1], 0.40, 0.56, { bolts: 10, gear: 26, gearW: 0.4 });
  kit.drum([0, 0, 0.30], [0, 0, 1], 0.16, 0.08, { bolts: 0, seg: 14, col: DARK });
  kit.mat('armour');
  kit.loft([ring(-0.05, 0.26, -0.28, 0.24), ring(0.40, 0.30, -0.30, 0.25), ring(1.0, 0.22, -0.24, 0.21), ring(thF.L + 0.02, 0.15, -0.15, 0.15)], { col: DARK });
  const t1 = sideP(0.29, [[0.34, -0.28], [1.02, -0.23], [1.22, -0.10], [1.22, 0.10], [1.02, 0.22], [0.40, 0.30], [0.30, 0.14], [0.30, -0.12]], 0.05);
  kit.loop(t1, 0.045); kit.bolts(t1, 0.03, 1, 0.016);
  kit.streak(t1, [0.36, 0.04, 0.29], 0.66, 0.12, 'oil'); kit.streak(t1, [0.40, -0.16, 0.29], 0.42, 0.06, 'rust');
  const t2 = sideP(0.325, [[0.50, -0.20], [0.94, -0.16], [0.94, 0.16], [0.50, 0.21]], 0.035, { col: PAINT2 });
  kit.bolts(t2, 0.03);
  kit.seam(t2, [0.74, -0.18, 0.325], [0.74, 0.18, 0.325]);
  kit.stencil([0.67, -0.05, 0.325], [0, 1, 0], [-1, 0, 0], '07', 0.13, BONE, [0, 0, 1]);
  const t3 = kit.hazardPlate([[1.00, -0.19, 0.325], [1.00, 0.19, 0.325], [1.17, 0.09, 0.325], [1.17, -0.09, 0.325]], 0.03, { out: [0, 0, 1], sw: 0.05 });
  kit.seam(t3, t3.inner[0], t3.inner[1], 0.008);
  const t4 = sideP(-0.28, [[0.34, -0.27], [1.05, -0.20], [1.18, -0.08], [1.18, 0.08], [1.05, 0.20], [0.40, 0.29], [0.32, 0.12], [0.32, -0.12]], 0.04, { col: PAINT2 });
  kit.loop(t4, 0.05);
  const tf = kit.plate([[0.38, 0.335, 0.235], [1.04, 0.245, 0.185], [1.04, 0.245, -0.185], [0.38, 0.335, -0.235]], 0.05, { out: [0, 1, 0] });
  kit.seam(tf, [0.62, 0.30, 0.22], [0.62, 0.30, -0.22]); kit.seam(tf, [0.84, 0.27, 0.20], [0.84, 0.27, -0.20]);
  kit.bolts(tf, 0.03, 1, 0.016);
  const tb = kit.plate([[0.36, -0.315, 0.235], [1.10, -0.255, 0.185], [1.10, -0.255, -0.185], [0.36, -0.315, -0.235]], 0.04, { out: [0, -1, 0], col: GUN });
  kit.loop(tb, 0.05);
  // Servo pack on the outer rear of the thigh
  kit.mat('steel');
  kit.cyl([0.46, -0.205, 0.40], [0.86, -0.17, 0.40], 0.066, 0.066, { seg: 10, col: STEEL_D });
  for (const u of [0.52, 0.60, 0.68, 0.76]) kit.lathe([u, -0.205 + (u - 0.46) * 0.09, 0.40], [1, 0.09, 0], [[0, 0.07], [0, 0.082, GUN], [0.018, 0.082, GUN], [0.018, 0.07]], { seg: 10, col: GUN });
  kit.mat('rubber');
  kit.cables([[0, 0, 0.345], [0.30, 0.10, 0.37], [0.70, 0.235, 0.385], [1.05, 0.215, 0.375], [1.30, 0.08, 0.345], [thF.L, 0, 0.32]], 0.026, [{ r: 0.019, col: CAB_K }, { r: 0.015, col: CAB_R }, { r: 0.019, col: CAB_K }]);
  kit.mat('armour');

  const hipLugT = kit.at(thF, 0.62, -0.42, 0), hipLugB = kit.at(thF, 0.70, -0.27, 0);
  const kneeA = kit.at(thF, 0.30, 0.50, 0), kneeAb = kit.at(thF, 0.42, 0.31, 0);
  kit.frame(null); kit.hull(null);
  kit.lug(hipLugT, hipLugB, z0, { col: GUN });
  kit.lug(kneeA, kneeAb, z0, { col: GUN, ear: 0.10, w: 0.09, foot: 0.15 });
  kit.frame(thF); kit.hull([thF.L / 2, 0, 0]);

  // ---- Shin
  kit.use(kneeG); kit.frame(shF); kit.hull([shF.L / 2, 0, 0]); kit.mat('steel');
  kit.drum([0, 0, 0], [0, 0, 1], 0.30, 0.56, { bolts: 8, gear: 22, gearW: 0.4 });
  kit.drum([0, 0, 0.30], [0, 0, 1], 0.13, 0.07, { bolts: 0, seg: 12, col: DARK });
  kit.mat('armour');
  kit.loft([ring(0.05, 0.25, -0.21, 0.23), ring(0.70, 0.25, -0.19, 0.22), ring(1.25, 0.19, -0.16, 0.19), ring(shF.L + 0.02, 0.13, -0.13, 0.14)], { col: DARK });
  const s1 = sideP(0.275, [[0.24, -0.20], [1.28, -0.17], [1.50, -0.10], [1.50, 0.11], [1.30, 0.19], [0.58, 0.27], [0.26, 0.24]], 0.05);
  kit.loop(s1, 0.045); kit.bolts(s1, 0.03, 1, 0.016);
  kit.streak(s1, [0.30, 0.02, 0.275], 0.7, 0.14, 'oil'); kit.streak(s1, [0.48, -0.12, 0.275], 0.5, 0.07, 'rust');
  const s2 = sideP(0.31, [[0.42, -0.15], [1.05, -0.13], [1.05, 0.15], [0.58, 0.20], [0.42, 0.17]], 0.035, { col: PAINT2 });
  kit.bolts(s2, 0.03); kit.seam(s2, [0.76, -0.13, 0.31], [0.76, 0.17, 0.31]);
  const s2b = sideP(0.31, [[1.10, -0.13], [1.40, -0.09], [1.40, 0.09], [1.10, 0.14]], 0.03, { col: RUST });
  kit.bolts(s2b, 0.025, 1, 0.014);
  sideP(-0.27, [[0.24, -0.19], [1.30, -0.16], [1.50, -0.09], [1.50, 0.10], [1.30, 0.18], [0.58, 0.25], [0.26, 0.22]], 0.04, { col: PAINT2 });
  const sg = kit.plate([[0.34, 0.33, 0.24], [1.38, 0.22, 0.185], [1.38, 0.22, -0.185], [0.34, 0.33, -0.24]], 0.055, { out: [0, 1, 0] });
  kit.seam(sg, [0.70, 0.295, 0.22], [0.70, 0.295, -0.22]); kit.seam(sg, [1.05, 0.26, 0.20], [1.05, 0.26, -0.20]); kit.bolts(sg, 0.03, 2, 0.016);
  const sg2 = kit.plate([[0.74, 0.32, 0.12], [1.02, 0.29, 0.11], [1.02, 0.29, -0.11], [0.74, 0.32, -0.12]], 0.035, { out: [0, 1, 0], col: PAINT2 });
  kit.bolts(sg2, 0.02, 1, 0.012);
  kit.plate([[0.30, -0.235, 0.22], [1.30, -0.185, 0.18], [1.30, -0.185, -0.18], [0.30, -0.235, -0.22]], 0.04, { out: [0, -1, 0], col: GUN });
  // Knee guard and piston horn
  const kg = kit.plate([[-0.46, 0.235, 0.27], [0.32, 0.415, 0.285], [0.32, 0.415, -0.285], [-0.46, 0.235, -0.27]], 0.06, { out: [0, 1, 0], col: PAINT });
  kit.loop(kg, 0.05); kit.bolts(kg, 0.03, 1, 0.018);
  kit.hazardPlate([[-0.34, 0.325, 0.17], [-0.34, 0.325, -0.17], [0.06, 0.42, -0.17], [0.06, 0.42, 0.17]], 0.04, { out: [0, 1, 0], sw: 0.05 });
  sideP(0.245, [[-0.46, 0.02], [-0.46, 0.24], [0.20, 0.40], [0.22, 0.20], [-0.10, 0.02]], 0.03, { col: GUN });
  sideP(-0.245, [[-0.46, 0.02], [-0.46, 0.24], [0.20, 0.40], [0.22, 0.20], [-0.10, 0.02]], 0.03, { col: GUN });
  kit.mat('rubber');
  kit.cables([[0, 0, 0.335], [0.34, 0.03, 0.355], [0.80, -0.055, 0.365], [1.20, 0.01, 0.36], [1.50, -0.10, 0.33], [shF.L, 0, 0.27]], 0.024, [{ r: 0.017, col: CAB_K }, { r: 0.017, col: CAB_B }]);
  kit.mat('armour');
  const hornK = kit.at(shF, -0.396, 0.115, 0), hornKb = kit.at(shF, -0.14, 0.14, 0);
  const calfA = kit.at(shF, 0.50, -0.50, 0), calfAb = kit.at(shF, 0.62, -0.20, 0);
  kit.frame(null); kit.hull(null);
  kit.lug(hornK, hornKb, z0, { ear: 0.09, w: 0.11, foot: 0.16, t: 0.04 });
  kit.lug(calfA, calfAb, z0, { col: GUN, ear: 0.10, w: 0.095, foot: 0.16 });
  kit.frame(shF); kit.hull([shF.L / 2, 0, 0]);

  // ---- Metatarsus
  kit.use(ankleG); kit.frame(mtF); kit.hull([mtF.L / 2, 0, 0]); kit.mat('steel');
  kit.drum([0, 0, 0], [0, 0, 1], 0.22, 0.46, { bolts: 6, gear: 18, gearW: 0.4 });
  kit.drum([0, 0, 0.25], [0, 0, 1], 0.10, 0.06, { bolts: 0, seg: 12, col: DARK });
  kit.block([0.56, 0, 0.105], [0.90, 0.17, 0.065], { col: DARK, c: 0.01 });
  kit.block([0.56, 0, -0.105], [0.90, 0.17, 0.065], { col: DARK, c: 0.01 });
  kit.cyl([0.14, 0, 0], [0.98, 0, 0], 0.052, 0.052, { seg: 10, col: STEEL_D });
  kit.mat('armour');
  const m1 = kit.plate([[0.14, 0.17, 0.175], [0.92, 0.13, 0.145], [0.92, 0.13, -0.145], [0.14, 0.17, -0.175]], 0.05, { out: [0, 1, 0] });
  kit.seam(m1, [0.40, 0.155, 0.16], [0.40, 0.155, -0.16]); kit.bolts(m1, 0.028, 1, 0.014);
  const m2 = sideP(0.16, [[0.16, -0.13], [0.88, -0.11], [0.98, -0.05], [0.98, 0.07], [0.88, 0.12], [0.16, 0.15]], 0.03, { col: PAINT2 });
  kit.loop(m2, 0.035, 0.009);
  kit.streak(m2, [0.2, 0.02, 0.16], 0.5, 0.09, 'oil');
  sideP(-0.16, [[0.16, -0.13], [0.88, -0.11], [0.98, -0.05], [0.98, 0.07], [0.88, 0.12], [0.16, 0.15]], 0.03, { col: PAINT2 });
  kit.hazardPlate([[0.62, 0.155, 0.13], [0.62, 0.155, -0.13], [0.88, 0.145, -0.12], [0.88, 0.145, 0.12]], 0.025, { out: [0, 1, 0], sw: 0.04 });
  kit.plate([[0.16, -0.135, 0.16], [0.92, -0.115, 0.13], [0.92, -0.115, -0.13], [0.16, -0.135, -0.16]], 0.03, { out: [0, -1, 0], col: GUN });
  sideP(0.24, [[-0.46, -0.16], [-0.46, -0.04], [-0.15, 0.13], [-0.15, -0.20]], 0.03, { col: GUN });
  sideP(-0.24, [[-0.46, -0.16], [-0.46, -0.04], [-0.15, 0.13], [-0.15, -0.20]], 0.03, { col: GUN });
  kit.mat('rubber');
  kit.tube([[0, 0, 0.28], [0.25, -0.02, 0.205], [0.62, 0.04, 0.20], [0.95, 0, 0.215], [mtF.L, 0, 0.24]], 0.016, { col: CAB_Y });
  kit.tube([[0, 0, 0.28], [0.30, 0.05, 0.205], [0.66, -0.05, 0.20], [0.92, 0.03, 0.215], [mtF.L, 0, 0.24]], 0.014, { col: CAB_K });
  kit.mat('armour');
  const hornA = kit.at(mtF, -0.38, -0.10, 0), hornAb = kit.at(mtF, -0.10, -0.08, 0);
  const toeUp = kit.at(mtF, 0.62, 0.20, 0), toeUpb = kit.at(mtF, 0.70, 0.13, 0);
  kit.frame(null); kit.hull(null);
  kit.lug(hornA, hornAb, z0, { ear: 0.09, w: 0.11, foot: 0.14, t: 0.04 });
  kit.lug(toeUp, toeUpb, z0, { col: GUN, ear: 0.06, w: 0.055, foot: 0.08, t: 0.02 });

  // ---- Foot: armoured toes over rubber soles. Tread reaches y = 0; centre toe tip stays at SK.tipX.
  kit.use(toeG); kit.frame(null); kit.hull(null); kit.mat('armour');
  const toePiece = (deg, len, wid, x0, dz, cols, hBase, segs, rows) => {
    const c = Math.cos(deg * D2R), sn = Math.sin(deg * D2R), w = wid / 2;
    const P = (x, y, z) => [x0 + x * c + z * sn, y, z0 + dz - x * sn + z * c];
    const dirX = [c, 0, -sn], dirZ = [sn, 0, c];
    const halfW = (x) => (x < len * 0.62 ? w : x < len * 0.88 ? w * (1 - 0.34 * (x - len * 0.62) / (len * 0.26)) : w * (0.66 - 0.40 * (x - len * 0.88) / (len * 0.12)));
    const hgt = (x) => hBase - (hBase - 0.125) * Math.max(0, x / len);
    const stations = [-0.05, len * 0.62, len * 0.88, len];
    const outline = [...stations.map((x) => [x, halfW(x)]), ...[...stations].reverse().map((x) => [x, -halfW(x)])];
    // Rubber sole: a band standing proud of the armour, with cross-lugs that actually carry the foot.
    kit.loft([outline.map(([x, z]) => P(x, 0.022, z)), outline.map(([x, z]) => P(x, 0.085, z))], { col: RUB, mat: 'rubber', capEnd: false });
    const pitch = (len + 0.03) / rows, lw = pitch * 0.58;
    for (let i = 0; i < rows; i++) {
      const xc = i === rows - 1 ? len - lw / 2 : -0.03 + pitch * (i + 0.5);
      kit.block(P(xc, 0.0125, 0), [lw, 0.025, 2 * halfW(xc) * 0.9], { ax: [dirX, [0, 1, 0], dirZ], c: 0, col: tone(RUB, 1.25), mat: 'rubber' });
    }
    // Core, then side skirts, shingled knuckle plates and a steel toe cap.
    kit.loft([outline.map(([x, z]) => P(x, 0.085, z * 0.93)), outline.map(([x, z]) => P(Math.min(x, len * 0.97), hgt(x), z * 0.74))], { col: DARK, capStart: false });
    for (const s of [1, -1]) {
      const sd = vAdd(vMul(dirZ, s), [0, 0.3, 0]);
      const sk = kit.plate([P(0, 0.095, s * w * 0.97), P(len * 0.6, 0.095, s * w * 0.97), P(len * 0.6, hgt(len * 0.6) - 0.014, s * w * 0.8), P(0, hgt(0) - 0.014, s * w * 0.8)], 0.024, { out: sd, col: cols.side, noBack: true, c: 0.012 });
      kit.bolts(sk, 0.022, 1, 0.014);
      kit.plate([P(len * 0.62, 0.095, s * w * 0.97), P(len * 0.9, 0.095, s * halfW(len * 0.9) * 0.97), P(len * 0.9, hgt(len * 0.9) - 0.012, s * halfW(len * 0.9) * 0.76), P(len * 0.62, hgt(len * 0.62) - 0.012, s * w * 0.78)], 0.02, { out: vAdd(sd, vMul(dirX, 0.5)), col: cols.a, noBack: true, c: 0.01 });
    }
    const capAt = len * 0.72, step = (capAt + 0.03) / segs, lap = 0.04;
    let last = null;
    for (let i = 0; i < segs; i++) {
      const a = -0.03 + i * step, b = a + step + (i < segs - 1 ? lap : 0), wa = halfW(a) * 0.74 + 0.012, wb = halfW(b) * 0.74 + 0.012, ya = hgt(a) + 0.018, yb = hgt(b) + 0.048;
      last = kit.plate([P(a, ya, wa), P(b, yb, wb), P(b, yb, -wb), P(a, ya, -wa)], 0.04, { out: [0, 1, 0], col: i % 2 ? cols.b : cols.a, c: 0.018 });
      kit.bolts(last, 0.024, 1, 0.017);
      kit.seam(last, last.at(0.5, 0.06), last.at(0.5, 0.94));
    }
    const yc = hgt(capAt) + 0.03, capW = halfW(capAt) * 0.74 + 0.012, tipW = halfW(len) * 0.86;
    kit.plate([P(capAt, yc, capW), P(len * 0.995, 0.128, tipW), P(len * 0.995, 0.128, -tipW), P(capAt, yc, -capW)], 0.04, { out: [0.4, 1, 0], mat: 'steel', col: GM_L, c: 0.016 });
    kit.plate([P(len * 0.998, 0.128, tipW), P(len * 0.998, 0.09, halfW(len) * 0.94), P(len * 0.998, 0.09, -halfW(len) * 0.94), P(len * 0.998, 0.128, -tipW)], 0.03, { out: dirX, mat: 'steel', col: GM, c: 0.008 });
    return { last };
  };
  const ct = toePiece(0, SK.tipX, 0.44, 0, 0, { a: PAINT, b: PAINT2, side: PAINT2 }, 0.31, 2, 7);
  const hz = ct.last;
  kit.hazardPlate([hz.at(0.42, 0.1, 0.008), hz.at(0.96, 0.1, 0.008), hz.at(0.96, 0.9, 0.008), hz.at(0.42, 0.9, 0.008)], 0.02, { out: hz.n, sw: 0.04, c: 0.006, noBack: true });
  toePiece(24, 0.78, 0.29, 0.04, -0.14, { a: PAINT2, b: PAINT, side: GUN }, 0.25, 2, 5);
  toePiece(-24, 0.78, 0.29, 0.04, 0.14, { a: PAINT2, b: PAINT, side: GUN }, 0.25, 2, 5);
  toePiece(180, 0.62, 0.28, -0.02, 0, { a: GUN, b: PAINT2, side: GUN }, 0.23, 1, 4);
  kit.mat('steel');
  kit.drum([0, SK.toeH, z0], [0, 0, 1], 0.17, 0.46, { bolts: 6, seg: 18 });
  kit.mat('armour');
  kit.block([0.04, 0.17, z0], [0.46, 0.27, 0.42], { col: GUN, c: 0.03 });
  const ftTop = kit.plate([[-0.14, 0.325, z0 + 0.20], [0.27, 0.27, z0 + 0.20], [0.27, 0.27, z0 - 0.20], [-0.14, 0.325, z0 - 0.20]], 0.03, { out: [0, 1, 0], col: PAINT2 });
  kit.bolts(ftTop, 0.024, 1, 0.016);
  kit.ventOn(ftTop, 0.22, 0.78, 0.2, 0.8, { n: 4 });
  const ftFront = kit.plate([[0.20, 0.312, z0 + 0.215], [0.335, 0.225, z0 + 0.215], [0.335, 0.225, z0 - 0.215], [0.20, 0.312, z0 - 0.215]], 0.03, { out: [0.6, 1, 0], col: PAINT });
  kit.bolts(ftFront, 0.022, 1, 0.014);
  const ftRear = kit.plate([[-0.15, 0.335, z0 + 0.205], [-0.15, 0.335, z0 - 0.205], [-0.28, 0.20, z0 - 0.195], [-0.28, 0.20, z0 + 0.195]], 0.03, { out: [-0.7, 1, 0], col: GUN });
  kit.bolts(ftRear, 0.022, 1, 0.014);
  kit.streak(ftRear, [-0.17, 0.32, z0 + 0.08], 0.22, 0.07, 'oil');
  const toeB = [0.38, 0.30, 0], toeBb = [0.42, 0.20, 0];
  kit.lug([toeB[0], toeB[1], 0], [toeBb[0], toeBb[1], 0], z0, { col: GUN, ear: 0.055, w: 0.055, foot: 0.08, t: 0.02 });

  // ---- Leg hydraulics: each spans one joint and is aim-constrained at both ends.
  const pelvisAnchor = [-0.72, 3.50, z0];
  kit.piston('Hip_' + side, pelvisG, pelvisAnchor, hipG, hipLugT, { r: 0.085, rod: 0.05 });
  kit.piston('Knee_' + side, hipG, kneeA, kneeG, hornK, { r: 0.098, rod: 0.058, hose: CAB_R });
  kit.piston('Ankle_' + side, kneeG, calfA, ankleG, hornA, { r: 0.098, rod: 0.058, hose: CAB_R });
  kit.piston('Toe_' + side, ankleG, toeUp, toeG, [toeB[0], toeB[1], z0], { r: 0.052, rod: 0.03, seg: 10 });
  kit.mirror(1);
  return { hipG, kneeG, ankleG, toeG };
}

// ---------------------------------------------------------------- pelvis
function buildPelvis(kit, pelvisG) {
  const z0 = SK.legZ, y0 = SK.hip[1];
  kit.use(pelvisG); kit.frame(null); kit.mirror(1); kit.hull([0, y0, 0]); kit.mat('armour');
  const oct = (y, xf, xr, hz, cut) => [[xr + cut, y, hz], [xf - cut, y, hz], [xf, y, hz - cut], [xf, y, -hz + cut], [xf - cut, y, -hz], [xr + cut, y, -hz], [xr, y, -hz + cut], [xr, y, hz - cut]];
  kit.loft([oct(3.00, 0.34, -0.34, 0.34, 0.08), oct(3.18, 0.56, -0.58, 0.50, 0.12), oct(3.62, 0.60, -0.66, 0.52, 0.12), oct(3.80, 0.50, -0.54, 0.50, 0.10)], { col: DARK });
  const f0 = kit.plate([[0.635, 3.66, 0.27], [0.635, 3.66, -0.27], [0.60, 3.20, -0.24], [0.60, 3.20, 0.24]], 0.06, { col: BONE });
  kit.loop(f0, 0.05); kit.bolts(f0, 0.03, 1, 0.016);
  kit.stencil([0.612, 3.34, 0.13], [0, 0, -1], [0.076, 0.997, 0], 'H-7', 0.13, RUST, [0.997, -0.076, 0]);
  kit.hazardPlate([[0.60, 3.19, 0.24], [0.60, 3.19, -0.24], [0.38, 2.99, -0.16], [0.38, 2.99, 0.16]], 0.04, { out: [1, -0.8, 0], sw: 0.05 });
  const rr0 = kit.plate([[-0.70, 3.66, 0.30], [-0.70, 3.66, -0.30], [-0.62, 3.20, -0.26], [-0.62, 3.20, 0.26]], 0.05, { col: PAINT2 });
  kit.vent([-0.692, 3.58, 0.20], [-0.692, 3.58, -0.20], [-0.642, 3.30, -0.17], [-0.642, 3.30, 0.17], { n: 6 });
  kit.seam(rr0, [-0.63, 3.26, 0.24], [-0.63, 3.26, -0.24]);
  kit.plate([[-0.62, 3.19, 0.26], [-0.62, 3.19, -0.26], [-0.38, 2.99, -0.18], [-0.38, 2.99, 0.18]], 0.04, { col: GUN, out: [-1, -0.8, 0] });
  for (const s of [1, -1]) {
    kit.mirror(s); kit.mat('steel');
    kit.drum([0, y0, 0.53], [0, 0, 1], 0.46, 0.13, { gear: 32, bolts: 12, gearW: 0.7, seg: 26 });
    kit.mat('armour');
    const a = kit.plate([[0.635, 3.68, 0.28], [0.635, 3.68, 0.525], [0.60, 3.20, 0.505], [0.60, 3.20, 0.25]], 0.05);
    kit.bolts(a, 0.03, 1, 0.016);
    kit.streak(a, [0.63, 3.64, 0.40], 0.42, 0.09, 'oil');
    kit.plate([[0.60, 3.19, 0.25], [0.60, 3.19, 0.505], [0.36, 3.02, 0.345], [0.38, 2.99, 0.17]], 0.04, { col: PAINT2, out: [1, -0.8, 0.3] });
    kit.plate([[-0.70, 3.68, 0.31], [-0.70, 3.68, 0.53], [-0.62, 3.20, 0.51], [-0.62, 3.20, 0.27]], 0.05, { col: PAINT2 });
    kit.plate([[-0.62, 3.19, 0.27], [-0.62, 3.19, 0.51], [-0.36, 3.02, 0.345], [-0.38, 2.99, 0.19]], 0.04, { col: GUN, out: [-1, -0.8, 0.3] });
    const t = kit.plate([[0.50, 3.84, 0.53], [-0.56, 3.84, 0.53], [-0.60, 3.68, 0.555], [0.56, 3.68, 0.555]], 0.04, { col: PAINT, out: [0, 0.7, 1] });
    kit.seam(t, [0.2, 3.76, 0.545], [-0.2, 3.76, 0.545]);
    // Outrigger carrying the hip piston's upper pin
    kit.mat('steel');
    kit.block([-0.70, 3.50, 0.63], [0.13, 0.15, 0.60], { col: GUN, c: 0.02 });
    kit.mat('rubber');
    kit.tube([[-0.58, 3.62, 0.30], [-0.70, 3.62, 0.42], [-0.76, 3.54, 0.62], [-0.74, 3.42, 0.78], [-0.46, 3.36, 0.72], [-0.1, 3.42, 0.60], [0, y0, 0.60]], 0.017, { col: CAB_K, sp: 3 });
    kit.mat('armour');
    kit.lug([-0.72, 3.50, 0], [-0.70, 3.50, 0], z0, { col: GUN, ear: 0.085, foot: 0.085, w: 0.085 });
  }
  kit.mirror(1); kit.mat('steel');
  kit.lathe([0, 3.76, 0], [0, 1, 0], [[0, 0.46, GM_D], [0.02, 0.60, GM_H, 1], [0.03, 0.60, GM], [0.09, 0.60, GM_H, 1], [0.11, 0.52, GM_D], [0.15, 0.50, GM], [0.15, 0, GM]], { seg: 32 });
  const NT = 40;
  for (let i = 0; i < NT; i++) {
    const th = (i / NT) * 2 * Math.PI, rad = [Math.cos(th), 0, Math.sin(th)], tan = [-Math.sin(th), 0, Math.cos(th)];
    kit.block(vAdd([0, 3.825, 0], vMul(rad, 0.612)), [0.03, 0.05, 0.05], { ax: [rad, [0, 1, 0], tan], c: 0, col: GM_L, polish: true });
  }
  kit.mat('armour');
}

// ---------------------------------------------------------------- torso, cockpit, backpack
function buildTorso(kit, waistG) {
  kit.use(waistG); kit.frame(null); kit.mirror(1); kit.hull([0, 4.6, 0]); kit.mat('armour');
  const tRing = (y, f, n, r, h) => {
    const c = Math.max(0.56, h * 0.62);
    return [[r + 0.18, y, h], [f - 0.30, y, h], [f, y, c], [f, y, 0.52], [n, y, 0.50], [n, y, -0.50], [f, y, -0.52], [f, y, -c], [f - 0.30, y, -h], [r + 0.18, y, -h], [r, y, -h * 0.55], [r, y, h * 0.55]];
  };
  kit.loft([tRing(3.96, 0.50, 0.50, -0.50, 0.60), tRing(4.25, 0.72, 0.72, -0.70, 0.88), tRing(4.56, 0.86, 0.86, -0.84, 1.10), tRing(4.60, 0.87, 0.40, -0.85, 1.12), tRing(5.10, 0.84, 0.40, -0.92, 1.18), tRing(5.40, 0.62, 0.40, -0.88, 1.02), tRing(5.44, 0.60, 0.60, -0.88, 1.00), tRing(5.62, 0.25, 0.25, -0.70, 0.72)], { col: DARK });
  kit.mat('steel');
  kit.lathe([0, 3.90, 0], [0, 1, 0], [[0, 0, STEEL_D], [0, 0.50, STEEL_D], [0.04, 0.50, GUN], [0.08, 0.58, GUN]], { seg: 28 });
  for (const s of [1, -1]) { kit.mirror(s); kit.drum([0.34, 3.97, 0.36], [0, 1, 0], 0.09, 0.14, { bolts: 0, seg: 12 }); }
  kit.mirror(1); kit.mat('armour');

  // Abdomen bands
  const ab1 = kit.plate([[0.76, 4.27, 0.56], [0.76, 4.27, -0.56], [0.63, 4.13, -0.50], [0.63, 4.13, 0.50]], 0.05, { col: PAINT2 });
  kit.bolts(ab1, 0.026, 2, 0.014);
  const ab2 = kit.plate([[0.67, 4.15, 0.48], [0.67, 4.15, -0.48], [0.55, 4.02, -0.42], [0.55, 4.02, 0.42]], 0.05, { col: GUN });
  kit.loop(ab2, 0.03, 0.009);
  kit.hazardPlate([[0.56, 4.035, 0.40], [0.56, 4.035, -0.40], [0.50, 3.94, -0.36], [0.50, 3.94, 0.36]], 0.04, { sw: 0.05 });
  const rb1 = kit.plate([[-0.72, 4.26, 0.56], [-0.72, 4.26, -0.56], [-0.52, 3.98, -0.40], [-0.52, 3.98, 0.40]], 0.05, { col: GUN });
  kit.bolts(rb1, 0.03, 1, 0.014);

  for (const s of [1, -1]) {
    kit.mirror(s);
    // Cheek intake block
    const c0 = kit.plate([[0.915, 4.62, 0.53], [0.915, 4.62, 0.70], [0.885, 5.08, 0.74], [0.885, 5.08, 0.53]], 0.05, { col: BONE });
    kit.bolts(c0, 0.026, 1, 0.014);
    const ob = kit.plate([[0.915, 4.60, 0.71], [0.60, 4.60, 1.15], [0.58, 5.09, 1.215], [0.89, 5.09, 0.75]], 0.06, { col: PAINT });
    kit.vent([0.885, 4.66, 0.745], [0.635, 4.66, 1.095], [0.625, 4.92, 1.135], [0.875, 4.92, 0.77], { n: 6, col: GUN });
    kit.seam(ob, [0.885, 4.97, 0.76], [0.62, 4.97, 1.15]); kit.bolts(ob, 0.03, 1, 0.016);
    kit.mat('glowAmber');
    kit.lathe([0.916, 4.75, 0.615], [1, 0, 0], [[0, 0.03], [0.012, 0.022], [0.012, 0]], { seg: 8, mat: 'glowAmber' });
    kit.mat('armour');
    const br = kit.plate([[0.90, 5.11, 0.53], [0.90, 5.11, 0.77], [0.66, 5.41, 0.68], [0.66, 5.41, 0.53]], 0.055, { col: PAINT2 });
    kit.bolts(br, 0.028, 1, 0.014);
    const br2 = kit.plate([[0.60, 5.12, 1.22], [0.89, 5.12, 0.79], [0.66, 5.41, 0.70], [0.42, 5.41, 1.03]], 0.05, { col: PAINT });
    kit.loop(br2, 0.04);
    kit.plate([[0.885, 4.575, 0.50], [0.885, 4.575, 0.71], [0.745, 4.255, 0.565], [0.745, 4.255, 0.50]], 0.05, { col: GUN });
    const fl = kit.plate([[0.885, 4.575, 0.72], [0.585, 4.575, 1.125], [0.43, 4.255, 0.90], [0.745, 4.255, 0.575]], 0.055, { col: PAINT });
    kit.seam(fl, [0.81, 4.415, 0.635], [0.51, 4.415, 1.01]); kit.bolts(fl, 0.03, 1, 0.016);
    const sl = kit.plate([[0.42, 4.26, 0.915], [-0.42, 4.26, 0.915], [-0.54, 4.56, 1.135], [0.56, 4.56, 1.135]], 0.05, { col: PAINT2 });
    kit.seam(sl, [0.1, 4.28, 0.93], [0.14, 4.54, 1.125]); kit.seam(sl, [-0.2, 4.28, 0.93], [-0.24, 4.54, 1.125]);
    kit.hazardPlate([[0.40, 4.225, 0.875], [-0.40, 4.225, 0.875], [-0.42, 4.14, 0.80], [0.42, 4.14, 0.80]], 0.03, { sw: 0.06, out: [0, -0.5, 1] });
    kit.plate([[0.52, 4.60, 1.155], [0.52, 5.09, 1.215], [0.30, 5.09, 1.215], [0.30, 4.60, 1.155]], 0.04, { col: PAINT });
    const srr = kit.plate([[-0.26, 4.60, 1.155], [-0.26, 5.09, 1.215], [-0.70, 5.09, 1.215], [-0.70, 4.60, 1.155]], 0.05, { col: PAINT });
    kit.loop(srr, 0.04); kit.bolts(srr, 0.025, 2, 0.014);
    kit.streak(srr, [-0.32, 5.04, 1.21], 0.4, 0.1, 'oil');
    const rf = kit.plate([[0.38, 5.46, 1.015], [-0.66, 5.46, 1.015], [-0.53, 5.64, 0.735], [0.10, 5.64, 0.735]], 0.05, { col: PAINT });
    kit.bolts(rf, 0.03, 2, 0.014); kit.seam(rf, [-0.12, 5.47, 1.0], [-0.2, 5.63, 0.74]);
    // Shoulder yoke
    kit.mat('steel');
    kit.drum([0.02, 5.00, 1.255], [0, 0, 1], 0.40, 0.17, { gear: 30, bolts: 10, gearW: 0.6, seg: 24 });
    kit.block([0.02, 4.70, 1.20], [0.34, 0.34, 0.13], { col: GUN, c: 0.03 });
    kit.mat('rubber');
    kit.tube([[-0.74, 5.12, 1.05], [-0.68, 5.18, 1.26], [-0.34, 5.27, 1.37], [-0.05, 5.1, 1.37], [0.02, 5.0, 1.36]], 0.02, { col: CAB_K });
    kit.tube([[-0.74, 5.05, 1.05], [-0.70, 5.08, 1.27], [-0.40, 5.15, 1.37], [-0.08, 5.05, 1.37], [0.02, 5.0, 1.36]], 0.016, { col: CAB_R });
    kit.mat('armour');
  }
  kit.mirror(1);
  // Brow, roof, hatch
  const fh = kit.plate([[0.625, 5.46, 0.60], [0.625, 5.46, -0.60], [0.27, 5.645, -0.43], [0.27, 5.645, 0.43]], 0.055, { col: PAINT2 });
  kit.bolts(fh, 0.03, 2, 0.014);
  const rft = kit.plate([[0.26, 5.645, 0.70], [0.26, 5.645, -0.70], [-0.52, 5.645, -0.70], [-0.52, 5.645, 0.70]], 0.04, { col: PAINT2 });
  kit.loop(rft, 0.06);
  kit.mat('steel');
  kit.lathe([-0.14, 5.645, 0.12], [0, 1, 0], [[0, 0.24, GUN], [0.035, 0.24, GUN], [0.05, 0.21, STEEL_D], [0.05, 0, STEEL_D]], { seg: 16 });
  kit.block([-0.14, 5.71, 0.12], [0.30, 0.03, 0.04], { col: STEEL });
  // Sensor pod and whip antenna
  kit.block([0.05, 5.70, -0.34], [0.26, 0.11, 0.28], { col: GUN, c: 0.02 });
  kit.cyl([-0.42, 5.65, -0.52], [-0.42, 5.98, -0.52], 0.014, 0.006, { seg: 6, col: RUB });
  kit.cyl([-0.42, 5.65, -0.40], [-0.42, 5.84, -0.40], 0.012, 0.005, { seg: 6, col: RUB });
  kit.lathe([0.18, 5.70, -0.34], [1, 0, 0], [[0, 0.04, GUN], [0.02, 0.04, GUN], [0.02, 0.028, GUN]], { seg: 10 });
  kit.mat('glowCyan');
  kit.lathe([0.20, 5.70, -0.34], [1, 0, 0], [[0, 0.028], [0.006, 0.02], [0.006, 0]], { seg: 10, mat: 'glowCyan' });
  kit.mat('armour');

  // ---- Chin tub
  kit.hull([1.0, 4.40, 0]);
  const chinRing = (x, yt, yb, z, cut) => [[x, yt, z], [x, yt, -z], [x, yb + cut, -z], [x, yb, -z + cut], [x, yb, z - cut], [x, yb + cut, z]];
  kit.loft([chinRing(0.66, 4.60, 4.10, 0.50, 0.10), chinRing(1.12, 4.60, 4.33, 0.47, 0.08), chinRing(1.43, 4.62, 4.49, 0.25, 0.05)], { col: DARK });
  const ch1 = kit.plate([[1.15, 4.34, 0.45], [1.15, 4.34, -0.45], [0.70, 4.09, -0.47], [0.70, 4.09, 0.47]], 0.05, { col: PAINT });
  kit.bolts(ch1, 0.03, 2, 0.014); kit.seam(ch1, [0.92, 4.21, 0.44], [0.92, 4.21, -0.44]);
  const ch2 = kit.plate([[1.45, 4.49, 0.235], [1.45, 4.49, -0.235], [1.17, 4.33, -0.40], [1.17, 4.33, 0.40]], 0.05, { col: PAINT2 });
  kit.bolts(ch2, 0.025, 1, 0.012);
  kit.hazardPlate([[1.455, 4.63, 0.235], [1.455, 4.63, -0.235], [1.455, 4.50, -0.235], [1.455, 4.50, 0.235]], 0.03, { sw: 0.05, out: [1, 0, 0] });
  for (const s of [1, -1]) {
    kit.mirror(s);
    const cs = kit.plate([[1.13, 4.61, 0.485], [0.68, 4.61, 0.515], [0.68, 4.15, 0.515], [1.13, 4.37, 0.485]], 0.05, { col: PAINT, out: [0, 0, 1] });
    kit.seam(cs, [0.90, 4.60, 0.50], [0.90, 4.24, 0.50]); kit.bolts(cs, 0.026, 1, 0.014);
    kit.plate([[1.44, 4.62, 0.26], [1.15, 4.61, 0.47], [1.15, 4.37, 0.47], [1.44, 4.51, 0.26]], 0.04, { col: GUN, out: [0.5, 0, 1] });
    // Lamps
    kit.mat('steel');
    kit.lathe([1.22, 4.42, 0.335], [1, 0.1, 0.25], [[0, 0, GUN], [0, 0.05, GUN], [0.05, 0.05, GUN], [0.05, 0.036, GUN]], { seg: 10 });
    kit.mat('glowCyan');
    kit.lathe(vAdd([1.22, 4.42, 0.335], vMul(vUnit([1, 0.1, 0.25]), 0.04)), [1, 0.1, 0.25], [[0, 0.036], [0.006, 0]], { seg: 10, mat: 'glowCyan' });
    kit.mat('armour');
  }
  kit.mirror(1);

  // ---- Cockpit interior
  kit.hull(null); kit.mat('armour');
  kit.poly([[0.40, 4.606, 0.49], [1.14, 4.606, 0.46], [1.39, 4.606, 0.24], [1.39, 4.606, -0.24], [1.14, 4.606, -0.46], [0.40, 4.606, -0.49]], lin(0x2a2c2e), { out: [0, 1, 0] });
  kit.mat('steel');
  kit.block([0.46, 4.97, 0], [0.09, 0.66, 0.44], { col: GUN, c: 0.02, edge: tone(GUN, 1.25) });
  kit.block([0.47, 5.27, 0], [0.08, 0.13, 0.20], { col: GUN, c: 0.015, edge: tone(GUN, 1.25) });
  kit.block([0.70, 4.70, 0], [0.42, 0.10, 0.44], { col: GUN, c: 0.02, edge: tone(GUN, 1.25) });
  kit.mat('rubber');
  // Seated pilot: rounded limbs in a flight suit, dark visor
  kit.lathe([0.62, 4.74, 0], [0, 1, 0], [[0, 0, SUIT], [0, 0.11, SUIT], [0.10, 0.135, SUIT], [0.27, 0.16, SUIT], [0.35, 0.12, SUIT], [0.37, 0.05, RUB], [0.43, 0.04, RUB], [0.43, 0, RUB]], { seg: 10, mat: 'rubber' });
  for (const sz of [1, -1]) {
    kit.tube([[0.64, 5.04, sz * 0.15], [0.70, 4.92, sz * 0.21], [0.84, 4.88, sz * 0.19], [0.95, 4.85, sz * 0.13]], 0.046, { col: SUIT, seg: 7, sp: 2 });
    kit.tube([[0.66, 4.78, sz * 0.09], [0.84, 4.82, sz * 0.10], [0.99, 4.80, sz * 0.10], [1.05, 4.64, sz * 0.10]], 0.066, { col: tone(SUIT, 0.85), seg: 7, sp: 2 });
  }
  kit.lathe([0.64, 5.12, 0], [0, 1, 0], [[0, 0, BONE], [0, 0.07, BONE], [0.05, 0.115, BONE], [0.14, 0.12, BONE], [0.20, 0.075, BONE], [0.22, 0, BONE]], { seg: 12, mat: 'rubber' });
  kit.poly([[0.76, 5.26, 0.085], [0.76, 5.26, -0.085], [0.76, 5.18, -0.085], [0.76, 5.18, 0.085]], tone(RUB, 0.5), { out: [1, 0, 0], mat: 'rubber' });
  kit.mat('steel');
  kit.block([1.08, 4.76, 0], [0.32, 0.30, 0.62], { col: GUN, c: 0.02, ax: [vUnit([1, 0.45, 0]), vUnit([-0.45, 1, 0]), [0, 0, 1]] });
  kit.mat('glowCyan');
  const scr = (z0, w) => kit.poly([[0.985, 4.93, z0 + w], [0.985, 4.93, z0 - w], [0.915, 4.80, z0 - w], [0.915, 4.80, z0 + w]].map((p) => [p[0] + 0.012, p[1] + 0.012, p[2]]), WHITE, { out: [-1, 0.5, 0], mat: 'glowCyan' });
  scr(0, 0.10); kit.mat('glowAmber');
  kit.poly([[1.00, 4.93, 0.27], [1.00, 4.93, 0.15], [0.93, 4.80, 0.15], [0.93, 4.80, 0.27]], WHITE, { out: [-1, 0.5, 0], mat: 'glowAmber' });
  kit.mat('glowCyan');
  kit.poly([[1.00, 4.93, -0.15], [1.00, 4.93, -0.27], [0.93, 4.80, -0.27], [0.93, 4.80, -0.15]], WHITE, { out: [-1, 0.5, 0], mat: 'glowCyan' });
  kit.mat('armour');

  // ---- Glass canopy and frame
  const A0b = [0.80, 4.60, 0.50], A0s = [0.80, 5.18, 0.50], A0t = [0.80, 5.42, 0.26];
  const A1b = [1.14, 4.60, 0.47], A1s = [1.14, 5.04, 0.44], A1t = [1.14, 5.20, 0.20];
  const A2b = [1.40, 4.62, 0.25], A2t = [1.40, 4.84, 0.12];
  const mz = (p) => [p[0], p[1], -p[2]];
  const cc = [1.0, 4.9, 0];
  const pane = (pts) => kit.poly(pts, WHITE, { out: vSub(centroid(pts), cc), mat: 'glass' });
  pane([A0t, A1t, mz(A1t), mz(A0t)]);
  pane([A1t, A2t, mz(A2t), mz(A1t)]);
  pane([A2t, A2b, mz(A2b), mz(A2t)]);
  for (const f of [(p) => p, mz]) {
    pane([f(A0s), f(A1s), f(A1t), f(A0t)]);
    pane([f(A0b), f(A1b), f(A1s), f(A0s)]);
    pane([f(A1b), f(A2b), f(A2t), f(A1s)]);
    pane([f(A1s), f(A2t), f(A1t)]);
  }
  kit.mat('steel');
  const bar = (a, b, r = 0.026) => kit.cyl(a, b, r, r, { seg: 6, col: GUN });
  for (const f of [(p) => p, mz]) {
    bar(f(A0b), f(A0s), 0.038); bar(f(A0s), f(A0t), 0.038);
    bar(f(A1b), f(A1s)); bar(f(A1s), f(A1t));
    bar(f(A0s), f(A1s), 0.016); bar(f(A0t), f(A1t)); bar(f(A1t), f(A2t)); bar(f(A1s), f(A2t), 0.016); bar(f(A1b), f(A2b)); bar(f(A0b), f(A1b)); bar(f(A2b), f(A2t));
  }
  bar(A0t, mz(A0t), 0.03); bar(A1t, mz(A1t)); bar(A2t, mz(A2t)); bar(A2b, mz(A2b));
  kit.mat('armour');

  // ---- Backpack: reactor block, radiators, stacks
  kit.hull([-1.1, 4.8, 0]);
  const bRing = (x, y0, y1, z) => [[x, y1, z], [x, y1, -z], [x, y0, -z], [x, y0, z]];
  kit.loft([bRing(-0.78, 4.24, 5.46, 0.86), bRing(-1.22, 4.32, 5.40, 0.78), bRing(-1.46, 4.48, 5.22, 0.60)], { col: DARK });
  const bt = kit.plate([[-0.80, 5.49, 0.82], [-0.80, 5.49, -0.82], [-1.25, 5.43, -0.76], [-1.25, 5.43, 0.76]], 0.05, { col: PAINT });
  kit.loop(bt, 0.05); kit.bolts(bt, 0.026, 2, 0.014);
  kit.streak(bt, [-0.92, 5.48, 0.44], 0.34, 0.2, 'soot'); kit.streak(bt, [-0.92, 5.48, -0.44], 0.34, 0.2, 'soot');
  const br0 = kit.hazardPlate([[-1.26, 5.43, 0.74], [-1.26, 5.43, -0.74], [-1.46, 5.25, -0.58], [-1.46, 5.25, 0.58]], 0.03, { sw: 0.08, out: [-1, 1, 0] });
  kit.bolts(br0, 0.018, 1, 0.012);
  const rearP = kit.plate([[-1.49, 5.20, 0.56], [-1.49, 5.20, -0.56], [-1.49, 4.50, -0.56], [-1.49, 4.50, 0.56]], 0.03, { col: PAINT2, out: [-1, 0, 0] });
  kit.bolts(rearP, 0.03, 2, 0.016);
  kit.streak(rearP, [-1.49, 4.60, 0.28], 0.1, 0.26, 'soot'); kit.streak(rearP, [-1.49, 4.60, -0.28], 0.1, 0.26, 'soot');
  for (const z of [0.28, -0.28]) {
    kit.vent([-1.50, 4.60, z - 0.20], [-1.50, 4.60, z + 0.20], [-1.50, 5.08, z + 0.20], [-1.50, 5.08, z - 0.20], { n: 7, col: GUN, base: WHITE, glow: 'glowAmber', depth: 0.02 });
  }
  kit.stencil([-1.505, 4.52, 0.08], [0, 0, -1], [0, 1, 0], 'HE', 0.06, HAZ_Y, [-1, 0, 0]);
  for (const s of [1, -1]) {
    kit.mirror(s);
    const sd = kit.plate([[-0.82, 5.36, 0.875], [-1.20, 5.32, 0.795], [-1.20, 5.02, 0.795], [-0.82, 5.02, 0.875]], 0.04, { col: PAINT2, out: [0, 0, 1] });
    kit.bolts(sd, 0.024, 1, 0.012);
    kit.mat('steel');
    // Radiator bank: fins over a dark core, exposed on the flank
    kit.block([-1.02, 4.66, 0.82], [0.44, 0.60, 0.04], { col: tone(GUN, 0.4), c: 0 });
    for (let i = 0; i < 11; i++) kit.block([-0.82 - i * 0.04, 4.66, 0.86], [0.012, 0.56, 0.05], { col: STEEL_D, c: 0 });
    // Stack
    kit.lathe([-1.32, 5.30, 0.44], [-0.12, 1, 0], [[0, 0.11, GUN], [0.40, 0.095, GUN], [0.40, 0.12, STEEL_D], [0.50, 0.12, STEEL_D], [0.50, 0.08, tone(RUB, 0.6)], [0.42, 0.075, tone(RUB, 0.6)], [0.42, 0, tone(RUB, 0.6)]], { seg: 12 });
    // Coolant lines to the waist axis
    kit.mat('rubber');
    kit.tube([[-0.92, 4.26, 0.46], [-0.86, 4.04, 0.42], [-0.60, 3.96, 0.30], [-0.26, 3.95, 0.14], [0, 3.94, 0.02]], 0.024, { col: CAB_K });
    kit.tube([[-0.98, 4.26, 0.34], [-0.90, 4.03, 0.30], [-0.62, 3.95, 0.20], [-0.26, 3.95, 0.09], [0, 3.94, 0.01]], 0.018, { col: CAB_B });
    kit.mat('armour');
  }
  kit.mirror(1);

  // ---- Right shoulder sensor / counterweight (torso mounted)
  kit.hull(null);
  kit.block([-0.08, 5.51, 0.92], [0.50, 0.18, 0.38], { col: PAINT2, c: 0.03 });
  kit.mat('steel');
  for (const dz of [-0.09, 0.09]) {
    kit.lathe([0.17, 5.53, 0.92 + dz], [1, 0, 0], [[-0.02, 0, GUN], [-0.02, 0.06, GUN], [0.07, 0.066, GUN], [0.07, 0.042, tone(GUN, 0.4)], [0.05, 0.042, tone(GUN, 0.4)]], { seg: 12 });
    kit.mat('glowCyan');
    kit.lathe([0.22, 5.53, 0.92 + dz], [1, 0, 0], [[0, 0.042], [0.006, 0], [0.006, 0]], { seg: 12, mat: 'glowCyan' });
    kit.mat('steel');
  }
  kit.mat('armour');
  // Paint on the rear hull facets and backpack flanks
  kit.hull([-1.0, 4.8, 0]);
  for (const s of [1, -1]) {
    kit.mirror(s);
    const rh = kit.plate([[-0.66, 4.60, 1.125], [-0.82, 4.60, 0.90], [-0.87, 5.09, 0.90], [-0.71, 5.09, 1.19]], 0.05, { col: PAINT2, out: [-1, 0, 1] });
    kit.bolts(rh, 0.026, 1, 0.014);
    const bf = kit.plate([[-1.24, 5.38, 0.80], [-1.24, 4.34, 0.80], [-1.48, 4.50, 0.615], [-1.48, 5.20, 0.615]], 0.04, { col: PAINT, out: [-0.6, 0, 1] });
    kit.loop(bf, 0.04); kit.bolts(bf, 0.022, 1, 0.012);
    kit.plate([[-0.80, 4.21, 0.84], [-1.22, 4.29, 0.76], [-1.22, 4.29, 0.04], [-0.80, 4.21, 0.04]], 0.03, { col: PAINT2, out: [0, -1, 0] });
  }
  kit.mirror(1);
  const rs = kit.plate([[-0.52, 5.647, 0.70], [-0.52, 5.647, -0.70], [-0.78, 5.50, -0.84], [-0.78, 5.50, 0.84]], 0.05, { col: PAINT, out: [-0.5, 1, 0] });
  kit.bolts(rs, 0.03, 2, 0.014); kit.seam(rs, [-0.65, 5.575, 0.76], [-0.65, 5.575, -0.76]);
  kit.hull(null);
  // Pod pylon on the left shoulder line
  kit.mat('steel');
  kit.beam([-0.05, 5.44, -0.80], [-0.05, 5.50, -1.34], 0.13, 0.20, { col: GUN, c: 0.02, up: [0, 1, 0] });
  kit.mat('armour');
}

// ---------------------------------------------------------------- arms
function buildUpperArm(kit, side, waistG) {
  const s = side === 'L' ? -1 : 1, z0 = SK.armZ;
  kit.mirror(s);
  const G = kit.group('Shoulder_' + side, waistG, [SK.shoulder[0], SK.shoulder[1], s * z0], 'UpperArm_' + side);
  G.node.userData = { hinge: 'z' };
  const F = kit.bone(SK.shoulder, SK.elbow, z0);
  kit.use(G); kit.frame(F); kit.hull(null); kit.mat('steel');
  kit.drum([0, 0, -0.02], [0, 0, 1], 0.33, 0.50, { bolts: 10, seg: 24 });
  kit.mat('armour');
  // Pauldron core: the dark shadow gap behind every armour layer.
  kit.block([-0.02, 0.01, 0.05], [0.84, 0.74, 0.62], { col: DARK, c: 0.05 });

  // Crown: a cap and four sloped facets, each its own bevelled plate, with a bolted spine on top.
  const crown = kit.plate([[-0.47, -0.19, 0.19], [-0.47, 0.21, 0.19], [-0.47, 0.21, -0.19], [-0.47, -0.19, -0.19]], 0.05, { col: PAINT, out: [-1, 0, 0] });
  kit.bolts(crown, 0.024, 1, 0.017);
  const spine = kit.plate([[-0.476, -0.15, 0.05], [-0.476, 0.17, 0.05], [-0.476, 0.17, -0.05], [-0.476, -0.15, -0.05]], 0.012, { col: GUN, out: [-1, 0, 0], noBack: true, c: 0.01 });
  const cO = kit.plate([[-0.47, -0.19, 0.195], [-0.47, 0.21, 0.195], [-0.34, 0.35, 0.345], [-0.34, -0.33, 0.345]], 0.05, { col: PAINT2, out: [-0.6, 0, 0.8] });
  kit.bolts(cO, 0.026, 1, 0.017); kit.seam(cO, cO.at(0.5, 0.06), cO.at(0.5, 0.94));
  const cF = kit.plate([[-0.47, 0.215, 0.19], [-0.47, 0.215, -0.19], [-0.33, 0.41, -0.27], [-0.33, 0.41, 0.335]], 0.05, { col: PAINT, out: [-0.6, 0.8, 0] });
  kit.bolts(cF, 0.026, 1, 0.017);
  const cR = kit.plate([[-0.47, -0.195, -0.19], [-0.47, -0.195, 0.19], [-0.33, -0.38, 0.335], [-0.33, -0.38, -0.27]], 0.05, { col: PAINT2, out: [-0.6, -0.8, 0] });
  kit.bolts(cR, 0.026, 1, 0.017);
  const cI = kit.plate([[-0.47, 0.21, -0.195], [-0.47, -0.19, -0.195], [-0.33, -0.36, -0.295], [-0.33, 0.39, -0.295]], 0.05, { col: PAINT2, out: [-0.6, 0, -0.8] });
  kit.bolts(cI, 0.026, 1, 0.017);

  // Outer face: three lames lapped like shingles, flaring outward toward the bottom.
  const L1 = kit.plate([[-0.35, -0.345, 0.345], [-0.35, 0.365, 0.345], [-0.05, 0.41, 0.39], [-0.05, -0.385, 0.39]], 0.05, { col: PAINT, out: [0, 0, 1] });
  kit.bolts(L1, 0.03, 2, 0.019);
  kit.seam(L1, L1.at(0.34, 0.05), L1.at(0.34, 0.95));
  kit.ventOn(L1, 0.5, 0.9, 0.2, 0.78, { n: 4 });
  const L2 = kit.plate([[-0.10, -0.37, 0.37], [-0.10, 0.395, 0.37], [0.20, 0.40, 0.41], [0.20, -0.385, 0.41]], 0.05, { col: PAINT2, out: [0, 0, 1] });
  kit.bolts(L2, 0.03, 2, 0.019);
  const num = kit.plate([[-0.03, -0.20, 0.395], [-0.03, 0.22, 0.395], [0.17, 0.22, 0.423], [0.17, -0.20, 0.423]], 0.022, { col: BONE, out: [0, 0, 1], noBack: true, c: 0.01 });
  kit.bolts(num, 0.018, 1, 0.012);
  kit.stencil(num.at(0.1, 0.92, 0), [0, 1, 0], [-0.99, 0, -0.14], side === 'R' ? '07' : '12', 0.15, RUST, num.n);
  const L3 = kit.plate([[0.15, -0.365, 0.39], [0.15, 0.38, 0.39], [0.46, 0.27, 0.43], [0.46, -0.25, 0.43]], 0.05, { col: PAINT, out: [0, 0, 1] });
  kit.bolts(L3, 0.03, 1, 0.019);
  kit.hazardPlate([L3.at(0.1, 0.58, 0.008), L3.at(0.9, 0.58, 0.008), L3.at(0.9, 0.94, 0.008), L3.at(0.1, 0.94, 0.008)], 0.02, { out: L3.n, sw: 0.05, c: 0.008, noBack: true });

  // Front: main plate and intake louvres. Rear: heat-sink fins. Inner: bolted cover. Underside: dark closing plate.
  const pF = kit.plate([[-0.33, 0.425, 0.335], [0.30, 0.405, 0.38], [0.30, 0.405, -0.26], [-0.33, 0.425, -0.27]], 0.05, { col: PAINT2, out: [0, 1, 0] });
  kit.bolts(pF, 0.03, 1, 0.019);
  kit.ventOn(pF, 0.06, 0.52, 0.14, 0.86, { n: 5 });
  kit.seam(pF, pF.at(0.6, 0.05), pF.at(0.6, 0.95));
  const pR = kit.plate([[-0.33, -0.395, 0.335], [0.22, -0.385, 0.38], [0.22, -0.385, -0.26], [-0.33, -0.395, -0.27]], 0.05, { col: GUN, out: [0, -1, 0] });
  kit.bolts(pR, 0.028, 1, 0.017);
  kit.fins(pR, 0.1, 0.62, 0.18, 0.82, 7, 0.05, GM);
  const pI = kit.plate([[-0.33, 0.39, -0.30], [0.26, 0.37, -0.30], [0.26, -0.35, -0.30], [-0.33, -0.36, -0.30]], 0.04, { col: PAINT2, out: [0, 0, -1] });
  kit.bolts(pI, 0.03, 1, 0.017); kit.loop(pI, 0.06);
  kit.plate([[0.32, 0.38, 0.38], [0.32, -0.36, 0.38], [0.32, -0.34, -0.24], [0.32, 0.36, -0.24]], 0.03, { col: GUN, out: [1, 0, 0], noDrip: true });

  // Lower arm: faceted shell below the pauldron.
  const sec = kit.shell([
    { u: 0.40, vf: 0.24, vr: -0.25, wo: 0.25, wi: 0.25, c: 0.05 },
    { u: 0.72, vf: 0.20, vr: -0.21, wo: 0.22, wi: 0.22, c: 0.05 },
    { u: 0.96, vf: 0.17, vr: -0.17, wo: 0.19, wi: 0.19, c: 0.04 },
  ], { cols: { out: PAINT, rear: GUN, in: PAINT2, front: PAINT2, chamfer: PAINT2 } });
  kit.bolts(sec[1].out, 0.025, 1, 0.016); kit.seam(sec[1].out, sec[1].out.at(0.08, 0.5), sec[1].out.at(0.92, 0.5));
  kit.bolts(sec[1].front, 0.024, 1, 0.014);
  kit.bolts(sec[0].front, 0.024, 1, 0.014);
  kit.streak(sec[1].out, [0.56, -0.02, 0.25], 0.28, 0.07, 'oil');
  kit.mat('rubber');
  kit.cables([[0.40, -0.30, 0.33], [0.56, -0.29, 0.30], [0.74, -0.24, 0.285], [0.92, -0.18, 0.265], [F.L, 0, 0.29]], 0.025, [{ r: 0.018, col: CAB_K }, { r: 0.014, col: CAB_R }]);
  kit.mat('armour');
  const A = kit.at(F, 0.25, -0.46, 0), Ab = kit.at(F, 0.32, -0.26, 0);
  kit.frame(null); kit.hull(null);
  kit.lug(A, Ab, z0, { col: GUN, w: 0.08 });
  kit.mirror(1);
  return { G, A };
}

function forearmBase(kit, s, z0) {
  kit.mirror(s);
  kit.frame(null); kit.mat('steel');
  kit.drum([SK.elbow[0], SK.elbow[1], z0], [0, 0, 1], 0.27, 0.56, { bolts: 8, gear: 20, gearW: 0.35, seg: 22 });
  kit.mat('armour');
}

function buildCannonArm(kit, parent, upperA) {
  const z0 = SK.armZ, y = SK.elbow[1];
  const G = kit.group('Elbow_R', parent, [SK.elbow[0], y, z0], 'Forearm_R');
  G.node.userData = { hinge: 'z' };
  kit.use(G); forearmBase(kit, 1, z0);
  kit.frame({ o: [0, y, z0], u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1] });
  // Faceted gun housing: breech, receiver, taper and barrel shroud.
  const sec = kit.shell([
    { u: 0.04, vf: 0.22, vr: -0.22, wo: 0.26, wi: 0.26, c: 0.05 },
    { u: 0.38, vf: 0.27, vr: -0.25, wo: 0.31, wi: 0.30, c: 0.06 },
    { u: 0.74, vf: 0.27, vr: -0.25, wo: 0.31, wi: 0.30, c: 0.06 },
    { u: 0.96, vf: 0.24, vr: -0.22, wo: 0.26, wi: 0.26, c: 0.06 },
    { u: 1.10, vf: 0.255, vr: -0.255, wo: 0.255, wi: 0.255, c: 0.07 },
  ], { cols: { front: PAINT, out: PAINT, rear: GUN, in: PAINT2, chamfer: PAINT2 }, t: 0.028 });
  const [s0, s1, s2, s3] = sec;
  kit.ventOn(s0.front, 0.18, 0.82, 0.2, 0.8, { n: 5 });
  kit.bolts(s0.front, 0.024, 1, 0.017);
  const sp = kit.onPlate(s1.front, 0.2, 0.8, 0.05, 0.95, 0.016, { col: PAINT2 });
  kit.bolts(sp, 0.024, 2, 0.018);
  kit.seam(sp, sp.at(0.5, 0.04), sp.at(0.5, 0.96));
  kit.hazardPlate([s2.front.at(0.08, 0.12, 0.012), s2.front.at(0.92, 0.12, 0.012), s2.front.at(0.92, 0.88, 0.012), s2.front.at(0.08, 0.88, 0.012)], 0.024, { out: s2.front.n, sw: 0.06, noBack: true, c: 0.01 });
  kit.bolts(s3.front, 0.02, 1, 0.017);
  const rp = kit.onPlate(s1.out, 0.14, 0.86, 0.1, 0.9, 0.018, { col: RUST });
  kit.bolts(rp, 0.024, 1, 0.018);
  kit.ventOn(s0.out, 0.18, 0.82, 0.24, 0.8, { n: 4 });
  kit.ventOn(s2.out, 0.2, 0.8, 0.2, 0.8, { n: 3 });
  kit.bolts(s3.out, 0.02, 1, 0.017);
  kit.loop(s1.in, 0.05); kit.bolts(s1.in, 0.028, 1, 0.017); kit.bolts(s3.in, 0.02, 1, 0.014);
  kit.seam(s1.rear, s1.rear.at(0.5, 0.05), s1.rear.at(0.5, 0.95)); kit.bolts(s1.rear, 0.025, 1, 0.014);

  // Ammo drum and feed
  kit.frame(null); kit.hull(null); kit.mat('steel');
  const dc = [0.40, y - 0.52, z0];
  kit.drum(dc, [0, 0, 1], 0.27, 0.46, { bolts: 10, seg: 24, gear: 16, gearW: 0.8 });
  kit.block([0.40, y - 0.29, z0], [0.30, 0.14, 0.34], { col: GM_D, c: 0.02, edge: GM_L });
  for (let i = 0; i < 5; i++) kit.lathe([0.40, y - 0.52, z0 - 0.17 + i * 0.085], [0, 0, 1], [[0, 0.272, GM], [0, 0.285, GM_H, 1], [0.018, 0.285, GM_D], [0.018, 0.272, GM_D]], { seg: 24 });
  kit.mat('armour');
  kit.hazardPlate([[0.14, y - 0.70, z0 + 0.24], [0.66, y - 0.70, z0 + 0.24], [0.66, y - 0.82, z0 + 0.24], [0.14, y - 0.82, z0 + 0.24]], 0.012, { sw: 0.05, out: [0, 0, 1], c: 0.006, noBack: true });
  kit.mat('rubber');
  kit.tube([[0.66, y - 0.42, z0 + 0.26], [0.86, y - 0.34, z0 + 0.30], [0.98, y - 0.24, z0 + 0.20], [1.03, y - 0.15, z0 + 0.05], [1.05, y, z0]], 0.03, { col: CAB_K, seg: 8 });
  kit.tube([[0.10, y + 0.02, z0 + 0.335], [0.34, y + 0.20, z0 + 0.378], [0.70, y + 0.21, z0 + 0.378], [0.90, y + 0.10, z0 + 0.30], [1.04, y + 0.03, z0 + 0.12], [1.05, y, z0]], 0.016, { col: CAB_R });
  kit.tube([[0.10, y - 0.02, z0 + 0.335], [0.34, y - 0.19, z0 + 0.378], [0.70, y - 0.20, z0 + 0.378], [0.90, y - 0.10, z0 + 0.30], [1.04, y - 0.03, z0 + 0.12], [1.05, y, z0]], 0.016, { col: CAB_Y });
  kit.mat('armour');
  const horn = [-0.46, y + 0.10, z0];
  kit.lug(horn, [-0.16, y + 0.06, z0], z0, { ear: 0.075, w: 0.10, foot: 0.13, t: 0.04 });
  kit.piston('Elbow_R', parent, [upperA[0], upperA[1], z0], G, horn, { r: 0.075, rod: 0.044 });

  // Rotary barrels spin about local X. Bare gunmetal, heat-blued toward the muzzle, polished at every shoulder.
  const spinG = kit.group('CannonSpin_R', G, [SK.cannon[0], SK.cannon[1], z0], 'CannonBarrels_R');
  spinG.node.userData = { hinge: 'x' };
  kit.use(spinG); kit.mat('steel');
  const sx = SK.cannon[0], R = 0.135, Lb = 1.36;
  kit.lathe([sx + 0.05, y, z0], [1, 0, 0], [
    [0, 0, GM_L], [0, 0.205, GM_H, 1], [0.012, 0.22, GM], [0.10, 0.22, GM_H, 1], [0.115, 0.205, GM_D], [0.12, 0.16, GM], [0.32, 0.16, GM_H, 1], [0.335, 0.14, GM_D],
    [0.34, 0.06, GM_L], [Lb, 0.06, GM_L], [Lb, 0, GM_L],
  ], { seg: 22 });
  for (const d of [0.16, 0.22, 0.28]) kit.lathe([sx + d, y, z0], [1, 0, 0], [[0, 0.16, GM_D], [0.004, 0.178, GM_H, 1], [0.016, 0.178, GM_D], [0.02, 0.16, GM_D]], { seg: 22 });
  for (let i = 0; i < 6; i++) {
    const th = (i / 6) * 2 * Math.PI, cy = y + R * Math.cos(th), cz = z0 + R * Math.sin(th);
    kit.lathe([sx + 0.28, cy, cz], [1, 0, 0], [
      [0, 0.046, GM, 0, GM], [Lb - 0.62, 0.046, GM, 0, HEAT_A], [Lb - 0.20, 0.046, GM_D], [Lb - 0.20, 0.058, GM_H, 1], [Lb - 0.19, 0.062, GM_D, 0, SOOT], [Lb - 0.07, 0.062, GM_H, 1],
      [Lb - 0.055, 0.052, GM_H, 1], [Lb - 0.05, 0.03, SOOT], [Lb - 0.16, 0.03, SOOT], [Lb - 0.16, 0, SOOT],
    ], { seg: 12 });
  }
  for (const d of [0.62, 1.00]) {
    kit.lathe([sx + d, y, z0], [1, 0, 0], [[0, 0, GM], [0, 0.205, GM_H, 1], [0.012, 0.218, GM], [0.052, 0.218, GM_H, 1], [0.064, 0.205, GM_D], [0.064, 0, GM_D]], { seg: 22 });
    for (let k = 0; k < 6; k++) {
      const a = ((k + 0.5) / 6) * 2 * Math.PI;
      kit.bolt([sx + d - 0.004, y + 0.192 * Math.cos(a), z0 + 0.192 * Math.sin(a)], [-1, 0, 0], 0.016, GM_L);
    }
  }
  kit.lathe([sx + Lb - 0.09, y, z0], [1, 0, 0], [[0, 0.222, GM_H, 1], [0.012, 0.222, GM_D], [0.05, 0.222, GM_H, 1], [0.06, 0.205, GM_D]], { seg: 22 });
  kit.mat('armour');
  return { G, spinG };
}

function buildRailCannonArm(kit, parent, upperA) {
  const z0 = SK.armZ, y = SK.elbow[1];
  const G = kit.group('Elbow_L', parent, [SK.elbow[0], y, -z0], 'Forearm_L');
  G.node.userData = { hinge: 'z' };
  kit.use(G); forearmBase(kit, -1, z0);
  kit.frame({ o: [0, y, z0], u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1] });
  const [s0, s1, s2] = kit.shell([
    { u: 0.04, vf: 0.24, vr: -0.24, wo: 0.26, wi: 0.26, c: 0.05 },
    { u: 0.54, vf: 0.31, vr: -0.31, wo: 0.33, wi: 0.31, c: 0.07 },
    { u: 0.78, vf: 0.28, vr: -0.28, wo: 0.30, wi: 0.28, c: 0.07 },
    { u: 0.96, vf: 0.20, vr: -0.20, wo: 0.23, wi: 0.23, c: 0.05 },
  ], { cols: { front: PAINT, out: PAINT, rear: GUN, in: PAINT2, chamfer: PAINT2 } });
  kit.ventOn(s0.front, 0.2, 0.8, 0.14, 0.5, { n: 4 });
  const tp = kit.onPlate(s0.front, 0.14, 0.86, 0.56, 0.96, 0.016, { col: PAINT2 });
  kit.bolts(tp, 0.022, 1, 0.017);
  const sp = kit.onPlate(s1.front, 0.16, 0.84, 0.08, 0.92, 0.016, { col: PAINT2 });
  kit.bolts(sp, 0.022, 1, 0.018);
  kit.bolts(s2.front, 0.024, 1, 0.017);
  const so = kit.onPlate(s0.out, 0.14, 0.86, 0.14, 0.86, 0.016, { col: PAINT2 });
  kit.bolts(so, 0.024, 1, 0.018);
  const so0 = so.at(0.8, 0.28, 0), rD = vUnit(vSub(so.at(0.8, 0.8, 0), so0)), uD = vUnit(vSub(so.at(0.2, 0.28, 0), so0));
  kit.stencil(so0, rD, uD, 'H-7', 0.13, BONE, so.n);
  kit.hazardPlate([s1.out.at(0.1, 0.12, 0.012), s1.out.at(0.9, 0.12, 0.012), s1.out.at(0.9, 0.88, 0.012), s1.out.at(0.1, 0.88, 0.012)], 0.024, { out: s1.out.n, sw: 0.055, noBack: true, c: 0.01 });
  kit.ventOn(s2.out, 0.2, 0.8, 0.2, 0.8, { n: 3 });
  kit.loop(s0.in, 0.05); kit.bolts(s0.in, 0.028, 1, 0.017); kit.bolts(s1.in, 0.024, 1, 0.014);
  kit.seam(s0.rear, s0.rear.at(0.5, 0.05), s0.rear.at(0.5, 0.95)); kit.bolts(s0.rear, 0.025, 1, 0.014);
  kit.frame(null); kit.hull(null);
  kit.mat('rubber');
  kit.cables([[0.10, y - 0.02, z0 + 0.345], [0.32, y - 0.25, z0 + 0.40], [0.66, y - 0.25, z0 + 0.39], [0.86, y - 0.20, z0 + 0.27], [0.96, y, z0 + 0.18]], 0.022, [{ r: 0.018, col: CAB_K }, { r: 0.015, col: CAB_Y }]);
  kit.mat('armour');
  const horn = [-0.46, y + 0.10, z0];
  kit.lug(horn, [-0.16, y + 0.06, z0], z0, { ear: 0.075, w: 0.10, foot: 0.13, t: 0.04 });
  kit.piston('Elbow_L', parent, [upperA[0], upperA[1], z0], G, horn, { r: 0.075, rod: 0.044 });

  // Rail cannon on the wrist (mirrored into -Z). It draws on its own random sequence, then restores the one the
  // missile pod and pistons were authored against, so this weapon cannot repaint anything built after it.
  kit.reseed(RAIL_SEED);
  const wG = kit.group('Wrist_L', G, [SK.wrist[0], SK.wrist[1], -z0], 'RailCannon_L');
  wG.node.userData = { hinge: 'x' };
  kit.use(wG); kit.mat('steel');
  const wx = SK.wrist[0];
  kit.lathe([wx - 0.02, y, z0], [1, 0, 0], [[0, 0.19, GM], [0.05, 0.20, GM_H, 1], [0.06, 0.20, GM_D], [0.11, 0.17, GM_H, 1], [0.13, 0.15, GM_D]], { seg: 22 });
  kit.mat('armour');
  // Everything below is in a frame on the barrel axis: u along the barrel, v up, w outboard.
  kit.frame({ o: [0, y, z0], u: [1, 0, 0], v: [0, 1, 0], w: [0, 0, 1] }); kit.hull(null);
  const paint = { front: PAINT, out: PAINT, rear: GUN, in: PAINT2, chamfer: PAINT2 };
  // Breech: armoured rear block, a dark core holding the capacitor bank, fixed side armour, and a nose.
  const [rb] = kit.shell([{ u: 1.06, vf: 0.21, vr: -0.21, wo: 0.24, wi: 0.24, c: 0.06 }, { u: 1.27, vf: 0.24, vr: -0.24, wo: 0.30, wi: 0.30, c: 0.07 }], { cols: paint, t: 0.024 });
  kit.bolts(rb.out, 0.02, 1, 0.016); kit.bolts(rb.front, 0.02, 1, 0.016); kit.bolts(rb.in, 0.02, 1, 0.014);
  kit.block([1.61, 0, 0], [0.70, 0.24, 0.46], { col: DARK, c: 0.02 });
  for (let i = 0; i < 3; i++) for (const sw of [-1, 1]) for (const sv of [-1, 1]) kit.block([1.44 + i * 0.19, sv * 0.125, sw * 0.14], [0.13, 0.012, 0.17], { col: WHITE, c: 0, mat: 'glowCoil' });
  const sO = kit.plate([[1.27, -0.135, 0.31], [1.96, -0.125, 0.275], [1.96, 0.125, 0.275], [1.27, 0.135, 0.31]], 0.05, { col: PAINT, out: [0, 0, 1] });
  kit.bolts(sO, 0.022, 2, 0.017);
  const sP = kit.onPlate(sO, 0.06, 0.5, 0.14, 0.86, 0.014, { col: PAINT2 });
  const st0 = sP.at(0.14, 0.2, 0), stR = vUnit(vSub(sP.at(0.9, 0.2, 0), st0)), stU = vUnit(vSub(sP.at(0.14, 0.8, 0), st0));
  kit.stencil(st0, stR, stU, 'A-12', 0.085, BONE, sP.n);
  kit.ventOn(sO, 0.56, 0.93, 0.18, 0.82, { n: 4 });
  const sI = kit.plate([[1.27, 0.135, -0.31], [1.96, 0.125, -0.275], [1.96, -0.125, -0.275], [1.27, -0.135, -0.31]], 0.05, { col: PAINT2, out: [0, 0, -1] });
  kit.bolts(sI, 0.022, 2, 0.017); kit.loop(sI, 0.04);
  const [nose] = kit.shell([{ u: 1.95, vf: 0.20, vr: -0.20, wo: 0.25, wi: 0.25, c: 0.05 }, { u: 2.06, vf: 0.205, vr: -0.205, wo: 0.205, wi: 0.205, c: 0.06 }], { cols: paint, t: 0.024 });
  kit.bolts(nose.front, 0.016, 1, 0.014); kit.bolts(nose.out, 0.016, 1, 0.014);
  // Twin exposed rails with copper contact faces, running through every coil and out past the muzzle collar as a fork.
  kit.mat('steel');
  for (const sv of [-1, 1]) {
    kit.block([2.95, sv * 0.08, 0], [1.94, 0.056, 0.13], { col: GM, c: 0.012, edge: GM_H });
    kit.block([2.95, sv * 0.0495, 0], [1.90, 0.008, 0.09], { col: COPPER, c: 0 });
    kit.block([3.905, sv * 0.08, 0], [0.03, 0.064, 0.14], { col: GM_L, c: 0.01, polish: true });
  }
  // Stanchions carry the spine down onto the upper rail, in the gaps between coils.
  for (const u of [2.225, 2.395, 2.565, 3.015, 3.185, 3.355]) kit.block([u, 0.1665, 0], [0.03, 0.117, 0.06], { col: GM_D, c: 0, edge: GM });
  // Coils: a gunmetal spool with polished flanges, wound with four separate turns of glowing wire over a dark core.

  const coil = (cu) => {
    kit.mat('steel');
    kit.lathe([cu - 0.065, 0, 0], [1, 0, 0], [[0, 0.10, GM_D], [0, 0.168, GM_H, 1], [0.006, 0.178, GM], [0.012, 0.178, GM_D], [0.012, 0.132, GM_D], [0.118, 0.132, GM_D], [0.118, 0.178, GM], [0.124, 0.178, GM_H, 1], [0.13, 0.168, GM_D], [0.13, 0.10, GM_D]], { seg: 14 });
    const turns = 4, n = turns * 12, pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * 2 * Math.PI; pts.push([cu - 0.048 + t * 0.096, 0.141 * Math.cos(a), 0.141 * Math.sin(a)]); }
    kit.tube(pts, 0.0078, { mat: 'glowCoil', seg: 5, sp: 1 });
  };
  for (const cu of [2.14, 2.31, 2.48, 2.65, 2.93, 3.10, 3.27, 3.44]) coil(cu);
  kit.mat('armour');
  // Collars tie the barrel together; a spine and two power conduits run the length between them.
  const collar = (u0, u1) => kit.shell([{ u: u0, vf: 0.205, vr: -0.205, wo: 0.205, wi: 0.205, c: 0.06 }, { u: u1, vf: 0.205, vr: -0.205, wo: 0.205, wi: 0.205, c: 0.06 }], { cols: paint, t: 0.024 })[0];
  const cM = collar(2.74, 2.84), cZ = collar(3.53, 3.70);
  kit.bolts(cM.out, 0.014, 1, 0.012); kit.bolts(cM.front, 0.014, 1, 0.012); kit.bolts(cZ.front, 0.016, 1, 0.014);
  for (const f of [cZ.out, cZ.in]) kit.hazardPlate([f.at(0.04, 0.12, 0.008), f.at(0.96, 0.12, 0.008), f.at(0.96, 0.88, 0.008), f.at(0.04, 0.88, 0.008)], 0.02, { out: f.n, sw: 0.04, noBack: true, c: 0.008 });
  const spine = kit.plate([[2.06, 0.275, 0.05], [3.60, 0.275, 0.05], [3.60, 0.275, -0.05], [2.06, 0.275, -0.05]], 0.05, { col: GUN, out: [0, 1, 0], c: 0.014 });
  for (const u of [2.5, 3.1]) kit.seam(spine, [u, 0.275, 0.045], [u, 0.275, -0.045], 0.012);
  for (let u = 2.14; u < 3.6; u += 0.26) for (const sw of [-1, 1]) kit.bolt([u, 0.275, sw * 0.03], [0, 1, 0], 0.012);
  kit.mat('rubber');
  kit.tube([[1.96, -0.16, 0.07], [2.2, -0.225, 0.07], [2.8, -0.225, 0.07], [3.3, -0.225, 0.07], [3.54, -0.19, 0.07]], 0.018, { col: CAB_B, sp: 2 });
  kit.tube([[1.96, -0.16, -0.07], [2.2, -0.225, -0.07], [2.8, -0.225, -0.07], [3.3, -0.225, -0.07], [3.54, -0.19, -0.07]], 0.018, { col: CAB_K, sp: 2 });
  // Muzzle: a glowing ring and bore behind the fork, with side cheeks tying the prongs together.
  kit.lathe([3.70, 0, 0], [1, 0, 0], [[0, 0.165], [0.012, 0.15], [0.012, 0.125]], { seg: 16, mat: 'glowCoil' });
  kit.block([3.715, 0, 0], [0.01, 0.10, 0.12], { col: WHITE, c: 0, mat: 'glowCoil' });
  kit.mat('steel');
  // Cheeks with venting ports either side of the fork.
  for (const sw of [-1, 1]) {
    kit.block([3.81, 0, sw * 0.072], [0.20, 0.205, 0.016], { col: GM, c: 0.005, edge: GM_H });
    for (const u of [3.75, 3.81, 3.87]) kit.block([u, 0, sw * 0.081], [0.026, 0.13, 0.004], { col: tone(GM_D, 0.3), c: 0 });
  }
  kit.mat('armour');
  kit.frame(null);
  // The three hatch pivots keep the claw's joint names and rest positions. Each carries an armour hatch over the
  // capacitor bank: positive rotation.z lifts the two upper hatches, negative rotation.z drops the lower one.
  const hx = wx + 0.35;
  const hatch = (name, label, hy, hz, sgnY, halfW, col) => {
    const fG = kit.group(name, wG, [hx, y + hy, -(z0 + hz)], label);
    fG.node.userData = { hinge: 'z' };
    kit.use(fG); kit.mat('steel');
    const zc = z0 + hz, Y = (h) => y + hy + sgnY * h;
    kit.drum([hx, y + hy, zc], [0, 0, 1], 0.04, halfW * 1.6, { bolts: 0, seg: 10 });
    kit.mat('armour');
    const h = kit.plate([[hx - 0.03, Y(0.055), zc + halfW], [hx + 0.64, Y(0.035), zc + halfW], [hx + 0.64, Y(0.035), zc - halfW], [hx - 0.03, Y(0.055), zc - halfW]], 0.05, { out: [0, sgnY, 0], col });
    kit.bolts(h, 0.024, 1, 0.017);
    // Dark liner on the inside face, seen when the hatch is open.
    kit.poly([[hx - 0.028, Y(0.0035), zc + halfW * 0.98], [hx + 0.638, Y(-0.0165), zc + halfW * 0.98], [hx + 0.638, Y(-0.0165), zc - halfW * 0.98], [hx - 0.028, Y(0.0035), zc - halfW * 0.98]], GM_D, { out: [0, -sgnY, 0], mat: 'steel' });
    return h;
  };
  for (const [name, label, hz] of [['ClawUpperOuter_L', 'RailHatch_UpperOuter_L', 0.16], ['ClawUpperInner_L', 'RailHatch_UpperInner_L', -0.16]]) {
    const h = hatch(name, label, 0.13, hz, 1, 0.145, PAINT);
    kit.ventOn(h, 0.12, 0.5, 0.2, 0.8, { n: 3 });
    kit.seam(h, h.at(0.56, 0.06), h.at(0.56, 0.94));
  }
  const hL = hatch('ClawThumb_L', 'RailHatch_Lower_L', -0.13, 0, -1, 0.30, GUN);
  kit.hazardPlate([hL.at(0.5, 0.08, 0.008), hL.at(0.95, 0.08, 0.008), hL.at(0.95, 0.92, 0.008), hL.at(0.5, 0.92, 0.008)], 0.02, { out: hL.n, sw: 0.05, noBack: true, c: 0.008 });
  kit.reseed(SEED_AFTER_WRIST);
  kit.mirror(1);
  return { G };
}

// ---------------------------------------------------------------- missile pod
function buildPod(kit, waistG) {
  const G = kit.group('MissilePod', waistG, [-0.05, 5.50, -1.42], 'MissilePod');
  G.node.userData = { hinge: 'z' };
  kit.use(G); kit.frame(null); kit.mirror(-1);
  const zc = 1.46, x0 = -0.62, x1 = 0.62, y0 = 5.54, y1 = 5.97, hz = 0.42;
  kit.hull([0, (y0 + y1) / 2, zc]); kit.mat('armour');
  const r = (x, ya, yb, h) => [[x, yb, zc + h], [x, yb, zc - h], [x, ya, zc - h], [x, ya, zc + h]];
  kit.loft([r(x0, y0 + 0.04, y1 - 0.06, hz - 0.06), r(x0 + 0.12, y0, y1, hz), r(x1 - 0.03, y0, y1, hz), r(x1, y0 + 0.02, y1 - 0.02, hz - 0.02)], { col: DARK });
  const top = kit.plate([[x0 + 0.12, y1 + 0.02, zc + hz], [x1 - 0.14, y1 + 0.02, zc + hz], [x1 - 0.14, y1 + 0.02, zc - hz], [x0 + 0.12, y1 + 0.02, zc - hz]], 0.03, { col: PAINT, out: [0, 1, 0] });
  kit.loop(top, 0.05); kit.bolts(top, 0.028, 2, 0.014);
  kit.hazardPlate([[x1 - 0.13, y1 + 0.02, zc + hz], [x1 - 0.13, y1 + 0.02, zc - hz], [x1 + 0.02, y1 + 0.005, zc - hz], [x1 + 0.02, y1 + 0.005, zc + hz]], 0.02, { sw: 0.07, out: [0, 1, 0] });
  for (const sg of [1, -1]) {
    const so = kit.plate([[x0 + 0.14, y1 - 0.03, zc + sg * (hz + 0.025)], [x1 - 0.06, y1 - 0.03, zc + sg * (hz + 0.025)], [x1 - 0.06, y0 + 0.03, zc + sg * (hz + 0.025)], [x0 + 0.14, y0 + 0.03, zc + sg * (hz + 0.025)]], 0.03, { col: sg > 0 ? PAINT : PAINT2, out: [0, 0, sg] });
    kit.loop(so, 0.045); kit.bolts(so, 0.026, 2, 0.014);
    if (sg > 0) {
      const s2 = kit.plate([[x0 + 0.26, y1 - 0.12, zc + hz + 0.05], [x0 + 0.72, y1 - 0.12, zc + hz + 0.05], [x0 + 0.72, y0 + 0.11, zc + hz + 0.05], [x0 + 0.26, y0 + 0.11, zc + hz + 0.05]], 0.025, { col: RUST, out: [0, 0, 1] });
      kit.bolts(s2, 0.018, 1, 0.01);
      kit.stencil([x0 + 0.84, y0 + 0.13, zc + hz + 0.025], [1, 0, 0], [0, 1, 0], 'HE', 0.14, BONE, [0, 0, 1]);
    }
  }
  kit.plate([[x0 + 0.1, y0 - 0.015, zc + hz], [x1 - 0.03, y0 - 0.015, zc + hz], [x1 - 0.03, y0 - 0.015, zc - hz], [x0 + 0.1, y0 - 0.015, zc - hz]], 0.02, { col: GUN, out: [0, -1, 0] });
  // Rear vent
  kit.vent([x0 - 0.008, y0 + 0.08, zc - 0.28], [x0 - 0.008, y0 + 0.08, zc + 0.28], [x0 - 0.008, y1 - 0.10, zc + 0.28], [x0 - 0.008, y1 - 0.10, zc - 0.28], { n: 5, col: GUN });
  // Launch tubes, two rows of four
  const front = x1 + 0.002;
  kit.poly([[front, y1 - 0.02, zc + hz - 0.02], [front, y1 - 0.02, zc - hz + 0.02], [front, y0 + 0.02, zc - hz + 0.02], [front, y0 + 0.02, zc + hz - 0.02]], GUN, { out: [1, 0, 0] });
  kit.mat('steel');
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
    const cy = (y0 + y1) / 2 + (row - 0.5) * 0.205, cz = zc + (col - 1.5) * 0.195;
    kit.lathe([front, cy, cz], [1, 0, 0], [[0, 0.088, STEEL_D], [0.022, 0.088, vMix(STEEL_D, WEAR, 0.4)], [0.022, 0.072, tone(GUN, 0.4)], [-0.06, 0.072, tone(GUN, 0.4)]], { seg: 12 });
    kit.mat('rubber');
    kit.lathe([front - 0.05, cy, cz], [1, 0, 0], [[0, 0.064, BONE], [0.03, 0.062, BONE], [0.055, 0.044, RUST], [0.08, 0.018, RUST], [0.088, 0, RUST]], { seg: 10, mat: 'rubber' });
    kit.mat('steel');
  }
  // Trunnion
  kit.drum([-0.05, 5.50, 1.42], [0, 0, 1], 0.09, 0.22, { bolts: 0, seg: 14 });
  kit.mat('rubber');
  kit.tube([[-0.40, y0 - 0.01, zc + 0.10], [-0.32, 5.50, 1.42], [-0.15, 5.47, 1.38], [-0.05, 5.50, 1.36]], 0.018, { col: CAB_K });
  kit.mat('armour');
  kit.mirror(1);
}

// ---------------------------------------------------------------- build
async function build() {
  const root = createRoot('HeavyWalkerMech');
  const tex = makeTextures();
  const MAT = {
    armour: pbrMaterial({ albedo: tex.albedo, metallicRoughness: tex.mr, normal: tex.nrm, roughness: 1, metalness: 1, name: 'Armour_WeatheredPaint' }),
    // Gunmetal: colour comes from vertex colours, finish from the map. Metalness stays a little under 1 so
    // machinery keeps some diffuse read in scenes with no environment map; the polished band takes the sharp highlights.
    steel: pbrMaterial({ metallicRoughness: tex.steelMR, roughness: 1, metalness: 1, name: 'Gunmetal_Machinery' }),
    decal: pbrMaterial({ albedo: tex.wearA, metallicRoughness: tex.wearMR, roughness: 1, metalness: 1, alphaMode: 'blend', name: 'Wear_Overlay' }),
    chrome: gameMaterial(0xf0f2f4, { metalness: 0.72, roughness: 0.22, flatShading: false, name: 'Chrome_PistonRod' }),
    rubber: gameMaterial(0xffffff, { metalness: 0, roughness: 0.78, flatShading: false, name: 'Rubber_CableAndTrim' }),
    glass: glassMaterial(0x4f8598, { opacity: 0.32, roughness: 0.05, metalness: 0.2, name: 'Canopy_Glass' }),
    glowCyan: gameMaterial(0x06131a, { emissive: 0x2cc4f5, emissiveIntensity: 1.5, metalness: 0, roughness: 0.4, flatShading: false, name: 'Glow_Cyan' }),
    glowAmber: gameMaterial(0x1a0c02, { emissive: 0xff6408, emissiveIntensity: 1.15, metalness: 0, roughness: 0.4, flatShading: false, name: 'Glow_Amber' }),
    // Separate from Glow_Cyan so a game can drive rail charge-up without touching the cockpit lights.
    glowCoil: gameMaterial(0x06131a, { emissive: 0x2cc8ff, emissiveIntensity: 2.2, metalness: 0, roughness: 0.4, flatShading: false, name: 'Glow_RailCoil' }),
  };
  const kit = createKit(root, MAT, { armour: true, steel: true, rubber: true, decal: true }, { armour: true, steel: true, decal: true });

  const pelvisG = kit.group('Pelvis', null, [SK.hip[0], SK.hip[1], 0], 'Pelvis');
  buildPelvis(kit, pelvisG);
  buildLeg(kit, 'L', pelvisG);
  buildLeg(kit, 'R', pelvisG);
  const waistG = kit.group('Waist', pelvisG, [0, SK.waistY, 0], 'Torso');
  waistG.node.userData = { hinge: 'y (yaw); clip also rolls/pitches slightly' };
  buildTorso(kit, waistG);
  const ua = { L: buildUpperArm(kit, 'L', waistG), R: buildUpperArm(kit, 'R', waistG) };
  buildCannonArm(kit, ua.R.G, ua.R.A);
  buildRailCannonArm(kit, ua.L.G, ua.L.A);
  buildPod(kit, waistG);

  // Size each piston from its real span across the Walk cycle (with margin for code-driven poses).
  const N = rigNodes(root);
  const rest = rigList(N).map((n) => [n, n.position.clone(), n.quaternion.clone()]);
  const worldA = new THREE.Vector3(), worldB = new THREE.Vector3();
  const stats = kit.pistonList().map((p) => {
    const s = p.mir;
    const la = new THREE.Vector3(p.A[0] - p.gA.origin[0], p.A[1] - p.gA.origin[1], p.A[2] * s - p.gA.origin[2]);
    const lb = new THREE.Vector3(p.B[0] - p.gB.origin[0], p.B[1] - p.gB.origin[1], p.B[2] * s - p.gB.origin[2]);
    return { p, la, lb, min: Infinity, max: 0 };
  });
  for (let i = 0; i < 30; i++) {
    applyPose(N, walkPose(i / 30));
    root.updateMatrixWorld(true);
    for (const st of stats) {
      const d = st.p.gA.node.localToWorld(worldA.copy(st.la)).distanceTo(st.p.gB.node.localToWorld(worldB.copy(st.lb)));
      st.min = Math.min(st.min, d); st.max = Math.max(st.max, d);
    }
  }
  rest.forEach(([n, pos, q]) => { n.position.copy(pos); n.quaternion.copy(q); });
  root.updateMatrixWorld(true);
  for (const st of stats) kit.buildPiston(st.p, st.min - 0.04, st.max + 0.05);

  kit.flush();
  root.userData = { rig: { clip: 'Walk', walkSpeedMps: Number(WALK.speed.toFixed(4)), strideM: Number(WALK.stride.toFixed(4)), durationS: WALK.T, forward: '+X', hingeAxis: 'local Z unless the joint says otherwise' } };
  return root;
}

// ---------------------------------------------------------------- Walk clip
function animate(root) {
  const N = rigNodes(root);
  const aimers = [];
  root.traverse((n) => { if (n.userData && n.userData.aimAt) aimers.push(n); });
  const nodes = rigList(N);
  const rest = nodes.concat(aimers).map((n) => [n, n.position.clone(), n.quaternion.clone()]);
  const names = nodes.concat(aimers);
  const keyRot = new Map(names.map((n) => [n.name, []]));
  const keyPos = [];
  const eul = new THREE.Euler(), wp = new THREE.Vector3(), dir = new THREE.Vector3(), restDir = new THREE.Vector3();
  for (let i = 0; i <= WALK.keys; i++) {
    const phi = (i % WALK.keys) / WALK.keys, t = (WALK.T * i) / WALK.keys;
    applyPose(N, walkPose(phi));
    root.updateMatrixWorld(true);
    for (const n of aimers) {
      const target = root.getObjectByName(n.userData.aimAt);
      target.getWorldPosition(wp);
      n.parent.worldToLocal(wp);
      dir.copy(wp).sub(n.position).normalize();
      const r = n.userData.aimRestDir;
      restDir.set(r[0], r[1], r[2]);
      n.quaternion.setFromUnitVectors(restDir, dir);
    }
    for (const n of names) {
      eul.setFromQuaternion(n.quaternion, 'XYZ');
      keyRot.get(n.name).push({ time: t, rotation: [eul.x / D2R, eul.y / D2R, eul.z / D2R] });
    }
    keyPos.push({ time: t, position: [N.pelvis.position.x, N.pelvis.position.y, N.pelvis.position.z] });
  }
  rest.forEach(([n, pos, q]) => { n.position.copy(pos); n.quaternion.copy(q); });
  root.updateMatrixWorld(true);
  const tracks = [positionTrack(N.pelvis.name, keyPos)];
  for (const n of names) tracks.push(rotationTrack(n.name, keyRot.get(n.name)));
  return [createClip('Walk', WALK.T, tracks, { loop: true })];
}
