/** Which palm to build: 'tall', 'lean', 'arch' or 'young'. 'lineup' shows all four for review only. */
const VARIANT = 'tall';
const meta = { name: VARIANT === 'lineup' ? 'Coconut palm lineup' : `Coconut palm ${VARIANT}`, role: 'fill' };

// Crescent Cove coconut palms. Asset frame: metres, +Y up, +X is the lean direction,
// trunk base at the origin with its flared root plate buried below Y=0.
// All fronds are one mesh primitive named fronds, with one material, for Holodeck
// foliage wind: TEXCOORD_0.y runs from 0 where a frond leaves the crown to 1 at its
// tip, and leaflets carry the value of their attachment point plus their own length.
// Leaflets (pinnae) are broad strap blades, about 8:1 long to wide, so the crown reads as
// lush leaves rather than needles; neighbours overlap along the rachis.
// TEXCOORD_0.x selects the frond group's colour band (four bands, older groups more
// yellow-olive) and, within it, a colour column of the frond strip.

const UP = [0, 1, 0];
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
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

/** Deterministic mulberry32 stream so every rebuild makes the same tree. */
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

/** Rodrigues rotation taking unit vector a onto unit vector b. */
function rotationFromTo(a, b) {
  const axis = V.cross(a, b);
  const s = V.len(axis);
  const c = V.dot(a, b);
  if (s < 1e-6) return (v) => v.slice();
  const k = V.mul(axis, 1 / s);
  return (v) => {
    const kv = V.cross(k, v);
    const kd = V.dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
  };
}

function meshBuilder() {
  return {
    p: [],
    n: [],
    uv: [],
    idx: [],
    vert(pos, nor, u, v) {
      this.p.push(pos[0], pos[1], pos[2]);
      this.n.push(nor[0], nor[1], nor[2]);
      this.uv.push(u, v);
      return this.p.length / 3 - 1;
    },
    tri(a, b, c) {
      this.idx.push(a, b, c);
    },
    geometry() {
      return meshGeo({ positions: this.p, indices: this.idx, normals: this.n, uvs: this.uv });
    },
  };
}

// ---------------------------------------------------------------- designs
const MATURE = { elevTop: 70, elevLow: -8, bendTop: 30, bendLow: 88, radial: 12, deadFronds: 1, sheathScale: 1, attachDrop: 0.55 };
const DESIGNS = {
  tall: {
    ...MATURE, seed: 11, bunches: 3,
    trunk: [[0, -0.35, 0], [0, 0.6, 0], [0.25, 4, 0.05], [0.7, 8, 0.12], [0.95, 11.5, 0.05], [0.9, 14.4, -0.05]],
    rBase: 0.22, rTop: 0.15, flare: 0.17, fronds: 24, frondLen: 5.2, leafLen: 1.05, leafWidth: 0.13, perSide: 30,
  },
  lean: {
    ...MATURE, seed: 23, bunches: 2,
    trunk: [[0, -0.35, 0], [0.05, 0.5, 0], [1.0, 3.0, 0], [2.4, 6.0, 0.1], [3.5, 9.0, 0.15], [4.0, 11.2, 0.1]],
    rBase: 0.21, rTop: 0.14, flare: 0.16, fronds: 22, frondLen: 4.9, leafLen: 1.0, leafWidth: 0.125, perSide: 29,
  },
  arch: {
    ...MATURE, seed: 37, bunches: 2,
    trunk: [[0, -0.35, 0], [0.08, 0.4, 0], [1.3, 1.6, 0], [3.0, 3.0, -0.1], [5.0, 4.6, -0.2], [6.6, 6.4, -0.15], [7.5, 8.2, 0]],
    rBase: 0.21, rTop: 0.14, flare: 0.16, fronds: 21, frondLen: 4.8, leafLen: 0.98, leafWidth: 0.125, perSide: 29,
  },
  young: {
    elevTop: 80, elevLow: 20, bendTop: 18, bendLow: 46, radial: 12, seed: 51, bunches: 0, deadFronds: 0, sheathScale: 1.1,
    attachDrop: 0.3,
    trunk: [[0, -0.25, 0], [0, 0.3, 0], [0.04, 0.8, 0], [0.06, 1.2, 0.02]],
    rBase: 0.26, rTop: 0.2, flare: 0.14, fronds: 14, frondLen: 3.0, leafLen: 0.72, leafWidth: 0.1, perSide: 24,
  },
};

