const mk = (name, color, o = {}) => {
  const m = gameMaterial(color, { flatShading: false, ...o });
  m.name = name;
  return m;
};

function makeMaterials(extra = {}) {
  return {
    Paint: mk('Paint', 0xebebeb, { roughness: 0.3, metalness: 0 }),
    Trim: mk('Trim', 0x141414, { roughness: 0.7, metalness: 0 }),
    Glass: mk('Glass', 0x12161a, { roughness: 0.05, metalness: 0 }),
    Chrome: mk('Chrome', 0xd0d0d0, { roughness: 0.2, metalness: 1 }),
    Tyre: mk('Tyre', 0x222222, { roughness: 0.9, metalness: 0 }),
    Rim: mk('Rim', 0xc4c4c4, { roughness: 0.4, metalness: 1 }),
    Headlight: mk('Headlight', 0xffffff, { roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 1 }),
    Taillight: mk('Taillight', 0x5a0a0a, { roughness: 0.3, emissive: 0xff1a1a, emissiveIntensity: 1 }),
    BrakeLight: mk('BrakeLight', 0x7a0d0d, { roughness: 0.3, emissive: 0xff2020, emissiveIntensity: 1 }),
    Plate: mk('Plate', 0xe6e6e0, { roughness: 0.6, metalness: 0 }),
    ...extra,
  };
}

// Non-indexed triangle soup; each triangle is wound so its normal agrees with the outward hint h.
function polyMesh() {
  const pos = [];
  const api = {
    pos,
    tri(a, b, c, h) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (n[0] * h[0] + n[1] * h[1] + n[2] * h[2] < 0) { const t = b; b = c; c = t; }
      pos.push(...a, ...b, ...c);
    },
    quad(a, b, c, d, h) { api.tri(a, b, c, h); api.tri(a, c, d, h); },
    geo() { return meshGeo({ positions: pos, indices: Array.from({ length: pos.length / 3 }, (_, i) => i) }); },
  };
  return api;
}

// One polyMesh per material name; commit() emits one uniquely named part per material.
function meshSet() {
  const by = {};
  return {
    get: name => by[name] || (by[name] = polyMesh()),
    commit(parent, suffix, mats) {
      for (const name of Object.keys(by)) if (by[name].pos.length) createPart(name + '_' + suffix, by[name].geo(), mats[name], { parent });
    },
  };
}

function addBox(M, cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  for (const [a, b, c, d, h] of [[0, 1, 2, 3, [0, 0, -1]], [4, 5, 6, 7, [0, 0, 1]], [0, 4, 7, 3, [-1, 0, 0]], [1, 5, 6, 2, [1, 0, 0]], [0, 1, 5, 4, [0, -1, 0]], [3, 2, 6, 7, [0, 1, 0]]]) M.quad(p[a], p[b], p[c], p[d], h);
}

// Axis-aligned rectangle on plane ax=c spanning a0..a1, b0..b1 (x: a=z,b=y; y: a=x,b=z; z: a=x,b=y), facing dir.
function addFlat(M, ax, c, a0, a1, b0, b1, dir) {
  const P = (a, b) => ax === 'x' ? [c, b, a] : ax === 'y' ? [a, c, b] : [a, b, c];
  const h = ax === 'x' ? [dir, 0, 0] : ax === 'y' ? [0, dir, 0] : [0, 0, dir];
  M.quad(P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1), h);
}

// stations: [x, yLow, yHigh, halfWidth]; chamfered rectangular rings lofted along X, capped at both ends.
function addLoft(M, stations, c = 0.07) {
  const rings = stations.map(([x, lo, hi, w]) => {
    const k = Math.min(c, (hi - lo) / 3, w / 3);
    return [[x, lo, -w + k], [x, lo, w - k], [x, lo + k, w], [x, hi - k, w], [x, hi, w - k], [x, hi, -w + k], [x, hi - k, -w], [x, lo + k, -w]];
  });
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i], B = rings[i + 1];
    const cy = (stations[i][1] + stations[i][2] + stations[i + 1][1] + stations[i + 1][2]) / 4;
    for (let j = 0; j < 8; j++) {
      const k = (j + 1) % 8;
      const a = A[j], b = A[k], cc = B[k], d = B[j];
      M.quad(a, b, cc, d, [0, (a[1] + b[1] + cc[1] + d[1]) / 4 - cy, (a[2] + b[2] + cc[2] + d[2]) / 4]);
    }
  }
  for (const [R, s] of [[rings[0], -1], [rings[rings.length - 1], 1]]) {
    for (let j = 1; j < 7; j++) M.tri(R[0], R[j], R[j + 1], [s, 0, 0]);
  }
}

