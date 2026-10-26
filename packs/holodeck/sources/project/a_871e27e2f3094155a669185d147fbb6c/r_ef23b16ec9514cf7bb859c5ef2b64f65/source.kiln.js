/** Which plant to build: one of the PLANTS keys, or 'lineup' to review every variant together. */
const VARIANT = 'grass_patch';
const meta = {
  name: VARIANT === 'lineup' ? 'Crescent Cove undergrowth lineup' : `Crescent Cove undergrowth ${VARIANT}`,
  role: 'fill',
};

// Crescent Cove undergrowth and ground cover (Holodeck world tropical-island).
// Asset frame: metres, +Y up, origin at the ground contact; bases dip a few centimetres below Y=0.
// Every plant is one mesh primitive named `foliage` with one double-sided material, so Holodeck's
// foliage wind can drive it: TEXCOORD_0.y is the wind weight, 0 at the ground or attachment and rising
// toward 1 at the most flexible tips. TEXCOORD_0.x only selects a colour band of a 512x4 strip texture
// (constant along V); bands carry a lighter or darker midrib stripe at their centre, so leaves that map
// across a band show a midrib. Leaf outlines are geometry, not alpha. Shrub masses turn every leaf to
// face away from the shrub centre and bend normals toward an enclosing ellipsoid, so the mass shades as
// one volume while leaf edges still break the silhouette.

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const rad = (d) => (d * Math.PI) / 180;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
/** Rotate a direction about +Y. */
const yaw = (h, a) => [h[0] * Math.cos(a) - h[2] * Math.sin(a), h[1], h[0] * Math.sin(a) + h[2] * Math.cos(a)];
/** Gradient direction of an ellipsoid at q (its outward normal). */
const ellipsoidNormal = (q, c, r) => V.norm([(q[0] - c[0]) / (r[0] * r[0]), (q[1] - c[1]) / (r[1] * r[1]), (q[2] - c[2]) / (r[2] * r[2])]);

/** Deterministic mulberry32 stream. */
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- strip texture
const BAND_PX = 16;
const STRIP_W = 512;
const BANDS = {
  alocasia: { i: 0, blade: [44, 92, 30], rib: [150, 186, 96] },
  alocasiaLight: { i: 1, blade: [64, 116, 40], rib: [164, 198, 108] },
  alocasiaStem: { i: 2, blade: [108, 150, 58] },
  naupaka: { i: 3, blade: [128, 176, 58], rib: [166, 202, 98] },
  naupakaYellow: { i: 4, blade: [160, 196, 72], rib: [188, 214, 114] },
  naupakaCore: { i: 5, blade: [76, 116, 40] },
  hibiscus: { i: 6, blade: [70, 128, 38], rib: [160, 194, 108] },
  hibiscusLight: { i: 7, blade: [96, 152, 50], rib: [176, 206, 124] },
  hibiscusOld: { i: 8, blade: [182, 172, 70], rib: [214, 205, 120] },
  wood: { i: 9, blade: [104, 92, 76] },
  hibiscusFlower: { i: 10, blade: [242, 197, 58], rib: [150, 40, 40] },
  nestFern: { i: 11, blade: [126, 178, 54], rib: [58, 44, 28] },
  nestCore: { i: 12, blade: [86, 62, 38] },
  swordFern: { i: 13, blade: [78, 138, 44], rib: [109, 138, 58] },
  grass: { i: 14, blade: [134, 162, 70] },
  grassYoung: { i: 15, blade: [108, 148, 54] },
  grassStraw: { i: 16, blade: [196, 182, 118] },
  grassDry: { i: 17, blade: [152, 136, 90] },
  vine: { i: 18, blade: [72, 140, 44], rib: [152, 194, 102] },
  vineLight: { i: 19, blade: [98, 164, 56], rib: [168, 204, 118] },
  vineStem: { i: 20, blade: [132, 72, 56] },
  vineFlower: { i: 21, blade: [196, 88, 160], rib: [118, 30, 82] },
  scrub: { i: 22, blade: [124, 152, 104], rib: [164, 182, 144] },
  scrubDark: { i: 23, blade: [92, 120, 70], rib: [130, 154, 110] },
  scrubCore: { i: 24, blade: [66, 88, 50] },
  scrubFlower: { i: 25, blade: [232, 207, 74] },
  purslane: { i: 26, blade: [108, 166, 60], rib: [146, 194, 88] },
  purslaneRed: { i: 27, blade: [170, 70, 60] },
  purslaneFlower: { i: 28, blade: [228, 138, 184], rib: [250, 220, 235] },
  white: { i: 29, blade: [242, 239, 230], rib: [200, 190, 120] },
};
/** U inside a band: f = -1 and +1 are the band edges, 0 is the centre (midrib). */
const bandU = (b, f) => (b.i * BAND_PX + 1.5 + (BAND_PX - 3) * (0.5 + 0.5 * f)) / STRIP_W;

function makeMaterial() {
  const ops = [];
  for (const b of Object.values(BANDS)) {
    ops.push({ op: 'paint', shape: { kind: 'rectangle', x: b.i * BAND_PX, y: 0, width: BAND_PX, height: 4 }, rgba: [...b.blade, 255] });
    if (b.rib) ops.push({ op: 'paint', shape: { kind: 'rectangle', x: b.i * BAND_PX + 7, y: 0, width: 2, height: 4 }, rgba: [...b.rib, 255] });
  }
  const strip = proceduralTexture({
    schemaVersion: 3, width: STRIP_W, height: 4, usage: 'albedo', name: 'UndergrowthStrip',
    background: [80, 120, 50, 255], operations: ops,
  });
  const mat = pbrMaterial({ albedo: strip, roughness: 0.58, metalness: 0, doubleSided: true });
  mat.name = 'Undergrowth';
  return mat;
}