// ---------------------------------------------------------------- textures and materials
// Frond strip: columns hold the rachis, leaflet edges, blade and midrib colours. The blades are
// broad, so their margins are only a little darker than the blade and the midrib is a soft stripe.
const FROND_U = { rachis: 4 / 64, edgeA: 9.5 / 64, mid: 32 / 64, edgeB: 54.5 / 64 };
// Frond group tints in linear light, youngest group first; older (lower) groups lean yellow-olive.
const FROND_TINTS = [[0.9, 1.0, 0.88], [1, 1, 1], [1.0, 0.95, 0.84], [1.0, 0.86, 0.62]];
const NUT_U = [2 / 20, 6 / 20, 10 / 20, 14 / 20, 18 / 20];

function makeMaterials() {
  const rect = (x, w, rgba) => ({ op: 'paint', shape: { kind: 'rectangle', x, y: 0, width: w, height: 4 }, rgba });
  // One 64 px strip per frond group, side by side; each group's tint is baked into its band in
  // linear light, as the base colour factor applied it before.
  const toLinear = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const toSrgb = (l) => {
    const s = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, s)) * 255);
  };
  const tinted = (rgba, t) => [toSrgb(toLinear(rgba[0]) * t[0]), toSrgb(toLinear(rgba[1]) * t[1]), toSrgb(toLinear(rgba[2]) * t[2]), 255];
  const strip = [
    [0, 64, [80, 132, 40, 255]],
    [0, 8, [176, 170, 84, 255]],
    [8, 5, [64, 112, 32, 255]],
    [13, 8, [72, 124, 36, 255]],
    [43, 8, [72, 124, 36, 255]],
    [51, 5, [64, 112, 32, 255]],
    [30, 4, [134, 156, 60, 255]],
  ];
  const frondTex = proceduralTexture({
    schemaVersion: 3, width: 64 * FROND_TINTS.length, height: 4, usage: 'albedo', name: 'PalmFrondBands',
    background: [80, 132, 40, 255],
    operations: FROND_TINTS.flatMap((t, g) => strip.map(([x, w, rgba]) => rect(64 * g + x, w, tinted(rgba, t)))),
  });
  // Eight leaf scars per metre with irregular spacing, depth and weathering.
  const rings = [];
  const jitter = [0, 3, -2, 1, -3, 2, -1, 1];
  const depth = [3, 2, 4, 2, 3, 4, 2, 3];
  for (let i = 0; i < 8; i++) {
    const y = 2 + i * 16 + jitter[i];
    rings.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y, width: 128, height: depth[i] }, rgba: [84, 77, 66, 255], opacity: 170 + 10 * depth[i] });
    rings.push({ op: 'paint', shape: { kind: 'rectangle', x: 0, y: y + depth[i], width: 128, height: 2 }, rgba: [182, 174, 156, 255], opacity: 120 });
  }
  const trunkTex = proceduralTexture({
    schemaVersion: 3, width: 128, height: 128, usage: 'albedo', name: 'PalmTrunkRings',
    operations: [
      {
        op: 'legacy-v2',
        spec: {
          schemaVersion: 2, size: 128, usage: 'albedo',
          layers: [
            { op: 'solid', color: 0x8f8676 },
            { op: 'noise', colorA: 0x655e53, colorB: 0xb4ac9c, scale: 10, octaves: 4, seed: 5, blend: 'overlay', opacity: 0.75 },
            { op: 'noise', colorA: 0x7a7266, colorB: 0xa39a8a, scale: 48, octaves: 2, seed: 9, blend: 'overlay', opacity: 0.4 },
          ],
        },
      },
      ...rings,
    ],
  });
  const nutTex = proceduralTexture({
    schemaVersion: 3, width: 20, height: 4, usage: 'albedo', name: 'CoconutHusks',
    background: [96, 122, 40, 255],
    operations: [
      { op: 'paint', shape: { kind: 'rectangle', x: 4, y: 0, width: 4, height: 4 }, rgba: [150, 150, 52, 255] },
      { op: 'paint', shape: { kind: 'rectangle', x: 8, y: 0, width: 4, height: 4 }, rgba: [186, 140, 52, 255] },
      { op: 'paint', shape: { kind: 'rectangle', x: 12, y: 0, width: 4, height: 4 }, rgba: [112, 78, 44, 255] },
      { op: 'paint', shape: { kind: 'rectangle', x: 16, y: 0, width: 4, height: 4 }, rgba: [128, 116, 62, 255] },
    ],
  });
  const fronds = pbrMaterial({ albedo: frondTex, roughness: 0.45, metalness: 0, doubleSided: true });
  fronds.name = 'PalmFronds';
  const trunk = pbrMaterial({ albedo: trunkTex, roughness: 0.92, metalness: 0 });
  trunk.name = 'PalmTrunk';
  const nuts = pbrMaterial({ albedo: nutTex, roughness: 0.8, metalness: 0 });
  nuts.name = 'Coconut';
  return { fronds, trunk, nuts };
}

