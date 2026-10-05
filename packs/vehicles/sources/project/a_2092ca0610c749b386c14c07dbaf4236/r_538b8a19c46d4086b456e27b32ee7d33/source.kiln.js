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

const meta = { name: 'Generic box truck' };

// Class 6 cab-over box truck: 7.60 x 2.50 x 3.40 m, wheelbase 4.50 m, 0.42 m radius tyres (0.245 m wide), dual rear wheels.
const FX = 2.25, RX = -2.25, WY = 0.42, WR = 0.42, WW = 0.245;
const FT = 0.93, RT = 0.86, RGAP = 0.29;
const CF = 3.40, CB = 1.45, CHW = 1.08, ARCH = 0.50, CLO = 0.60;
const DM = Math.sqrt(ARCH * ARCH - (CLO - WY) * (CLO - WY));
const BX0 = -4.05, BX1 = 1.30, BY0 = 1.05, BY1 = 3.40, BW = 1.24;

function cabStations(step) {
  const xs = [CF, 3.32, 3.20, CB];
  for (let d = -DM; d < DM; d += step) xs.push(FX + d);
  xs.push(FX + DM);
  xs.sort((a, b) => a - b);
  const u = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1e-4);
  const lo = x => Math.abs(x - FX) < DM ? WY + Math.sqrt(ARCH * ARCH - (x - FX) * (x - FX)) : CLO;
  const hi = x => x > CF - 0.01 ? 2.20 : x > 3.31 ? 2.42 : 2.46;
  const w = x => x > CF - 0.01 ? 1.02 : x > 3.31 ? 1.06 : CHW;
  return u.map(x => [x, lo(x), hi(x), w(x)]);
}

const both = (M, cx, cy, cz, sx, sy, sz) => { addBox(M, cx, cy, -cz, sx, sy, sz); addBox(M, cx, cy, cz, sx, sy, sz); };

function cabWindows(G) {
  addFlat(G, 'x', CF + 0.004, -0.90, 0.90, 1.28, 2.10, 1);
  for (const s of [-1, 1]) addFlat(G, 'z', s * (CHW + 0.004), 1.85, 3.10, 1.35, 2.30, s);
}

function cabParts(P, fine, step) {
  const Pt = P.get('Paint'), T = P.get('Trim'), C = P.get('Chrome');
  addLoft(Pt, cabStations(step));
  cabWindows(P.get('Glass'));
  addBox(T, 3.41, 0.54, 0, 0.08, 0.24, 2.12);
  addBox(T, CF + 0.004, 0.98, 0, 0.008, 0.46, 0.90);
  addBox(C, CF + 0.0095, 0.98, 0, 0.003, 0.03, 0.90);
  both(T, CF + 0.005, 1.00, 0.72, 0.010, 0.24, 0.40);
  both(P.get('Headlight'), CF + 0.013, 1.00, 0.72, 0.006, 0.16, 0.32);
  both(T, 3.15, 1.85, 1.145, 0.03, 0.03, 0.13);
  both(T, 3.15, 1.85, 1.20, 0.10, 0.36, 0.03);
  addBox(T, (BX1 + CB) / 2, 1.75, 0, CB - BX1, 1.40, 1.90);
  if (fine) {
    for (const x of [1.62, 3.24]) both(T, x, 1.50, CHW + 0.0015, 0.012, 1.60, 0.003);
    both(C, 1.80, 1.25, CHW + 0.01, 0.16, 0.03, 0.02);
  }
}

function boxParts(P, fine) {
  const C = P.get('CargoBox'), T = P.get('Trim'), Ch = P.get('Chrome');
  addLoft(C, [[BX0, BY0, BY1, BW], [BX1, BY0, BY1, BW]], 0.06);
  both(T, (BX0 + BX1) / 2, 1.09, BW + 0.005, BX1 - BX0, 0.08, 0.012);
  addBox(T, -4.10, 0.62, 0, 0.10, 0.20, 2.30);
  addBox(P.get('Plate'), BX0 - 0.003, 1.30, 0, 0.006, 0.12, 0.52);
  both(T, BX0 - 0.006, 1.36, 1.09, 0.012, 0.44, 0.18);
  both(P.get('BrakeLight'), BX0 - 0.0145, 1.46, 1.09, 0.005, 0.12, 0.14);
  both(P.get('Taillight'), BX0 - 0.0145, 1.28, 1.09, 0.005, 0.12, 0.14);
  if (fine) {
    addBox(T, BX0 - 0.0015, 2.25, 0, 0.003, 2.15, 0.014);
    for (const z of [-1.02, -0.62, 0.62, 1.02]) addBox(Ch, BX0 - 0.006, 2.25, z, 0.012, 2.05, 0.03);
    for (const x of [-3.5, -2.6, -1.7, -0.8, 0.1, 0.9]) both(C, x, 2.22, BW + 0.006, 0.05, 2.15, 0.012);
  }
}

function chassisParts(P) {
  const T = P.get('Trim');
  both(T, -1.175, 0.77, 0.45, 5.25, 0.30, 0.10);
  addBox(T, -3.75, 0.85, 0, 0.12, 0.16, 0.90);
  addBox(T, -0.55, 0.62, -0.83, 1.30, 0.50, 0.42);
  addBox(T, FX, WY, 0, 0.14, 0.14, 1.56);
  addBox(T, RX, WY, 0, 0.16, 0.16, 1.16);
  both(T, RX - 0.49, 0.40, RT, 0.02, 0.50, 0.70);
}

function bodyParts(fine, step, P) {
  cabParts(P, fine, step);
  boxParts(P, fine);
  chassisParts(P);
}

function lod2Parts(P) {
  addLoft(P.get('CargoBox'), [[BX0, BY0, BY1, BW], [BX1, BY0, BY1, BW]], 0.10);
  addLoft(P.get('Paint'), [[CB, 0.25, 2.46, CHW], [3.30, 0.25, 2.46, CHW], [CF, 0.25, 2.20, 1.02]], 0.08);
  addBox(P.get('Trim'), -1.25, 0.65, 0, 5.40, 0.80, 1.90);
  cabWindows(P.get('Glass'));
}

async function build() {
  const M = makeMaterials({ CargoBox: mk('CargoBox', 0xe4e6e8, { roughness: 0.5, metalness: 0 }) });
  const root = createRoot('BoxTruck');
  for (const [name, fn] of [['LOD0', P => bodyParts(true, 0.05, P)], ['LOD1', P => bodyParts(false, 0.125, P)], ['LOD2', lod2Parts]]) {
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
  defineLod(['LOD0', 'LOD1', 'LOD2'].map(name => root.children.find(g => g.name === name)), { screenCoverage: [0.0105,0.000606,0.0000168] });
  return root;
}