// Convex tapered prism from a 4-point side profile [x,y] and a half-width per point.
function addPrism(M, profile, widths) {
  const L = profile.map(([x, y], i) => [x, y, widths[i]]);
  const R = profile.map(([x, y], i) => [x, y, -widths[i]]);
  const all = L.concat(R);
  const cen = [0, 1, 2].map(k => all.reduce((s, p) => s + p[k], 0) / 8);
  const h = pts => [0, 1, 2].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length - cen[k]);
  M.quad(L[0], L[1], L[2], L[3], h(L));
  M.quad(R[0], R[1], R[2], R[3], h(R));
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, q = [L[i], L[j], R[j], R[i]];
    M.quad(...q, h(q));
  }
  return { L, R, cen, hint: q => [0, 1, 2].map(k => (q[0][k] + q[1][k] + q[2][k] + q[3][k]) / 4 - cen[k]) };
}

// Inset panel on a planar quad [bottomStart, topStart, topEnd, bottomEnd], lifted off the surface along its normal.
function addPanel(M, q, u0, u1, v0, v1, lift, hint) {
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const P = (u, v) => lerp(lerp(q[0], q[3], u), lerp(q[1], q[2], u), v);
  const e1 = q[1].map((v, i) => v - q[0][i]), e2 = q[3].map((v, i) => v - q[0][i]);
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const len = Math.hypot(...n); n = n.map(v => v / len);
  if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) n = n.map(v => -v);
  const off = p => p.map((v, i) => v + n[i] * lift);
  M.quad(off(P(u0, v0)), off(P(u0, v1)), off(P(u1, v1)), off(P(u1, v0)), n);
}

// Surface of revolution about local Z. profile: [[r, z], ...]; sign s mirrors it so the same profile can face +Z or -Z.
function revolveGeo(profile, N, s = 1, dz = 0) {
  const prof = (s < 0 ? profile.map(([r, z]) => [r, -z]).reverse() : profile).map(([r, z]) => [r, z + dz]);
  const pos = [], idx = [], P = prof.length;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    for (const [r, z] of prof) pos.push(r * c, r * sn, z);
  }
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j, b = i2 * P + j, c = i2 * P + j + 1, d = i * P + j + 1;
      if (prof[j][0] !== 0) idx.push(a, b, c);
      if (prof[j + 1][0] !== 0) idx.push(a, c, d);
    }
  }
  return meshGeo({ positions: pos, indices: idx });
}

// R: tyre radius, W: tyre width. Tyre profile runs -Z bead -> tread -> +Z bead (outward normals); rim dish faces +Z (s = 1) or -Z.
function tyreProfile(R, W) {
  return [[0.64 * R, -0.44 * W], [0.78 * R, -0.5 * W], [0.94 * R, -0.42 * W], [R, -0.25 * W], [R, 0.25 * W], [0.94 * R, 0.42 * W], [0.78 * R, 0.5 * W], [0.64 * R, 0.44 * W]];
}
function rimProfile(R, W) {
  return [[0.66 * R, 0.44 * W], [0.36 * R, 0.38 * W], [0.30 * R, 0.44 * W], [0, 0.46 * W]];
}

// Wheel node: plain group with pivot at the wheel centre and the axle along local Z.
// pairs: 1 for a single wheel, 2 for a dual pair (tyres at +-gap/2 around the pivot, dish on the outboard tyre).
function wheelNode(name, x, y, z, R, W, mats, opts = {}) {
  const N = opts.segments || 24, pairs = opts.pairs || 1, gap = opts.gap || 0;
  const g = createRoot(name);
  g.position.set(x, y, z);
  const s = z >= 0 ? 1 : -1, tag = name.slice(6);
  const offsets = pairs === 1 ? [0] : [-gap / 2, gap / 2];
  offsets.forEach((dz, i) => {
    const suffix = pairs === 1 ? tag : tag + (i === (s > 0 ? 1 : 0) ? '_outer' : '_inner');
    createPart('Tyre_' + suffix, revolveGeo(tyreProfile(R, W), N, 1, dz), mats.Tyre, { parent: g });
    if (pairs === 1 || i === (s > 0 ? 1 : 0)) createPart('Rim_' + suffix, revolveGeo(rimProfile(R, W), N, s, dz), mats.Rim, { parent: g });
  });
  return g;
}

const meta = { name: 'Generic pickup truck' };

// Crew-cab short-bed pickup: 5.90 x 2.03 x 1.95 m, wheelbase 3.70 m, 275 mm tyres on a 0.40 m radius.
const WX = 1.85, WY = 0.40, ARCH = 0.46, TRACK = 0.86, HW = 0.975, WR = 0.40, WW = 0.275;

function mainStations(step, inset = 0) {
  const xs = [-2.90, -1.021, -1.020, 1.30, 1.301, 2.80, 2.90];
  for (const cx of [WX, -WX]) {
    for (let d = -ARCH; d < ARCH; d += step) xs.push(cx + d);
    xs.push(cx + ARCH);
  }
  xs.sort((a, b) => a - b);
  const u = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1e-4);
  const lo = x => {
    for (const cx of [WX, -WX]) { const d = Math.abs(x - cx); if (d < ARCH) return WY + Math.sqrt(ARCH * ARCH - d * d); }
    return x > 2.85 ? 0.34 : 0.32;
  };
  const hi = x => x > 2.80 ? 1.14 : x > 1.3005 ? 1.22 : x > -1.0205 ? 1.30 : 0.92;
  const last = u.length - 1;
  return u.map((x, i) => [x + (i === 0 ? inset : i === last ? -inset : 0), lo(x) + inset, hi(x) - inset, (x > 2.85 ? HW - 0.02 : HW) - inset]);
}