// ---------------------------------------------------------------- trunk
function buildTrunk(mb, d, rand) {
  const dense = catmullRomPath(d.trunk, 24);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + V.len(V.sub(dense[i], dense[i - 1])));
  const total = cum[cum.length - 1];
  const at = (s) => {
    // Below the path start the trunk continues straight along its first direction (buried root plate).
    if (s < 0) return V.add(dense[0], V.mul(V.norm(V.sub(dense[1], dense[0])), s));
    let j = 0;
    while (j < dense.length - 2 && cum[j + 1] < s) j++;
    const t = Math.min(1, Math.max(0, (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j])));
    return V.lerp(dense[j], dense[j + 1], t);
  };
  let sGround = 0;
  for (let i = 1; i < dense.length; i++) {
    if (dense[i - 1][1] < 0 && dense[i][1] >= 0) {
      sGround = cum[i - 1] + (-dense[i - 1][1] / (dense[i][1] - dense[i - 1][1])) * (cum[i] - cum[i - 1]);
      break;
    }
  }
  const height = total - sGround;
  const bump = rand() * Math.PI * 2;
  const radius = (s, theta) => {
    const h = Math.max(0, s - sGround);
    let r = d.rTop + (d.rBase - d.rTop) * Math.pow(1 - Math.min(1, h / height), 0.8);
    r += d.flare * Math.exp(-h / 0.45);
    r *= 1 + 0.12 * Math.pow(Math.max(0, Math.cos(7 * theta + bump)), 3) * Math.exp(-h / 0.3);
    if (s < 0) r *= 1 + 0.7 * Math.min(0.5, -s);
    r *= 1 + 0.22 * smoothstep(total - 1.5, total - 0.7, s);
    r *= 1 - 0.6 * smoothstep(total - 0.45, total, s);
    return r;
  };
  // Two buried rings 0.22 and 0.45 m below the old base flare the root plate outward; a cap closes it.
  const stations = [-0.45, -0.22];
  for (let s = 0; s < total - 0.05; ) {
    stations.push(s);
    s += Math.abs(s - sGround) < 1.0 ? 0.16 : s > total - 1.6 ? 0.25 : 0.55;
  }
  stations.push(total);
  const P = stations.map(at);
  const n = P.length;
  const T = P.map((_, i) => V.norm(V.sub(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)])));
  const radial = d.radial;
  let N = V.norm(V.cross(T[0], [0, 0, 1]));
  const first = mb.p.length / 3;
  for (let i = 0; i < n; i++) {
    const t = T[i];
    N = V.norm(V.sub(N, V.mul(t, V.dot(N, t))));
    const B = V.cross(t, N);
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * Math.PI * 2;
      const dir = V.add(V.mul(N, Math.cos(th)), V.mul(B, Math.sin(th)));
      const dr = (radius(stations[i] + 0.05, th) - radius(stations[i] - 0.05, th)) / 0.1;
      // V is metres along the trunk: one texture tile (eight leaf scars) per metre.
      mb.vert(V.add(P[i], V.mul(dir, radius(stations[i], th))), V.norm(V.sub(dir, V.mul(t, dr))), k / radial, stations[i]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = first + i * (radial + 1) + k;
      const c = a + radial + 1;
      mb.tri(a, a + 1, c);
      mb.tri(a + 1, c + 1, c);
    }
  }
  const tip = mb.vert(V.add(P[n - 1], V.mul(T[n - 1], 0.04)), T[n - 1], 0.5, total);
  const last = first + (n - 1) * (radial + 1);
  for (let k = 0; k < radial; k++) mb.tri(last + k, last + k + 1, tip);
  const bottom = mb.vert(V.sub(P[0], V.mul(T[0], 0.06)), V.mul(T[0], -1), 0.5, stations[0] - 0.06);
  for (let k = 0; k < radial; k++) mb.tri(first + k + 1, first + k, bottom);
  return { top: P[n - 1], tangent: T[n - 1] };
}

