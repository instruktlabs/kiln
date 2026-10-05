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
    Taillight: mk('Taillight', 0x5a0a0a, { roughness: 0.3, emissive: 0xff1a1a, emissiveIntensity: 0.25 }),
    BrakeLight: mk('BrakeLight', 0x7a0d0d, { roughness: 0.3, emissive: 0xff2020, emissiveIntensity: 0.7 }),
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

const meta = { name: 'Generic transit bus' };

// 40 ft low-floor transit bus: 12.20 x 2.59 x 3.10 m (mirrors add ~0.08 m of width), wheelbase 7.20 m, 0.50 m radius tyres (0.30 m wide), dual rear wheels.
const FX = 3.6, RX = -3.6, WY = 0.5, WR = 0.5, WW = 0.30;
const FT = 1.03, RT = 0.93, RGAP = 0.33;
const BXF = 5.74, BXR = -6.34, HW = 1.295;
const SKIRT = 0.30, ARCH = 0.57, SPL = 1.15, ROOF = 2.95;
const FRONT = [[BXF, 1.20, 2.72], [5.60, 1.27, 2.87], [5.35, HW, ROOF]];
const REAR = [[-5.95, HW, ROOF], [-6.20, 1.275, 2.90], [BXR, 1.22, 2.78]];
const WIN_R = [[3.20, 4.15], [2.05, 3.05], [0.90, 1.90], [-0.60, 0.75], [-3.05, -2.10], [-4.15, -3.20], [-5.25, -4.30]];
const WIN_L = [[4.45, 5.25], [3.25, 4.30], [2.10, 3.10], [0.95, 1.95], [-0.20, 0.80], [-1.35, -0.35], [-2.50, -1.50], [-3.65, -2.65], [-4.80, -3.80], [-5.65, -4.95]];
const DOORS = [[4.30, 5.35], [-1.95, -0.75]];
const WB0 = 1.30, WB1 = 2.42;
const END_X = [BXF, 5.60, 5.35, -5.95, -6.20, BXR];

function env(x) {
  const seg = x > 5.35 ? FRONT : x < -5.95 ? REAR : null;
  if (!seg) return [HW, ROOF];
  for (let i = 0; i < seg.length - 1; i++) {
    const [x0, w0, h0] = seg[i], [x1, w1, h1] = seg[i + 1];
    if (x <= x0 + 1e-9 && x >= x1 - 1e-9) { const t = (x0 - x) / (x0 - x1); return [w0 + (w1 - w0) * t, h0 + (h1 - h0) * t]; }
  }
  return [HW, ROOF];
}

function archLo(x) {
  for (const ax of [FX, RX]) {
    const d = Math.abs(x - ax);
    if (d <= ARCH + 1e-9) return WY + Math.sqrt(Math.max(0, ARCH * ARCH - d * d));
  }
  return SKIRT;
}

function bandStations(seg) {
  const xs = END_X.slice();
  for (const ax of [FX, RX]) {
    for (let i = 0; i <= seg; i++) xs.push(ax - ARCH * Math.cos(Math.PI * i / seg));
    xs.push(ax - ARCH - 0.002, ax + ARCH + 0.002);
  }
  xs.sort((a, b) => a - b);
  return xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1e-4);
}

const both = (M, cx, cy, cz, sx, sy, sz) => { addBox(M, cx, cy, -cz, sx, sy, sz); addBox(M, cx, cy, cz, sx, sy, sz); };

function glass(G) {
  addFlat(G, 'x', BXF + 0.006, -1.02, 1.02, 1.22, 2.40, 1);
  addFlat(G, 'x', BXF + 0.006, -0.90, 0.90, 2.47, 2.66, 1);
  addFlat(G, 'x', BXR - 0.004, -0.85, 0.85, 1.95, 2.50, -1);
  for (const [a, b] of WIN_R) addFlat(G, 'z', HW + 0.004, a, b, WB0, WB1, 1);
  for (const [a, b] of WIN_L) addFlat(G, 'z', -(HW + 0.004), a, b, WB0, WB1, -1);
  for (const [a, b] of DOORS) {
    const m = (a + b) / 2;
    addFlat(G, 'z', HW + 0.010, a + 0.07, m - 0.025, 0.95, 2.40, 1);
    addFlat(G, 'z', HW + 0.010, m + 0.025, b - 0.07, 0.95, 2.40, 1);
  }
}