// ---------------------------------------------------------------- mesh builder
function makeMesh() {
  const p = [];
  const uv = [];
  const idx = [];
  const group = [];
  let current = -1;
  let groups = 0;
  const P = (i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
  return {
    v(pos, u, w) {
      p.push(pos[0], pos[1], pos[2]);
      uv.push(u, clamp01(w));
      return p.length / 3 - 1;
    },
    t(a, b, c) {
      idx.push(a, b, c);
      group.push(current);
    },
    /** Triangles added between leaf(true) and leaf(false) form one leaf that may be turned to face outward. */
    leaf(on) {
      current = on ? groups++ : -1;
    },
    triangles: () => idx.length / 3,
    /** shade {center, radii, bend}: face leaves away from the centre, bend normals toward the ellipsoid. */
    geometry(shade) {
      if (shade) {
        const facing = new Map();
        for (let f = 0; f < group.length; f++) {
          if (group[f] < 0) continue;
          const a = P(idx[3 * f]);
          const b = P(idx[3 * f + 1]);
          const c = P(idx[3 * f + 2]);
          const fn = V.cross(V.sub(b, a), V.sub(c, a));
          const mid = V.mul(V.add(V.add(a, b), c), 1 / 3);
          facing.set(group[f], (facing.get(group[f]) || 0) + V.dot(fn, ellipsoidNormal(mid, shade.center, shade.radii)));
        }
        for (let f = 0; f < group.length; f++) {
          if (group[f] >= 0 && facing.get(group[f]) < 0) {
            const s = idx[3 * f + 1];
            idx[3 * f + 1] = idx[3 * f + 2];
            idx[3 * f + 2] = s;
          }
        }
      }
      const n = new Array(p.length).fill(0);
      for (let i = 0; i < idx.length; i += 3) {
        const a = P(idx[i]);
        const f = V.cross(V.sub(P(idx[i + 1]), a), V.sub(P(idx[i + 2]), a));
        for (let k = 0; k < 3; k++) {
          const q = idx[i + k] * 3;
          n[q] += f[0];
          n[q + 1] += f[1];
          n[q + 2] += f[2];
        }
      }
      for (let i = 0; i < n.length; i += 3) {
        let v = [n[i], n[i + 1], n[i + 2]];
        v = V.len(v) < 1e-12 ? [0, 1, 0] : V.norm(v);
        if (shade && shade.bend) {
          const e = ellipsoidNormal(P(i / 3), shade.center, shade.radii);
          v = V.norm(V.add(V.mul(v, 1 - shade.bend), V.mul(e, shade.bend)));
        }
        n[i] = v[0];
        n[i + 1] = v[1];
        n[i + 2] = v[2];
      }
      return meshGeo({ positions: p, normals: n, uvs: uv, indices: idx });
    },
  };
}

/** Orthonormal leaf frame: d along the leaf, s across it, n its upper face (the part of `up` normal to d). */
function frame(dir, up) {
  const d = V.norm(dir);
  let s = V.cross(up || [0, 1, 0], d);
  if (V.len(s) < 1e-5) s = V.cross([1, 0, 0], d);
  s = V.norm(s);
  return { d, s, n: V.cross(d, s) };
}

// ---------------------------------------------------------------- leaves, stems and flowers
/** Strap or broad blade on a grid; droop bends it toward its underside, fold lifts the edges into a V. */
function blade(m, o) {
  const { d, s, n } = frame(o.dir, o.up);
  const cols = o.flat ? [-1, 1] : Array.from({ length: 2 * (o.across || 1) + 1 }, (_, j) => j / (o.across || 1) - 1);
  const fold = Math.tan(rad(o.fold || 0));
  const droop = rad(o.droop || 0);
  const rows = [];
  let pos = o.base;
  let prev = d;
  m.leaf(true);
  for (let i = 0; i <= o.segs; i++) {
    const t = i / o.segs;
    const a = droop * Math.pow(t, o.droopPow || 1.5);
    const dt = V.sub(V.mul(d, Math.cos(a)), V.mul(n, Math.sin(a)));
    const nt = V.add(V.mul(n, Math.cos(a)), V.mul(d, Math.sin(a)));
    if (i > 0) pos = V.add(pos, V.mul(V.norm(V.add(dt, prev)), o.len / o.segs));
    prev = dt;
    const hw = o.width * Math.max(0.02, o.shape(t));
    const w = o.w0 + (o.w1 - o.w0) * t;
    rows.push(cols.map((f) => {
      const wave = o.wave ? o.wave * Math.sin(t * Math.PI * (o.waveFreq || 6) + (f > 0 ? 0 : 1.7)) * Math.abs(f) : 0;
      const lift = Math.abs(f) * hw * fold + wave;
      return m.v(V.add(V.add(pos, V.mul(s, f * hw)), V.mul(nt, lift)), bandU(o.band, f), w);
    }));
  }
  for (let i = 0; i < o.segs; i++) {
    for (let j = 0; j < cols.length - 1; j++) {
      const a = rows[i][j];
      const b = rows[i][j + 1];
      const c = rows[i + 1][j + 1];
      const e = rows[i + 1][j];
      m.t(a, c, b);
      m.t(a, e, c);
    }
  }
  m.leaf(false);
}

/** Two-triangle folded leaf: base, widest point at tm, drooping tip. */
function diamond(m, o) {
  const { d, s, n } = frame(o.dir, o.up);
  const droop = rad(o.droop || 0);
  const tipDir = V.sub(V.mul(d, Math.cos(droop)), V.mul(n, Math.sin(droop)));
  const tm = o.tm || 0.6;
  const mid = V.add(o.base, V.mul(d, o.len * tm));
  const tip = V.add(mid, V.mul(tipDir, o.len * (1 - tm)));
  const lift = V.mul(n, o.width * Math.tan(rad(o.fold || 0)));
  const wm = o.w0 + (o.w1 - o.w0) * tm;
  m.leaf(true);
  const iB = m.v(o.base, bandU(o.band, 0), o.w0);
  const iL = m.v(V.add(V.sub(mid, V.mul(s, o.width)), lift), bandU(o.band, -1), wm);
  const iT = m.v(tip, bandU(o.band, 0), o.w1);
  const iR = m.v(V.add(V.add(mid, V.mul(s, o.width)), lift), bandU(o.band, 1), wm);
  m.t(iB, iL, iT);
  m.t(iB, iT, iR);
  m.leaf(false);
}

// Leaf outlines in leaf space: [along, across] in units of the leaf length, base first, then the -across
// side to the tip and back down the +across side. leafFan fans them from the base point.
const SPOON = [[0, 0], [0.5, -0.32], [0.93, -0.24], [0.93, 0.24], [0.5, 0.32]];
const HEART = [[0, 0], [-0.1, -0.38], [0.4, -0.5], [1, 0], [0.4, 0.5], [-0.1, 0.38]];
const GOAT4 = [[0, 0], [0.42, -0.5], [0.95, -0.3], [0.78, 0], [0.95, 0.3], [0.42, 0.5]];
const NARROW = [[0, 0], [0.55, -0.3], [1, 0], [0.55, 0.3]];
const HALF_FLOWER = [[0, 0], [0.3, -0.9], [0.8, -0.7], [1, 0], [0.8, 0.7], [0.3, 0.9]];

function leafFan(m, o) {
  const { d, s, n } = frame(o.dir, o.up);
  const maxY = Math.max(...o.outline.map((q) => Math.abs(q[1])));
  const maxX = Math.max(...o.outline.map((q) => q[0]));
  const fold = Math.tan(rad(o.fold || 0));
  const place = (x, y) => {
    const z = Math.abs(y) * fold - (o.droop || 0) * x * x;
    return V.add(o.base, V.add(V.mul(d, x * o.len), V.add(V.mul(s, y * o.len), V.mul(n, z * o.len))));
  };
  m.leaf(true);
  const ids = o.outline.map((q) => m.v(place(q[0], q[1]), bandU(o.band, q[1] / maxY), o.w0 + (o.w1 - o.w0) * clamp01(q[0] / maxX)));
  for (let i = 1; i < ids.length - 1; i++) m.t(ids[0], ids[i], ids[i + 1]);
  m.leaf(false);
}

/** Leaves spiralling out of one point around `axis`; outer leaves flatter and longer than inner ones. */
function rosette(m, rand, o) {
  const a1 = V.norm(V.cross(o.axis, Math.abs(o.axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const a2 = V.cross(o.axis, a1);
  const phase = rand() * Math.PI * 2;
  for (let k = 0; k < o.leaves; k++) {
    const f = o.leaves > 1 ? k / (o.leaves - 1) : 0;
    const a = phase + k * GOLDEN;
    const out = V.add(V.mul(a1, Math.cos(a)), V.mul(a2, Math.sin(a)));
    const elev = rad(o.elev[0] + (o.elev[1] - o.elev[0]) * f + (rand() - 0.5) * 12);
    const dir = V.norm(V.add(V.mul(out, Math.cos(elev)), V.mul(o.axis, Math.sin(elev))));
    const len = o.len * (1 - 0.35 * f) * (0.9 + rand() * 0.2);
    leafFan(m, { base: o.center, dir, up: o.axis, len, outline: o.outline, fold: o.fold, droop: o.droop, band: o.band(), w0: o.w, w1: Math.min(1, o.w + o.dw) });
  }
}

/** Thin tube along a polyline with parallel-transported frames (open ends). */
function tube(m, path, radius, sides, band, weight) {
  let prevN = null;
  const rings = [];
  for (let k = 0; k < path.length; k++) {
    const t = k / (path.length - 1);
    const T = V.norm(V.sub(path[Math.min(path.length - 1, k + 1)], path[Math.max(0, k - 1)]));
    let N = prevN ? V.sub(prevN, V.mul(T, V.dot(prevN, T))) : V.cross(T, Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
    N = V.norm(N);
    prevN = N;
    const B = V.cross(T, N);
    const r = radius(t);
    const ring = [];
    for (let j = 0; j < sides; j++) {
      const ang = (j / sides) * Math.PI * 2;
      ring.push(m.v(V.add(path[k], V.add(V.mul(N, Math.cos(ang) * r), V.mul(B, Math.sin(ang) * r))), bandU(band, 0), weight(t)));
    }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < sides; j++) {
      const a = rings[k][j];
      const b = rings[k][(j + 1) % sides];
      const c = rings[k + 1][(j + 1) % sides];
      const e = rings[k + 1][j];
      m.t(a, b, c);
      m.t(a, c, e);
    }
  }
}

/** Flat strip along a polyline, its face normal toward `up`. */
function ribbon(m, path, width, band, weight, up) {
  const rows = [];
  for (let k = 0; k < path.length; k++) {
    const T = V.norm(V.sub(path[Math.min(path.length - 1, k + 1)], path[Math.max(0, k - 1)]));
    let S = V.cross(up || [0, 1, 0], T);
    if (V.len(S) < 1e-5) S = V.cross([1, 0, 0], T);
    S = V.norm(S);
    const t = k / (path.length - 1);
    const w = width(t);
    rows.push([m.v(V.sub(path[k], V.mul(S, w)), bandU(band, -1), weight(t)), m.v(V.add(path[k], V.mul(S, w)), bandU(band, 1), weight(t))]);
  }
  for (let k = 0; k < rows.length - 1; k++) {
    const [a, b] = rows[k];
    const [e, c] = rows[k + 1];
    m.t(a, c, b);
    m.t(a, e, c);
  }
}

/** Open cup or trumpet: a fan from the base point to a scalloped rim around `axis`. */
function cup(m, base, axis, length, radius, band, w0, w1, petals) {
  const { d, s, n } = frame(axis, [1, 0, 0]);
  const c = m.v(base, bandU(band, 0), w0);
  const rim = [];
  const count = petals * 2;
  for (let j = 0; j < count; j++) {
    const a = (j / count) * Math.PI * 2;
    const r = radius * (j % 2 ? 0.72 : 1);
    rim.push(m.v(V.add(V.add(base, V.mul(d, length * (j % 2 ? 0.85 : 1))), V.add(V.mul(s, Math.cos(a) * r), V.mul(n, Math.sin(a) * r))), bandU(band, j % 2 ? 0.8 : 1), w1));
  }
  for (let j = 0; j < count; j++) m.t(c, rim[(j + 1) % count], rim[j]);
}

/** Closed low-resolution lumpy ellipsoid (shrub interiors, fern nest), wound outward. */
function blob(m, o) {
  const N = o.res;
  const ids = new Map();
  const vid = (i, j, k) => {
    const key = i + ',' + j + ',' + k;
    let id = ids.get(key);
    if (id === undefined) {
      const q = [(2 * i) / N[0] - 1, (2 * j) / N[1] - 1, (2 * k) / N[2] - 1];
      const l = Math.hypot(q[0], q[1], q[2]);
      const bump = 1 + o.noise * (o.rand() - 0.5) * 2;
      const p = [0, 1, 2].map((a) => o.center[a] + (q[a] / l) * o.radii[a] * bump);
      id = m.v(p, bandU(o.band, 0), o.weight(p));
      ids.set(key, id);
    }
    return id;
  };
  const AX = [[1, 2], [2, 0], [0, 1]];
  for (let a = 0; a < 3; a++) {
    const [b, c] = AX[a];
    for (const sgn of [1, -1]) {
      const at = (u, v) => {
        const ijk = [0, 0, 0];
        ijk[a] = sgn > 0 ? N[a] : 0;
        ijk[b] = u;
        ijk[c] = v;
        return vid(ijk[0], ijk[1], ijk[2]);
      };
      for (let u = 0; u < N[b]; u++) {
        for (let v = 0; v < N[c]; v++) {
          const v00 = at(u, v);
          const v10 = at(u + 1, v);
          const v11 = at(u + 1, v + 1);
          const v01 = at(u, v + 1);
          if (sgn > 0) {
            m.t(v00, v10, v11);
            m.t(v00, v11, v01);
          } else {
            m.t(v00, v11, v10);
            m.t(v00, v01, v11);
          }
        }
      }
    }
  }
}

/** Point and unit tangent at fraction t along a polyline (by vertex index). */
function along(path, t) {
  const f = clamp01(t) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  return { p: V.lerp(path[i], path[i + 1], f - i), d: V.norm(V.sub(path[i + 1], path[i])) };
}

function bezier(p0, p1, p2, t) {
  return V.add(V.add(V.mul(p0, (1 - t) * (1 - t)), V.mul(p1, 2 * t * (1 - t))), V.mul(p2, t * t));
}

/** Point on the unit sphere for the i-th of `count` Fibonacci samples, from the top down to y = yMin. */
function fibonacci(i, count, yMin) {
  const y = 1 - ((i + 0.5) / count) * (1 - yMin);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const th = i * GOLDEN;
  return [Math.cos(th) * r, y, Math.sin(th) * r];
}

// ---------------------------------------------------------------- blade shapes
const heartShape = (t) => (t < 0.18 ? 0.55 + 0.45 * Math.sin((t / 0.18) * (Math.PI / 2)) : Math.pow((1 - t) / 0.82, 0.8));
const strapShape = (t) => Math.min(1, 0.25 + (t / 0.15) * 0.75) * (t > 0.75 ? Math.sqrt(Math.max(0, 1 - ((t - 0.75) / 0.25) ** 2)) : 1);
const grassShape = (t) => 1 - Math.pow(t, 1.6);

// ---------------------------------------------------------------- plants
/** Elephant ear: arrow-shaped blades on long petioles, the grove's big-leaf understory. */
function alocasia(m, rand) {
  const count = 9;
  for (let i = 0; i < count; i++) {
    const outer = i / (count - 1);
    const az = i * GOLDEN + rand() * 0.4;
    const h = [Math.cos(az), 0, Math.sin(az)];
    const elev = rad(76 - 28 * outer + (rand() - 0.5) * 8);
    const pl = 0.55 + 0.45 * outer + rand() * 0.15;
    const p0 = [h[0] * 0.04, -0.04, h[2] * 0.04];
    const p2 = [h[0] * pl * Math.cos(elev), pl * Math.sin(elev), h[2] * pl * Math.cos(elev)];
    const p1 = [h[0] * pl * 0.12, pl * 0.7, h[2] * pl * 0.12];
    const path = [];
    for (let k = 0; k <= 6; k++) path.push(bezier(p0, p1, p2, k / 6));
    const wTop = 0.22 + 0.25 * clamp01(p2[1] / 1.2);
    tube(m, path, (t) => 0.022 - 0.01 * t, 5, BANDS.alocasiaStem, (t) => wTop * t * t);
    const L = 0.52 + 0.34 * outer + rand() * 0.12;
    const tilt = rad(-20 - 22 * outer - rand() * 10);
    const dir = V.norm([h[0] * Math.cos(tilt), Math.sin(tilt), h[2] * Math.cos(tilt)]);
    blade(m, {
      base: V.sub(p2, V.mul(dir, L * 0.14)), dir, up: [0, 1, 0], len: L, width: L * (0.38 + rand() * 0.05),
      shape: heartShape, droop: 22 + 16 * outer, droopPow: 1.4, fold: 14, wave: 0.012, waveFreq: 5, segs: 7, across: 3,
      band: rand() < 0.35 ? BANDS.alocasiaLight : BANDS.alocasia, w0: wTop, w1: Math.min(1, wTop + 0.45),
    });
  }
}

/** Naupaka hedge mound: overlapping dark lobes covered in spoon-leaf rosettes with white half-flowers. */
function naupaka(m, rand) {
  const wAt = (y) => 0.08 + 0.5 * smoothstep(0, 1.3, y);
  const lobes = [
    [[0, 0.5, 0], [0.8, 0.58, 0.72]],
    [[0.48, 0.38, 0.28], [0.5, 0.42, 0.48]],
    [[-0.46, 0.36, 0.3], [0.48, 0.4, 0.46]],
    [[0.06, 0.34, -0.5], [0.54, 0.4, 0.46]],
  ];
  for (const [c, r] of lobes) blob(m, { center: c, radii: r, res: [3, 2, 3], noise: 0.12, band: BANDS.naupakaCore, rand, weight: (p) => wAt(p[1]) });
  const C = [0, 0.46, 0];
  const R = [1.12, 0.78, 1.02];
  const count = 66;
  for (let i = 0; i < count; i++) {
    const u = fibonacci(i, count, -0.6);
    const depth = 0.84 + rand() * 0.18;
    const center = [C[0] + u[0] * R[0] * depth, C[1] + u[1] * R[1] * depth, C[2] + u[2] * R[2] * depth];
    if (center[1] < 0.1) continue;
    const nrm = ellipsoidNormal(center, C, R);
    const axis = V.norm(V.add(V.mul(nrm, 0.7), [(rand() - 0.5) * 0.3, 0.45, (rand() - 0.5) * 0.3]));
    const w = wAt(center[1]);
    const yellow = rand() < 0.3;
    rosette(m, rand, {
      center, axis, leaves: 7, len: 0.2 + rand() * 0.07, elev: [18, 52], outline: SPOON, fold: 16, droop: 0.12,
      band: () => (yellow || rand() < 0.12 ? BANDS.naupakaYellow : BANDS.naupaka), w, dw: 0.14,
    });
    if (rand() < 0.4) {
      const fdir = V.norm(V.add(axis, [rand() * 0.6 - 0.3, 0.2, rand() * 0.6 - 0.3]));
      leafFan(m, { base: V.add(center, V.mul(axis, 0.03)), dir: fdir, up: axis, len: 0.05, outline: HALF_FLOWER, band: BANDS.white, w0: w, w1: w + 0.05 });
    }
  }
}

/** Beach hibiscus thicket: leaning woody stems and side shoots carrying broad heart leaves and yellow cups. */
function hibiscus(m, rand) {
  const wAt = (y) => 0.05 + 0.55 * clamp01(y / 2) ** 1.2;
  // Leaves hang outward from their stalks, so their broad faces turn toward an eye-level viewer.
  const leafAt = (p, outward) => {
    const o = V.norm(yaw(outward, (rand() - 0.5) * 1.4));
    const e = rad(-45 + rand() * 60);
    const dir = [o[0] * Math.cos(e), Math.sin(e), o[2] * Math.cos(e)];
    const w = wAt(p[1]);
    const r = rand();
    leafFan(m, {
      base: V.add(p, V.mul(dir, 0.06)), dir, up: V.norm(V.add(V.mul(o, 0.3), [0, 1, 0])), len: 0.22 + rand() * 0.12, outline: HEART, fold: 8, droop: 0.15,
      band: r < 0.08 ? BANDS.hibiscusOld : r < 0.45 ? BANDS.hibiscusLight : BANDS.hibiscus, w0: w, w1: Math.min(1, w + 0.2),
    });
  };
  const stems = 6;
  for (let i = 0; i < stems; i++) {
    const az = i * GOLDEN + rand() * 0.5;
    const h = [Math.cos(az), 0, Math.sin(az)];
    const lean = rad(12 + rand() * 24);
    const len = 1.3 + rand() * 0.6;
    const path = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const out = Math.sin(lean) * t * len + 0.22 * t * t * len + 0.05;
      path.push([h[0] * out, Math.cos(lean) * t * len - 0.06, h[2] * out]);
    }
    tube(m, path, (t) => 0.034 - 0.022 * t, 5, BANDS.wood, (t) => wAt(path[Math.round(t * 6)][1]));
    for (let k = 0; k < 16; k++) {
      const { p } = along(path, 0.4 + 0.6 * (k / 15));
      const swing = k * 2.4 + rand() * 0.6;
      leafAt(p, V.norm([h[0] + Math.cos(swing) * 0.9, 0, h[2] + Math.sin(swing) * 0.9]));
    }
    for (let b = 0; b < 3; b++) {
      const { p } = along(path, 0.38 + 0.2 * b + rand() * 0.08);
      const baz = az + (b % 2 ? 1 : -1) * (0.6 + rand() * 0.6);
      const bh = [Math.cos(baz), 0, Math.sin(baz)];
      const blen = 0.4 + rand() * 0.3;
      const bpath = [];
      for (let k = 0; k <= 3; k++) {
        const t = k / 3;
        bpath.push([p[0] + bh[0] * blen * t, p[1] + (0.3 - 0.15 * t) * blen * t, p[2] + bh[2] * blen * t]);
      }
      tube(m, bpath, (t) => 0.016 - 0.008 * t, 3, BANDS.wood, (t) => wAt(bpath[Math.round(t * 3)][1]));
      for (let k = 0; k < 9; k++) {
        const { p: q } = along(bpath, 0.2 + 0.8 * (k / 8));
        const swing = k * 2.4 + rand();
        leafAt(q, V.norm([bh[0] + Math.cos(swing) * 0.8, 0, bh[2] + Math.sin(swing) * 0.8]));
      }
    }
    const { p: fp } = along(path, 0.7 + rand() * 0.25);
    const fw = wAt(fp[1]);
    cup(m, V.add(fp, [h[0] * 0.08, 0.03, h[2] * 0.08]), V.norm([h[0] * 0.6, 0.8, h[2] * 0.6]), 0.08, 0.06, BANDS.hibiscusFlower, fw, fw + 0.1, 5);
  }
}

/** Bird's-nest fern: a brown nest with upright and arching strap fronds. */
function nestFern(m, rand) {
  blob(m, { center: [0, 0.08, 0], radii: [0.17, 0.12, 0.17], res: [3, 2, 3], noise: 0.15, band: BANDS.nestCore, rand, weight: () => 0.02 });
  const count = 15;
  for (let i = 0; i < count; i++) {
    const inner = i < 5;
    const az = i * GOLDEN + rand() * 0.3;
    const h = [Math.cos(az), 0, Math.sin(az)];
    const elev = rad(inner ? 72 + rand() * 10 : 40 + rand() * 24);
    blade(m, {
      base: [h[0] * 0.06, 0.1, h[2] * 0.06], dir: [h[0] * Math.cos(elev), Math.sin(elev), h[2] * Math.cos(elev)], up: [0, 1, 0],
      len: inner ? 0.55 + rand() * 0.2 : 0.8 + rand() * 0.35, width: 0.08 + rand() * 0.025, shape: strapShape,
      droop: inner ? 10 : 35 + rand() * 25, droopPow: 1.6, fold: 18, wave: 0.012, waveFreq: 7, segs: 8, across: 1,
      band: BANDS.nestFern, w0: 0.05, w1: inner ? 0.6 : 0.9,
    });
  }
}

/** Sword fern: arching pinnate fronds. */
function swordFern(m, rand) {
  const count = 13;
  for (let i = 0; i < count; i++) {
    const az = i * GOLDEN + rand() * 0.4;
    const h = [Math.cos(az), 0, Math.sin(az)];
    const elev = rad(52 + rand() * 30);
    const { d, n } = frame([h[0] * Math.cos(elev), Math.sin(elev), h[2] * Math.cos(elev)], [0, 1, 0]);
    const L = 0.6 + rand() * 0.38;
    const droop = rad(55 + rand() * 35);
    const segs = 8;
    const pts = [];
    const ups = [];
    let pos = [h[0] * 0.03, 0.0, h[2] * 0.03];
    for (let k = 0; k <= segs; k++) {
      const a = droop * Math.pow(k / segs, 1.4);
      const dt = V.sub(V.mul(d, Math.cos(a)), V.mul(n, Math.sin(a)));
      if (k > 0) pos = V.add(pos, V.mul(dt, L / segs));
      pts.push(pos);
      ups.push(V.add(V.mul(n, Math.cos(a)), V.mul(d, Math.sin(a))));
    }
    ribbon(m, pts, (t) => 0.006 * (1 - 0.6 * t), BANDS.swordFern, (t) => 0.05 + 0.85 * t, n);
    const pairs = 18;
    for (let k = 0; k < pairs; k++) {
      const t = 0.12 + 0.86 * (k / (pairs - 1));
      const { p, d: dd } = along(pts, t);
      const up = V.norm(ups[Math.min(segs, Math.round(t * segs))]);
      const side = V.norm(V.cross(up, dd));
      const pl = (0.075 - 0.05 * Math.pow(t, 1.5)) * (L / 0.8);
      for (const sg of [-1, 1]) {
        const dir = V.norm(V.add(V.mul(side, sg * Math.sin(rad(62))), V.mul(dd, Math.cos(rad(62)))));
        diamond(m, { base: p, dir, up, len: pl, width: pl * 0.22, tm: 0.45, fold: 10, droop: 8, band: BANDS.swordFern,
          w0: 0.05 + 0.85 * t, w1: Math.min(1, 0.1 + 0.85 * t) });
      }
    }
  }
}

/** Strand grass: tapered flat blades leaning out of one or more crowns. */
function grassTuft(m, rand, o) {
  for (let i = 0; i < o.blades; i++) {
    const az = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * o.r;
    const lean = rad(o.lean[0] + rand() * (o.lean[1] - o.lean[0]));
    const roll = (rand() - 0.5) * 1.2;
    const r = rand();
    blade(m, {
      base: [o.at[0] + Math.cos(az) * rr, -0.03, o.at[2] + Math.sin(az) * rr],
      dir: [Math.sin(lean) * Math.cos(az), Math.cos(lean), Math.sin(lean) * Math.sin(az)],
      up: [-Math.cos(az + roll), 0, -Math.sin(az + roll)],
      len: o.len[0] + rand() * (o.len[1] - o.len[0]), width: o.width[0] + rand() * (o.width[1] - o.width[0]), shape: grassShape,
      droop: 15 + rand() * 50, droopPow: 1.8, segs: o.segs, flat: true,
      band: r < o.mix[0] ? BANDS.grass : r < o.mix[1] ? BANDS.grassYoung : r < o.mix[2] ? BANDS.grassStraw : BANDS.grassDry, w0: 0, w1: 1,
    });
  }
}

/** Beach morning glory runner: a red stem on the sand, goat's-foot leaves tilted up beside it, side runners. */
function vineRunner(m, rand, o, start, az, len, depth) {
  const segs = Math.max(4, Math.round(len / 0.18));
  let pos = [start[0], 0.012, start[2]];
  const path = [pos];
  for (let k = 1; k <= segs; k++) {
    az += (rand() - 0.5) * 0.45;
    pos = [pos[0] + (Math.cos(az) * len) / segs, 0.01 + 0.012 * rand(), pos[2] + (Math.sin(az) * len) / segs];
    path.push(pos);
  }
  ribbon(m, path, () => 0.006, BANDS.vineStem, () => 0, [0, 1, 0]);
  const leaves = Math.max(2, Math.round(len / o.leafStep));
  for (let k = 0; k < leaves; k++) {
    const { p, d } = along(path, (k + 0.5 + (rand() - 0.5) * 0.4) / leaves);
    const side = V.mul(V.norm(V.cross([0, 1, 0], d)), k % 2 ? 1 : -1);
    const base = V.add(V.add(p, V.mul(side, 0.012)), [0, 0.008 + rand() * 0.03, 0]);
    const dir = V.norm(V.add(V.add(V.mul(side, 0.75), V.mul(d, 0.3 + rand() * 0.4)), [0, 0.15 + rand() * 0.25, 0]));
    leafFan(m, { base, dir, up: [0, 1, 0], len: o.leafLen[0] + rand() * (o.leafLen[1] - o.leafLen[0]), outline: GOAT4, fold: 16, droop: 0.12,
      band: rand() < 0.3 ? BANDS.vineLight : BANDS.vine, w0: 0.04, w1: 0.4 });
  }
  if (rand() < o.flowerChance) {
    const { p } = along(path, 0.3 + rand() * 0.5);
    cup(m, V.add(p, [0, 0.01, 0]), V.norm([rand() - 0.5, 1.6, rand() - 0.5]), 0.06, 0.04, BANDS.vineFlower, 0.2, 0.45, 5);
  }
  if (depth === 0) {
    const branches = o.branches[0] + Math.floor(rand() * (o.branches[1] - o.branches[0] + 1));
    for (let b = 0; b < branches; b++) {
      const { p, d } = along(path, 0.25 + rand() * 0.5);
      const baz = Math.atan2(d[2], d[0]) + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.5);
      vineRunner(m, rand, o, p, baz, len * (0.3 + rand() * 0.3), 1);
    }
  }
}

function vines(m, rand, o) {
  for (let r = 0; r < o.runners; r++) {
    const az = o.aim !== undefined ? o.aim + (rand() - 0.5) * o.fan : (r / o.runners) * Math.PI * 2 + rand() * 0.6;
    vineRunner(m, rand, o, o.start(rand), az, o.spread[0] + rand() * (o.spread[1] - o.spread[0]), 0);
  }
}

/** Headland scrub cushion: low wind-pruned lobes covered in small grey-green leaf clusters. */
function scrub(m, rand) {
  const wAt = (y) => 0.06 + 0.3 * clamp01(y / 0.6);
  const lobes = [
    [[0, 0.16, 0], [0.6, 0.36, 0.52]],
    [[0.5, 0.1, 0.22], [0.42, 0.27, 0.4]],
    [[-0.46, 0.1, 0.24], [0.42, 0.25, 0.38]],
    [[0.12, 0.1, -0.44], [0.44, 0.26, 0.38]],
    [[-0.34, 0.08, -0.3], [0.36, 0.22, 0.32]],
  ];
  // The shadowed interior sits well inside the leaf shell; rosettes stand on the full lobe surfaces.
  for (const [c, r] of lobes) blob(m, { center: c, radii: V.mul(r, 0.78), res: [3, 2, 3], noise: 0.14, band: BANDS.scrubCore, rand, weight: (p) => wAt(p[1]) });
  const inside = (q, skip) => lobes.some(([c, r], j) => j !== skip && ((q[0] - c[0]) / r[0]) ** 2 + ((q[1] - c[1]) / r[1]) ** 2 + ((q[2] - c[2]) / r[2]) ** 2 < 0.8);
  // Pick lobes by their top-down area so the big central lobe gets its share of rosettes.
  const areas = lobes.map(([, r]) => r[0] * r[2]);
  const total = areas.reduce((a, b) => a + b, 0);
  const pickLobe = () => {
    let x = rand() * total;
    for (let j = 0; j < areas.length; j++) {
      x -= areas[j];
      if (x <= 0) return j;
    }
    return areas.length - 1;
  };
  let placed = 0;
  for (let tries = 0; placed < 95 && tries < 1500; tries++) {
    const j = pickLobe();
    const [c, r] = lobes[j];
    const th = rand() * Math.PI * 2;
    const y = Math.min(1, -0.25 + rand() * 1.25);
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const u = [Math.cos(th) * rr, y, Math.sin(th) * rr];
    const depth = 0.96 + rand() * 0.12;
    const q = [c[0] + u[0] * r[0] * depth, c[1] + u[1] * r[1] * depth, c[2] + u[2] * r[2] * depth];
    if (q[1] < 0.03 || inside(q, j)) continue;
    placed++;
    const nrm = ellipsoidNormal(q, c, r);
    const axis = V.norm(V.add(V.mul(nrm, 0.8), [(rand() - 0.5) * 0.4, 0.3, (rand() - 0.5) * 0.4]));
    const w = wAt(q[1]);
    rosette(m, rand, { center: q, axis, leaves: 6, len: 0.13 + rand() * 0.06, elev: [5, 35], outline: NARROW, fold: 18, droop: 0.1,
      band: () => (rand() < 0.3 ? BANDS.scrubDark : BANDS.scrub), w, dw: 0.08 });
    if (rand() < 0.08) {
      diamond(m, { base: V.add(q, V.mul(axis, 0.02)), dir: axis, up: [1, 0, 0], len: 0.03, width: 0.016, tm: 0.5, band: BANDS.scrubFlower, w0: w, w1: w + 0.04 });
    }
  }
}

/** Sea purslane runner: a red stem with fleshy folded leaf pairs, a side runner and pink star flowers. */
function purslaneStem(m, rand, start, az, len, depth) {
  const segs = Math.max(3, Math.round(len / 0.09));
  let pos = [start[0], 0.012, start[2]];
  const path = [pos];
  for (let k = 1; k <= segs; k++) {
    az += (rand() - 0.5) * 0.5;
    pos = [pos[0] + (Math.cos(az) * len) / segs, 0.012 + 0.03 * Math.sin((k / segs) * Math.PI) * rand(), pos[2] + (Math.sin(az) * len) / segs];
    path.push(pos);
  }
  ribbon(m, path, () => 0.006, BANDS.purslaneRed, () => 0, [0, 1, 0]);
  const pairs = Math.round(len / 0.05);
  for (let k = 0; k < pairs; k++) {
    const { p, d } = along(path, (k + 0.6) / pairs);
    const side = V.norm(V.cross([0, 1, 0], d));
    for (const sg of [-1, 1]) {
      const elev = rad(30 + rand() * 30);
      const hd = V.norm(V.add(V.mul(side, sg), V.mul(d, 0.4)));
      const dir = V.norm([hd[0] * Math.cos(elev), Math.sin(elev), hd[2] * Math.cos(elev)]);
      diamond(m, { base: p, dir, up: [0, 1, 0], len: 0.05 + rand() * 0.03, width: 0.013, tm: 0.55, fold: 50, droop: 5,
        band: rand() < 0.2 ? BANDS.purslaneRed : BANDS.purslane, w0: 0.03, w1: 0.18 });
    }
  }
  if (depth === 0 && rand() < 0.7) {
    const { p, d } = along(path, 0.3 + rand() * 0.3);
    purslaneStem(m, rand, p, Math.atan2(d[2], d[0]) + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.4), len * (0.35 + rand() * 0.25), 1);
  }
  if (rand() < 0.5) {
    const { p } = along(path, 0.4 + rand() * 0.5);
    cup(m, V.add(p, [0, 0.02, 0]), [0, 1, 0], 0.012, 0.02, BANDS.purslaneFlower, 0.05, 0.15, 5);
  }
}

function purslane(m, rand) {
  const stems = 13;
  for (let s = 0; s < stems; s++) {
    const az = (s / stems) * Math.PI * 2 + rand() * 0.5;
    purslaneStem(m, rand, [Math.cos(az) * 0.04, 0, Math.sin(az) * 0.04], az, 0.5 + rand() * 0.35, 0);
  }
}

// ---------------------------------------------------------------- catalogue
const PLANTS = {
  shrub_alocasia: { seed: 11, build: alocasia },
  shrub_naupaka: { seed: 23, build: naupaka, shade: { center: [0, 0.46, 0], radii: [1.15, 0.85, 1.05], bend: 0.45 } },
  shrub_hibiscus: { seed: 37, build: hibiscus, shade: { center: [0, 1.15, 0], radii: [1.1, 0.95, 1.1], bend: 0.35 } },
  fern_nest: { seed: 41, build: nestFern },
  fern_sword: { seed: 53, build: swordFern },
  grass_tuft: {
    seed: 61,
    build: (m, r) => grassTuft(m, r, { blades: 72, r: 0.09, len: [0.32, 0.72], width: [0.009, 0.015], lean: [4, 38], segs: 3, at: [0, 0, 0], mix: [0.45, 0.68, 0.88] }),
  },
  grass_patch: {
    seed: 67,
    build: (m, r) => {
      const tufts = [[0, 0, 0], [0.6, 0, 0.4], [-0.55, 0, 0.5], [0.4, 0, -0.65], [-0.5, 0, -0.45], [1.05, 0, -0.1], [-1.0, 0, 0.05], [0.15, 0, 0.95], [-0.1, 0, -1.0]];
      for (const at of tufts) {
        grassTuft(m, r, { blades: 22 + Math.floor(r() * 9), r: 0.07, len: [0.2, 0.5], width: [0.008, 0.013], lean: [6, 42], segs: 2, at, mix: [0.4, 0.6, 0.85] });
      }
      grassTuft(m, r, { blades: 36, r: 1.25, len: [0.12, 0.3], width: [0.007, 0.011], lean: [10, 50], segs: 2, at: [0, 0, 0], mix: [0.35, 0.55, 0.8] });
    },
  },
  vine_mat: {
    seed: 71,
    build: (m, r) => vines(m, r, { runners: 8, spread: [1.1, 1.8], start: (rr) => [(rr() - 0.5) * 0.3, 0, (rr() - 0.5) * 0.3], branches: [1, 2], leafStep: 0.075, leafLen: [0.09, 0.13], flowerChance: 0.7 }),
  },
  vine_fringe: {
    seed: 79,
    build: (m, r) => vines(m, r, { runners: 12, aim: 0, fan: 1.8, spread: [0.9, 2.2], start: (rr) => [-0.4 + rr() * 0.4, 0, -3 + rr() * 6], branches: [0, 1], leafStep: 0.08, leafLen: [0.09, 0.13], flowerChance: 0.55 }),
  },
  cover_scrub: { seed: 83, build: scrub, shade: { center: [0, 0.1, 0], radii: [0.95, 0.45, 0.85], bend: 0.5 } },
  cover_purslane: { seed: 89, build: purslane },
};

function addPlant(parent, name, material, offset, prefix) {
  const plant = PLANTS[name];
  const m = makeMesh();
  plant.build(m, makeRandom(plant.seed));
  const part = createPart(prefix + 'foliage', m.geometry(plant.shade), material, { parent, position: offset });
  part.name = prefix + 'foliage';
  markOpenShell(part, 'Single-sheet leaves, blades and flowers on a double-sided material; thin open-ended stems.');
  return m.triangles();
}

/** Review-only sand floor (lineup mode). */
function addLineupGround(parent, material) {
  const [x0, x1, z0, z1] = [-4, 4, -4, 37];
  const geo = meshGeo({
    positions: [x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [x0, z0, x1, z0, x1, z1, x0, z1],
    indices: [0, 2, 1, 0, 3, 2],
  });
  const part = createPart('lineup_ground', geo, material, { parent });
  part.name = 'lineup_ground';
  markOpenShell(part, 'Single-sided review floor; not part of any saved plant.');
}

const SAND_SPEC = {
  schemaVersion: 3, model: 'pbrMetallicRoughness', name: 'ReviewSand', roughness: 1, metalness: 0,
  textures: Object.fromEntries([['baseColor', 'base-color'], ['normal', 'normal'], ['metallicRoughness', 'metallic-roughness']].map(([slot, suffix]) => [slot, {
    kind: 'resource',
    resourceId: `kiln.library.ebba050eb4413a171f9ecade01346f3c3fe1a91d97136944b64600416c5264fb.${suffix}`,
    sampler: { minFilter: 'linear-mipmap-linear', magFilter: 'linear', wrapS: 'repeat', wrapT: 'repeat' },
  }])),
};

async function build() {
  const material = makeMaterial();
  const root = createRoot(VARIANT === 'lineup' ? 'UndergrowthLineup' : 'Undergrowth');
  const triangles = {};
  if (VARIANT === 'lineup') {
    const row = [['shrub_alocasia', 0], ['shrub_naupaka', 3.4], ['shrub_hibiscus', 7.2], ['fern_nest', 10.6], ['fern_sword', 13.2],
      ['grass_tuft', 15.6], ['grass_patch', 18.2], ['vine_mat', 22], ['vine_fringe', 27], ['cover_scrub', 31.6], ['cover_purslane', 34.4]];
    for (const [n, z] of row) triangles[n] = addPlant(root, n, material, [0, 0, z], n + '_');
    addLineupGround(root, await compilePortableMaterialSpecV3(SAND_SPEC));
  } else {
    triangles[VARIANT] = addPlant(root, VARIANT, material, [0, 0, 0], '');
  }
  root.userData = { undergrowthVariant: VARIANT, groundY: 0, windWeight: 'uv-y', triangles };
  return root;
}