// ---------------------------------------------------------------- fronds
const FROND_SEGMENTS = 12;

/**
 * Advance the crown stream exactly as the earlier narrow-leaflet revisions did for one frond, so
 * frond azimuths, arcs, coconuts and dead fronds stay where they were. New leaflets draw from
 * their own per-frond stream (f.leafSeed).
 */
function skipLegacyLeaflets(f, rand) {
  for (let side = 0; side < 2; side++) {
    for (let j = 0; j < f.legacyPerSide; j++) {
      if (f.spear) {
        rand();
        continue;
      }
      if (rand() < f.torn) continue;
      rand();
      rand();
      rand();
    }
  }
}

function addFrond(mb, f, rand, toWorld, toWorldDir) {
  const U = f.uFixed !== undefined ? { rachis: f.uFixed, edgeA: f.uFixed, mid: f.uFixed, edgeB: f.uFixed } : FROND_U;
  const segs = FROND_SEGMENTS;
  const horiz = [Math.cos(f.azimuth), 0, Math.sin(f.azimuth)];
  const side = [-Math.sin(f.azimuth), 0, Math.cos(f.azimuth)];
  const pts = [f.attach];
  const dirs = [];
  for (let i = 0; i < segs; i++) {
    const u = (i + 0.5) / segs;
    const theta = f.elev - f.bend * Math.pow(u, 1.3);
    const lat = f.sweep * u;
    const ct = Math.cos(theta);
    const dir = V.norm([
      horiz[0] * ct * Math.cos(lat) + side[0] * ct * Math.sin(lat),
      Math.sin(theta),
      horiz[2] * ct * Math.cos(lat) + side[2] * ct * Math.sin(lat),
    ]);
    dirs.push(dir);
    pts.push(V.add(pts[i], V.mul(dir, f.length / segs)));
  }
  const tangents = pts.map((_, i) => V.norm(V.add(dirs[Math.max(0, i - 1)], dirs[Math.min(segs - 1, i)])));
  const frame = (t) => {
    const c = V.cross(UP, t);
    const b = V.len(c) < 1e-4 ? side : V.norm(c);
    return { b, n: V.cross(t, b) };
  };
  const rachisR = (u) => 0.012 + (f.rachisRadius - 0.012) * Math.pow(1 - u, 1.5) + 0.03 * Math.exp(-u / 0.06);

  // Rachis: three-sided prism, flat on top with a keel below.
  const first = mb.p.length / 3;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const { b, n } = frame(tangents[i]);
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
      const dir = V.add(V.mul(b, Math.cos(a)), V.mul(n, Math.sin(a)));
      mb.vert(toWorld(V.add(pts[i], V.mul(dir, rachisR(u)))), toWorldDir(dir), U.rachis, u);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < 3; k++) {
      const a = first + i * 3 + k;
      const b = first + i * 3 + ((k + 1) % 3);
      mb.tri(a, b, a + 3);
      mb.tri(b, b + 3, a + 3);
    }
  }

  // Leaflets (pinnae): broad strap blades, staggered densely on the two sides of the rachis so
  // neighbours overlap. Each blade is one V-folded strip of four triangles: a narrow folded base
  // at the rachis, full width at 16 % of its length, 86 % width at 64 %, then an acuminate tip.
  // Upper fronds hold their leaflets out nearly level; older fronds and outer leaflets hang lower.
  skipLegacyLeaflets(f, rand);
  const lr = makeRandom(f.leafSeed);
  const start = f.spear ? 0.3 : 0.17;
  for (const sideSign of [-1, 1]) {
    for (let j = 0; j < f.perSide; j++) {
      const u = start + ((0.985 - start) * (j + (sideSign > 0 ? 0.3 : 0.7))) / f.perSide;
      if (!f.spear && lr() < f.torn) continue;
      const x = u * segs;
      const i0 = Math.min(segs - 1, Math.floor(x));
      const fr = x - i0;
      const A = V.lerp(pts[i0], pts[i0 + 1], fr);
      const t = V.norm(V.lerp(tangents[i0], tangents[i0 + 1], fr));
      const { b, n } = frame(t);
      const alpha = f.spear ? rad(80) : f.alpha + rad(16) * u + (lr() - 0.5) * rad(8);
      const beta = f.spear ? rad(-4) : f.droop + rad(22) * u + (lr() - 0.5) * rad(10);
      const d0 = V.norm(V.add(V.mul(b, sideSign * Math.cos(alpha)), V.mul(t, Math.sin(alpha))));
      const dir = V.norm(V.sub(V.mul(d0, Math.cos(beta)), V.mul(n, Math.sin(beta))));
      const shape = Math.max(0.28, Math.pow(Math.sin(Math.PI * (0.15 + 0.85 * u)), 0.55));
      const len = f.leafLen * shape * (0.9 + 0.2 * lr()) * (f.spear ? 0.55 : 1);
      // Shorter leaflets near the frond base and tip are narrower too.
      const wid = f.leafWidth * (0.55 + 0.45 * shape) * (0.9 + 0.2 * lr()) * (f.spear ? 0.5 : 1);
      const W = V.norm(V.cross(dir, n));
      const fn = V.norm(V.sub(n, V.mul(dir, V.dot(dir, n))));
      const g = f.spear ? 0 : f.gravity;
      const root = V.add(A, V.mul(dir, rachisR(u) * 0.7));
      const centre = (s) => V.sub(V.add(root, V.mul(dir, len * s)), V.mul(UP, len * g * s * s));
      // Edges rise above the midrib: a shallow V channel along the blade.
      const edge = (s, w, sgn) => V.add(V.add(centre(s), V.mul(W, sgn * w * 0.5)), V.mul(fn, w * 0.16));
      const wy = (s) => Math.min(1, u + (s * len * 0.8) / f.length);
      const nL = toWorldDir(V.norm(V.add(fn, V.mul(W, 0.45))));
      const nR = toWorldDir(V.norm(V.sub(fn, V.mul(W, 0.45))));
      const nC = toWorldDir(fn);
      const b0 = mb.vert(toWorld(centre(0)), nC, U.mid, wy(0));
      const l1 = mb.vert(toWorld(edge(0.16, wid, -1)), nL, U.edgeA, wy(0.16));
      const r1 = mb.vert(toWorld(edge(0.16, wid, 1)), nR, U.edgeB, wy(0.16));
      const l2 = mb.vert(toWorld(edge(0.64, wid * 0.86, -1)), nL, U.edgeA, wy(0.64));
      const r2 = mb.vert(toWorld(edge(0.64, wid * 0.86, 1)), nR, U.edgeB, wy(0.64));
      const tp = mb.vert(toWorld(centre(1)), nC, U.mid, wy(1));
      mb.tri(b0, r1, l1);
      mb.tri(l1, r1, r2);
      mb.tri(l1, r2, l2);
      mb.tri(l2, r2, tp);
    }
  }
}