function bodyParts(P, fine, seg) {
  const Pt = P.get('Paint'), T = P.get('Trim'), C = P.get('Chrome');
  addLoft(T, bandStations(seg).map(x => [x, archLo(x), SPL, env(x)[0]]), 0.04);
  addLoft(Pt, END_X.map(x => { const [w, h] = env(x); return [x, SPL, h, w]; }), 0.04);
  addLoft(Pt, [[-5.0, ROOF - 0.05, 3.07, 0.78], [-1.8, ROOF - 0.05, 3.07, 0.78]], 0.03);
  addBox(T, -4.2, 3.075, 0, 0.7, 0.05, 0.55);
  addBox(T, -2.6, 3.075, 0, 0.7, 0.05, 0.55);
  glass(P.get('Glass'));
  addBox(T, BXF, 1.81, 0, 0.008, 1.28, 2.14);
  addBox(T, BXF, 2.565, 0, 0.008, 0.23, 1.94);
  addBox(T, BXF + 0.008, 1.81, 0, 0.010, 1.18, 0.04);
  addBox(T, BXF, 0.50, 0, 0.12, 0.34, 2.36);
  addBox(P.get('Plate'), BXF + 0.062, 0.49, 0, 0.004, 0.13, 0.52);
  both(P.get('Headlight'), BXF + 0.006, 0.80, 0.92, 0.008, 0.13, 0.30);
  for (const [a, b] of DOORS) addBox(T, (a + b) / 2, 1.425, HW + 0.005, b - a, 2.05, 0.006);
  for (const s of [-1, 1]) {
    addBox(T, 5.575, 2.10, s * 1.285, 0.05, 0.48, 0.10);
    addBox(C, 5.5475, 2.10, s * 1.285, 0.005, 0.42, 0.08);
    if (fine) addBox(T, 5.50, 2.36, s * 1.29, 0.14, 0.04, 0.05);
  }
  addBox(T, BXR, 0.50, 0, 0.12, 0.36, 2.40);
  addBox(P.get('Plate'), BXR - 0.062, 0.50, 0, 0.004, 0.13, 0.52);
  addBox(T, BXR - 0.005, 1.55, 0, 0.010, 0.60, 1.60);
  both(T, BXR - 0.005, 1.60, 1.09, 0.010, 0.56, 0.17);
  both(P.get('BrakeLight'), BXR - 0.0125, 1.75, 1.09, 0.005, 0.18, 0.13);
  both(P.get('Taillight'), BXR - 0.0125, 1.45, 1.09, 0.005, 0.18, 0.13);
  addBox(T, FX, WY, 0, 0.14, 0.16, 1.70);
  addBox(T, RX, WY, 0, 0.20, 0.22, 1.20);
  if (fine) {
    addBox(T, 0.5, 2.96, 0, 0.8, 0.02, 0.55);
    addBox(T, 2.6, 2.96, 0, 0.8, 0.02, 0.55);
    for (const [a, b] of DOORS) addBox(C, (a + b) / 2, 1.40, HW + 0.011, 0.02, 0.24, 0.006);
  }
}

function lod2Parts(P) {
  addLoft(P.get('Trim'), [[BXF, 0.25, SPL, 1.20], [5.35, 0.25, SPL, HW], [-5.95, 0.25, SPL, HW], [BXR, 0.25, SPL, 1.22]], 0.06);
  addLoft(P.get('Paint'), [[BXF, SPL, 2.72, 1.20], [5.35, SPL, ROOF, HW], [-5.95, SPL, ROOF, HW], [BXR, SPL, 2.78, 1.22]], 0.08);
  addLoft(P.get('Paint'), [[-5.0, 2.90, 3.10, 0.78], [-1.8, 2.90, 3.10, 0.78]], 0.05);
  const G = P.get('Glass');
  addFlat(G, 'x', BXF + 0.006, -1.02, 1.02, 1.22, 2.66, 1);
  addFlat(G, 'z', HW + 0.004, -5.25, 4.15, WB0, WB1, 1);
  addFlat(G, 'z', -(HW + 0.004), -5.65, 5.25, WB0, WB1, -1);
}

async function build() {
  const M = makeMaterials();
  const root = createRoot('TransitBus');
  for (const [name, fn] of [['LOD0', P => bodyParts(P, true, 14)], ['LOD1', P => bodyParts(P, false, 8)], ['LOD2', lod2Parts]]) {
    const g = createRoot(name);
    root.add(g);
    const P = meshSet();
    fn(P);
    P.commit(g, name, M);
  }
  root.add(wheelNode('Wheel_FL', FX, WY, -FT, WR, WW, M));
  root.add(wheelNode('Wheel_FR', FX, WY, FT, WR, WW, M));
  root.add(wheelNode('Wheel_RL', RX, WY, -RT, WR, WW, M, { pairs: 2, gap: RGAP }));
  root.add(wheelNode('Wheel_RR', RX, WY, RT, WR, WW, M, { pairs: 2, gap: RGAP }));
  return root;
}