const both = (M, cx, cy, cz, sx, sy, sz) => { addBox(M, cx, cy, -cz, sx, sy, sz); addBox(M, cx, cy, cz, sx, sy, sz); };

function addCab(P) {
  const g = addPrism(P.get('Paint'), [[1.30, 1.30], [0.55, 1.95], [-0.80, 1.95], [-0.95, 1.30]], [0.95, 0.86, 0.86, 0.95]);
  const G = P.get('Glass');
  const win = (q, u0, u1, v0, v1) => addPanel(G, q, u0, u1, v0, v1, 0.004, g.hint(q));
  for (const S of [g.L, g.R]) { win(S, 0.05, 0.47, 0.10, 0.90); win(S, 0.53, 0.95, 0.10, 0.90); }
  win([g.L[0], g.L[1], g.R[1], g.R[0]], 0.05, 0.95, 0.06, 0.92);
  win([g.L[3], g.L[2], g.R[2], g.R[3]], 0.10, 0.90, 0.15, 0.85);
}

function bodyParts(fine, P) {
  const Pt = P.get('Paint'), T = P.get('Trim'), C = P.get('Chrome');
  addLoft(Pt, mainStations(fine ? 0.05 : 0.115, fine ? 0 : 0.003));
  addBox(T, 0, 0.58, 0, 5.0, 0.56, 1.44);
  addCab(P);
  both(Pt, -1.975, 1.10, 0.925, 1.85, 0.36, 0.10);
  addBox(Pt, -1.06, 1.10, 0, 0.08, 0.36, 1.75);
  addBox(Pt, -2.90, 1.09, 0, 0.08, 0.34, 1.75);
  addBox(T, -1.98, 0.93, 0, 1.76, 0.02, 1.75);
  addBox(T, 2.87, 0.50, 0, 0.16, 0.18, 1.98);
  addBox(T, -2.88, 0.55, 0, 0.14, 0.16, 1.98);
  addBox(T, 2.915, 0.90, 0, 0.04, 0.32, 1.00);
  addBox(C, 2.94, 0.90, 0, 0.02, 0.04, 1.00);
  both(T, 2.912, 0.96, 0.70, 0.03, 0.20, 0.36);
  both(P.get('Headlight'), 2.917, 0.96, 0.70, 0.04, 0.13, 0.30);
  both(P.get('Taillight'), -2.94, 1.14, 0.80, 0.03, 0.10, 0.20);
  both(P.get('BrakeLight'), -2.94, 1.02, 0.80, 0.03, 0.08, 0.20);
  addBox(P.get('Plate'), -2.943, 0.98, 0, 0.006, 0.11, 0.52);
  both(T, 1.05, 1.38, 1.0, 0.10, 0.14, 0.05);
  if (fine) {
    for (const x of [1.02, 0.05, -0.98]) both(T, x, 0.84, 0.975, 0.010, 0.88, 0.012);
    both(T, 0.15, 0.36, 0.975, 1.9, 0.05, 0.02);
    both(C, 0.30, 1.16, 0.99, 0.14, 0.03, 0.03);
    both(C, -0.72, 1.16, 0.99, 0.14, 0.03, 0.03);
  }
}

function lod2Parts(P) {
  const w = HW - 0.03, lo = 0.20;
  addLoft(P.get('Paint'), [[-2.885, lo, 0.91, w], [-1.021, lo, 0.91, w], [-1.020, lo, 1.29, w], [1.30, lo, 1.29, w], [1.301, lo, 1.21, w], [2.885, lo, 1.13, w]], 0.06);
  addCab(P);
  both(P.get('Paint'), -1.975, 1.10, 0.925, 1.85, 0.36, 0.10);
  addBox(P.get('Paint'), -2.90, 1.09, 0, 0.08, 0.34, 1.75);
}

async function build() {
  const M = makeMaterials();
  const root = createRoot('Pickup');
  for (const [name, fn] of [['LOD0', P => bodyParts(true, P)], ['LOD1', P => bodyParts(false, P)], ['LOD2', lod2Parts]]) {
    const g = createRoot(name);
    root.add(g);
    const P = meshSet();
    fn(P);
    P.commit(g, name, M);
  }
  root.add(wheelNode('Wheel_FL', WX, WY, -TRACK, WR, WW, M));
  root.add(wheelNode('Wheel_FR', WX, WY, TRACK, WR, WW, M));
  root.add(wheelNode('Wheel_RL', -WX, WY, -TRACK, WR, WW, M));
  root.add(wheelNode('Wheel_RR', -WX, WY, TRACK, WR, WW, M));
  defineLod(['LOD0', 'LOD1', 'LOD2'].map(name => root.children.find(g => g.name === name)), { screenCoverage: [0.0059,0.00034,0.00000943] });
  return root;
}