function buildCrown(groups, d, rand, toWorld, toWorldDir) {
  const n = d.fronds;
  const perGroup = Math.ceil(n / groups.length);
  const baseAz = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const e = n > 1 ? i / (n - 1) : 0;
    const spear = i === 0;
    const az = baseAz + i * GOLDEN + (rand() - 0.5) * 0.12;
    const ring = 0.06 + 0.12 * e;
    const f = {
      azimuth: az,
      elev: spear ? rad(84) : rad(lerp(d.elevTop, d.elevLow, Math.pow(e, 0.85)) + (rand() - 0.5) * 10),
      bend: spear ? rad(5) : rad(lerp(d.bendTop, d.bendLow, e) + (rand() - 0.5) * 10),
      sweep: (rand() - 0.5) * 0.3,
      length: d.frondLen * (spear ? 0.6 : lerp(0.86, 1.04, Math.min(1, e * 2))) * (0.94 + 0.12 * rand()),
      leafLen: d.leafLen,
      leafWidth: d.leafWidth,
      perSide: spear ? Math.round(d.perSide * 0.6) : d.perSide,
      legacyPerSide: spear ? Math.round(d.perSide * 0.6) : d.perSide,
      leafSeed: d.seed * 1009 + 17 * (i + 1),
      droop: rad(lerp(16, 42, e)),
      alpha: rad(34),
      gravity: lerp(0.2, 0.4, e),
      torn: 0.03 + 0.05 * e,
      rachisRadius: 0.04,
      spear,
      attach: [Math.cos(az) * ring, 0.05 - d.attachDrop * e, Math.sin(az) * ring],
    };
    addFrond(groups[Math.min(groups.length - 1, Math.floor(i / perGroup))], f, rand, toWorld, toWorldDir);
  }
}

// ---------------------------------------------------------------- coconuts
function addEllipsoid(mb, c, rx, ry, slices, stacks, u, toWorld, toWorldDir) {
  const top = mb.vert(toWorld([c[0], c[1] + ry, c[2]]), toWorldDir(UP), u, 0);
  const ringStart = mb.p.length / 3;
  for (let j = 1; j < stacks; j++) {
    const phi = (j / stacks) * Math.PI;
    for (let k = 0; k < slices; k++) {
      const th = (k / slices) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(th);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(th);
      mb.vert(toWorld([c[0] + rx * x, c[1] + ry * y, c[2] + rx * z]), toWorldDir(V.norm([x / rx, y / ry, z / rx])), u, j / stacks);
    }
  }
  const bottom = mb.vert(toWorld([c[0], c[1] - ry, c[2]]), toWorldDir([0, -1, 0]), u, 1);
  const ring = (j, k) => ringStart + (j - 1) * slices + (k % slices);
  for (let k = 0; k < slices; k++) mb.tri(top, ring(1, k + 1), ring(1, k));
  for (let j = 1; j < stacks - 1; j++) {
    for (let k = 0; k < slices; k++) {
      mb.tri(ring(j, k), ring(j, k + 1), ring(j + 1, k));
      mb.tri(ring(j, k + 1), ring(j + 1, k + 1), ring(j + 1, k));
    }
  }
  for (let k = 0; k < slices; k++) mb.tri(ring(stacks - 1, k), ring(stacks - 1, k + 1), bottom);
}

/** Fibrous leaf-sheath bulb that hides the crown shaft where the frond bases emerge. */
function addSheath(mb, d, toWorld, toWorldDir) {
  const s = d.sheathScale;
  const profile = [[-0.78, 0.19], [-0.55, 0.24], [-0.3, 0.225], [-0.05, 0.17], [0.1, 0.12], [0.17, 0.05]];
  const radial = 10;
  const u = NUT_U[4];
  const first = mb.p.length / 3;
  profile.forEach(([y, r], i) => {
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(profile.length - 1, i + 1)];
    const slope = (next[1] - prev[1]) / (next[0] - prev[0]);
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * Math.PI * 2;
      const dir = [Math.cos(th), 0, Math.sin(th)];
      const rr = r * s * (1 + 0.1 * Math.sin(5 * th + 1.7 * i) + 0.05 * Math.sin(11 * th + i));
      mb.vert(toWorld([dir[0] * rr, y * s, dir[2] * rr]), toWorldDir(V.norm([dir[0], -slope, dir[2]])), u, i / (profile.length - 1));
    }
  });
  for (let i = 0; i < profile.length - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = first + i * (radial + 1) + k;
      const c = a + radial + 1;
      mb.tri(a, c, a + 1);
      mb.tri(a + 1, c, c + 1);
    }
  }
  const top = profile[profile.length - 1];
  const tip = mb.vert(toWorld([0, (top[0] + 0.03) * s, 0]), toWorldDir(UP), u, 1);
  const last = first + (profile.length - 1) * (radial + 1);
  for (let k = 0; k < radial; k++) mb.tri(last + k + 1, last + k, tip);
}

function buildNuts(mb, d, rand, toWorld, toWorldDir) {
  for (let b = 0; b < d.bunches; b++) {
    const az = rand() * Math.PI * 2;
    const c = [Math.cos(az) * 0.3, -0.72 - 0.14 * b, Math.sin(az) * 0.3];
    const count = 5 + Math.floor(rand() * 2);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rand() * 0.4;
      const r = 0.12 + rand() * 0.015;
      const p = [c[0] + Math.cos(a) * 0.15, c[1] - (k % 2) * 0.1 - rand() * 0.05, c[2] + Math.sin(a) * 0.15];
      const pick = rand();
      const u = NUT_U[pick < 0.45 ? 0 : pick < 0.75 ? 1 : pick < 0.9 ? 2 : 3];
      addEllipsoid(mb, p, r, r * 1.15, 7, 5, u, toWorld, toWorldDir);
    }
  }
}

// ---------------------------------------------------------------- assembly
function buildPalm(parent, mats, variant, offset, prefix) {
  const d = DESIGNS[variant];
  const rand = makeRandom(d.seed);
  const trunkMb = meshBuilder();
  const tr = buildTrunk(trunkMb, d, rand);
  const rot = rotationFromTo(UP, V.norm(V.lerp(UP, tr.tangent, 0.35)));
  const toWorld = (p) => V.add(tr.top, rot(p));
  const toWorldDir = (v) => rot(v);
  const groups = [meshBuilder(), meshBuilder(), meshBuilder(), meshBuilder()];
  buildCrown(groups, d, rand, toWorld, toWorldDir);

  const trunk = createPart(prefix + 'trunk', trunkMb.geometry(), mats.trunk, { parent, position: offset });
  trunk.name = prefix + 'trunk';
  markOpenShell(trunk, 'Capped trunk; flared root plate buried 0.7-0.8 m below the ground contact. Only the UV seam vertices are split.');
  {
    // Leaf-sheath bulb, coconuts and hanging dead fronds share the husk material;
    // the sheath and dead fronds use its brown column.
    const nutMb = meshBuilder();
    addSheath(nutMb, d, toWorld, toWorldDir);
    buildNuts(nutMb, d, rand, toWorld, toWorldDir);
    for (let k = 0; k < d.deadFronds; k++) {
      const az = rand() * Math.PI * 2;
      addFrond(nutMb, {
        azimuth: az, elev: rad(-58), bend: rad(22), sweep: (rand() - 0.5) * 0.3, length: d.frondLen * 0.8,
        leafLen: d.leafLen * 0.8, leafWidth: d.leafWidth * 0.7, perSide: Math.round(d.perSide * 0.7),
        legacyPerSide: Math.round(d.perSide * 0.7), leafSeed: d.seed * 1009 + 7001 + k,
        droop: rad(62), alpha: rad(40), gravity: 0.5, torn: 0.3, rachisRadius: 0.03, spear: false,
        uFixed: NUT_U[3], attach: [Math.cos(az) * 0.16, -0.7, Math.sin(az) * 0.16],
      }, rand, toWorld, toWorldDir);
    }
    const husk = createPart(prefix + 'crown_husk', nutMb.geometry(), mats.nuts, { parent, position: offset });
    husk.name = prefix + 'crown_husk';
    markOpenShell(husk, 'Open-bottomed sheath bulb over the trunk top, closed coconuts and single-sheet dead fronds.');
  }
  // The four groups are still built separately (same geometry and random stream), then merged
  // into one primitive: TEXCOORD_0.x moves into each group's colour band, TEXCOORD_0.y is kept.
  const frondMb = meshBuilder();
  groups.forEach((mb, g) => {
    const base = frondMb.p.length / 3;
    for (let k = 0; k < mb.p.length / 3; k++) {
      frondMb.vert(mb.p.slice(3 * k, 3 * k + 3), mb.n.slice(3 * k, 3 * k + 3), (g + mb.uv[2 * k]) / groups.length, mb.uv[2 * k + 1]);
    }
    for (const i of mb.idx) frondMb.idx.push(base + i);
  });
  const fronds = createPart(prefix + 'fronds', frondMb.geometry(), mats.fronds, { parent, position: offset });
  fronds.name = prefix + 'fronds';
  markOpenShell(fronds, 'Single-sheet leaflets on a thin rachis; double-sided foliage.');
}

/** Review only (lineup): a 3.2 m sand square through the pivot, sloping 14 deg down toward +X. */
function reviewGround(parent, offset, prefix) {
  const mb = meshBuilder();
  const k = Math.tan(rad(14));
  const n = V.norm([k, 1, 0]);
  const c = [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]].map(([x, z]) => mb.vert([x, -k * x, z], n, 0.5, 0.5));
  mb.tri(c[0], c[2], c[1]);
  mb.tri(c[0], c[3], c[2]);
  const sand = pbrMaterial({ roughness: 0.95, metalness: 0 });
  sand.color.setRGB(0.8, 0.72, 0.58);
  sand.name = 'ReviewSand';
  const part = createPart(prefix + 'review_ground', mb.geometry(), sand, { parent, position: offset });
  part.name = prefix + 'review_ground';
  markOpenShell(part, 'Review-only sloped sand square for the lineup; not part of any exported palm.');
}

function build() {
  const mats = makeMaterials();
  const root = createRoot(VARIANT === 'lineup' ? 'CoconutPalmLineup' : 'CoconutPalm');
  if (VARIANT === 'lineup') {
    const lineup = [['young', [-9, 0, 0]], ['tall', [0, 0, 0]], ['lean', [8, 0, 0]], ['arch', [19, 0, 0]]];
    for (const [v, off] of lineup) {
      buildPalm(root, mats, v, off, v + '_');
      reviewGround(root, off, v + '_');
    }
  } else {
    buildPalm(root, mats, VARIANT, [0, 0, 0], '');
  }
  root.userData = {
    palmVariant: VARIANT,
    windNodes: ['fronds'],
    windWeight: 'TEXCOORD_0.y: 0 at frond attachment, 1 at frond tip',
  };
  return root;
}
